/**
 * @anya-ui/core — InMemoryStorage
 *
 * In-memory fallback for environments without file access.
 */

import type { FileStorage } from './interface';

export class InMemoryStorage implements FileStorage {
  private store = new Map<string, string>();

  async read(path: string): Promise<string | null> {
    return this.store.get(path) ?? null;
  }

  async write(path: string, content: string): Promise<void> {
    this.store.set(path, content);
  }
}
