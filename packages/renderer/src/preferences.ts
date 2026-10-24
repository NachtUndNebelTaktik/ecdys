import {z} from 'zod';

export type UiPreferences = {
  appearance: 'dark' | 'light' | 'system';
  accent: 'crimson' | 'sage' | 'indigo';
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
  accent: z.enum(['crimson', 'sage', 'indigo']),
  density: z.enum(['comfortable', 'compact']),
  reduceMotion: z.boolean(),
  notifications: z.boolean(),
}).strict();

export function loadUiPreferences(storage?: Storage): UiPreferences {
  try {
    const value = (storage ?? globalThis.localStorage)?.getItem(storageKey);
    if (value == null || value.length > maximumStoredBytes || new TextEncoder().encode(value).byteLength > maximumStoredBytes) {
      return {...DEFAULT_UI_PREFERENCES};
    }
    const result = preferencesSchema.safeParse(JSON.parse(value));
    return result.success ? result.data : {...DEFAULT_UI_PREFERENCES};
  } catch {
    return {...DEFAULT_UI_PREFERENCES};
  }
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
