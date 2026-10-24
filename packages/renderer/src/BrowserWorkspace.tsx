import {batch, createMemo, createSignal, For, Show} from 'solid-js';
import type {EcdysApi, Profile} from '@ecdys/shared';
import {TemporaryBrowser} from './TemporaryBrowser';
import {AppearanceControls, BrowserMark, browserStyle} from './BrowserAppearance';
import {orderProfiles, type Appearance} from './appearance';

export type BrowserDestination = 'Profiles' | 'Routes' | 'Snapshots' | 'Diagnostics' | 'Settings';
interface Tab {
  id: number;
  title: string;
  address: string;
  query: string;
}
export function BrowserWorkspace(props: {
  api: EcdysApi;
  refresh: () => Promise<void>;
  active: boolean;
  preferences: Appearance;
  update: (patch: Partial<Appearance>) => void;
  reset: () => void;
  persisted: boolean;
  profiles: Profile[];
  selectedId?: string;
  selectProfile: (id: string) => void;
  open: (view: BrowserDestination) => void;
  createProfile: () => void;
}) {
  let nextId = 2;
  const [tabs, setTabs] = createSignal<Tab[]>([
    {id: 1, title: 'Workspace', address: 'ecdys://start', query: ''},
  ]);
  const [activeId, setActiveId] = createSignal(1);
  const [message, setMessage] = createSignal('');
  const [customizing, setCustomizing] = createSignal(false);
  const [live, setLive] = createSignal(false);
  const active = createMemo(() => tabs().find(({id}) => id === activeId())!);
  const sorted = createMemo(() => orderProfiles(props.profiles, props.preferences.profileOrder));
  const visible = createMemo(() =>
    sorted().filter((profile) =>
      [profile.name, profile.folder, ...profile.tags]
        .join(' ')
        .toLowerCase()
        .includes(active().query.toLowerCase()),
    ),
  );
  const selected = createMemo(() => props.profiles.find(({id}) => id === props.selectedId));
  function updateTab(patch: Partial<Tab>) {
    setTabs((previous) =>
      previous.map((tab) => (tab.id === activeId() ? {...tab, ...patch} : tab)),
    );
  }
  function addTab() {
    if (tabs().length >= 12) {
      setMessage('Keep up to 12 local workspace tabs open.');
      return;
    }
    const id = nextId++;
    setTabs((previous) => [
      ...previous,
      {id, title: 'New tab', address: 'ecdys://start', query: ''},
    ]);
    setActiveId(id);
    setMessage('');
  }
  function closeTab(id: number) {
    const index = tabs().findIndex((tab) => tab.id === id),
      remaining = tabs().filter((tab) => tab.id !== id);
    batch(() => {
      if (!remaining.length) {
        setTabs([{id: nextId, title: 'Workspace', address: 'ecdys://start', query: ''}]);
        setActiveId(nextId++);
      } else {
        setTabs(remaining);
        if (activeId() === id) setActiveId(remaining[Math.min(index, remaining.length - 1)]!.id);
      }
    });
    queueMicrotask(() => document.getElementById('workspace-tab-' + activeId())?.focus());
    setMessage('');
  }
  function navigate() {
    const destination = active().address.trim().toLowerCase();
    const routes: Record<string, BrowserDestination> = {
      'ecdys://profiles': 'Profiles',
      'ecdys://routes': 'Routes',
      'ecdys://snapshots': 'Snapshots',
      'ecdys://diagnostics': 'Diagnostics',
      'ecdys://settings': 'Settings',
    };
    const workspaceView = Object.hasOwn(routes, destination) ? routes[destination] : undefined;
    if (workspaceView) {
      props.open(workspaceView);
      setMessage('');
      return;
    }
    if (destination === 'ecdys://start' || !destination) {
      updateTab({address: 'ecdys://start', query: ''});
      setMessage('');
      return;
    }
    setMessage(
      'Managed browsing with persistent state remains in development. Use Open temporary browser to visit websites through a saved proxy; this local start page stays open.',
    );
  }
  function tabKey(event: KeyboardEvent, id: number) {
    const index = tabs().findIndex((tab) => tab.id === id);
    let target: Tab | undefined;
    if (event.key === 'ArrowRight') target = tabs()[(index + 1) % tabs().length];
    if (event.key === 'ArrowLeft') target = tabs()[(index - 1 + tabs().length) % tabs().length];
    if (event.key === 'Home') target = tabs()[0];
    if (event.key === 'End') target = tabs().at(-1);
    if (target) {
      event.preventDefault();
      setActiveId(target.id);
      document.getElementById('workspace-tab-' + target.id)?.focus();
    }
  }
  return (
    <div class={'browser-workspace-layout ' + (customizing() ? 'with-customizer' : '')}>
      <div class="browser-workspace-main">
        <div class="browser-section-caption">
          <span>
            <i />
            LOCAL WORKSPACE
          </span>
          <button
            class="text-button"
            aria-expanded={customizing()}
            aria-controls="browser-customizer"
            onClick={() => setCustomizing(!customizing())}
          >
            {customizing() ? 'Hide appearance' : 'Customize appearance'} ☷
          </button>
        </div>
        <TemporaryBrowser
          api={props.api}
          refresh={props.refresh}
          preferences={props.preferences}
          profiles={props.profiles}
          selectedId={props.selectedId}
          selectProfile={props.selectProfile}
          onActive={setLive}
        />
        <section
          hidden={live()}
          class="browser-surface"
          role="region"
          aria-label="Browser surface"
          style={browserStyle(props.preferences)}
          data-density={props.preferences.density}
        >
          <div class="browser-tabstrip">
            <div class="browser-tabs" role="tablist" aria-label="Local workspace tabs">
              <For each={tabs()}>
                {(tab) => (
                  <div class={'browser-tab-wrap ' + (activeId() === tab.id ? 'active' : '')}>
                    <button
                      role="tab"
                      id={'workspace-tab-' + tab.id}
                      aria-selected={activeId() === tab.id}
                      aria-controls="browser-start-panel"
                      tabIndex={activeId() === tab.id ? 0 : -1}
                      onClick={() => {
                        setActiveId(tab.id);
                        setMessage('');
                      }}
                      onKeyDown={(event) => tabKey(event, tab.id)}
                    >
                      <span class="tab-emblem" aria-hidden="true">
                        ◈
                      </span>
                      <span>{tab.title}</span>
                    </button>
                    <button
                      class="browser-tab-close"
                      aria-label={'Close tab ' + tab.id}
                      onClick={() => closeTab(tab.id)}
                    >
                      ×
                    </button>
                  </div>
                )}
              </For>
            </div>
            <button
              class="browser-add-tab"
              aria-label="New browser tab"
              disabled={tabs().length >= 12}
              onClick={addTab}
            >
              ＋
            </button>
            <span class="browser-local-badge">LOCAL</span>
          </div>
          <div class="browser-toolbar">
            <button
              aria-label="Return to browser start"
              class="browser-chrome-button"
              onClick={() => {
                updateTab({address: 'ecdys://start', query: ''});
                setMessage('');
              }}
            >
              ⌂
            </button>
            <form
              class="browser-address"
              onSubmit={(event) => {
                event.preventDefault();
                navigate();
              }}
            >
              <span aria-hidden="true">◇</span>
              <input
                aria-label="Browser address"
                value={active().address}
                spellcheck={false}
                autocomplete="off"
                onInput={(event) => updateTab({address: event.currentTarget.value})}
              />
              <button type="submit" aria-label="Open workspace address">
                ↵
              </button>
            </form>
            <button
              class="browser-chrome-button"
              aria-label="Open workspace settings"
              onClick={() => props.open('Settings')}
            >
              ☷
            </button>
            <span class="browser-profile-emblem" title={selected()?.name || 'Local workspace'}>
              {selected()?.name.slice(0, 2).toUpperCase() || 'OP'}
            </span>
          </div>
          <Show when={props.preferences.bookmarks}>
            <nav class="browser-bookmarks" aria-label="Browser bookmarks">
              <button onClick={() => props.open('Profiles')}>
                ▦ <span>Profiles</span>
              </button>
              <button onClick={() => props.open('Routes')}>
                ⇄ <span>Route library</span>
              </button>
              <button onClick={() => props.open('Snapshots')}>
                ◷ <span>Checkpoints</span>
              </button>
              <span class="browser-bookmarks-note">YOUR WORKSPACE, WITHIN REACH</span>
            </nav>
          </Show>
          <div class="browser-body">
            <Show when={props.preferences.sidebar}>
              <aside class="browser-inner-sidebar" aria-label="Browser workspace sidebar">
                <span class="browser-sidebar-title">WORKSPACE</span>
                <button class="browser-sidebar-current" onClick={() => updateTab({query: ''})}>
                  ⌂ <span>Start page</span>
                  <small>{props.profiles.length}</small>
                </button>
                <span class="browser-sidebar-title">PROFILES</span>
                <For each={sorted().slice(0, 8)}>
                  {(profile) => (
                    <button
                      class={selected()?.id === profile.id ? 'chosen' : ''}
                      onClick={() => props.selectProfile(profile.id)}
                    >
                      <span class="browser-profile-dot" />
                      <span>{profile.name}</span>
                    </button>
                  )}
                </For>
                <Show when={!props.profiles.length}>
                  <p>Create a profile to keep an environment here.</p>
                </Show>
                <div class="browser-sidebar-bottom">
                  <span>↳</span> Local view
                  <br />
                  <small>No browsing session running</small>
                </div>
              </aside>
            </Show>
            <div
              class="browser-start-page"
              id="browser-start-panel"
              role="tabpanel"
              aria-labelledby={'workspace-tab-' + activeId()}
            >
              <Show when={message()}>
                <p class="browser-notice" role="status">
                  {message()}
                </p>
              </Show>
              <div class="browser-start-topline">
                <span>ECDYS / PERSONAL WORKSPACE</span>
                <span>
                  {new Intl.DateTimeFormat('en', {month: 'short', day: 'numeric'}).format(
                    new Date(),
                  )}
                </span>
              </div>
              <div class="browser-home-heading">
                <BrowserMark />
                <span class="browser-overline">A LITTLE LESS NOISE.</span>
                <h2>Space to focus.</h2>
                <p>Your environments. Your rhythm. Everything in its place.</p>
              </div>
              <label class="browser-search">
                <span aria-hidden="true">⌕</span>
                <input
                  aria-label="Find a workspace profile"
                  value={active().query}
                  onInput={(event) => updateTab({query: event.currentTarget.value})}
                  placeholder="Find a profile, folder or tag"
                />
                <kbd>LOCAL</kbd>
              </label>
              <div class="browser-shortcuts">
                <button onClick={() => props.open('Profiles')}>
                  <span>▦</span>
                  <strong>Profiles</strong>
                  <small>Your environments</small>
                </button>
                <button onClick={() => props.open('Routes')}>
                  <span>⇄</span>
                  <strong>Route library</strong>
                  <small>Choose your connection</small>
                </button>
                <button onClick={() => props.open('Snapshots')}>
                  <span>◷</span>
                  <strong>Checkpoints</strong>
                  <small>A way back</small>
                </button>
              </div>
              <div class="browser-resume-header">
                <span>YOUR PROFILES</span>
                <span>{visible().length} SAVED</span>
              </div>
              <div class="browser-resume-list">
                <For each={visible().slice(0, 4)}>
                  {(profile) => (
                    <button
                      class={selected()?.id === profile.id ? 'chosen' : ''}
                      onClick={() => {
                        props.selectProfile(profile.id);
                        props.open('Profiles');
                      }}
                    >
                      <span class="browser-resume-icon">
                        {profile.name.slice(0, 2).toUpperCase()}
                      </span>
                      <span>
                        <strong>{profile.name}</strong>
                        <small>
                          {profile.folder || 'Unfiled'} ·{' '}
                          {profile.policy === 'protected_execution'
                            ? 'Protected execution'
                            : 'Standard'}
                        </small>
                      </span>
                      <span class="browser-resume-state">CONFIGURATION SAVED</span>
                      <b aria-hidden="true">↗</b>
                    </button>
                  )}
                </For>
                <Show when={!visible().length}>
                  <p>
                    {props.profiles.length
                      ? 'No matching profiles. Try a different name or tag.'
                      : 'Start with a profile. Its configuration is saved with a baseline checkpoint.'}
                  </p>
                </Show>
              </div>
              <button class="browser-primary-action" onClick={props.createProfile}>
                ＋ Create profile
              </button>
              <p class="browser-page-footnote">
                Local start page · Configure and review environments before launching.
              </p>
            </div>
          </div>
        </section>
        <div class="browser-under-note">
          <span>◇</span>
          <p>
            <strong>A workspace that moves with you.</strong> Appearance choices stay on this
            device. Local tabs and searches clear when you lock.
          </p>
        </div>
      </div>
      <Show when={props.active && customizing()}>
        <aside
          id="browser-customizer"
          class="browser-customizer"
          aria-label="Customize browser appearance"
        >
          <AppearanceControls
            preferences={props.preferences}
            update={props.update}
            reset={props.reset}
            persisted={props.persisted}
          />
        </aside>
      </Show>
    </div>
  );
}
