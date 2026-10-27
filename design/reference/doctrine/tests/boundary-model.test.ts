import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareDestination, createWorkspaceExport, type ExportWorkspace } from '../src/components/generated/EcDysBoundaryModel.ts';

test('normalizes HTTP/S addresses and identifies the actual recipient including a port', () => {
  const result = prepareDestination(' HTTPS://Example.ORG:8443/a b?x=1#part ');
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.destination, {
    url: 'https://example.org:8443/a%20b?x=1#part', recipient: 'example.org:8443', kind: 'address',
    payload: 'https://example.org:8443/a%20b?x=1#part', scheme: 'https',
  });
  const http = prepareDestination('http://example.org');
  assert.equal(http.ok && http.destination.scheme, 'http');
});

test('recognizes domain-plus-port, IDN, and explicit localhost addresses', () => {
  for (const [input, recipient] of [['example.org:8443/path', 'example.org:8443'], ['bücher.de', 'xn--bcher-kva.de'], ['http://localhost:3000', 'localhost:3000'], ['127.0.0.1:8080', '127.0.0.1:8080']]) {
    const result = prepareDestination(input);
    assert.equal(result.ok && result.destination.recipient, recipient, input);
    assert.equal(result.ok && result.destination.kind, 'address');
  }
});

test('rejects executable, file, custom, and relative protocols', () => {
  for (const input of ['javascript:alert(1)', 'data:text/html,<h1>x</h1>', 'file:///etc/passwd', 'mailto:user@example.org', 'ftp://example.org', 'custom:thing', '//example.org']) {
    const result = prepareDestination(input);
    assert.equal(result.ok, false, input);
    if (!result.ok) for (const field of ['happened', 'meaning', 'next'] as const) assert.ok(result.error[field]);
  }
});

test('rejects credentials and URLs that URL() would otherwise silently repair', () => {
  for (const input of ['https://user:secret@example.org', 'https://user@example.org', 'https://@example.org', 'https:/example.org', 'https:example.org', 'https:///example.org', 'https://', 'https://exa mple.org', 'https://[invalid]', 'https://example.org:99999', 'https://example.org\\@evil.example']) {
    assert.equal(prepareDestination(input).ok, false, input);
  }
});

test('preserves the exact search query and its encoded boundary', () => {
  const query = '  cables & notes / #2? ü +  ';
  const result = prepareDestination(query);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.destination.kind, 'search');
  assert.equal(result.destination.recipient, 'duckduckgo.com');
  assert.equal(result.destination.payload, query);
  const target = new URL(result.destination.url);
  assert.equal(target.searchParams.get('q'), query);
  assert.equal([...target.searchParams].length, 1);
  assert.equal(target.hash, '');
});

test('empty inputs and hidden control characters produce actionable errors', () => {
  for (const input of ['', '   ', 'terms\nother terms', 'https://example.org/a\u0000b']) assert.equal(prepareDestination(input).ok, false, input);
});

const workspace: ExportWorkspace = {
  notes: [{ id: 'n1', title: 'Note', body: 'private note body', updatedAt: '2026-10-27T05:00:00Z' }],
  bookmarks: [{ id: 'b1', title: 'Private bookmark', url: 'https://example.org/private', createdAt: '2026-10-27T04:00:00Z' }],
  activity: [{ id: 'e1', at: '2026-10-27T05:00:00Z', message: 'private activity event' }],
  destinations: [{ id: 'd1', url: 'https://example.org/staged', recipient: 'example.org', kind: 'address', payload: 'https://example.org/staged', scheme: 'https', preparedAt: '2026-10-27T05:20:00Z' }, { id: 'd2', url: 'https://example.org/requested', recipient: 'example.org', kind: 'address', payload: 'https://example.org/requested', scheme: 'https', preparedAt: '2026-10-27T05:21:00Z', requestedAt: '2026-10-27T05:22:00Z' }],
};
const now = '2026-10-27T05:30:00.000Z';

test('no export occurs without an explicit collection selection', () => {
  assert.equal(createWorkspaceExport(workspace, { notes: false, bookmarks: false, activity: false, destinations: false }, now), null);
});

test('granular exports contain only selected collections, no hidden counts or unrelated metadata', () => {
  for (const selected of ['notes', 'bookmarks', 'activity', 'destinations'] as const) {
    const result = createWorkspaceExport(workspace, { notes: selected === 'notes', bookmarks: selected === 'bookmarks', activity: selected === 'activity', destinations: selected === 'destinations' }, now);
    assert.ok(result);
    const data = JSON.parse(result.text);
    assert.deepEqual(Object.keys(data).sort(), ['schema', 'version', 'exportedAt', selected].sort());
    assert.deepEqual(data[selected], workspace[selected]);
    assert.match(data.schema, /plaintext/);
    assert.equal(data.exportedAt, now);
    assert.equal(result.filename, 'ecDys-workspace-2026-10-27.json');
    for (const omitted of ['notes', 'bookmarks', 'activity', 'destinations'] as const) if (omitted !== selected) assert.equal(Object.hasOwn(data, omitted), false);
  }
});

test('export does not mutate data and excludes undeclared runtime object properties', () => {
  const input = structuredClone(workspace);
  (input.notes[0] as ExportWorkspace['notes'][number] & { secret: string }).secret = 'unlisted runtime property';
  const before = JSON.stringify(input);
  const result = createWorkspaceExport(input, { notes: true, bookmarks: true, activity: false, destinations: false }, now);
  assert.ok(result);
  assert.equal(result.text.includes('unlisted runtime property'), false);
  assert.equal(result.text.includes('private activity event'), false);
  assert.equal(JSON.stringify(input), before);
});

test('an invalid timestamp is rejected rather than inventing an export time', () => {
  assert.throws(() => createWorkspaceExport(workspace, { notes: true, bookmarks: false, activity: false, destinations: false }, 'unknown'), RangeError);
});
