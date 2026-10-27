import {afterEach, describe, expect, it, vi} from 'vitest';
import {DEFAULT_UI_PREFERENCES, loadUiPreferences, readUiPreferences, saveUiPreferences, type UiPreferences} from '../packages/renderer/src/preferences';

const key = 'ecdys.ui-preferences.v1';
const defaults: UiPreferences = {appearance: 'dark', accent: 'crimson', density: 'comfortable', reduceMotion: false, notifications: true};
const chosen: UiPreferences = {appearance: 'light', accent: 'indigo', density: 'compact', reduceMotion: true, notifications: false};

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(name: string) { return this.values.get(name) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(name: string) { this.values.delete(name); }
  setItem(name: string, value: string) { this.values.set(name, value); }
}

afterEach(() => vi.unstubAllGlobals());

describe('local UI preferences', () => {
  it('loads independent defaults when storage is empty', () => {
    const storage = new MemoryStorage();
    expect(loadUiPreferences(storage)).toEqual(defaults);
    const first = loadUiPreferences(storage);
    first.accent = 'sage';
    expect(loadUiPreferences(storage)).toEqual(defaults);
    expect(DEFAULT_UI_PREFERENCES).toEqual(defaults);
    expect(storage.length).toBe(0);
    expect(readUiPreferences(storage)).toEqual({preferences: defaults, persistenceAvailable: true});
  });

  it('persists only UI fields and reloads them through a new storage reader', () => {
    const storage = new MemoryStorage();
    storage.setItem('unrelated', 'preserved');
    expect(saveUiPreferences(chosen, storage)).toBe(true);
    expect(JSON.parse(storage.getItem(key)!)).toEqual({appearance: 'light', accent: 'indigo', density: 'compact', reduceMotion: true, notifications: false});
    const reloaded = new MemoryStorage();
    reloaded.setItem(key, storage.getItem(key)!);
    expect(loadUiPreferences(reloaded)).toEqual(chosen);
    expect(readUiPreferences(reloaded)).toEqual({preferences: chosen, persistenceAvailable: true});
    expect(storage.getItem('unrelated')).toBe('preserved');
    expect(storage.length).toBe(2);
  });

  it('accepts a valid preference value at the two KiB storage boundary', () => {
    const storage = new MemoryStorage();
    const value = JSON.stringify({...chosen, appearance: 'system', accent: 'sage'});
    storage.setItem(key, value.padEnd(2048, ' '));
    expect(loadUiPreferences(storage)).toEqual({appearance: 'system', accent: 'sage', density: 'compact', reduceMotion: true, notifications: false});
  });

  it.each([
    '{', 'null', '[]', 'true', '"dark"', '{}',
    JSON.stringify({...chosen, appearance: 'sepia'}),
    JSON.stringify({...chosen, accent: 'chartreuse'}),
    JSON.stringify({...chosen, density: 'dense'}),
    JSON.stringify({...chosen, reduceMotion: 'true'}),
    JSON.stringify({...chosen, notifications: 1}),
    JSON.stringify({...chosen, email: 'private@example.test'}),
    `${JSON.stringify(chosen)}${' '.repeat(2048)}`,
  ])('rejects malformed, invalid, extra-field or oversized stored data (%#)', value => {
    const storage = new MemoryStorage();
    storage.setItem(key, value);
    expect(loadUiPreferences(storage)).toEqual(defaults);
    expect(storage.getItem(key)).toBe(value);
    expect(readUiPreferences(storage)).toEqual({preferences: defaults, persistenceAvailable: true});
  });

  it.each(['account', 'email', 'credentials', 'wallet', 'privateKey', 'token'])('refuses to persist an extra %s field', field => {
    const storage = new MemoryStorage();
    expect(saveUiPreferences(chosen, storage)).toBe(true);
    const before = storage.getItem(key);
    const value = {...chosen, [field]: 'sensitive-fixture'} as UiPreferences;
    expect(saveUiPreferences(value, storage)).toBe(false);
    expect(storage.getItem(key)).toBe(before);
    expect(storage.getItem(key)).not.toContain('sensitive-fixture');
  });

  it.each([
    null, {}, {...chosen, appearance: 'sepia'}, {...chosen, accent: 'chartreuse'},
    {...chosen, density: 'dense'}, {...chosen, reduceMotion: 0}, {...chosen, notifications: 'false'},
  ])('refuses invalid writes without replacing existing data (%#)', value => {
    const storage = new MemoryStorage();
    storage.setItem(key, JSON.stringify(defaults));
    expect(saveUiPreferences(value as UiPreferences, storage)).toBe(false);
    expect(loadUiPreferences(storage)).toEqual(defaults);
  });

  it('serializes validated values instead of inherited serialization hooks', () => {
    const storage = new MemoryStorage();
    const prototype = Object.defineProperty({}, 'toJSON', {value: () => ({token: 'sensitive-fixture'})});
    const value = Object.assign(Object.create(prototype), chosen);
    expect(saveUiPreferences(value, storage)).toBe(true);
    expect(JSON.parse(storage.getItem(key)!)).toEqual(chosen);
    expect(storage.getItem(key)).not.toContain('sensitive-fixture');
  });

  it('handles unavailable default storage and denied reads or writes', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(loadUiPreferences()).toEqual(defaults);
    expect(readUiPreferences()).toEqual({preferences: defaults, persistenceAvailable: false});
    expect(saveUiPreferences(chosen)).toBe(false);
    const denied = new MemoryStorage();
    denied.getItem = () => { throw new Error('Storage denied'); };
    denied.setItem = () => { throw new Error('Storage full'); };
    expect(loadUiPreferences(denied)).toEqual(defaults);
    expect(readUiPreferences(denied)).toEqual({preferences: defaults, persistenceAvailable: false});
    expect(saveUiPreferences(chosen, denied)).toBe(false);
  });

  it('handles a browser that denies access to the storage property', () => {
    vi.stubGlobal('localStorage', undefined);
    Object.defineProperty(globalThis, 'localStorage', {configurable: true, get: () => { throw new Error('Storage denied'); }});
    expect(loadUiPreferences()).toEqual(defaults);
    expect(readUiPreferences()).toEqual({preferences: defaults, persistenceAvailable: false});
    expect(saveUiPreferences(chosen)).toBe(false);
  });

  it('uses browser storage when no explicit storage is supplied', () => {
    const storage = new MemoryStorage();
    vi.stubGlobal('localStorage', storage);
    expect(saveUiPreferences(chosen)).toBe(true);
    expect(loadUiPreferences()).toEqual(chosen);
    expect(storage.length).toBe(1);
  });

  it.each(['crimson', 'rose', 'amber', 'teal', 'blue', 'violet', 'sage', 'indigo'] as const)('round-trips the %s accent without losing other preferences', accent => {
    const storage = new MemoryStorage();
    const value = {...chosen, accent};
    expect(saveUiPreferences(value as UiPreferences, storage)).toBe(true);
    expect(loadUiPreferences(storage)).toEqual(value);
  });
});
