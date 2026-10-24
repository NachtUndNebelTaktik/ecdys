import {Modal} from './Modal';
import {RoutesWorkspace} from './RoutesWorkspace';
import {BrowserWorkspace} from './BrowserWorkspace';
import {AppearanceControls, AppearancePreview} from './BrowserAppearance';
import {
  accentColors,
  defaultAppearance,
  orderProfiles,
  readAppearance,
  saveAppearance,
  type Appearance,
} from './appearance';
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  type JSX,
} from 'solid-js';
import {
  evaluateLaunch,
  type EcdysApi,
  type Profile,
  type ProfileDraft,
  type Snapshot,
  type VaultStatus,
} from '@ecdys/shared';

const integrations = [
  {
    name: 'Native route enforcement',
    detail: 'Required before any browsing session can launch.',
    category: 'NETWORK',
  },
  {
    name: 'SOCKS5 / proxy switching',
    state: 'PARTIAL',
    detail:
      'Encrypted pools, tunnel diagnostics and recoverable configuration switching are available. Native traffic switching is pending.',
    category: 'NETWORK',
  },
  {
    name: 'Managed Chromium',
    detail: 'Browser provisioning, fingerprint controls and WebRTC validation are pending.',
    category: 'BROWSER',
  },
  {
    name: 'Protected browser storage',
    detail:
      'The configuration vault is encrypted. A protected live browser filesystem is still required.',
    category: 'STORAGE',
  },
  {
    name: 'Monero payments',
    detail: 'Required payment integration. No wallet, invoice or merchant service is connected.',
    category: 'COMMERCE',
  },
  {
    name: 'Self-hosted team feature',
    detail: 'Invites, shared profiles, leases and audits remain in the implementation plan.',
    category: 'COLLABORATION',
  },
  {
    name: 'Selenium & playground',
    detail: 'The authenticated driver gateway and isolated runtime are pending.',
    category: 'AUTOMATION',
  },
  {
    name: 'Signed updates',
    detail: 'Release signing, compatibility checks and rollback are pending.',
    category: 'MAINTENANCE',
  },
];
type View = 'Profiles' | 'Browser' | 'Routes' | 'Snapshots' | 'Diagnostics' | 'Settings';
function Mark() {
  return (
    <span class="brand-mark" aria-hidden="true">
      e
      <svg viewBox="0 0 16 16" fill="none">
        <path
          d="M4 12 12 4M4 4h8v8"
          stroke="currentColor"
          stroke-width="1.4"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </span>
  );
}
function Pill(props: {children: JSX.Element; tone?: string}) {
  return <span class={'pill ' + (props.tone || '')}>{props.children}</span>;
}
function Stamp(props: {children: JSX.Element}) {
  return <span class="stamp">{props.children}</span>;
}
function RouteLabel(props: {profile: Profile}) {
  const route = () => props.profile.route;
  return (
    <Show when={route()} fallback={<span class="muted">No route configured</span>}>
      <span class="route-label">
        <span class="small-square" />
        {route()?.kind === 'vpn'
          ? (route() as Extract<Profile['route'], {kind: 'vpn'}>).provider
          : route()?.kind === 'socks5'
            ? 'SOCKS5'
            : 'HTTP CONNECT'}
        <span class="muted route-host">
          {route()?.kind === 'vpn'
            ? (route() as Extract<Profile['route'], {kind: 'vpn'}>).endpoint
            : (route() as Extract<Profile['route'], {kind: 'socks5' | 'http_connect'}>).host}
        </span>
      </span>
    </Show>
  );
}

export default function App() {
  const api = window.ecdys;
  const preferenceStorage = {
    getItem: (key: string) => window.localStorage.getItem(key),
    setItem: (key: string, value: string) => window.localStorage.setItem(key, value),
  };
  const initialAppearance = readAppearance(preferenceStorage);
  const [appearance, setAppearance] = createSignal(initialAppearance.preferences);
  const [appearanceSaved, setAppearanceSaved] = createSignal(initialAppearance.available);
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
  const [systemDark, setSystemDark] = createSignal(systemTheme.matches);
  const resolvedTheme = createMemo(() =>
    appearance().theme === 'system' ? (systemDark() ? 'dark' : 'light') : appearance().theme,
  );
  function updateAppearance(patch: Partial<Appearance>) {
    const next = {...appearance(), ...patch};
    setAppearance(next);
    setAppearanceSaved(saveAppearance(preferenceStorage, next));
  }
  function resetAppearance() {
    updateAppearance({
      ...defaultAppearance,
      profileOrder: appearance().profileOrder,
      profileLayout: appearance().profileLayout,
    });
  }
  createEffect(() => {
    const root = document.documentElement;
    root.dataset.uiTheme = resolvedTheme();
    root.style.setProperty(
      '--accent',
      accentColors[appearance().accent][resolvedTheme() === 'light' ? 'light' : 'dark'],
    );
    root.style.setProperty('--ui-radius', appearance().radius / 2 + 'px');
    root.style.setProperty('--ui-motion', appearance().motion ? '180ms' : '0ms');
    root.style.setProperty('--night-opacity', String(appearance().nightWarmth / 200));
  });
  const [status, setStatus] = createSignal<VaultStatus>();
  const [profiles, setProfiles] = createSignal<Profile[]>([]);
  const [view, setView] = createSignal<View>('Profiles');
  const [search, setSearch] = createSignal('');
  const [filter, setFilter] = createSignal('all');
  const [selectedId, setSelectedId] = createSignal<string>();
  const [snapshots, setSnapshots] = createSignal<Snapshot[]>([]);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal('');
  const [notice, setNotice] = createSignal('');
  const [editor, setEditor] = createSignal<Profile | 'new'>();
  const [confirm, setConfirm] = createSignal<{
    title: string;
    message: string;
    action: () => Promise<void>;
  }>();
  const [branch, setBranch] = createSignal<Profile>();
  const [branchName, setBranchName] = createSignal('');
  let searchInput!: HTMLInputElement;
  const selected = createMemo(() => profiles().find((profile) => profile.id === selectedId()));
  const filtered = createMemo(() =>
    orderProfiles(profiles(), appearance().profileOrder).filter((profile) => {
      const text = [profile.name, profile.folder, ...profile.tags].join(' ').toLowerCase();
      return (
        text.includes(search().toLowerCase()) &&
        (filter() === 'all' ||
          (filter() === 'protected'
            ? profile.policy === 'protected_execution'
            : profile.tags.includes(filter().slice(4))))
      );
    }),
  );
  const tags = createMemo(() => [...new Set(profiles().flatMap((profile) => profile.tags))].sort());
  async function run(action: () => Promise<void>) {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The operation could not be completed.');
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    setProfiles(await api!.listProfiles());
    setStatus(await api!.status());
  }
  async function lock() {
    await api!.lock();
    setProfiles([]);
    setSnapshots([]);
    setSelectedId();
    setEditor();
    setBranch();
    setConfirm();
    setStatus(await api!.status());
  }
  async function history(profile: Profile) {
    setSelectedId(profile.id);
    await run(async () => {
      setSnapshots(await api!.listSnapshots(profile.id));
      setView('Snapshots');
    });
  }
  function launchReasons(profile: Profile) {
    return evaluateLaunch({
      hasRoute: profile.route !== null,
      nativeRouteReady: false,
      protectedStorageReady: false,
      browserReady: false,
      requiredObservations: ['unavailable'],
    }).reasons;
  }
  onMount(() => {
    const themeChanged = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    systemTheme.addEventListener('change', themeChanged);
    onCleanup(() => systemTheme.removeEventListener('change', themeChanged));
    if (api)
      void run(async () => {
        const current = await api.status();
        setStatus(current);
        if (current.unlocked) await refresh();
      });
    if (api) {
      const unsubscribe = api.onVaultLocked(() => {
        setProfiles([]);
        setSnapshots([]);
        setSelectedId();
        setEditor();
        setBranch();
        setConfirm();
        setError('');
        void api
          .status()
          .then(setStatus)
          .catch(() => setError('The vault was locked. Reopen the workspace to continue.'));
      });
      onCleanup(unsubscribe);
    }
    const shortcut = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === 'k' &&
        status()?.unlocked &&
        !editor()
      ) {
        event.preventDefault();
        setView('Profiles');
        searchInput?.focus();
      }
    };
    window.addEventListener('keydown', shortcut);
    onCleanup(() => window.removeEventListener('keydown', shortcut));
  });
  return (
    <Show
      when={api}
      fallback={
        <div class="bridge-error">
          <Mark />
          <h1>Open ecdys.app on your desktop.</h1>
          <p>
            The privileged desktop bridge is unavailable. This browser view does not create a
            substitute vault.
          </p>
        </div>
      }
    >
      <div class="night-filter" aria-hidden="true" hidden={resolvedTheme() !== 'night'} />
      <Show
        when={status()}
        fallback={
          <div class="loading-screen">
            <Mark />
            <p>Opening local workspace…</p>
            <Show when={error()}>
              <p role="alert">{error()}</p>
            </Show>
          </div>
        }
      >
        <Show
          when={status()?.unlocked}
          fallback={
            <VaultScreen
              api={api!}
              status={status()!}
              busy={busy()}
              error={error()}
              submit={(input) =>
                run(async () => {
                  try {
                    if (status()!.exists) await api!.unlock(input.passphrase);
                    else await api!.createVault(input);
                  } finally {
                    setStatus(await api!.status());
                  }
                  await refresh();
                })
              }
            />
          }
        >
          <div class="application">
            <aside class="sidebar">
              <a class="brand" href="#" onClick={(e) => e.preventDefault()}>
                <Mark />
                <span>
                  ecdys<span class="brand-app">.app</span>
                </span>
              </a>
              <div class="workspace-label">
                <span class="status-dot" />
                <div>
                  <strong>Local workspace</strong>
                  <small>CONFIGURATION VAULT</small>
                </div>
                <span class="tiny">01</span>
              </div>
              <Stamp>WORKSPACE</Stamp>
              <nav aria-label="Workspace navigation">
                <For each={['Profiles', 'Browser', 'Routes', 'Snapshots', 'Diagnostics'] as View[]}>
                  {(item) => (
                    <button
                      class={view() === item ? 'nav-item active' : 'nav-item'}
                      onClick={() => {
                        if (item === 'Snapshots' && selected()) void history(selected()!);
                        else setView(item);
                      }}
                    >
                      <span aria-hidden="true" class="nav-symbol">
                        {
                          {
                            Profiles: '▦',
                            Browser: '▱',
                            Routes: '⇄',
                            Snapshots: '◷',
                            Diagnostics: '⌁',
                          }[item as 'Profiles']
                        }
                      </span>
                      {item}
                      <Show when={item === 'Profiles'}>
                        <span class="nav-count">{profiles().length}</span>
                      </Show>
                    </button>
                  )}
                </For>
              </nav>
              <div class="sidebar-section">
                <Stamp>COLLECTIONS</Stamp>
                <button
                  class={'collection ' + (filter() === 'all' ? 'selected' : '')}
                  onClick={() => {
                    setFilter('all');
                    setView('Profiles');
                  }}
                >
                  All profiles <span>{profiles().length}</span>
                </button>
                <button
                  class={'collection ' + (filter() === 'protected' ? 'selected' : '')}
                  onClick={() => {
                    setFilter('protected');
                    setView('Profiles');
                  }}
                >
                  Protected execution{' '}
                  <span>{profiles().filter((p) => p.policy === 'protected_execution').length}</span>
                </button>
              </div>
              <div class="sidebar-section">
                <Stamp>TAGS</Stamp>
                <Show
                  when={tags().length}
                  fallback={<p class="sidebar-hint">Tags appear as you organize profiles.</p>}
                >
                  <For each={tags()}>
                    {(tag) => (
                      <button
                        class={'tag-nav ' + (filter() === 'tag:' + tag ? 'selected' : '')}
                        onClick={() => {
                          setFilter('tag:' + tag);
                          setView('Profiles');
                        }}
                      >
                        <span>#</span>
                        {tag}
                      </button>
                    )}
                  </For>
                </Show>
              </div>
              <div class="sidebar-bottom">
                <div class="local-note">
                  <span class="status-dot" />
                  <span>
                    Local operation
                    <br />
                    <small>No application telemetry</small>
                  </span>
                </div>
                <button
                  class={'nav-item ' + (view() === 'Settings' ? 'active' : '')}
                  onClick={() => setView('Settings')}
                >
                  <span class="nav-symbol">⚙</span>Settings
                </button>
                <button class="nav-item" onClick={() => void run(lock)} disabled={busy()}>
                  <span class="nav-symbol">↪</span>Lock workspace
                </button>
                <div class="version">
                  FOUNDATION BUILD <span>v0.3.0</span>
                </div>
              </div>
            </aside>
            <main class="main">
              <header class="topbar">
                <div class="breadcrumbs">
                  WORKSPACE <span>/</span> <strong>{view().toUpperCase()}</strong>
                </div>
                <div class="topbar-right">
                  <span class="vault-state">
                    <span class="status-dot" />
                    VAULT UNLOCKED
                  </span>
                  <span class="avatar">OP</span>
                </div>
              </header>
              <section class="page-heading">
                <div>
                  <Stamp>YOUR ENVIRONMENT. YOUR CONTROL.</Stamp>
                  <h1>
                    {view() === 'Profiles'
                      ? 'Profile workspace'
                      : view() === 'Browser'
                        ? 'Browser workspace'
                        : view() === 'Routes'
                          ? 'Network routes'
                          : view() === 'Snapshots'
                            ? 'Configuration history'
                            : view() === 'Diagnostics'
                              ? 'System diagnostics'
                              : 'Workspace settings'}
                  </h1>
                  <p>
                    {view() === 'Profiles'
                      ? 'Persistent identities. Deliberate configuration. Recoverable changes.'
                      : view() === 'Browser'
                        ? 'A calmer surface for your work. Shape it around the way you operate.'
                        : view() === 'Routes'
                          ? 'First-class VPN and proxy configuration, including authenticated SOCKS5.'
                          : view() === 'Snapshots'
                            ? 'Inspect and restore committed configuration checkpoints.'
                            : view() === 'Diagnostics'
                              ? 'Implementation status and the boundaries of this foundation build.'
                              : 'Local ownership, encryption parameters and workspace identity.'}
                  </p>
                </div>
                <Show when={view() === 'Profiles' || view() === 'Routes'}>
                  <button class="button primary" onClick={() => setEditor('new')} disabled={busy()}>
                    <span>＋</span> New profile
                  </button>
                </Show>
              </section>
              <Show when={error()}>
                <div class="message error" role="alert">
                  {error()}
                  <button aria-label="Dismiss error" onClick={() => setError('')}>
                    ×
                  </button>
                </div>
              </Show>
              <Show when={notice()}>
                <div class="message" role="status">
                  {notice()}
                </div>
              </Show>
              <For each={status()?.storageWarnings || []}>
                {(warning) => (
                  <div class="message error" role="alert">
                    {warning}
                  </div>
                )}
              </For>
              <div class="foundation-banner">
                <span class="banner-icon">◇</span>
                <div>
                  <strong>Configuration foundation</strong>
                  <span>
                    Local profiles and encrypted checkpoints are available. Browsing remains blocked
                    until native routing and protected browser storage are implemented.
                  </span>
                </div>
                <button onClick={() => setView('Diagnostics')}>View status ↗</button>
              </div>
              <Show when={view() === 'Profiles'}>
                <div class="metric-grid">
                  <Metric
                    title="SAVED PROFILES"
                    value={String(profiles().length).padStart(2, '0')}
                    detail={'/ ' + status()!.profileLimit + ' local allowance'}
                  />
                  <Metric title="ACTIVE SESSIONS" value="00" detail="Browser integration pending" />
                  <Metric
                    title="CONFIG CHECKPOINTS"
                    value={String(profiles().reduce((n, p) => n + p.snapshotCount, 0)).padStart(
                      2,
                      '0',
                    )}
                    detail="Independently encrypted"
                  />
                  <Metric
                    title="PROTECTED EXECUTION"
                    value={String(
                      profiles().filter((p) => p.policy === 'protected_execution').length,
                    ).padStart(2, '0')}
                    detail="Policy saved per profile"
                  />
                </div>
                <div class="toolbar">
                  <div class="search">
                    <span>⌕</span>
                    <input
                      ref={searchInput}
                      aria-label="Search profiles"
                      placeholder="Search profiles, folders or tags…"
                      value={search()}
                      onInput={(e) => setSearch(e.currentTarget.value)}
                    />
                    <kbd>⌘ / Ctrl K</kbd>
                  </div>
                  <span class="result-count">{filtered().length} PROFILES</span>
                  <select
                    class="profile-view-select"
                    aria-label="Sort profiles"
                    value={appearance().profileOrder}
                    onChange={(event) =>
                      updateAppearance({
                        profileOrder: event.currentTarget.value as Appearance['profileOrder'],
                      })
                    }
                  >
                    <option value="recent">Recently changed</option>
                    <option value="name_asc">Name A–Z</option>
                    <option value="name_desc">Name Z–A</option>
                    <option value="created">Newest created</option>
                  </select>
                  <select
                    class="profile-view-select layout-select"
                    aria-label="Profile layout"
                    value={appearance().profileLayout}
                    onChange={(event) =>
                      updateAppearance({
                        profileLayout: event.currentTarget.value as Appearance['profileLayout'],
                      })
                    }
                  >
                    <option value="grid">▦ Grid</option>
                    <option value="list">☷ List</option>
                  </select>
                  <Show when={filter() !== 'all'}>
                    <button class="text-button" onClick={() => setFilter('all')}>
                      Clear filter ×
                    </button>
                  </Show>
                </div>
                <div class="workspace-content">
                  <div
                    class={
                      'profile-grid ' +
                      (appearance().profileLayout === 'list' ? 'profile-list' : '')
                    }
                  >
                    <Show
                      when={filtered().length > 0}
                      fallback={
                        <div class="empty-state">
                          <div class="empty-symbol">▦</div>
                          <Stamp>A CLEAN START</Stamp>
                          <h2>
                            {profiles().length
                              ? 'No matching profiles'
                              : 'Your workspace starts here.'}
                          </h2>
                          <p>
                            {profiles().length
                              ? 'Try a different search or collection.'
                              : 'Create a persistent profile. Its baseline is saved before your first configuration change.'}
                          </p>
                          <button class="button primary" onClick={() => setEditor('new')}>
                            ＋ Create profile
                          </button>
                          <small>No sample identities. No simulated sessions.</small>
                        </div>
                      }
                    >
                      <For each={filtered()}>
                        {(profile) => (
                          <article
                            class={
                              'profile-card ' + (selectedId() === profile.id ? 'selected-card' : '')
                            }
                            onClick={() => setSelectedId(profile.id)}
                            tabIndex={0}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') setSelectedId(profile.id);
                            }}
                          >
                            <div class="card-top">
                              <span class="profile-icon">
                                {profile.name.slice(0, 2).toUpperCase()}
                              </span>
                              <Pill>{profile.branchName ? 'BRANCH' : 'SAVED'}</Pill>
                              <button
                                class="icon-button"
                                aria-label={'Edit ' + profile.name}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditor(profile);
                                }}
                              >
                                ⋯
                              </button>
                            </div>
                            <h3>{profile.name}</h3>
                            <div class="card-folder">
                              {profile.folder || 'Unfiled'}{' '}
                              <span>· REV {String(profile.revision).padStart(2, '0')}</span>
                            </div>
                            <div class="card-route">
                              <RouteLabel profile={profile} />
                            </div>
                            <div class="card-tags">
                              <For each={profile.tags}>{(tag) => <span>#{tag}</span>}</For>
                              <Show when={profile.policy === 'protected_execution'}>
                                <span class="protected-tag">◇ protected</span>
                              </Show>
                            </div>
                            <footer>
                              <span>
                                <span class="status-dot" />
                                {profile.snapshotCount} config checkpoint
                                {profile.snapshotCount === 1 ? '' : 's'}
                              </span>
                              <button
                                class="text-button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void history(profile);
                                }}
                              >
                                History ↗
                              </button>
                            </footer>
                          </article>
                        )}
                      </For>
                    </Show>
                  </div>
                  <Show when={selected()}>
                    {(profile) => (
                      <aside class="inspector">
                        <Stamp>PROFILE INSPECTOR</Stamp>
                        <div class="inspector-title">
                          <span class="profile-icon">
                            {profile().name.slice(0, 2).toUpperCase()}
                          </span>
                          <h2>{profile().name}</h2>
                        </div>
                        <div class="inspector-status">
                          <span class="amber-dot" />
                          Launch blocked
                        </div>
                        <dl>
                          <dt>Configuration revision</dt>
                          <dd>{profile().revision}</dd>
                          <dt>Timezone</dt>
                          <dd>{profile().timezone}</dd>
                          <dt>Operating policy</dt>
                          <dd>
                            {profile().policy === 'protected_execution'
                              ? 'Protected execution'
                              : 'Standard'}
                          </dd>
                          <dt>Route</dt>
                          <dd>
                            <RouteLabel profile={profile()} />
                          </dd>
                          <dt>Snapshot scope</dt>
                          <dd>Configuration only</dd>
                        </dl>
                        <div class="inspector-actions">
                          <button class="button" onClick={() => setEditor(profile())}>
                            Edit configuration
                          </button>
                          <button class="button" onClick={() => void history(profile())}>
                            View checkpoints
                          </button>
                          <button
                            class="button"
                            onClick={() => {
                              setBranch(profile());
                              setBranchName('');
                            }}
                          >
                            Create branch
                          </button>
                        </div>
                        <div class="blocking-reasons">
                          <Stamp>LAUNCH REQUIREMENTS</Stamp>
                          <For each={launchReasons(profile())}>{(reason) => <p>◇ {reason}</p>}</For>
                        </div>
                        <button
                          class="button danger subtle"
                          onClick={() =>
                            setConfirm({
                              title: 'Delete profile?',
                              message:
                                'This removes the profile and its configuration checkpoints from this workspace. Independent branches are retained.',
                              action: async () => {
                                await api!.deleteProfile(profile().id, profile().revision);
                                setSelectedId();
                                await refresh();
                                setConfirm();
                              },
                            })
                          }
                        >
                          Delete profile
                        </button>
                      </aside>
                    )}
                  </Show>
                </div>
              </Show>
              <Show when={view() === 'Routes'}>
                <RoutesWorkspace
                  api={api!}
                  profiles={profiles()}
                  refresh={refresh}
                  edit={setEditor}
                />
              </Show>
              <div hidden={view() !== 'Browser'}>
                <BrowserWorkspace
                  active={view() === 'Browser'}
                  preferences={appearance()}
                  update={updateAppearance}
                  reset={resetAppearance}
                  persisted={appearanceSaved()}
                  profiles={profiles()}
                  selectedId={selectedId()}
                  selectProfile={setSelectedId}
                  open={setView}
                  createProfile={() => setEditor('new')}
                />
              </div>
              <Show when={view() === 'Snapshots'}>
                <Show
                  when={selected()}
                  fallback={
                    <div class="empty-state">
                      <div class="empty-symbol">◷</div>
                      <h2>Select a profile first.</h2>
                      <p>Open a profile's history from the workspace.</p>
                      <button class="button" onClick={() => setView('Profiles')}>
                        Back to profiles
                      </button>
                    </div>
                  }
                >
                  {(profile) => (
                    <>
                      <div class="history-header">
                        <div>
                          <Pill>CONFIGURATION ONLY</Pill>
                          <h2>{profile().name}</h2>
                          <p>
                            Browser cookies, tabs and session state are not captured in this
                            foundation build.
                          </p>
                        </div>
                        <button
                          class="button"
                          disabled={busy()}
                          onClick={() =>
                            void run(async () => {
                              setSnapshots(await api!.createSnapshot(profile().id));
                              await refresh();
                            })
                          }
                        >
                          ＋ Save checkpoint
                        </button>
                      </div>
                      <div class="timeline">
                        <For each={snapshots()}>
                          {(snapshot) => (
                            <article class="snapshot-row">
                              <div class="timeline-dot" />
                              <div class="snapshot-main">
                                <div class="snapshot-label">
                                  <strong>{snapshot.trigger.replaceAll('_', ' ')}</strong>
                                  <span>REV {snapshot.revision}</span>
                                  <Show when={snapshot.pinned}>
                                    <Pill>PINNED</Pill>
                                  </Show>
                                </div>
                                <time>{new Date(snapshot.capturedAt).toLocaleString()}</time>
                                <p>
                                  {snapshot.config.name}{' '}
                                  <span>
                                    · {snapshot.config.timezone} · {snapshot.bytes.toLocaleString()}{' '}
                                    bytes encrypted
                                  </span>
                                </p>
                                <div class="diff-lines">
                                  <Show when={snapshot.config.name !== profile().name}>
                                    <span>
                                      Name: {profile().name} → {snapshot.config.name}
                                    </span>
                                  </Show>
                                  <Show when={snapshot.config.timezone !== profile().timezone}>
                                    <span>
                                      Timezone: {profile().timezone} → {snapshot.config.timezone}
                                    </span>
                                  </Show>
                                  <Show
                                    when={
                                      JSON.stringify(snapshot.config.route) !==
                                      JSON.stringify(profile().route)
                                    }
                                  >
                                    <span>Route configuration differs</span>
                                  </Show>
                                  <Show
                                    when={
                                      snapshot.config.name === profile().name &&
                                      snapshot.config.timezone === profile().timezone &&
                                      JSON.stringify(snapshot.config.route) ===
                                        JSON.stringify(profile().route)
                                    }
                                  >
                                    <span class="muted">
                                      Name, timezone and route match current configuration.
                                    </span>
                                  </Show>
                                </div>
                              </div>
                              <div class="snapshot-actions">
                                <label class="checkbox-label">
                                  <input
                                    type="checkbox"
                                    checked={snapshot.pinned}
                                    disabled={busy()}
                                    onChange={(e) =>
                                      void run(async () => {
                                        await api!.pinSnapshot(
                                          snapshot.id,
                                          e.currentTarget.checked,
                                        );
                                        setSnapshots(await api!.listSnapshots(profile().id));
                                      })
                                    }
                                  />
                                  Pin
                                </label>
                                <button
                                  class="button"
                                  disabled={busy()}
                                  onClick={() =>
                                    setConfirm({
                                      title: 'Restore configuration?',
                                      message:
                                        'The current configuration is checkpointed first. This restores the selected configuration, including its saved route references. Browser session state is not part of this checkpoint.',
                                      action: async () => {
                                        await api!.restoreSnapshot(
                                          profile().id,
                                          snapshot.id,
                                          profile().revision,
                                        );
                                        await refresh();
                                        setSnapshots(await api!.listSnapshots(profile().id));
                                        setConfirm();
                                        setNotice(
                                          'Configuration restored. A pre-restore checkpoint was saved.',
                                        );
                                      },
                                    })
                                  }
                                >
                                  Restore ↶
                                </button>
                              </div>
                            </article>
                          )}
                        </For>
                      </div>
                    </>
                  )}
                </Show>
              </Show>
              <Show when={view() === 'Diagnostics'}>
                <div class="diagnostic-grid">
                  <Diagnostic
                    title="Local configuration vault"
                    state="AVAILABLE"
                    detail="SQLCipher-compatible database; wrapped random master key; Argon2id passphrase derivation."
                    ready
                  />
                  <Diagnostic
                    title="Configuration recovery"
                    state="AVAILABLE"
                    detail="Encrypted baseline, edit, manual and pre-restore checkpoints. Browser-state recovery is not implemented."
                    ready
                  />
                  <For each={integrations}>
                    {(item) => (
                      <Diagnostic
                        title={item.name}
                        state={item.state || 'NOT IMPLEMENTED'}
                        detail={item.detail}
                      />
                    )}
                  </For>
                </div>
              </Show>
              <Show when={view() === 'Settings'}>
                <section class="interface-settings" aria-label="Browser appearance settings">
                  <AppearanceControls
                    preferences={appearance()}
                    update={updateAppearance}
                    reset={resetAppearance}
                    persisted={appearanceSaved()}
                  />
                  <div class="interface-settings-preview">
                    <AppearancePreview preferences={appearance()} />
                    <button class="button" onClick={() => setView('Browser')}>
                      Open browser workspace ↗
                    </button>
                  </div>
                </section>
                <section class="settings-panel">
                  <Stamp>LOCAL WORKSPACE</Stamp>
                  <h2>Ownership starts here.</h2>
                  <dl>
                    <dt>Local workspace identifier</dt>
                    <dd class="mono">{status()?.localId}</dd>
                    <dt>Created</dt>
                    <dd>
                      {status()?.createdAt ? new Date(status()!.createdAt!).toLocaleString() : '—'}
                    </dd>
                    <dt>Master key derivation</dt>
                    <dd>Argon2id · {(status()?.memoryMiB || 0) / 1024} GiB · 2 passes</dd>
                    <dt>Database encryption</dt>
                    <dd>SQLCipher-compatible AES-256</dd>
                    <dt>Application telemetry</dt>
                    <dd>None implemented; application renderer network requests are blocked.</dd>
                    <dt>Commercial account / activation</dt>
                    <dd>
                      Not connected. Current foundation allowance: {status()?.profileLimit}{' '}
                      profiles.
                    </dd>
                    <dt>Team and offline features</dt>
                    <dd>
                      Part of ecdys.app. Local configuration operations work offline; team sync is
                      pending.
                    </dd>
                  </dl>
                  <div class="note-panel">
                    <strong>What locking means in this build</strong>
                    <p>
                      Lock closes the database, releases working key buffers and clears profile data
                      from the UI. It does not encrypt arbitrary files elsewhere on your computer or
                      protect an unlocked host from an administrator.
                    </p>
                  </div>
                  <button class="button" disabled={busy()} onClick={() => void run(lock)}>
                    Lock workspace
                  </button>
                </section>
              </Show>
              <footer class="page-footer">
                <span>ecdys.app / LOCAL-FIRST WORKSTATION</span>
                <span>FOUNDATION · CONFIGURATION OPERATIONS ONLY</span>
              </footer>
            </main>
          </div>
          <Show when={editor()}>
            {(value) => (
              <ProfileEditor
                profile={value() === 'new' ? undefined : (value() as Profile)}
                busy={busy()}
                error={error()}
                close={() => {
                  if (!busy()) setEditor();
                }}
                save={(draft) =>
                  void run(async () => {
                    const current = editor();
                    const result =
                      current === 'new'
                        ? await api!.createProfile(draft)
                        : await api!.updateProfile(
                            (current as Profile).id,
                            (current as Profile).revision,
                            draft,
                          );
                    await refresh();
                    setSelectedId(result.id);
                    setEditor();
                    setNotice('Configuration saved with an encrypted recovery checkpoint.');
                  })
                }
              />
            )}
          </Show>
          <Show when={branch()}>
            {(profile) => (
              <Modal
                title="Create a branch"
                subtitle={'Independent configuration derived from ' + profile().name}
                close={() => {
                  if (!busy()) setBranch();
                }}
              >
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      const result = await api!.branchProfile(profile().id, branchName());
                      await refresh();
                      setSelectedId(result.id);
                      setBranch();
                      setNotice('Independent branch created.');
                    });
                  }}
                >
                  <label>
                    Branch name
                    <input
                      required
                      maxLength={80}
                      placeholder="test-new-route"
                      value={branchName()}
                      onInput={(e) => setBranchName(e.currentTarget.value)}
                    />
                  </label>
                  <div class="modal-actions">
                    <button
                      class="button"
                      type="button"
                      onClick={() => setBranch()}
                      disabled={busy()}
                    >
                      Cancel
                    </button>
                    <button class="button primary" disabled={busy()}>
                      Create branch
                    </button>
                  </div>
                </form>
              </Modal>
            )}
          </Show>
          <Show when={confirm()}>
            {(confirmation) => (
              <Modal
                title={confirmation().title}
                close={() => {
                  if (!busy()) setConfirm();
                }}
              >
                <p class="confirmation-text">{confirmation().message}</p>
                <div class="modal-actions">
                  <button class="button" disabled={busy()} onClick={() => setConfirm()}>
                    Cancel
                  </button>
                  <button
                    class="button primary"
                    disabled={busy()}
                    onClick={() => void run(confirmation().action)}
                  >
                    {busy() ? 'Working…' : 'Confirm'}
                  </button>
                </div>
              </Modal>
            )}
          </Show>
        </Show>
      </Show>
    </Show>
  );
}

function Metric(props: {title: string; value: string; detail: string}) {
  return (
    <div class="metric">
      <Stamp>{props.title}</Stamp>
      <div class="metric-number">{props.value}</div>
      <p>{props.detail}</p>
    </div>
  );
}
function Diagnostic(props: {title: string; state: string; detail: string; ready?: boolean}) {
  return (
    <article class="diagnostic">
      <div class="diagnostic-heading">
        <span class={props.ready ? 'status-dot' : 'amber-dot'} />
        <Pill tone={props.ready ? 'green' : 'amber'}>{props.state}</Pill>
      </div>
      <h3>{props.title}</h3>
      <p>{props.detail}</p>
    </article>
  );
}
function VaultScreen(props: {
  api: EcdysApi;
  status: VaultStatus;
  busy: boolean;
  error: string;
  submit: (input: {passphrase: string; memoryMiB: 1024 | 2048 | 4096 | 8192}) => Promise<void>;
}) {
  const [passphrase, setPassphrase] = createSignal(''),
    [confirmation, setConfirmation] = createSignal('');
  const [memory, setMemory] = createSignal<1024 | 2048 | 4096 | 8192>(4096);
  const [localError, setLocalError] = createSignal('');
  return (
    <div class="vault-screen">
      <div class="vault-story">
        <div class="brand">
          <Mark />
          <span>
            ecdys<span class="brand-app">.app</span>
          </span>
        </div>
        <Stamp>SOVEREIGN BROWSER WORKSTATION</Stamp>
        <h1>
          Your environment.
          <br />
          Your <em>control.</em>
        </h1>
        <p>
          Purpose-built for deliberate operations.
          <br />
          Persistent identities. Recoverable changes.
          <br />A workspace that belongs to you.
        </p>
        <div class="vault-principles">
          <span>
            01 <strong>LOCAL OWNERSHIP</strong>
          </span>
          <span>
            02 <strong>FUNCTIONAL AUSTERITY</strong>
          </span>
          <span>
            03 <strong>OPERATIONAL CONTINUITY</strong>
          </span>
        </div>
        <div class="vault-build">
          ECDYS FOUNDATION / v0.3.0 <span>CONFIGURATION OPERATIONS</span>
        </div>
      </div>
      <div class="vault-form-wrap">
        <form
          class="vault-form"
          onSubmit={(event) => {
            event.preventDefault();
            setLocalError('');
            if (!props.status.exists && passphrase() !== confirmation()) {
              setLocalError('Passphrases do not match.');
              return;
            }
            void props.submit({passphrase: passphrase(), memoryMiB: memory()}).then(() => {
              setPassphrase('');
              setConfirmation('');
            });
          }}
        >
          <span class="vault-symbol">◇</span>
          <Stamp>ENCRYPTED LOCAL WORKSPACE</Stamp>
          <h2>
            {props.status.recoveryRequired
              ? 'Recover your local workspace.'
              : props.status.exists
                ? 'Welcome back, operator.'
                : 'Establish your workspace.'}
          </h2>
          <p>
            {props.status.recoveryRequired
              ? 'Initialization was interrupted or a required file is missing. Existing files are preserved. Enter your passphrase to attempt recovery; a missing database requires your backup.'
              : props.status.exists
                ? 'Unlock your local configuration vault to continue.'
                : 'Your passphrase wraps a random workspace key. Keep it safe: there is no account recovery for a lost local passphrase.'}
          </p>
          <label>
            Passphrase
            <input
              type="password"
              autocomplete={props.status.exists ? 'current-password' : 'new-password'}
              minLength={props.status.exists ? 1 : 12}
              maxLength={1024}
              required
              value={passphrase()}
              disabled={props.busy}
              onInput={(e) => setPassphrase(e.currentTarget.value)}
              placeholder={props.status.exists ? 'Enter your passphrase' : 'At least 12 characters'}
            />
          </label>
          <Show when={!props.status.exists}>
            <label>
              Confirm passphrase
              <input
                type="password"
                autocomplete="new-password"
                required
                value={confirmation()}
                disabled={props.busy}
                onInput={(e) => setConfirmation(e.currentTarget.value)}
              />
            </label>
            <label>
              Key derivation memory
              <select
                value={memory()}
                disabled={props.busy}
                onChange={(e) =>
                  setMemory(
                    Number(e.currentTarget.value) as typeof memory extends () => infer T
                      ? T
                      : never,
                  )
                }
              >
                <option value="1024">1 GiB</option>
                <option value="2048">2 GiB</option>
                <option value="4096">4 GiB — default</option>
                <option value="8192">8 GiB</option>
              </select>
            </label>
            <p class="field-help">
              Memory is allocated during key derivation. The selected cost is never silently
              reduced.
            </p>
          </Show>
          <Show when={props.error || localError()}>
            <p class="form-error" role="alert">
              {props.error || localError()}
            </p>
          </Show>
          <button class="button primary wide" disabled={props.busy}>
            {props.busy
              ? 'Deriving key…'
              : props.status.recoveryRequired
                ? 'Attempt recovery →'
                : props.status.exists
                  ? 'Unlock workspace →'
                  : 'Create local vault →'}
          </button>
          <div class="vault-assurance">
            <span class="status-dot" />
            LOCAL OPERATION · NO APPLICATION TELEMETRY
          </div>
        </form>
      </div>
    </div>
  );
}

function ProfileEditor(props: {
  profile?: Profile;
  busy: boolean;
  error: string;
  close: () => void;
  save: (draft: ProfileDraft) => void;
}) {
  const [name, setName] = createSignal(props.profile?.name || ''),
    [folder, setFolder] = createSignal(props.profile?.folder || '');
  const [tags, setTags] = createSignal(props.profile?.tags.join(', ') || ''),
    [timezone, setTimezone] = createSignal(props.profile?.timezone || 'UTC');
  const [policy, setPolicy] = createSignal<Profile['policy']>(props.profile?.policy || 'standard');
  const route = props.profile?.route;
  const [kind, setKind] = createSignal<'none' | 'socks5' | 'http_connect' | 'vpn'>(
    route?.kind || 'none',
  );
  const [host, setHost] = createSignal(route && 'host' in route ? route.host : '');
  const [port, setPort] = createSignal(String(route && 'port' in route ? route.port : 1080));
  const [username, setUsername] = createSignal(
    route && 'username' in route ? route.username || '' : '',
  );
  const [password, setPassword] = createSignal(''),
    [clearPassword, setClearPassword] = createSignal(false);
  const [provider, setProvider] = createSignal<'mullvad' | 'ivpn'>(
    route?.kind === 'vpn' ? route.provider : 'mullvad',
  );
  const [endpoint, setEndpoint] = createSignal(route?.kind === 'vpn' ? route.endpoint : '');
  const [tls, setTls] = createSignal(route?.kind === 'http_connect' ? route.tlsToProxy : true);
  onCleanup(() => setPassword(''));
  function submit() {
    let newRoute: ProfileDraft['route'] = null;
    if (kind() === 'vpn')
      newRoute = {kind: 'vpn', provider: provider(), endpoint: endpoint(), routeLock: true};
    else if (kind() !== 'none')
      newRoute = {
        kind: kind() as 'socks5',
        host: host(),
        port: Number(port()),
        username: username() || undefined,
        password: password() || undefined,
        clearPassword: clearPassword(),
        routeLock: true,
        ...(kind() === 'socks5' ? {remoteDNS: true} : {tlsToProxy: tls()}),
      } as ProfileDraft['route'];
    props.save({
      name: name(),
      folder: folder(),
      tags: tags()
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
      timezone: timezone(),
      policy: policy(),
      route: newRoute,
    });
  }
  return (
    <Modal
      title={props.profile ? 'Edit profile configuration' : 'Create a profile'}
      subtitle={
        props.profile
          ? 'A checkpoint is committed before this change.'
          : 'A baseline checkpoint is created with the profile.'
      }
      close={props.close}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div class="form-grid">
          <label class="span-two">
            Profile name
            <input
              required
              maxLength={120}
              placeholder="Research · client · trading environment"
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
            />
          </label>
          <label>
            Folder
            <input
              maxLength={80}
              placeholder="e.g. Capital / Futures"
              value={folder()}
              onInput={(e) => setFolder(e.currentTarget.value)}
            />
          </label>
          <label>
            Tags
            <input
              placeholder="trading, research, client"
              value={tags()}
              onInput={(e) => setTags(e.currentTarget.value)}
            />
          </label>
          <label>
            Timezone
            <input
              required
              value={timezone()}
              onInput={(e) => setTimezone(e.currentTarget.value)}
              placeholder="UTC"
            />
          </label>
          <label>
            Operating policy
            <select
              value={policy()}
              onChange={(e) => setPolicy(e.currentTarget.value as Profile['policy'])}
            >
              <option value="standard">Standard</option>
              <option value="protected_execution">Protected execution</option>
            </select>
          </label>
        </div>
        <div class="form-section-heading">
          <Stamp>NETWORK CONFIGURATION</Stamp>
          <Pill>ROUTE LOCK REQUIRED</Pill>
        </div>
        <label>
          Route type
          <select
            value={kind()}
            onChange={(e) => setKind(e.currentTarget.value as ReturnType<typeof kind>)}
          >
            <option value="none">Configure later — browsing blocked</option>
            <option value="socks5">SOCKS5 proxy</option>
            <option value="http_connect">HTTP CONNECT proxy</option>
            <option value="vpn">VPN — Mullvad / IVPN</option>
          </select>
        </label>
        <Show when={kind() === 'socks5' || kind() === 'http_connect'}>
          <div class="form-grid">
            <label>
              Host
              <input
                required
                maxLength={253}
                placeholder="proxy.example.net"
                value={host()}
                onInput={(e) => setHost(e.currentTarget.value)}
              />
            </label>
            <label>
              Port
              <input
                required
                type="number"
                min={1}
                max={65535}
                value={port()}
                onInput={(e) => setPort(e.currentTarget.value)}
              />
            </label>
            <label>
              Username
              <input
                maxLength={256}
                autocomplete="off"
                value={username()}
                onInput={(e) => setUsername(e.currentTarget.value)}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autocomplete="new-password"
                maxLength={2048}
                placeholder={
                  route && 'hasPassword' in route && route.hasPassword
                    ? 'Saved — leave blank to retain'
                    : 'Optional proxy password'
                }
                value={password()}
                onInput={(e) => setPassword(e.currentTarget.value)}
              />
            </label>
          </div>
          <Show when={route && 'hasPassword' in route && route.hasPassword}>
            <label class="checkbox-label">
              <input
                type="checkbox"
                checked={clearPassword()}
                onChange={(e) => setClearPassword(e.currentTarget.checked)}
              />
              Remove saved password
            </label>
          </Show>
          <Show when={kind() === 'http_connect'}>
            <label class="checkbox-label">
              <input
                type="checkbox"
                checked={tls()}
                onChange={(e) => setTls(e.currentTarget.checked)}
              />
              TLS connection to proxy
            </label>
          </Show>
          <Show when={kind() === 'socks5'}>
            <p class="field-help">
              Remote DNS is required. Authentication is encrypted; saved passwords are never
              returned to the UI.
            </p>
          </Show>
        </Show>
        <Show when={kind() === 'vpn'}>
          <div class="form-grid">
            <label>
              Provider
              <select
                value={provider()}
                onChange={(e) => setProvider(e.currentTarget.value as 'mullvad' | 'ivpn')}
              >
                <option value="mullvad">Mullvad</option>
                <option value="ivpn">IVPN</option>
              </select>
            </label>
            <label>
              Endpoint reference
              <input
                required
                maxLength={253}
                placeholder="Provider endpoint"
                value={endpoint()}
                onInput={(e) => setEndpoint(e.currentTarget.value)}
              />
            </label>
          </div>
          <p class="field-help">
            Provider authentication, server discovery and tunnel setup are not connected in this
            build.
          </p>
        </Show>
        <Show when={props.error}>
          <p role="alert" class="form-error">
            {props.error}
          </p>
        </Show>
        <div class="form-note">
          Configuration only. Saving a route does not establish or test a connection. Browser launch
          stays blocked.
        </div>
        <div class="modal-actions">
          <button type="button" class="button" disabled={props.busy} onClick={props.close}>
            Cancel
          </button>
          <button class="button primary" disabled={props.busy}>
            {props.busy ? 'Saving…' : props.profile ? 'Save configuration' : 'Create profile'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
