import {z} from 'zod';

export type UiPreferences = {
  appearance: 'dark' | 'light' | 'system';
  accent: 'crimson' | 'rose' | 'amber' | 'teal' | 'blue' | 'violet' | 'sage' | 'indigo';
  density: 'comfortable' | 'compact';
  reduceMotion: boolean;
  notifications: boolean;
};

export const DEFAULT_UI_PREFERENCES: UiPreferences = Object.freeze({
  appearance: 'dark',
  accent: 'crimson',
  density: 'comfortable',
  reduceMotion: false,
  notifications: true,
});

const storageKey = 'ecdys.ui-preferences.v1';
const maximumStoredBytes = 2048;
const preferencesSchema = z.object({
  appearance: z.enum(['dark', 'light', 'system']),
  accent: z.enum(['crimson', 'rose', 'amber', 'teal', 'blue', 'violet', 'sage', 'indigo']),
  density: z.enum(['comfortable', 'compact']),
  reduceMotion: z.boolean(),
  notifications: z.boolean(),
}).strict();

export type UiPreferencesReadResult = {
  preferences: UiPreferences;
  persistenceAvailable: boolean;
};

export function readUiPreferences(storage?: Storage): UiPreferencesReadResult {
  let preferences = {...DEFAULT_UI_PREFERENCES};
  let persistenceAvailable = false;
  try {
    const target = storage ?? globalThis.localStorage;
    if (target) {
      const value = target.getItem(storageKey);
      persistenceAvailable = true;
      if (value != null && value.length <= maximumStoredBytes && new TextEncoder().encode(value).byteLength <= maximumStoredBytes) {
        const result = preferencesSchema.safeParse(JSON.parse(value));
        if (result.success) preferences = result.data;
      }
    }
  } catch {
    // An unreadable store is distinct from readable but malformed preferences.
    // Neither case prevents using safe defaults for the current session.
  }
  return {preferences, persistenceAvailable};
}

export function loadUiPreferences(storage?: Storage): UiPreferences {
  return readUiPreferences(storage).preferences;
}

export function saveUiPreferences(preferences: UiPreferences, storage?: Storage): boolean {
  try {
    const result = preferencesSchema.safeParse(preferences);
    if (!result.success) return false;
    const target = storage ?? globalThis.localStorage;
    if (!target) return false;
    target.setItem(storageKey, JSON.stringify(result.data));
    return true;
  } catch {
    return false;
  }
}
