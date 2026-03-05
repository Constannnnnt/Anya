/**
 * @anya-ui/core — LocalStorageAdapter
 *
 * Browser localStorage adapter implementing FileStorage.
 */

import type { FileStorage } from './interface';

export class LocalStorageAdapter implements FileStorage {
  private prefix: string;

  constructor(prefix = 'anya-ui') {
    this.prefix = prefix;
  }

  async read(path: string): Promise<string | null> {
    try {
      return localStorage.getItem(`${this.prefix}:${path}`);
    } catch (error) {
      console.warn(`[LocalStorageAdapter] Failed to read "${path}":`, error);
      return null;
    }
  }

  async write(path: string, content: string): Promise<void> {
    try {
      localStorage.setItem(`${this.prefix}:${path}`, content);
    } catch (error) {
      console.warn(`[LocalStorageAdapter] Failed to write "${path}":`, error);
    }
  }
}
