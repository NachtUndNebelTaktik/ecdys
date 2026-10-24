import {For, Show, type JSX} from 'solid-js';
import {accentColors, type Appearance} from './appearance';

export function browserStyle(preferences: Appearance): JSX.CSSProperties {
  return {
    '--browser-radius': preferences.radius + 'px',
    '--browser-text-size': preferences.textSize + 'px',
    '--browser-toolbar-height': preferences.density === 'compact' ? '44px' : '58px',
    '--browser-padding': preferences.density === 'compact' ? '18px' : '28px',
    '--browser-motion': preferences.motion ? '180ms' : '0ms',
  };
}
export function BrowserMark() {
  return (
    <span class="browser-home-mark" aria-hidden="true">
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
export function AppearanceControls(props: {
  preferences: Appearance;
  update: (patch: Partial<Appearance>) => void;
  reset: () => void;
  persisted: boolean;
}) {
  return (
    <section class="appearance-controls" aria-label="Appearance controls">
      <div class="appearance-intro">
        <span class="stamp">MAKE IT YOURS</span>
        <h2>A familiar feel. Your way.</h2>
        <p>Every change takes effect immediately.</p>
      </div>
      <label class="appearance-field">
        Interface theme
        <select
          aria-label="Interface theme"
          value={props.preferences.theme}
          onChange={(event) => {
            const theme = event.currentTarget.value as Appearance['theme'];
            props.update({theme, ...(theme === 'crimson' ? {accent: 'crimson'} : {})});
          }}
        >
          <option value="light">Light</option>
          <option value="dark">Dark</option>
          <option value="system">System</option>
          <option value="night">Night · warm filter</option>
          <option value="crimson">Crimson</option>
        </select>
      </label>
      <Show when={props.preferences.theme === 'system'}>
        <p class="appearance-help">Follows the desktop’s light or dark appearance.</p>
      </Show>
      <Show when={props.preferences.theme === 'night'}>
        <label class="appearance-field">
          Night warmth <output>{props.preferences.nightWarmth}%</output>
          <input
            aria-label="Night warmth"
            type="range"
            min="0"
            max="80"
            step="5"
            value={props.preferences.nightWarmth}
            onInput={(event) => props.update({nightWarmth: Number(event.currentTarget.value)})}
          />
        </label>
        <p class="appearance-help">Warmer colors with less blue in this app window.</p>
      </Show>
      <fieldset class="accent-options">
        <legend>Accent color</legend>
        <For each={['sage', 'ice', 'copper', 'crimson'] as const}>
          {(accent) => (
            <button
              type="button"
              aria-label={accent[0]!.toUpperCase() + accent.slice(1) + ' accent'}
              aria-pressed={props.preferences.accent === accent}
              class={props.preferences.accent === accent ? 'chosen' : ''}
              style={{'--swatch': accentColors[accent].dark}}
              onClick={() => props.update({accent})}
            >
              <span />
              {accent[0]!.toUpperCase() + accent.slice(1)}
              <Show when={props.preferences.accent === accent}>
                <b aria-hidden="true">✓</b>
              </Show>
            </button>
          )}
        </For>
      </fieldset>
      <label class="appearance-field">
        Corner rounding <output>{props.preferences.radius} px</output>
        <input
          aria-label="Corner rounding"
          type="range"
          min="0"
          max="32"
          step="2"
          value={props.preferences.radius}
          onInput={(event) => props.update({radius: Number(event.currentTarget.value)})}
        />
        <span class="range-labels">
          <span>Precise</span>
          <span>Soft</span>
        </span>
      </label>
      <label class="appearance-field">
        Browser spacing
        <select
          aria-label="Browser spacing"
          value={props.preferences.density}
          onChange={(event) =>
            props.update({density: event.currentTarget.value as Appearance['density']})
          }
        >
          <option value="comfortable">Comfortable</option>
          <option value="compact">Compact</option>
        </select>
      </label>
      <label class="appearance-field">
        Browser text size <output>{props.preferences.textSize} px</output>
        <input
          aria-label="Browser text size"
          type="range"
          min="12"
          max="18"
          value={props.preferences.textSize}
          onInput={(event) => props.update({textSize: Number(event.currentTarget.value)})}
        />
      </label>
      <div class="appearance-toggles">
        <label>
          <span>
            Bookmarks bar<small>Keep workspace shortcuts close.</small>
          </span>
          <input
            type="checkbox"
            aria-label="Show bookmarks bar"
            checked={props.preferences.bookmarks}
            onChange={(event) => props.update({bookmarks: event.currentTarget.checked})}
          />
        </label>
        <label>
          <span>
            Browser sidebar<small>Profiles alongside your work.</small>
          </span>
          <input
            type="checkbox"
            aria-label="Show browser sidebar"
            checked={props.preferences.sidebar}
            onChange={(event) => props.update({sidebar: event.currentTarget.checked})}
          />
        </label>
        <label>
          <span>
            Smooth transitions<small>Respects system reduced motion.</small>
          </span>
          <input
            type="checkbox"
            aria-label="Smooth transitions"
            checked={props.preferences.motion}
            onChange={(event) => props.update({motion: event.currentTarget.checked})}
          />
        </label>
      </div>
      <div class="appearance-footer">
        <button class="text-button" onClick={props.reset}>
          Reset appearance
        </button>
        <span class={props.persisted ? '' : 'unsaved'} role="status">
          {props.persisted
            ? 'Saved on this device'
            : 'Changes apply here; local saving is unavailable.'}
        </span>
      </div>
    </section>
  );
}
export function AppearancePreview(props: {preferences: Appearance}) {
  return (
    <section class="appearance-preview" aria-label="Live appearance preview">
      <div class="preview-caption">
        <span class="stamp">LIVE PREVIEW</span>
        <span>Same settings. Every workspace.</span>
      </div>
      <div
        class="browser-surface browser-miniature"
        style={browserStyle(props.preferences)}
        data-density={props.preferences.density}
      >
        <div class="browser-tabstrip">
          <span class="browser-mini-tab">◈ &nbsp; Workspace</span>
          <span class="browser-mini-plus" aria-hidden="true">
            ＋
          </span>
          <span class="browser-local-badge">LOCAL</span>
        </div>
        <div class="browser-toolbar">
          <span aria-hidden="true">← &nbsp; → &nbsp; ↻</span>
          <div class="browser-mini-address">◇ &nbsp; ecdys://start</div>
          <span aria-hidden="true">☷</span>
        </div>
        <Show when={props.preferences.bookmarks}>
          <div class="browser-bookmarks">
            <span>▦ Profiles</span>
            <span>⇄ Routes</span>
            <span>◷ Checkpoints</span>
          </div>
        </Show>
        <div class="browser-body">
          <Show when={props.preferences.sidebar}>
            <div class="browser-mini-sidebar">
              <span>WORKSPACE</span>
              <div>▦ Profiles</div>
              <div>⇄ Routes</div>
              <div>◷ Checkpoints</div>
            </div>
          </Show>
          <div class="browser-mini-home">
            <BrowserMark />
            <h3>Space to focus.</h3>
            <p>Keep what you need. Make room for your work.</p>
            <span class="browser-preview-button">Your workspace ↗</span>
          </div>
        </div>
      </div>
      <p class="appearance-preview-note">
        Theme and Night warmth apply across the app. Spacing, text, corners and bars shape the
        browser workspace.
      </p>
    </section>
  );
}
