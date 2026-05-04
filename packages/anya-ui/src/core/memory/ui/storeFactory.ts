/**
 * ../../../core — Memory Store Selection Policy
 *
 * Hosts can pick one policy (`auto|sqlite|indexeddb|memory`) and receive a
 * MemoryStore implementation without wiring adapter classes manually.
 */

import type { MemoryStore } from './store';
import { InMemoryMemoryStore } from './inMemoryAdapter';
import { PersistentMemoryStore } from './persistentAdapter';
import { 
  NodeStorageProvider, 
  BrowserStorageProvider, 
  type StorageProvider 
} from './storageProvider';
import { getLogger } from '../../logging';

export type MemoryStorePolicy = 'auto' | 'sqlite' | 'indexeddb' | 'memory';
export type MemoryStoreRuntime = 'node' | 'browser';

export interface MemoryStoreFactoryOptions {
  policy?: MemoryStorePolicy;
  runtime?: MemoryStoreRuntime;
  /** Storage options for persistent stores */
  filename?: string;
  dbName?: string;
  dbVersion?: number;
  /** Explicit opt-in for downgrading to in-memory when the selected adapter is unavailable. */
  allowMemoryDowngrade?: boolean;
}

/**
 * Resolve one memory-store instance from selection policy.
 */
export function createMemoryStoreByPolicySync(options?: MemoryStoreFactoryOptions): MemoryStore {
  const policy = options?.policy ?? 'auto';
  const runtime = options?.runtime ?? detectRuntime();
  const allowMemoryDowngrade = options?.allowMemoryDowngrade ?? false;

  // For 'memory' policy, we always return the baseline.
  if (policy === 'memory') {
    return new InMemoryMemoryStore();
  }

  try {
    const provider = resolveStorageProvider(policy, runtime, options);
    return new PersistentMemoryStore(provider);
  } catch (error) {
    if (!allowMemoryDowngrade && policy !== 'auto') {
      throw new Error(`[MemoryStoreFactory] Failed to initialize '${policy}' adapter.`);
    }
    getLogger().warn(
      `[MemoryStoreFactory] Downgrading to in-memory store.`,
      error
    );
    return new InMemoryMemoryStore();
  }
}

function resolveStorageProvider(
  policy: MemoryStorePolicy,
  runtime: MemoryStoreRuntime,
  options?: MemoryStoreFactoryOptions
): StorageProvider {
  const isBrowser = runtime === 'browser';
  
  // Decide which provider to use based on policy and runtime
  const useBrowserProvider = policy === 'indexeddb' || (policy === 'auto' && isBrowser);
  
  if (useBrowserProvider) {
    if (!isBrowser && policy === 'indexeddb') {
      throw new Error("[MemoryStoreFactory] IndexedDB adapter requires browser runtime.");
    }
    return new BrowserStorageProvider({ 
      dbName: options?.dbName, 
      dbVersion: options?.dbVersion 
    });
  } else {
    // Node / SQLite
    if (isBrowser && policy === 'sqlite') {
      throw new Error("[MemoryStoreFactory] SQLite adapter requires node runtime.");
    }
    return new NodeStorageProvider({ 
      filename: options?.filename 
    });
  }
}

function detectRuntime(): MemoryStoreRuntime {
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    return 'browser';
  }
  return 'node';
}
