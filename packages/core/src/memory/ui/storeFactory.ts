/**
 * @anya-ui/core — Memory Store Selection Policy
 *
 * Hosts can pick one policy (`auto|sqlite|indexeddb|memory`) and receive a
 * MemoryStore implementation without wiring adapter classes manually.
 */

import type { MemoryStore } from './store';
import { InMemoryMemoryStore } from './inMemoryAdapter';
import { SQLiteMemoryStore, type SQLiteMemoryStoreOptions } from './sqliteAdapter';
import { IndexedDbMemoryStore, type IndexedDbMemoryStoreOptions } from './indexedDbAdapter';
import { getLogger } from '../../logging';

export type MemoryStorePolicy = 'auto' | 'sqlite' | 'indexeddb' | 'memory';
export type MemoryStoreRuntime = 'node' | 'browser';

export interface MemoryStoreFactoryOptions {
  policy?: MemoryStorePolicy;
  runtime?: MemoryStoreRuntime;
  sqlite?: SQLiteMemoryStoreOptions;
  indexeddb?: IndexedDbMemoryStoreOptions;
  /** Fallback to in-memory when selected adapter is unavailable. Default: true */
  fallbackToMemory?: boolean;
}

/**
 * Resolve one memory-store instance from selection policy.
 */
export function createMemoryStoreByPolicySync(options?: MemoryStoreFactoryOptions): MemoryStore {
  const policy = options?.policy ?? 'auto';
  const runtime = options?.runtime ?? detectRuntime();
  const fallbackToMemory = options?.fallbackToMemory ?? true;

  const resolveAutoPolicy = (): Exclude<MemoryStorePolicy, 'auto'> => {
    if (runtime === 'browser') return 'indexeddb';
    return 'sqlite';
  };

  const selectedPolicy = policy === 'auto' ? resolveAutoPolicy() : policy;

  try {
    switch (selectedPolicy) {
      case 'memory':
        return new InMemoryMemoryStore();
      case 'sqlite':
        if (runtime !== 'node') {
          throw new Error("[MemoryStoreFactory] SQLite adapter requires 'node' runtime.");
        }
        return new SQLiteMemoryStore(options?.sqlite);
      case 'indexeddb':
        if (runtime !== 'browser' || typeof indexedDB === 'undefined') {
          throw new Error("[MemoryStoreFactory] IndexedDB adapter requires browser indexedDB.");
        }
        return new IndexedDbMemoryStore(options?.indexeddb);
      default:
        return new InMemoryMemoryStore();
    }
  } catch (error) {
    if (!fallbackToMemory) {
      throw new Error(`[MemoryStoreFactory] Failed to initialize '${selectedPolicy}' adapter.`);
    }
    getLogger().warn(
      `[MemoryStoreFactory] Falling back to in-memory store from '${selectedPolicy}' policy.`,
      error
    );
    return new InMemoryMemoryStore();
  }
}

/**
 * Async compatibility wrapper for hosts that already await this factory.
 */
export async function createMemoryStoreByPolicy(
  options?: MemoryStoreFactoryOptions,
): Promise<MemoryStore> {
  return createMemoryStoreByPolicySync(options);
}

function detectRuntime(): MemoryStoreRuntime {
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    return 'browser';
  }
  return 'node';
}
