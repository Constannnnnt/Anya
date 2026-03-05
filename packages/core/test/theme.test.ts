import { describe, expect, it } from 'vitest';
import { InMemoryStorage } from '../src/storage/memory';
import { loadThemeTokens, saveThemeTokens } from '../src/theme';

describe('theme token persistence', () => {
  it('saves and loads design tokens', async () => {
    const storage = new InMemoryStorage();

    await saveThemeTokens(storage, {
      'bg-primary': '#111111',
      'text-primary': '#f0f0f0',
    });

    const loaded = await loadThemeTokens(storage);
    expect(loaded).toEqual({
      'bg-primary': '#111111',
      'text-primary': '#f0f0f0',
    });
  });

  it('merges updates without dropping existing tokens', async () => {
    const storage = new InMemoryStorage();

    await saveThemeTokens(storage, {
      'bg-primary': '#111111',
    });
    await saveThemeTokens(storage, {
      'border-focus': '#22aaff',
    });

    const loaded = await loadThemeTokens(storage);
    expect(loaded).toEqual({
      'bg-primary': '#111111',
      'border-focus': '#22aaff',
    });
  });
});
