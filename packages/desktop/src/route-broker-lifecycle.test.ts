import {afterEach, describe, expect, it, vi} from 'vitest';
import {connect, type Socket} from 'node:net';
import {once} from 'node:events';
import {createRouteBroker} from './route-broker';

const controlled = vi.hoisted(() => ({
  connected: undefined as
    | ((socket: Socket, target: {host: string; port: number}) => void)
    | undefined,
}));

// Keep the broker's Unix socket real, but never initiate TCP or DNS for this
// controlled destination. Leaving the Socket pending also models lookup delay.
vi.mock('node:net', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:net')>();
  return {
    ...actual,
    connect: (...args: unknown[]) => {
      const target = args[0] as {host?: string; port?: number};
      if (typeof target === 'object' && target.host === 'pending.ecdys.test') {
        const socket = new actual.Socket();
        controlled.connected?.(socket, {host: target.host, port: target.port!});
        return socket;
      }
      return Reflect.apply(actual.connect, actual, args);
    },
  };
});

afterEach(() => {
  controlled.connected = undefined;
  vi.useRealTimers();
});

async function pendingDirectConnection() {
  const broker = await createRouteBroker({kind: 'direct'});
  const target = {host: 'pending.ecdys.test', port: 443};
  broker.allow(target.host, target.port);
  const client = connect(broker.directory + '/route.sock');
  client.on('error', () => undefined);
  await once(client, 'connect');
  const opening = new Promise<{socket: Socket; target: typeof target}>((resolve) => {
    controlled.connected = (socket, target) => resolve({socket, target});
  });
  let output = '';
  client.on('data', (data: Buffer) => (output += data.toString()));
  const ended = once(client, 'end');
  // Only deadlines are faked; native socket I/O and nextTick stay real.
  vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
  client.write(JSON.stringify({...target, token: broker.token}) + '\n');
  const pending = await opening;
  const failures: (Error & {code?: string})[] = [];
  pending.socket.on('error', (error) => failures.push(error));
  expect(pending.target).toEqual(target);
  expect(pending.socket.destroyed).toBe(false);
  expect(vi.getTimerCount()).toBe(1);
  return {
    broker,
    client,
    upstream: pending.socket,
    failures,
    output: () => output,
    reply: async () => {
      await ended;
      return output;
    },
    cleanup: async () => {
      client.destroy();
      await broker.close();
    },
  };
}

describe.skipIf(process.platform !== 'linux')('Direct pending-connection lifecycle', () => {
  it('reports a failed connection and disposes the pending socket and deadline', async () => {
    const pending = await pendingDirectConnection();
    try {
      pending.upstream.destroy(new Error('Controlled connection refusal.'));
      expect(await pending.reply()).toBe('ERR NETWORK_ERROR\n');
      expect(pending.upstream.destroyed).toBe(true);
      expect(pending.failures.map(({message}) => message)).toEqual([
        'Controlled connection refusal.',
      ]);
      expect(pending.upstream.listenerCount('connect')).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      await pending.cleanup();
    }
  });

  it('revokes a pending connection immediately when the broker closes', async () => {
    const pending = await pendingDirectConnection();
    try {
      const clientClosed = once(pending.client, 'close');
      await pending.broker.close();
      await clientClosed;
      expect(pending.upstream.destroyed).toBe(true);
      expect(pending.failures.map(({code}) => code)).toEqual(['CANCELLED']);
      expect(pending.output()).toBe('');
      expect(pending.upstream.listenerCount('connect')).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      await pending.cleanup();
    }
  });

  it('enforces the six-second deadline while connection or lookup remains pending', async () => {
    const pending = await pendingDirectConnection();
    try {
      await vi.advanceTimersByTimeAsync(5999);
      expect(pending.upstream.destroyed).toBe(false);
      expect(pending.failures).toEqual([]);
      expect(pending.output()).toBe('');
      await vi.advanceTimersByTimeAsync(1);
      expect(await pending.reply()).toBe('ERR TIMEOUT\n');
      expect(pending.upstream.destroyed).toBe(true);
      expect(pending.failures.map(({code}) => code)).toEqual(['TIMEOUT']);
      expect(pending.upstream.listenerCount('connect')).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      await pending.cleanup();
    }
  });
});
