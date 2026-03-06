/**
 * @anya-ui/core — IndexedDB Memory Store Adapter (Browser)
 *
 * v0 implementation strategy:
 * - keep canonical logic in InMemoryMemoryStore
 * - persist/load full snapshot into one IndexedDB record
 *
 * This gives browser durability and contract parity with minimum complexity.
 */

import type { MemoryStore, MemoryStoreSnapshot } from './store';
import type {
  UiMemoryEvent,
  PreferenceMemory,
  InteractionPattern,
  Episode,
  Reflection,
  MemoryCursor,
} from './schemas';
import type {
  EventReadOptions,
  PreferenceQueryOptions,
  PatternQueryOptions,
  EpisodeQueryOptions,
  ReflectionQueryOptions,
} from './store';
import { InMemoryMemoryStore } from './inMemoryAdapter';

const SNAPSHOT_STORE = 'snapshots';
const SNAPSHOT_ID = 'root';

export interface IndexedDbMemoryStoreOptions {
  dbName?: string;
  dbVersion?: number;
}

function isInvalidStateDomException(error: unknown): boolean {
  return (
    typeof DOMException !== 'undefined'
    && error instanceof DOMException
    && error.name === 'InvalidStateError'
  );
}

export class IndexedDbMemoryStore implements MemoryStore {
  private readonly memory = new InMemoryMemoryStore();
  private readonly options: Required<IndexedDbMemoryStoreOptions>;
  private db: IDBDatabase | null = null;
  private readonly ready: Promise<void>;

  constructor(options?: IndexedDbMemoryStoreOptions) {
    this.options = {
      dbName: options?.dbName ?? 'anya-ui-memory',
      dbVersion: options?.dbVersion ?? 1,
    };
    this.ready = this.initialize();
  }

  static async create(options?: IndexedDbMemoryStoreOptions): Promise<IndexedDbMemoryStore> {
    const store = new IndexedDbMemoryStore(options);
    await store.waitUntilReady();
    return store;
  }

  async appendEvents(events: UiMemoryEvent[]): Promise<void> {
    await this.waitUntilReady();
    await this.memory.appendEvents(events);
    await this.persist();
  }

  async readEvents(options?: EventReadOptions): Promise<UiMemoryEvent[]> {
    await this.waitUntilReady();
    return this.memory.readEvents(options);
  }

  async getLatestEventId(): Promise<string | null> {
    await this.waitUntilReady();
    return this.memory.getLatestEventId();
  }

  async upsertPreference(pref: PreferenceMemory): Promise<void> {
    await this.waitUntilReady();
    await this.memory.upsertPreference(pref);
    await this.persist();
  }

  async findPreferences(actorId: string, options?: PreferenceQueryOptions): Promise<PreferenceMemory[]> {
    await this.waitUntilReady();
    return this.memory.findPreferences(actorId, options);
  }

  async upsertPattern(pattern: InteractionPattern): Promise<void> {
    await this.waitUntilReady();
    await this.memory.upsertPattern(pattern);
    await this.persist();
  }

  async findPatterns(actorId: string, options?: PatternQueryOptions): Promise<InteractionPattern[]> {
    await this.waitUntilReady();
    return this.memory.findPatterns(actorId, options);
  }

  async upsertEpisode(episode: Episode): Promise<void> {
    await this.waitUntilReady();
    await this.memory.upsertEpisode(episode);
    await this.persist();
  }

  async findEpisodes(actorId: string, options?: EpisodeQueryOptions): Promise<Episode[]> {
    await this.waitUntilReady();
    return this.memory.findEpisodes(actorId, options);
  }

  async upsertReflection(reflection: Reflection): Promise<void> {
    await this.waitUntilReady();
    await this.memory.upsertReflection(reflection);
    await this.persist();
  }

  async findReflections(actorId: string, options?: ReflectionQueryOptions): Promise<Reflection[]> {
    await this.waitUntilReady();
    return this.memory.findReflections(actorId, options);
  }

  async getCursor(namespace: string): Promise<MemoryCursor | null> {
    await this.waitUntilReady();
    return this.memory.getCursor(namespace);
  }

  async setCursor(cursor: MemoryCursor): Promise<void> {
    await this.waitUntilReady();
    await this.memory.setCursor(cursor);
    await this.persist();
  }

  async transaction<T>(fn: (store: MemoryStore) => Promise<T>): Promise<T> {
    await this.waitUntilReady();
    const result = await this.memory.transaction(fn);
    await this.persist();
    return result;
  }

  async exportJson(): Promise<MemoryStoreSnapshot> {
    await this.waitUntilReady();
    return this.memory.exportJson();
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }

  private async waitUntilReady(): Promise<void> {
    await this.ready;
  }

  private async initialize(): Promise<void> {
    const db = await this.openDb();
    this.db = db;
    const snapshot = await this.readSnapshot(db);
    if (!snapshot) return;
    await this.hydrate(snapshot);
  }

  private async hydrate(snapshot: MemoryStoreSnapshot): Promise<void> {
    await Promise.all([
      this.memory.appendEvents(snapshot.events ?? []),
      ...(snapshot.preferences ?? []).map((pref) => this.memory.upsertPreference(pref)),
      ...(snapshot.patterns ?? []).map((pattern) => this.memory.upsertPattern(pattern)),
      ...(snapshot.episodes ?? []).map((episode) => this.memory.upsertEpisode(episode)),
      ...(snapshot.reflections ?? []).map((reflection) => this.memory.upsertReflection(reflection)),
      ...(snapshot.cursors ?? []).map((cursor) => this.memory.setCursor(cursor)),
    ]);
  }

  private async persist(): Promise<void> {
    const snapshot = await this.memory.exportJson();
    await this.writeSnapshot(snapshot);
  }

  private async openDb(): Promise<IDBDatabase> {
    if (typeof indexedDB === 'undefined') {
      throw new Error('[IndexedDbMemoryStore] indexedDB is not available in this environment.');
    }

    return await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.options.dbName, this.options.dbVersion);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
          db.createObjectStore(SNAPSHOT_STORE, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB.'));
    });
  }

  private async getDb(): Promise<IDBDatabase> {
    await this.waitUntilReady();
    if (!this.db) {
      this.db = await this.openDb();
    }
    return this.db;
  }

  private async readSnapshot(dbInstance?: IDBDatabase): Promise<MemoryStoreSnapshot | null> {
    try {
      const db = dbInstance ?? await this.getDb();
      return await new Promise<MemoryStoreSnapshot | null>((resolve, reject) => {
        const tx = db.transaction(SNAPSHOT_STORE, 'readonly');
        const store = tx.objectStore(SNAPSHOT_STORE);
        const request = store.get(SNAPSHOT_ID);

        request.onsuccess = () => {
          const row = request.result as { id: string; data: MemoryStoreSnapshot } | undefined;
          resolve(row?.data ?? null);
        };
        request.onerror = () => reject(request.error ?? new Error('Failed to read IndexedDB snapshot.'));
      });
    } catch (err: unknown) {
      if (isInvalidStateDomException(err)) {
        this.db = null; // force reconnect on next try
      }
      throw err;
    }
  }

  private async writeSnapshot(snapshot: MemoryStoreSnapshot): Promise<void> {
    try {
      const db = await this.getDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(SNAPSHOT_STORE, 'readwrite');
        const store = tx.objectStore(SNAPSHOT_STORE);
        store.put({
          id: SNAPSHOT_ID,
          data: snapshot,
          updatedTs: Date.now(),
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('Failed to write IndexedDB snapshot.'));
        tx.onabort = () => reject(tx.error ?? new Error('IndexedDB snapshot write aborted.'));
      });
    } catch (err: unknown) {
      if (isInvalidStateDomException(err)) {
        this.db = null; // force reconnect next time
      }
      throw err;
    }
  }
}
