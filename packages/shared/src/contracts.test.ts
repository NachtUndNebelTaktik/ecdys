import {describe, expect, it} from 'vitest';
import {ProfileDraftSchema, RouteDraftSchema, VaultSetupSchema, evaluateLaunch} from './index';

describe('profile and route boundaries', () => {
  it('rejects invalid SOCKS ports and host schemes rather than persisting unusable routes', () => {
    expect(
      RouteDraftSchema.safeParse({kind: 'socks5', host: 'socks5://proxy.test', port: 1080}).success,
    ).toBe(false);
    expect(RouteDraftSchema.safeParse({kind: 'socks5', host: 'proxy.test', port: 0}).success).toBe(
      false,
    );
    expect(
      RouteDraftSchema.safeParse({kind: 'socks5', host: 'proxy.test', port: 65536}).success,
    ).toBe(false);
  });
  it('keeps credentials explicit and requires remote DNS for SOCKS5', () => {
    const route = RouteDraftSchema.parse({
      kind: 'socks5',
      host: 'proxy.test',
      port: 1080,
      username: 'operator',
      password: 'private',
    });
    expect(route).toMatchObject({remoteDNS: true, routeLock: true, username: 'operator'});
    expect(RouteDraftSchema.safeParse({...route, remoteDNS: false}).success).toBe(false);
  });
  it('bounds untrusted names, tags and unknown fields at the IPC boundary', () => {
    expect(ProfileDraftSchema.safeParse({name: ' ', tags: []}).success).toBe(false);
    expect(ProfileDraftSchema.safeParse({name: 'a'.repeat(121), tags: []}).success).toBe(false);
    expect(
      ProfileDraftSchema.safeParse({name: 'Research', tags: [], runCommand: 'anything'}).success,
    ).toBe(false);
    expect(
      ProfileDraftSchema.parse({name: ' Research ', tags: [' OSINT ', 'OSINT']}),
    ).toMatchObject({name: 'Research', tags: ['OSINT']});
  });
  it('does not silently lower the configured master KDF below one GiB', () => {
    expect(
      VaultSetupSchema.safeParse({passphrase: 'a strong local phrase', memoryMiB: 64}).success,
    ).toBe(false);
    expect(VaultSetupSchema.parse({passphrase: 'a strong local phrase'}).memoryMiB).toBe(4096);
  });
});

describe('launch admission', () => {
  it('blocks unsupported enforcement even when a SOCKS5 route has been entered', () => {
    const result = evaluateLaunch({
      hasRoute: true,
      nativeRouteReady: false,
      protectedStorageReady: true,
      browserReady: true,
      requiredObservations: ['pass'],
    });
    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain('Native route enforcement is not available.');
  });
  it.each(['fail', 'unknown', 'unavailable', 'unsupported'] as const)(
    'blocks a required %s validation result',
    (state) => {
      expect(
        evaluateLaunch({
          hasRoute: true,
          nativeRouteReady: true,
          protectedStorageReady: true,
          browserReady: true,
          requiredObservations: [state],
        }).allowed,
      ).toBe(false);
    },
  );
});
