import {createEffect, createMemo, createSignal, For, onMount, Show} from 'solid-js';
import type {
  EcdysApi,
  Profile,
  ProxyChange,
  ProxyChangeResult,
  ProxyDiagnostic,
  ProxyImportPreview,
  ProxyPool,
  PublicRoute,
} from '@ecdys/shared';
import {Modal} from './Modal';

function address(route: PublicRoute | null): string {
  if (!route) return 'Direct · device network';
  if (route.kind === 'vpn') return route.provider.toUpperCase() + ' · ' + route.endpoint;
  return (route.host.includes(':') ? '[' + route.host + ']' : route.host) + ':' + route.port;
}
function protocol(route: PublicRoute): string {
  return route.kind === 'socks5'
    ? 'SOCKS5'
    : route.kind === 'vpn'
      ? 'VPN'
      : route.tlsToProxy
        ? 'HTTPS CONNECT'
        : 'HTTP CONNECT';
}
export function RoutesWorkspace(props: {
  api: EcdysApi;
  profiles: Profile[];
  refresh: () => Promise<void>;
  edit: (profile: Profile) => void;
}) {
  const [pools, setPools] = createSignal<ProxyPool[]>([]);
  const [poolId, setPoolId] = createSignal(''),
    [endpointId, setEndpointId] = createSignal('');
  const [selected, setSelected] = createSignal(new Set<string>());
  const [busy, setBusy] = createSignal(false),
    [error, setError] = createSignal('');
  const [importing, setImporting] = createSignal(false),
    [name, setName] = createSignal(''),
    [source, setSource] = createSignal('');
  const [preview, setPreview] = createSignal<ProxyImportPreview>();
  const [change, setChange] = createSignal<ProxyChange>(),
    [deleting, setDeleting] = createSignal<ProxyPool>();
  const [results, setResults] = createSignal<ProxyChangeResult[]>([]);
  const [diagnostics, setDiagnostics] = createSignal<Record<string, ProxyDiagnostic>>({});
  const [testing, setTesting] = createSignal(new Set<string>());
  const pool = createMemo(() => pools().find((entry) => entry.id === poolId()));
  const targets = () =>
    props.profiles
      .filter((profile) => selected().has(profile.id))
      .map(({id, revision}) => ({id, revision}));
  const allSelected = () =>
    props.profiles.length > 0 && props.profiles.every((profile) => selected().has(profile.id));
  const changedCount = () => results().filter((result) => result.ok).length;
  const failedCount = () => results().length - changedCount();
  const refreshPools = async () => setPools(await props.api.listProxyPools());
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The route operation failed.');
    } finally {
      setBusy(false);
    }
  }
  createEffect(() => {
    if (!pools().some((entry) => entry.id === poolId())) setPoolId(pools()[0]?.id || '');
  });
  createEffect(() => {
    if (!pool()?.endpoints.some((entry) => entry.id === endpointId()))
      setEndpointId(pool()?.endpoints[0]?.id || '');
  });
  onMount(() => void run(refreshPools));
  function toggle(id: string, checked: boolean) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  async function test(id: string) {
    setTesting((previous) => new Set([...previous, id]));
    setError('');
    try {
      const report = await props.api.testProxyEndpoint(id);
      setDiagnostics((previous) => ({...previous, [id]: report}));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The tunnel test failed.');
    } finally {
      setTesting((previous) => {
        const next = new Set(previous);
        next.delete(id);
        return next;
      });
    }
  }
  function closeImport() {
    if (!busy()) {
      setImporting(false);
      setSource('');
      setName('');
      setPreview();
      setError('');
    }
  }
  function prepare(mode: 'assign' | 'rotate') {
    setError('');
    setResults([]);
    setChange({
      targets: targets(),
      choice: mode === 'assign' ? {mode, endpointId: endpointId()} : {mode, poolId: poolId()},
    });
  }
  return (
    <div class="routes-workspace">
      <Show when={error() && !importing() && !change() && !deleting()}>
        <div class="message error" role="alert">
          {error()}
        </div>
      </Show>
      <section class="proxy-library">
        <header class="route-section-heading">
          <div>
            <span class="stamp">ROUTE LIBRARY</span>
            <h2>Your exits. Under your control.</h2>
            <p>Encrypted proxy pools, deliberate switching and a checkpoint before every change.</p>
          </div>
          <button
            class="button primary"
            disabled={busy()}
            onClick={() => {
              setImporting(true);
              setError('');
            }}
          >
            ＋ Import proxy pool
          </button>
        </header>
        <div class="route-library-layout">
          <aside class="pool-sidebar" aria-label="Proxy pools">
            <div class="pool-count">
              <span>ENCRYPTED POOLS</span>
              <strong>{pools().length} / 20</strong>
            </div>
            <For each={pools()}>
              {(entry) => (
                <button
                  class={'pool-choice ' + (poolId() === entry.id ? 'selected' : '')}
                  onClick={() => setPoolId(entry.id)}
                >
                  <span>◇</span>
                  <strong>{entry.name}</strong>
                  <small>{entry.endpoints.length}</small>
                </button>
              )}
            </For>
            <Show when={!pools().length}>
              <p class="pool-hint">
                Import SOCKS5 or CONNECT endpoints to build a reusable route library.
              </p>
            </Show>
            <div class="pool-footnote">
              <span class="status-dot" /> Stored in your local vault
            </div>
          </aside>
          <div class="pool-content">
            <Show
              when={pool()}
              fallback={
                <div class="pool-empty">
                  <span class="empty-symbol">⇄</span>
                  <h3>Start with a proxy pool.</h3>
                  <p>
                    Paste provider URIs or a JSON array. Preview entries before saving any
                    credentials.
                  </p>
                  <code>socks5://user:password@host:1080</code>
                </div>
              }
            >
              {(current) => (
                <>
                  <div class="pool-header">
                    <div>
                      <h3>{current().name}</h3>
                      <p>
                        {current().endpoints.length} endpoints · Remote destination DNS for SOCKS5
                      </p>
                    </div>
                    <button
                      class="text-button"
                      disabled={busy()}
                      onClick={() => {
                        setDeleting(current());
                        setError('');
                      }}
                    >
                      Delete pool
                    </button>
                  </div>
                  <div class="endpoint-list">
                    <For each={current().endpoints}>
                      {(endpoint) => (
                        <article class="endpoint-card">
                          <div class="endpoint-heading">
                            <span class="pill">{protocol(endpoint.route)}</span>
                            <span class="endpoint-auth">
                              {endpoint.route.hasPassword
                                ? 'Encrypted authentication'
                                : 'No authentication'}
                            </span>
                          </div>
                          <strong class="endpoint-address">{address(endpoint.route)}</strong>
                          <div class="endpoint-meta">
                            <span>
                              {endpoint.route.username
                                ? 'User: ' + endpoint.route.username
                                : 'Anonymous proxy authentication'}
                            </span>
                            <button
                              class="text-button"
                              disabled={testing().has(endpoint.id)}
                              onClick={() => void test(endpoint.id)}
                            >
                              {testing().has(endpoint.id) ? 'Testing…' : 'Test tunnel ↗'}
                            </button>
                          </div>
                          <Show when={diagnostics()[endpoint.id]}>
                            {(report) => (
                              <div class={'tunnel-report ' + report().state} role="status">
                                <strong>
                                  {report().state === 'pass' ? 'Tunnel accepted' : 'Tunnel failed'}{' '}
                                  · {report().durationMs} ms
                                </strong>
                                <p>{report().message}</p>
                                <time>{new Date(report().checkedAt).toLocaleTimeString()}</time>
                              </div>
                            )}
                          </Show>
                        </article>
                      )}
                    </For>
                  </div>
                </>
              )}
            </Show>
          </div>
        </div>
        <div class="route-observation-note">
          <span>◇</span>
          <p>
            <strong>Every test is an explicit network action.</strong> Tests contact the selected
            proxy and request a tunnel to example.com:443. They do not check your public IP or
            establish a browsing session. SOCKS5 and plain HTTP proxy authentication are not
            encrypted in transit; HTTPS CONNECT verifies the proxy’s TLS certificate.
          </p>
        </div>
      </section>

      <section class="route-assignments">
        <div class="route-section-heading">
          <div>
            <span class="stamp">PROFILE ROUTES</span>
            <h2>Switch with a way back.</h2>
          </div>
          <span class="pill">{targets().length} SELECTED</span>
        </div>
        <div class="route-controls">
          <label>
            Proxy pool
            <select
              aria-label="Proxy pool"
              value={poolId()}
              disabled={!pools().length || busy()}
              onChange={(event) => setPoolId(event.currentTarget.value)}
            >
              <For each={pools()}>{(entry) => <option value={entry.id}>{entry.name}</option>}</For>
            </select>
          </label>
          <label>
            Endpoint
            <select
              aria-label="Pool endpoint"
              value={endpointId()}
              disabled={!pool() || busy()}
              onChange={(event) => setEndpointId(event.currentTarget.value)}
            >
              <For each={pool()?.endpoints}>
                {(entry) => (
                  <option value={entry.id}>
                    {protocol(entry.route)} · {address(entry.route)}
                  </option>
                )}
              </For>
            </select>
          </label>
          <button
            class="button"
            disabled={!targets().length || !endpointId() || busy()}
            onClick={() => prepare('assign')}
          >
            Assign endpoint
          </button>
          <button
            class="button"
            disabled={!targets().length || !poolId() || busy()}
            onClick={() => prepare('rotate')}
          >
            Rotate from pool
          </button>
        </div>
        <div class="route-profile-table">
          <div class="route-profile-head">
            <input
              type="checkbox"
              aria-label="Select all profiles for route change"
              checked={allSelected()}
              onChange={(event) =>
                setSelected(
                  event.currentTarget.checked
                    ? new Set(props.profiles.map(({id}) => id))
                    : new Set(),
                )
              }
            />
            <span>PROFILE</span>
            <span>CONFIGURED ROUTE</span>
            <span>RECOVERY</span>
            <span />
          </div>
          <For each={props.profiles}>
            {(profile) => (
              <div class={'route-profile-row ' + (selected().has(profile.id) ? 'selected' : '')}>
                <input
                  type="checkbox"
                  aria-label={'Select ' + profile.name}
                  checked={selected().has(profile.id)}
                  onChange={(event) => toggle(profile.id, event.currentTarget.checked)}
                />
                <div>
                  <strong>{profile.name}</strong>
                  <small>
                    {profile.policy === 'protected_execution' ? 'Protected execution' : 'Standard'}{' '}
                    · REV {profile.revision}
                  </small>
                </div>
                <div class="assigned-route">
                  <span>{profile.route ? protocol(profile.route) : 'NO ROUTE'}</span>
                  <strong>{address(profile.route)}</strong>
                </div>
                <span class="recovery-count">{profile.snapshotCount} checkpoints</span>
                <button class="text-button" onClick={() => props.edit(profile)}>
                  Edit ↗
                </button>
              </div>
            )}
          </For>
          <Show when={!props.profiles.length}>
            <div class="small-empty">Create a profile to assign its first route.</div>
          </Show>
        </div>
        <Show when={results().length}>
          <div class="route-results" role="status">
            <strong>
              {changedCount()} {changedCount() === 1 ? 'route changed' : 'routes changed'}
            </strong>
            <span>
              {failedCount()
                ? failedCount() + ' failed; successful changes were kept.'
                : 'Previous routes are saved in configuration history.'}
            </span>
            <For each={results().filter((result) => !result.ok)}>
              {(result) => (
                <p>
                  {props.profiles.find(({id}) => id === result.profileId)?.name ||
                    'Removed profile'}
                  : {!result.ok && result.error.message}
                </p>
              )}
            </For>
          </div>
        </Show>
        <p class="field-help">
          These operations update saved configuration. Temporary browsing uses the selected Direct
          or proxy policy. Persistent sessions still require native enforcement and protected
          browser storage.
        </p>
      </section>

      <Show when={importing()}>
        <Modal
          title="Import proxy pool"
          subtitle="Preview your endpoints before storing an encrypted local pool."
          close={closeImport}
        >
          <div class="form-grid">
            <label class="span-two">
              Pool name
              <input
                value={name()}
                maxLength={80}
                onInput={(event) => setName(event.currentTarget.value)}
                placeholder="Research exits"
              />
            </label>
            <label class="span-two">
              Proxy entries
              <textarea
                class="proxy-source"
                value={source()}
                maxLength={131_072}
                spellcheck={false}
                autocomplete="off"
                onInput={(event) => {
                  setSource(event.currentTarget.value);
                  setPreview();
                }}
                placeholder={
                  'socks5://user:password@proxy.example:1080\nhttps://proxy.example:8443'
                }
              />
            </label>
          </div>
          <p class="field-help">
            One URI per line or a JSON array. Use socks5://, socks5h://, http:// or https://. Encode
            special characters in URI credentials. Up to 100 entries per import; exact duplicates
            are removed.
          </p>
          <Show when={preview()}>
            {(report) => (
              <div class="import-preview">
                <strong>
                  {report().valid ? report().count + ' endpoints ready' : 'Fix the invalid entries'}
                </strong>
                <Show when={report().duplicates}>
                  <p>{report().duplicates} duplicate entries removed</p>
                </Show>
                <For each={report().entries.slice(0, 8)}>
                  {(entry) => (
                    <p>
                      {entry.line}. {protocol(entry.route)} · {address(entry.route)} ·{' '}
                      {entry.route.hasPassword ? 'Credential included' : 'No credential'}
                    </p>
                  )}
                </For>
                <Show when={report().entries.length > 8}>
                  <p>＋ {report().entries.length - 8} more endpoints</p>
                </Show>
                <For each={report().issues}>
                  {(issue) => (
                    <p class="import-issue">
                      {issue.line ? 'Entry ' + issue.line + ': ' : ''}
                      {issue.message}
                    </p>
                  )}
                </For>
              </div>
            )}
          </Show>
          <Show when={error()}>
            <p class="form-note" role="alert">
              {error()}
            </p>
          </Show>
          <div class="modal-actions">
            <button class="button" disabled={busy()} onClick={closeImport}>
              Cancel
            </button>
            <button
              class="button"
              disabled={busy() || !source().trim()}
              onClick={() =>
                void run(async () => setPreview(await props.api.previewProxyImport(source())))
              }
            >
              Preview import
            </button>
            <button
              class="button primary"
              disabled={busy() || !preview()?.valid || !name().trim()}
              onClick={() =>
                void run(async () => {
                  const saved = await props.api.importProxyPool({name: name(), source: source()});
                  await refreshPools();
                  setPoolId(saved.id);
                  setImporting(false);
                  setSource('');
                  setName('');
                  setPreview();
                })
              }
            >
              Save encrypted pool
            </button>
          </div>
        </Modal>
      </Show>
      <Show when={change()}>
        {(request) => (
          <Modal
            title={
              request().choice.mode === 'assign' ? 'Assign proxy endpoint?' : 'Rotate proxy routes?'
            }
            subtitle={
              'Apply to ' +
              request().targets.length +
              ' profiles. Each successful change saves a checkpoint first.'
            }
            close={() => {
              if (!busy()) setChange();
            }}
          >
            <p class="confirmation-copy">
              {request().choice.mode === 'assign'
                ? 'The selected endpoint replaces each selected profile’s saved route.'
                : 'Each profile advances to a different endpoint in this pool. Profiles without an alternative remain unchanged.'}{' '}
              Names, tags, policies and other settings are preserved. Review previous routes in
              configuration history.
            </p>
            <Show when={error()}>
              <p class="form-note" role="alert">
                {error()}
              </p>
            </Show>
            <div class="modal-actions">
              <button class="button" disabled={busy()} onClick={() => setChange()}>
                Cancel
              </button>
              <button
                class="button primary"
                disabled={busy()}
                onClick={() =>
                  void run(async () => {
                    setResults(await props.api.changeProxyRoutes(request()));
                    await props.refresh();
                    setChange();
                  })
                }
              >
                Apply route changes
              </button>
            </div>
          </Modal>
        )}
      </Show>
      <Show when={deleting()}>
        {(entry) => (
          <Modal
            title="Delete proxy pool?"
            close={() => {
              if (!busy()) setDeleting();
            }}
          >
            <p class="confirmation-copy">
              Remove “{entry().name}” and its saved endpoints from the library. Routes already
              assigned to profiles and their configuration checkpoints are retained with independent
              credentials.
            </p>
            <Show when={error()}>
              <p class="form-note" role="alert">
                {error()}
              </p>
            </Show>
            <div class="modal-actions">
              <button class="button" disabled={busy()} onClick={() => setDeleting()}>
                Cancel
              </button>
              <button
                class="button danger"
                disabled={busy()}
                onClick={() =>
                  void run(async () => {
                    await props.api.deleteProxyPool(entry().id, entry().revision);
                    await refreshPools();
                    setDeleting();
                  })
                }
              >
                Delete saved pool
              </button>
            </div>
          </Modal>
        )}
      </Show>
    </div>
  );
}
