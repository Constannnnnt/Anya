/**
 * @anya-ui/core — Theme Utilities
 *
 * Loads and persists design tokens from `.anya/theme.json` via FileStorage.
 * Single file, single source of truth — no separate base/overrides split.
 */

import type { FileStorage } from '../storage/interface';

/** The single storage key for the theme config file (.anya/theme.json) */
export const THEME_STORAGE_KEY = 'theme.json';

/**
 * Load the design tokens from `.anya/theme.json` via FileStorage.
 * Returns an empty record if the file doesn't exist or is malformed.
 */
export async function loadThemeTokens(
  storage: FileStorage,
): Promise<Record<string, string>> {
  const raw = await storage.read(THEME_STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const tokens: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string') {
        tokens[key] = value;
      }
    }
    return tokens;
  } catch {
    return {};
  }
}

/**
 * Save updated design tokens back to `.anya/theme.json`.
 * Merges the update into the existing tokens.
 */
export async function saveThemeTokens(
  storage: FileStorage,
  update: Record<string, string>,
): Promise<Record<string, string>> {
  const current = await loadThemeTokens(storage);
  const merged = { ...current, ...update };
  await storage.write(THEME_STORAGE_KEY, JSON.stringify(merged, null, 2));
  return merged;
}
