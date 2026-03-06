import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LocalStorageAdapter } from '../src/storage/localStorage';
import { consoleLogger, setLogger } from '../src/logging';

describe('LocalStorageAdapter', () => {
  let localStorageMock: Record<string, string>;
  let warnMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorageMock = {};

    // Mock the global localStorage manually for Bun
    globalThis.localStorage = {
      getItem: vi.fn((key: string) => localStorageMock[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        localStorageMock[key] = value;
      }),
    } as any;

    warnMock = vi.fn();
    setLogger({
      debug: vi.fn(),
      info: vi.fn(),
      warn: warnMock,
      error: vi.fn(),
    });
  });

  afterEach(() => {
    // Note: Can't easily unstub all in Bun, but we reset localStorage manually.
    globalThis.localStorage = undefined as any;
    setLogger(consoleLogger);
  });

  describe('read', () => {
    it('returns null if item does not exist', async () => {
      const adapter = new LocalStorageAdapter();
      const result = await adapter.read('missing-file.txt');
      expect(result).toBeNull();
      expect(localStorage.getItem).toHaveBeenCalledWith('anya-ui:missing-file.txt');
    });

    it('returns the item content if it exists', async () => {
      const adapter = new LocalStorageAdapter();
      localStorageMock['anya-ui:test.txt'] = 'hello world';
      const result = await adapter.read('test.txt');
      expect(result).toBe('hello world');
      expect(localStorage.getItem).toHaveBeenCalledWith('anya-ui:test.txt');
    });

    it('returns null and logs warning if localStorage throws an error', async () => {
      const adapter = new LocalStorageAdapter();
      const mockError = new Error('Storage disabled');

      (localStorage.getItem as any).mockImplementationOnce(() => {
        throw mockError;
      });

      const result = await adapter.read('test.txt');
      expect(result).toBeNull();
      expect(warnMock).toHaveBeenCalledWith(
        '[LocalStorageAdapter] Failed to read "test.txt":',
        mockError
      );
    });

    it('respects a custom prefix', async () => {
      const adapter = new LocalStorageAdapter('custom-prefix');
      localStorageMock['custom-prefix:file.txt'] = 'data';

      const result = await adapter.read('file.txt');
      expect(result).toBe('data');
      expect(localStorage.getItem).toHaveBeenCalledWith('custom-prefix:file.txt');
    });
  });

  describe('write', () => {
    it('writes content to localStorage', async () => {
      const adapter = new LocalStorageAdapter();
      await adapter.write('new-file.txt', 'new data');

      expect(localStorageMock['anya-ui:new-file.txt']).toBe('new data');
      expect(localStorage.setItem).toHaveBeenCalledWith('anya-ui:new-file.txt', 'new data');
    });

    it('logs warning if localStorage throws an error', async () => {
      const adapter = new LocalStorageAdapter();
      const mockError = new Error('Storage quota exceeded');

      (localStorage.setItem as any).mockImplementationOnce(() => {
        throw mockError;
      });

      await adapter.write('new-file.txt', 'new data');

      // Content shouldn't be saved in our mock state since the method threw
      expect(localStorageMock['anya-ui:new-file.txt']).toBeUndefined();
      expect(warnMock).toHaveBeenCalledWith(
        '[LocalStorageAdapter] Failed to write "new-file.txt":',
        mockError
      );
    });

    it('respects a custom prefix', async () => {
      const adapter = new LocalStorageAdapter('custom-prefix');
      await adapter.write('file.txt', 'data');

      expect(localStorageMock['custom-prefix:file.txt']).toBe('data');
      expect(localStorage.setItem).toHaveBeenCalledWith('custom-prefix:file.txt', 'data');
    });
  });
});
