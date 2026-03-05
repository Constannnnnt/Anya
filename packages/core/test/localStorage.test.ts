import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalStorageAdapter } from '../src/storage/localStorage';

describe('LocalStorageAdapter', () => {
  let adapter: LocalStorageAdapter;
  const prefix = 'test-prefix';

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock global localStorage
    const localStorageMock = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(),
      length: 0,
    };
    (globalThis as any).localStorage = localStorageMock;
    adapter = new LocalStorageAdapter(prefix);
  });

  describe('read', () => {
    it('returns value from localStorage if it exists', async () => {
      const path = 'test-file';
      const content = 'test-content';
      (localStorage.getItem as any).mockReturnValue(content);

      const result = await adapter.read(path);

      expect(localStorage.getItem).toHaveBeenCalledWith(`${prefix}:${path}`);
      expect(result).toBe(content);
    });

    it('returns null if localStorage.getItem returns null', async () => {
      const path = 'non-existent';
      (localStorage.getItem as any).mockReturnValue(null);

      const result = await adapter.read(path);

      expect(result).toBeNull();
    });

    it('returns null and logs warning if localStorage.getItem throws', async () => {
      const path = 'error-file';
      const error = new Error('Storage full');
      (localStorage.getItem as any).mockImplementation(() => {
        throw error;
      });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await adapter.read(path);

      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        `[LocalStorageAdapter] Failed to read "${path}":`,
        error
      );
    });
  });

  describe('write', () => {
    it('calls localStorage.setItem with prefixed path and content', async () => {
      const path = 'test-file';
      const content = 'test-content';

      await adapter.write(path, content);

      expect(localStorage.setItem).toHaveBeenCalledWith(`${prefix}:${path}`, content);
    });

    it('logs warning if localStorage.setItem throws', async () => {
      const path = 'error-file';
      const content = 'test-content';
      const error = new Error('Quota exceeded');
      (localStorage.setItem as any).mockImplementation(() => {
        throw error;
      });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await adapter.write(path, content);

      expect(warnSpy).toHaveBeenCalledWith(
        `[LocalStorageAdapter] Failed to write "${path}":`,
        error
      );
    });
  });
});
