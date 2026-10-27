/** Pure preview logic. Staging a destination performs no network request. */
export type Destination = {
  url: string;
  recipient: string;
  kind: 'address' | 'search';
  payload: string;
  scheme: 'http' | 'https';
};

type DestinationResult =
  | { ok: true; destination: Destination }
  | { ok: false; error: { happened: string; meaning: string; next: string } };

const failure = (happened: string, meaning: string, next: string): DestinationResult => ({
  ok: false,
  error: { happened, meaning, next },
});

/** Domain-like input is an address; ambiguous prose remains a search query. */
function looksLikeAddress(input: string): boolean {
  const authority = input.split(/[/?#]/, 1)[0];
  if (/\s/.test(authority) || authority.includes('@')) return false;
  if (/^\[[0-9a-f:.]+\](?::\d+)?$/i.test(authority)) return true;
  const hostname = authority.replace(/:\d+$/, '');
  if (hostname === 'localhost') return true;
  if (!hostname.includes('.') || hostname.includes(':')) return false;
  return hostname.split('.').every(label =>
    label.length > 0 && !label.startsWith('-') && !label.endsWith('-') && /^[\p{L}\p{N}-]+$/u.test(label),
  );
}

function stageAddress(input: string): DestinationResult {
  if (!/^https?:\/\//i.test(input) || /[\u0000-\u001f\u007f\\]/.test(input)) {
    return failure(
      'The address is not a valid HTTP or HTTPS URL.',
      'No destination has been staged.',
      'Use a complete address such as https://example.org and remove control characters or backslashes.',
    );
  }
  // URL() repairs extra or missing slashes. Reject those repairs at this boundary.
  const authority = input.slice(input.indexOf('//') + 2).split(/[/?#]/, 1)[0];
  if (!authority || /\s/.test(authority)) {
    return failure('The address has no valid host.', 'No destination has been staged.', 'Enter the destination host after http:// or https://.');
  }
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return failure('The address could not be parsed.', 'No destination has been staged.', 'Check the host, port, and URL syntax, then try again.');
  }
  if (parsed.username || parsed.password || authority.includes('@')) {
    return failure(
      'The address contains embedded credentials.',
      'A username or password could be exposed when this address is opened.',
      'Remove the credentials and enter the destination address again.',
    );
  }
  if (!parsed.hostname || !['http:', 'https:'].includes(parsed.protocol)) {
    return failure('The address has no supported destination.', 'This preview stages HTTP and HTTPS addresses only.', 'Enter an HTTP or HTTPS address.');
  }
  return {
    ok: true,
    destination: {
      url: parsed.href,
      recipient: parsed.host,
      kind: 'address',
      payload: parsed.href,
      scheme: parsed.protocol === 'https:' ? 'https' : 'http',
    },
  };
}

export function prepareDestination(raw: string): DestinationResult {
  const input = raw.trim();
  if (!input) return failure('No address or query was entered.', 'There is no destination to review.', 'Enter a website address or search query.');
  if (/^https?:/i.test(input)) return stageAddress(input);

  // A domain plus port (example.org:8443) is not a URI scheme.
  if (looksLikeAddress(input)) return stageAddress(`https://${input}`);
  if (/^[a-z][a-z\d+.-]*:/i.test(input) || input.startsWith('//')) {
    return failure('This address uses an unsupported or missing scheme.', 'This preview does not open executable, file, or custom-protocol addresses.', 'Use an explicit http:// or https:// address.');
  }
  if (/[\u0000-\u001f\u007f]/.test(raw)) {
    return failure('The query contains control characters.', 'Those characters are not included in a staged request.', 'Remove the control characters and try again.');
  }
  const url = `https://duckduckgo.com/?q=${encodeURIComponent(raw)}`;
  return {
    ok: true,
    destination: {
      url,
      recipient: 'duckduckgo.com',
      kind: 'search',
      payload: raw,
      scheme: 'https',
    },
  };
}

export type ExportSelection = { notes: boolean; bookmarks: boolean; activity: boolean; destinations: boolean };
export type ExportWorkspace = {
  notes: Array<{ id: string; title: string; body: string; updatedAt: string }>;
  bookmarks: Array<{ id: string; title: string; url: string; createdAt: string }>;
  activity: Array<{ id: string; at: string; message: string }>;
  destinations: Array<Destination & { id: string; preparedAt: string; requestedAt?: string }>;
};

/** Explicitly plaintext. Unselected collections and their counts are absent. */
export function createWorkspaceExport(
  workspace: ExportWorkspace,
  selection: ExportSelection,
  now: string,
): { filename: string; text: string } | null {
  if (!selection.notes && !selection.bookmarks && !selection.activity && !selection.destinations) return null;
  const instant = new Date(now);
  if (!Number.isFinite(instant.getTime())) throw new RangeError('Export timestamp is invalid.');
  const content: Record<string, unknown> = {
    schema: 'ecDys.workspace.plaintext',
    version: 1,
    exportedAt: now,
  };
  if (selection.notes) content.notes = workspace.notes.map(({ id, title, body, updatedAt }) => ({ id, title, body, updatedAt }));
  if (selection.bookmarks) content.bookmarks = workspace.bookmarks.map(({ id, title, url, createdAt }) => ({ id, title, url, createdAt }));
  if (selection.activity) content.activity = workspace.activity.map(({ id, at, message }) => ({ id, at, message }));
  if (selection.destinations) content.destinations = workspace.destinations.map(({ id, url, recipient, kind, payload, scheme, preparedAt, requestedAt }) => ({
    id, url, recipient, kind, payload, scheme, preparedAt,
    ...(requestedAt === undefined ? {} : { requestedAt }),
  }));
  return {
    filename: `ecDys-workspace-${instant.toISOString().slice(0, 10)}.json`,
    text: `${JSON.stringify(content, null, 2)}\n`,
  };
}
