/**
 * ../../../core — SQLite Memory Store Adapter (Node)
 *
 * v0 implementation strategy:
 * - keep canonical logic in InMemoryMemoryStore
 * - persist/load full snapshot into SQLite for durable storage
 *
 * This keeps behavior parity with in-memory contract while enabling
 * persistent storage without changing higher-level memory algorithms.
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

const SNAPSHOT_ID = 'root';

export interface SQLiteMemoryStoreOptions {
  filename?: string;
}

interface SqliteStatement {
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): void;
}

interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}

interface NodeSqliteModule {
  DatabaseSync: new (filename: string) => SqliteDatabase;
}

function isNodeSqliteModule(value: unknown): value is NodeSqliteModule {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { DatabaseSync?: unknown };
  return typeof candidate.DatabaseSync === 'function';
}

/**
 * Snapshot-backed SQLite adapter.
 * Uses Node's built-in experimental `node:sqlite` module.
 */
export class SQLiteMemoryStore implements MemoryStore {
  private readonly memory = new InMemoryMemoryStore();
  private readonly options: Required<SQLiteMemoryStoreOptions>;
  private db: SqliteDatabase | null = null;
  private readonly ready: Promise<void>;

  constructor(options?: SQLiteMemoryStoreOptions) {
    this.options = {
      filename: options?.filename ?? '.anya/ui-memory.sqlite',
    };
    this.ready = this.initialize();
  }

  /** Convenience async factory for explicit startup sequencing. */
  static async create(options?: SQLiteMemoryStoreOptions): Promise<SQLiteMemoryStore> {
    const store = new SQLiteMemoryStore(options);
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
    this.db?.close?.();
  }

  private async waitUntilReady(): Promise<void> {
    await this.ready;
  }

  private async initialize(): Promise<void> {
    const sqlite = await loadNodeSqlite();
    this.db = new sqlite.DatabaseSync(this.options.filename);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memory_snapshot (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_ts INTEGER NOT NULL
      );
    `);

    const row = this.db
      .prepare('SELECT data FROM memory_snapshot WHERE id = ?')
      .get(SNAPSHOT_ID) as { data?: string } | undefined;
    if (!row?.data) return;

    const snapshot = JSON.parse(row.data) as MemoryStoreSnapshot;
    await this.hydrate(snapshot);
  }

  private async hydrate(snapshot: MemoryStoreSnapshot): Promise<void> {
    await this.memory.appendEvents(snapshot.events ?? []);
    await Promise.all([
      ...(snapshot.preferences ?? []).map(pref => this.memory.upsertPreference(pref)),
      ...(snapshot.patterns ?? []).map(pattern => this.memory.upsertPattern(pattern)),
      ...(snapshot.episodes ?? []).map(episode => this.memory.upsertEpisode(episode)),
      ...(snapshot.reflections ?? []).map(reflection => this.memory.upsertReflection(reflection)),
      ...(snapshot.cursors ?? []).map(cursor => this.memory.setCursor(cursor)),
    ]);
  }

  private async persist(): Promise<void> {
    const snapshot = await this.memory.exportJson();
    const db = this.db;
    if (!db) {
      throw new Error('[SQLiteMemoryStore] Database is not initialized.');
    }
    db
      .prepare(`
        INSERT INTO memory_snapshot (id, data, updated_ts)
        VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          data = excluded.data,
          updated_ts = excluded.updated_ts
      `)
      .run(SNAPSHOT_ID, JSON.stringify(snapshot), Date.now());
  }
}

/**
 * Load node:sqlite without exposing a static import specifier.
 * This prevents browser bundlers from trying to bundle node-only modules.
 */
async function loadNodeSqlite(): Promise<NodeSqliteModule> {
  const sqliteSpecifier = `node:${'sqlite'}`;
  // Node-only path; keep unresolved in browser builds.
  const loaded: unknown = await import(/* @vite-ignore */ sqliteSpecifier);
  if (!isNodeSqliteModule(loaded)) {
    throw new Error('[SQLiteMemoryStore] Failed to load node:sqlite DatabaseSync module.');
  }
  return loaded;
}
