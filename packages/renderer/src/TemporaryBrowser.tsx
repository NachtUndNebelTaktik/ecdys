import {createEffect, createMemo, createSignal, For, onCleanup, onMount, Show} from 'solid-js';
import type {Appearance} from './appearance';
import {browserStyle} from './BrowserAppearance';
import {Modal} from './Modal';
import type {
  BrowserInput,
  BrowserSupport,
  EcdysApi,
  Profile,
  TemporaryBrowserSession,
} from '@ecdys/shared';

export function TemporaryBrowser(props: {
  api: EcdysApi;
  preferences: Appearance;
  profiles: Profile[];
  selectedId?: string;
  selectProfile: (id: string) => void;
  onActive: (active: boolean) => void;
  refresh: () => Promise<void>;
}) {
  const [support, setSupport] = createSignal<BrowserSupport>();
  const [session, setSession] = createSignal<TemporaryBrowserSession | null>(null);
  const [frame, setFrame] = createSignal(''),
    [address, setAddress] = createSignal('about:blank');
  const [error, setError] = createSignal(''),
    [busy, setBusy] = createSignal(false);
  const [prompt, setPrompt] = createSignal<'start' | 'stop'>(),
    [accepted, setAccepted] = createSignal(false);
  const profile = createMemo(
    () => props.profiles.find(({id}) => id === props.selectedId) || props.profiles[0],
  );
  let viewport: HTMLDivElement | undefined;
  let pendingFrame: {sessionId: string; data: string} | undefined;
  createEffect(() => props.onActive(Boolean(session())));
  async function run(operation: () => Promise<unknown>) {
    setError('');
    try {
      await operation();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The browser operation failed.');
    }
  }
  onMount(() => {
    const unsubscribe = props.api.onBrowserEvent((event) => {
      if (event.type === 'session') {
        setSession(event.session);
        if (event.session) {
          setAddress(event.session.url);
          if (event.session.status === 'crashed')
            setError(
              'The temporary browser stopped unexpectedly. Its memory-only site data is unavailable.',
            );
        } else {
          setFrame('');
          pendingFrame = undefined;
        }
      } else if (event.sessionId === session()?.id) {
        setFrame('data:image/jpeg;base64,' + event.data);
      } else pendingFrame = event;
    });
    onCleanup(unsubscribe);
    void run(async () => {
      setSupport(await props.api.browserSupport());
      const current = await props.api.browserSession();
      setSession(current);
      if (current) {
        setAddress(current.url);
        if (pendingFrame?.sessionId === current.id)
          setFrame('data:image/jpeg;base64,' + pendingFrame.data);
      }
    });
  });
  async function navigate(value: string) {
    if (!session()) return;
    const url = value.trim();
    await run(() =>
      props.api.navigateBrowser(
        session()!.id,
        url === 'about:blank' || /^[a-z]+:/i.test(url) ? url : 'https://' + url,
      ),
    );
  }
  function input(value: BrowserInput) {
    const current = session();
    if (current?.status === 'active') void run(() => props.api.inputBrowser(current.id, value));
  }
  function point(event: MouseEvent | WheelEvent) {
    const rect = viewport!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1199, ((event.clientX - rect.left) * 1200) / rect.width)),
      y: Math.max(0, Math.min(719, ((event.clientY - rect.top) * 720) / rect.height)),
    };
  }
  return (
    <>
      <Show when={!session()}>
        <div class="temporary-launchbar">
          <div>
            <strong>Temporary browsing</strong>
            <p>Memory-only session · your saved proxy route</p>
          </div>
          <Show
            when={support()?.available}
            fallback={
              <p class="temporary-unavailable">
                {support()?.reasons.join(' ') || 'Checking browser runtime…'}
              </p>
            }
          >
            <label>
              Browser profile
              <select
                aria-label="Browser profile"
                value={profile()?.id || ''}
                onChange={(event) => props.selectProfile(event.currentTarget.value)}
                disabled={busy()}
              >
                <For each={props.profiles}>
                  {(profile) => <option value={profile.id}>{profile.name}</option>}
                </For>
              </select>
            </label>
            <button
              class="button"
              disabled={busy() || !profile()}
              onClick={() => {
                setAccepted(false);
                setPrompt('start');
              }}
            >
              Open temporary browser
            </button>
          </Show>
        </div>
      </Show>
      <Show when={error()}>
        <div class="message error" role="alert">
          {error()}
          <button aria-label="Dismiss browser error" onClick={() => setError('')}>
            ×
          </button>
        </div>
      </Show>
      <Show when={session()}>
        {(current) => (
          <section
            class="browser-surface temporary-surface"
            role="region"
            aria-label="Live browser surface"
            style={browserStyle(props.preferences)}
          >
            <div class="browser-tabstrip temporary-session-heading">
              <span class="temporary-live-dot" />
              <strong>{current().profileName}</strong>
              <span class="browser-local-badge">TEMPORARY</span>
              <button class="text-button" onClick={() => setPrompt('stop')}>
                Close temporary browser ×
              </button>
            </div>
            <div class="browser-toolbar">
              <button
                class="browser-chrome-button"
                aria-label="Blank browser page"
                onClick={() => void navigate('about:blank')}
              >
                ⌂
              </button>
              <button
                class="browser-chrome-button"
                aria-label="Reload live page"
                onClick={() => void navigate(current().url)}
              >
                ↻
              </button>
              <form
                class="browser-address"
                onSubmit={(event) => {
                  event.preventDefault();
                  void navigate(address());
                }}
              >
                <span aria-hidden="true">◇</span>
                <input
                  aria-label="Live browser address"
                  value={address()}
                  autocomplete="off"
                  spellcheck={false}
                  onInput={(event) => setAddress(event.currentTarget.value)}
                />
                <button aria-label="Navigate live browser" type="submit">
                  ↵
                </button>
              </form>
            </div>
            <div
              class="temporary-viewport"
              ref={viewport}
              tabindex="0"
              role="group"
              aria-label="Live browser viewport"
              onContextMenu={(event) => event.preventDefault()}
              onMouseDown={(event) => {
                if (event.button > 2 || event.button === 1) return;
                event.preventDefault();
                viewport?.focus({preventScroll: true});
                input({
                  type: 'pointer',
                  action: 'down',
                  button: event.button === 2 ? 'right' : 'left',
                  ...point(event),
                });
              }}
              onMouseUp={(event) => {
                if (event.button > 2 || event.button === 1) return;
                event.preventDefault();
                input({
                  type: 'pointer',
                  action: 'up',
                  button: event.button === 2 ? 'right' : 'left',
                  ...point(event),
                });
              }}
              onWheel={(event) => {
                event.preventDefault();
                input({
                  type: 'wheel',
                  ...point(event),
                  deltaX: Math.max(-2000, Math.min(2000, event.deltaX)),
                  deltaY: Math.max(-2000, Math.min(2000, event.deltaY)),
                });
              }}
              onKeyDown={(event) => {
                if (event.ctrlKey || event.metaKey || event.altKey) return;
                if (event.key.length === 1) {
                  event.preventDefault();
                  input({type: 'text', text: event.key});
                } else if (
                  [
                    'Enter',
                    'Backspace',
                    'Tab',
                    'Escape',
                    'ArrowLeft',
                    'ArrowRight',
                    'ArrowUp',
                    'ArrowDown',
                    'Delete',
                    'Home',
                    'End',
                  ].includes(event.key)
                ) {
                  event.preventDefault();
                  input({
                    type: 'key',
                    key: event.key as Extract<BrowserInput, {type: 'key'}>['key'],
                    shift: event.shiftKey,
                  });
                }
              }}
              onPaste={(event) => {
                event.preventDefault();
                const text = event.clipboardData?.getData('text/plain');
                if (text) input({type: 'text', text: text.slice(0, 4096)});
              }}
            >
              <Show
                when={frame()}
                fallback={
                  <span class="temporary-frame-placeholder">Waiting for the browser page…</span>
                }
              >
                <img
                  src={frame()}
                  alt="Live browser page"
                  draggable={false}
                  width="1200"
                  height="720"
                />
              </Show>
            </div>
            <div class="temporary-session-footer">
              <span>{current().version} · route required · downloads disabled</span>
              <span>Site data is discarded on close or workspace lock</span>
            </div>
          </section>
        )}
      </Show>
      <Show when={prompt()}>
        <Modal
          title={prompt() === 'start' ? 'Open a temporary browser?' : 'Close temporary browser?'}
          close={() => {
            if (!busy()) setPrompt(undefined);
          }}
        >
          <Show when={error()}>
            <div class="message error" role="alert">
              {error()}
            </div>
          </Show>
          <p class="confirmation-copy">
            {prompt() === 'start'
              ? 'This first browsing mode uses a separate Chromium process and your selected saved proxy. Cookies, logins, tabs and site storage stay in memory and are discarded on close or workspace lock. Downloads, persistent browser recovery, protected execution and live route switching are not available in this mode.'
              : 'Closing discards this temporary session’s cookies, logins, tabs and site storage. The saved profile configuration and its checkpoints remain available.'}
          </p>
          <Show when={prompt() === 'start'}>
            <label class="checkbox-label">
              <input
                type="checkbox"
                checked={accepted()}
                onChange={(event) => setAccepted(event.currentTarget.checked)}
              />
              I understand this session’s site data is temporary.
            </label>
          </Show>
          <div class="modal-actions">
            <button class="button" disabled={busy()} onClick={() => setPrompt(undefined)}>
              Cancel
            </button>
            <button
              class="button primary"
              disabled={busy() || (prompt() === 'start' && !accepted())}
              onClick={() => {
                setBusy(true);
                void run(async () => {
                  if (prompt() === 'start') {
                    const selected = profile()!;
                    const created = await props.api.startTemporaryBrowser({
                      profileId: selected.id,
                      revision: selected.revision,
                      acceptTemporary: true,
                    });
                    setSession(created);
                    setAddress(created.url);
                    await props.refresh();
                  } else if (session()) {
                    await props.api.stopBrowser(session()!.id);
                    setSession(null);
                    setFrame('');
                  }
                  setPrompt(undefined);
                }).finally(() => setBusy(false));
              }}
            >
              {busy()
                ? 'Working…'
                : prompt() === 'start'
                  ? 'Start temporary browser'
                  : 'Close and discard'}
            </button>
          </div>
        </Modal>
      </Show>
    </>
  );
}
