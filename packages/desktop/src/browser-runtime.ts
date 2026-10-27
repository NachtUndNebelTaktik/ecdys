import {spawn, type ChildProcessWithoutNullStreams} from 'node:child_process';
import {access, readFile, readlink} from 'node:fs/promises';
import {constants} from 'node:fs';
import {dirname, join} from 'node:path';
import {randomUUID} from 'node:crypto';
import type {
  BrowserEvent,
  BrowserInput,
  BrowserSupport,
  TemporaryBrowserSession,
} from '@ecdys/shared';
import {BrowserInputSchema, BrowserUrlSchema} from '@ecdys/shared';
import {createRouteBroker} from './route-broker';
import {WorkspaceError, type WorkspaceService} from './workspace';

type Context = Awaited<ReturnType<WorkspaceService['prepareTemporaryBrowser']>>;
export class TemporaryBrowserRuntime {
  private active: TemporaryBrowserSession | null = null;
  private child?: ChildProcessWithoutNullStreams;
  private broker?: Awaited<ReturnType<typeof createRouteBroker>>;
  private context?: Context;
  private stopping?: Promise<void>;
  private starting = false;
  private abortCleanup?: () => void;
  private next = 1;
  private lastFrame = '';
  private requests = new Map<
    number,
    {resolve: () => void; reject: (error: Error) => void; timer: NodeJS.Timeout}
  >();
  constructor(
    private readonly emit: (event: BrowserEvent) => void,
    private readonly workerFile = join(__dirname, 'browser-worker.cjs'),
  ) {}
  session() {
    return this.active ? {...this.active} : null;
  }
  replayFrame() {
    if (this.active && this.lastFrame)
      this.emit({type: 'frame', sessionId: this.active.id, data: this.lastFrame});
  }
  async support(): Promise<BrowserSupport> {
    const reasons: string[] = [];
    if (process.platform !== 'linux')
      reasons.push('This development runtime currently requires Linux.');
    else {
      for (const [path, label] of [
        ['/usr/bin/bwrap', 'bubblewrap'],
        ['/usr/bin/prlimit', 'util-linux process limits'],
        ['/usr/lib/chromium/chromium', 'Chromium 156'],
      ]) {
        try {
          await access(path!, constants.X_OK);
        } catch {
          reasons.push('Install ' + label + ' to use temporary browsing.');
        }
      }
      try {
        if ((await readFile('/proc/swaps', 'utf8')).trim().split('\n').length !== 1)
          reasons.push('Temporary browsing currently requires swap to be disabled.');
      } catch {
        reasons.push('The memory-only storage prerequisite could not be checked.');
      }
    }
    return {
      available: !reasons.length,
      reasons,
      platform: process.platform,
      mode: 'temporary_linux',
    };
  }
  async start(context: Context): Promise<TemporaryBrowserSession> {
    if (this.starting || this.active || this.stopping) {
      if (context.route.kind !== 'direct') delete context.route.password;
      await context.release();
      throw new WorkspaceError('BROWSER_ACTIVE', 'Close the current temporary browser first.');
    }
    this.starting = true;
    this.context = context;
    const abort = () => {
      void this.stop().catch(() => undefined);
    };
    context.signal.addEventListener('abort', abort, {once: true});
    this.abortCleanup = () => context.signal.removeEventListener('abort', abort);
    try {
      const support = await this.support();
      if (!support.available)
        throw new WorkspaceError('BROWSER_UNAVAILABLE', support.reasons.join(' '));
      if (context.signal.aborted)
        throw new WorkspaceError('VAULT_LOCKED', 'The workspace was locked before browser launch.');
      const broker = await createRouteBroker(context.route);
      this.broker = broker;
      if (context.signal.aborted)
        throw new WorkspaceError('VAULT_LOCKED', 'The workspace was locked before browser launch.');
      const runtimeRoot = dirname(process.execPath),
        hostNetwork = await readlink('/proc/self/ns/net');
      if (context.signal.aborted)
        throw new WorkspaceError('VAULT_LOCKED', 'The workspace was locked before browser launch.');
      const args = [
        '--unshare-all',
        '--die-with-parent',
        '--new-session',
        '--ro-bind',
        '/usr',
        '/usr',
        '--symlink',
        'usr/bin',
        '/bin',
        '--symlink',
        'usr/lib',
        '/lib',
        '--symlink',
        'usr/lib64',
        '/lib64',
        '--dir',
        '/etc',
        '--ro-bind',
        '/etc/ld.so.cache',
        '/etc/ld.so.cache',
        '--ro-bind',
        '/etc/fonts',
        '/etc/fonts',
        '--ro-bind',
        '/etc/ssl',
        '/etc/ssl',
        '--proc',
        '/proc',
        '--dev',
        '/dev',
        '--size',
        '536870912',
        '--tmpfs',
        '/tmp',
        '--tmpfs',
        '/run',
        '--ro-bind',
        broker.directory,
        '/run/ecdys',
        '--ro-bind',
        runtimeRoot,
        '/app/runtime',
        '--ro-bind',
        this.workerFile,
        '/app/browser-worker.cjs',
        '--clearenv',
        '--setenv',
        'PATH',
        '/usr/bin:/bin',
        '--setenv',
        'HOME',
        '/tmp',
        '--setenv',
        'LANG',
        'C.UTF-8',
        '--setenv',
        'FONTCONFIG_FILE',
        '/etc/fonts/fonts.conf',
        '--setenv',
        'ELECTRON_RUN_AS_NODE',
        '1',
        '--chdir',
        '/tmp',
        '--',
        '/app/runtime/' + process.execPath.split('/').at(-1),
        '/app/browser-worker.cjs',
      ];
      const child = spawn('/usr/bin/prlimit', ['--core=0', '--', '/usr/bin/bwrap', ...args], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      this.child = child;
      child.stderr.on('data', () => undefined); // Never forward browser/website diagnostics into application logs.
      this.active = {
        id: randomUUID(),
        profileId: context.profile.id,
        profileName: context.profile.name,
        startedAt: Date.now(),
        url: 'about:blank',
        version: '',
        mode: 'temporary',
        routeMode: context.route.kind,
        width: 1200,
        height: 720,
        status: 'launching',
      };
      await new Promise<void>((resolve, reject) => {
        let buffer = Buffer.alloc(0),
          ready = false;
        const timer = setTimeout(
          () =>
            reject(
              new WorkspaceError(
                'BROWSER_START_FAILED',
                'The isolated browser did not become ready.',
              ),
            ),
          20_000,
        );
        const failed = () => {
          clearTimeout(timer);
          if (!ready)
            reject(
              new WorkspaceError(
                'BROWSER_START_FAILED',
                'The isolated browser could not start. Check Linux namespaces and Chromium 156.',
              ),
            );
          else if (!this.stopping && this.child === child) {
            if (this.active) {
              this.active.status = 'crashed';
              this.emit({type: 'session', session: this.session()});
            }
            void this.stop();
          }
        };
        child.once('error', failed);
        child.once('exit', failed);
        child.stdout.on('data', (chunk: Buffer) => {
          buffer = Buffer.concat([buffer, chunk]);
          if (buffer.length > 4_194_304) {
            failed();
            child.kill('SIGKILL');
            return;
          }
          let end: number;
          while ((end = buffer.indexOf(10)) >= 0) {
            const raw = buffer.subarray(0, end);
            buffer = buffer.subarray(end + 1);
            try {
              const value = JSON.parse(raw.toString());
              if (this.child !== child || context.signal.aborted) continue;
              if (value.type === 'ready' && !ready) {
                if (value.network === hostNetwork || !/^Chrome\/156\./.test(value.version)) {
                  failed();
                  child.kill('SIGKILL');
                  continue;
                }
                ready = true;
                clearTimeout(timer);
                this.active!.version = value.version;
                this.active!.status = 'active';
                this.emit({type: 'session', session: this.session()});
                resolve();
              } else if (value.type === 'fatal') {
                failed();
                child.kill('SIGKILL');
              } else if (
                ready &&
                value.type === 'destination' &&
                typeof value.host === 'string' &&
                typeof value.port === 'number'
              ) {
                broker.allow(value.host, value.port);
              } else if (
                ready &&
                value.type === 'frame' &&
                typeof value.data === 'string' &&
                value.data.length <= 2_796_204
              ) {
                this.lastFrame = value.data;
                this.emit({type: 'frame', sessionId: this.active!.id, data: value.data});
              } else if (ready && value.type === 'navigated' && typeof value.url === 'string') {
                const parsed = BrowserUrlSchema.safeParse(value.url);
                if (parsed.success) {
                  this.active!.url = parsed.data;
                  this.emit({type: 'session', session: this.session()});
                }
              } else if (value.type === 'reply') {
                const request = this.requests.get(value.id);
                if (request) {
                  clearTimeout(request.timer);
                  this.requests.delete(value.id);
                  if (value.ok) request.resolve();
                  else
                    request.reject(
                      new WorkspaceError(
                        'BROWSER_OPERATION_FAILED',
                        'The browser could not complete this operation through its selected route.',
                      ),
                    );
                }
              }
            } catch {
              failed();
              child.kill('SIGKILL');
            }
          }
        });
        child.stdin.on('error', failed);
        child.stdin.write(
          JSON.stringify({token: broker.token, timezone: context.profile.timezone, hostNetwork}) +
            '\n',
        );
      });
      if (context.signal.aborted)
        throw new WorkspaceError('VAULT_LOCKED', 'The workspace was locked during browser launch.');
      return this.session()!;
    } catch (error) {
      await this.stop();
      throw error;
    } finally {
      this.starting = false;
    }
  }
  private check(id: string) {
    if (!this.active || this.active.id !== id || !this.child || this.active.status !== 'active')
      throw new WorkspaceError('SESSION_NOT_FOUND', 'The temporary browser is no longer active.');
  }
  private command(id: string, value: object): Promise<void> {
    this.check(id);
    if (this.requests.size >= 32)
      throw new WorkspaceError(
        'BROWSER_BUSY',
        'Wait for the current browser operations to finish.',
      );
    const sequence = this.next++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.requests.delete(sequence);
        reject(new WorkspaceError('BROWSER_TIMEOUT', 'The browser operation timed out.'));
      }, 12_000);
      this.requests.set(sequence, {resolve, reject, timer});
      this.child!.stdin.write(JSON.stringify({...value, id: sequence}) + '\n');
    });
  }
  async navigate(id: string, url: string) {
    this.check(id);
    const target = BrowserUrlSchema.parse(url);
    if (target !== 'about:blank') {
      const parsed = new URL(target);
      this.broker?.allow(
        parsed.hostname.replace(/^\[|\]$/g, ''),
        Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80)),
      );
    }
    return this.command(id, {method: 'navigate', url: target});
  }
  async input(id: string, input: BrowserInput) {
    return this.command(id, {method: 'input', input: BrowserInputSchema.parse(input)});
  }
  async stop(id?: string): Promise<void> {
    if (id && this.active?.id !== id)
      throw new WorkspaceError('SESSION_NOT_FOUND', 'The temporary browser is no longer active.');
    if (this.stopping) return this.stopping;
    this.stopping = (async () => {
      const child = this.child,
        broker = this.broker,
        context = this.context;
      this.abortCleanup?.();
      this.abortCleanup = undefined;
      this.child = undefined;
      this.broker = undefined;
      this.context = undefined;
      this.active = null;
      this.lastFrame = '';
      for (const request of this.requests.values()) {
        clearTimeout(request.timer);
        request.reject(new WorkspaceError('SESSION_CLOSED', 'The temporary browser closed.'));
      }
      this.requests.clear();
      // Revoke networking before stopping the process tree.
      await broker?.close();
      if (child && child.exitCode === null && child.signalCode === null) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => child.kill('SIGKILL'), 2000);
          child.once('exit', () => {
            clearTimeout(timer);
            resolve();
          });
          child.kill('SIGTERM');
        });
      }
      if (context) {
        if (context.route.kind !== 'direct') delete context.route.password;
        await context.release();
      }
      this.emit({type: 'session', session: null});
    })();
    try {
      await this.stopping;
    } finally {
      this.stopping = undefined;
    }
  }
}
