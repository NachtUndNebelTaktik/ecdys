import {describe, expect, it} from 'vitest';
import {readAppearance, saveAppearance, defaultAppearance} from './appearance';

describe('browser appearance preferences', () => {
  it('restores valid settings without carrying unrelated or sensitive fields into storage', () => {
    let saved = JSON.stringify({
      theme: 'night',
      nightWarmth: 60,
      accent: 'ice',
      radius: 30,
      density: 'compact',
      textSize: 16,
      bookmarks: false,
      sidebar: false,
      motion: false,
      profileId: 'private-profile',
      url: 'https://private.test',
    });
    const storage = {
      getItem: () => saved,
      setItem: (_key: string, value: string) => {
        saved = value;
      },
    };
    const preferences = readAppearance(storage).preferences;
    expect(preferences).toMatchObject({
      theme: 'night',
      nightWarmth: 60,
      radius: 30,
      density: 'compact',
      textSize: 16,
      bookmarks: false,
    });
    expect(saveAppearance(storage, preferences)).toBe(true);
    expect(saved).not.toContain('private-profile');
    expect(saved).not.toContain('private.test');
  });
  it('retains system-following and night profiles as distinct preferences', () => {
    expect(
      readAppearance({getItem: () => JSON.stringify({theme: 'system'})}).preferences.theme,
    ).toBe('system');
    expect(
      readAppearance({getItem: () => JSON.stringify({theme: 'night', nightWarmth: 80})})
        .preferences,
    ).toMatchObject({theme: 'night', nightWarmth: 80});
  });
  it('recovers from malformed JSON, invalid values and unavailable storage', () => {
    for (const saved of [
      'not-json',
      'null',
      JSON.stringify({theme: 'remote-css', radius: 900, textSize: -1}),
    ]) {
      expect(readAppearance({getItem: () => saved}).preferences).toEqual(defaultAppearance);
    }
    expect(
      readAppearance({
        getItem: () => {
          throw new Error('unavailable');
        },
      }),
    ).toMatchObject({preferences: defaultAppearance, available: false});
    expect(
      saveAppearance(
        {
          setItem: () => {
            throw new Error('quota');
          },
        },
        defaultAppearance,
      ),
    ).toBe(false);
  });
});
