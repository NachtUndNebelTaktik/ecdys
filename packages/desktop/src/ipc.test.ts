import {describe, expect, it} from 'vitest';
import {isTrustedFrame, safeError, parseInvocation} from './ipc';

describe('privileged IPC boundary', () => {
  it('accepts only acknowledged temporary launches and bounded browser operations', () => {
    const id = '19ab1b20-cc99-4a9b-8ae4-d99dc272d192';
    expect(() =>
      parseInvocation({method: 'startTemporaryBrowser', args: [{profileId: id, revision: 1}]}),
    ).toThrow();
    expect(() =>
      parseInvocation({method: 'navigateBrowser', args: [id, 'file:///etc/passwd']}),
    ).toThrow();
    expect(() =>
      parseInvocation({method: 'navigateBrowser', args: [id, 'https://user:secret@example.com/']}),
    ).toThrow();
    expect(() =>
      parseInvocation({
        method: 'inputBrowser',
        args: [id, {type: 'evaluate', expression: 'process.env'}],
      }),
    ).toThrow();
    expect(() =>
      parseInvocation({
        method: 'inputBrowser',
        args: [id, {type: 'pointer', action: 'down', button: 'left', x: 50000, y: 0}],
      }),
    ).toThrow();
    expect(
      parseInvocation({
        method: 'startTemporaryBrowser',
        args: [{profileId: id, revision: 1, acceptTemporary: true}],
      }),
    ).toMatchObject({method: 'startTemporaryBrowser'});
  });
  it('rejects remote origins, lookalike hosts and child frames', () => {
    expect(isTrustedFrame('ecdys://app/index.html', true)).toBe(true);
    expect(isTrustedFrame('https://ecdys.app', true)).toBe(false);
    expect(isTrustedFrame('ecdys://app.evil/index.html', true)).toBe(false);
    expect(isTrustedFrame('ecdys://app/index.html', false)).toBe(false);
  });
  it('rejects arbitrary method names and invalid mutation arguments', () => {
    expect(() => parseInvocation({method: 'constructor', args: []})).toThrow();
    expect(() =>
      parseInvocation({method: 'updateProfile', args: ['not-a-uuid', -1, {name: 'Research'}]}),
    ).toThrow();
    expect(() => parseInvocation({method: 'status', args: ['unexpected']})).toThrow();
  });
  it('does not serialize SQL statements, stacks or secret-bearing exception messages', () => {
    const output = safeError(new Error('SQL password=private'));
    expect(JSON.stringify(output)).not.toContain('private');
    expect(output.code).toBe('INTERNAL_ERROR');
  });
  it('admits bounded proxy previews and rejects duplicate bulk targets and arbitrary destinations', () => {
    expect(
      parseInvocation({method: 'previewProxyImport', args: ['socks5://proxy.test:1080']}),
    ).toMatchObject({method: 'previewProxyImport'});
    const target = {id: '19ab1b20-cc99-4a9b-8ae4-d99dc272d192', revision: 1};
    expect(() =>
      parseInvocation({
        method: 'changeProxyRoutes',
        args: [{targets: [target, target], choice: {mode: 'assign', endpointId: target.id}}],
      }),
    ).toThrow();
    expect(() =>
      parseInvocation({method: 'testProxyEndpoint', args: [target.id, 'https://arbitrary.test']}),
    ).toThrow();
  });
});
