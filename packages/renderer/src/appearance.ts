import {z, type Profile} from '@ecdys/shared';

const AppearanceSchema = z.object({
  theme: z.enum(['dark', 'light', 'system', 'night']).default('dark'),
  nightWarmth: z.number().int().min(0).max(80).default(45),
  accent: z.enum(['sage', 'ice', 'copper']).default('sage'),
  radius: z.number().int().min(0).max(32).default(24),
  density: z.enum(['comfortable', 'compact']).default('comfortable'),
  textSize: z.number().int().min(12).max(18).default(14),
  bookmarks: z.boolean().default(true),
  sidebar: z.boolean().default(true),
  motion: z.boolean().default(true),
  profileOrder: z.enum(['recent', 'name_asc', 'name_desc', 'created']).default('recent'),
  profileLayout: z.enum(['grid', 'list']).default('grid'),
});
export type Appearance = z.infer<typeof AppearanceSchema>;
export const defaultAppearance: Appearance = AppearanceSchema.parse({});
export const accentColors = {
  sage: {dark: '#c4ef91', light: '#466a35'},
  ice: {dark: '#a6cfff', light: '#32699d'},
  copper: {dark: '#efba95', light: '#96582e'},
};
export function orderProfiles(profiles: Profile[], order: Appearance['profileOrder']): Profile[] {
  return [...profiles].sort((a, b) => {
    if (order === 'name_asc')
      return a.name.localeCompare(b.name, undefined, {numeric: true, sensitivity: 'base'});
    if (order === 'name_desc')
      return b.name.localeCompare(a.name, undefined, {numeric: true, sensitivity: 'base'});
    return (
      (order === 'created' ? b.createdAt - a.createdAt : b.updatedAt - a.updatedAt) ||
      a.name.localeCompare(b.name)
    );
  });
}
const preferenceKey = 'ecdys.interface.v1';
export function readAppearance(storage: {getItem(key: string): string | null}): {
  preferences: Appearance;
  available: boolean;
} {
  let raw: string | null;
  try {
    raw = storage.getItem(preferenceKey);
  } catch {
    return {preferences: {...defaultAppearance}, available: false};
  }
  try {
    if (!raw || raw.length > 4096) return {preferences: {...defaultAppearance}, available: true};
    const parsed = AppearanceSchema.safeParse(JSON.parse(raw));
    return {preferences: parsed.success ? parsed.data : {...defaultAppearance}, available: true};
  } catch {
    return {preferences: {...defaultAppearance}, available: true};
  }
}
export function saveAppearance(
  storage: {setItem(key: string, value: string): void},
  preferences: Appearance,
): boolean {
  try {
    storage.setItem(preferenceKey, JSON.stringify(AppearanceSchema.parse(preferences)));
    return true;
  } catch {
    return false;
  }
}
