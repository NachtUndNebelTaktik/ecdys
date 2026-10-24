import {describe, expect, it} from 'vitest';
import {parseProxyImport, previewProxyImport} from './route-import';

describe('proxy import', () => {
  it('accepts authenticated SOCKS5 and CONNECT URIs with encoded credentials and IPv6', () => {
    const rows = parseProxyImport(
      'socks5://operator:p%40ss%3Aword@127.0.0.1:1080\nhttps://[::1]:8443',
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({kind: 'socks5', password: 'p@ss:word', remoteDNS: true});
    expect(rows[1]).toMatchObject({
      kind: 'http_connect',
      host: '::1',
      port: 8443,
      tlsToProxy: true,
    });
  });
  it('validates structured JSON and removes exact duplicates', () => {
    const entry = {
      kind: 'socks5',
      host: 'proxy.test',
      port: 1080,
      username: 'op',
      password: 'secret',
    };
    const source = JSON.stringify([entry, entry]);
    expect(parseProxyImport(source)).toHaveLength(1);
    expect(previewProxyImport(source)).toMatchObject({valid: true, count: 1, duplicates: 1});
  });
  it('redacts secrets from valid and invalid previews and rejects the entire invalid import', () => {
    const valid = previewProxyImport('socks5://op:private-password@proxy.test:1080');
    expect(valid.entries[0]?.route).toMatchObject({hasPassword: true});
    expect(JSON.stringify(valid)).not.toContain('private-password');
    const source = 'socks5://op:private-password@proxy.test:1080\nftp://op:other-secret@bad.test';
    expect(previewProxyImport(source)).toMatchObject({valid: false, issues: [{line: 2}]});
    expect(JSON.stringify(previewProxyImport(source))).not.toContain('other-secret');
    expect(() => parseProxyImport(source)).toThrow(
      'Fix the invalid proxy entries before importing.',
    );
  });
  it('rejects paths, header injection, oversized credentials, excess entries and local DNS', () => {
    for (const source of [
      'socks5://proxy.test:1080/path',
      'socks5://op:bad%0D%0Aheader@proxy.test:1080',
      'socks5://op:' + 'a'.repeat(256) + '@proxy.test:1080',
      JSON.stringify([{kind: 'socks5', host: 'proxy.test', port: 1080, remoteDNS: false}]),
      Array.from({length: 101}, (_, i) => 'socks5://proxy' + i + '.test:1080').join('\n'),
    ])
      expect(previewProxyImport(source).valid).toBe(false);
  });
});
