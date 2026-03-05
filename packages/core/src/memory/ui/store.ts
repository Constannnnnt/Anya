/**
 * @anya-ui/core — UI Memory Store Interface
 *
 * Database-agnostic contract for persistent UI memory.
 * Adapters (in-memory, SQLite, IndexedDB) implement this interface.
 */

import type {
  UiMemoryEvent,
  PreferenceMemory,
  InteractionPattern,
  Episode,
  Reflection,
  MemoryCursor,
} from './schemas';

// ─── Query Options ───────────────────────────────────────────────────────

export interface EventReadOptions {
  /** Exclusive lower bound: events after this ID (cursor position) */
  afterId?: string;
  /** Inclusive upper bound: events up to and including this ID */
  beforeId?: string;
  /** Max number of events to return */
  limit?: number;
}

export interface PreferenceQueryOptions {
  category?: string;
  status?: PreferenceMemory['status'];
  limit?: number;
}

export interface PatternQueryOptions {
  taskClass?: string;
  outcome?: InteractionPattern['outcome'];
  limit?: number;
}

export interface EpisodeQueryOptions {
  intent?: string;
  sessionId?: string;
  limit?: number;
}

export interface ReflectionQueryOptions {
  limit?: number;
}

// ─── Store Interface ─────────────────────────────────────────────────────

export interface MemoryStore {
  // ── Events (append-only) ────────────────────────────────────────────

  /** Append one or more normalized events. */
  appendEvents(events: UiMemoryEvent[]): Promise<void>;

  /** Read events within a cursor range, ordered by ts ascending. */
  readEvents(options?: EventReadOptions): Promise<UiMemoryEvent[]>;

  /** Return the id of the most recent event, or null if empty. */
  getLatestEventId(): Promise<string | null>;

  // ── Preferences ─────────────────────────────────────────────────────

  /** Upsert a preference. Dedupes by (actorId, category, key). */
  upsertPreference(pref: PreferenceMemory): Promise<void>;

  /** Query preferences for an actor. */
  findPreferences(
    actorId: string,
    options?: PreferenceQueryOptions,
  ): Promise<PreferenceMemory[]>;

  // ── Interaction Patterns ────────────────────────────────────────────

  /** Upsert a pattern. Dedupes by (actorId, taskClass, sequenceKey). */
  upsertPattern(pattern: InteractionPattern): Promise<void>;

  /** Query patterns for an actor. */
  findPatterns(
    actorId: string,
    options?: PatternQueryOptions,
  ): Promise<InteractionPattern[]>;

  // ── Episodes ────────────────────────────────────────────────────────

  /** Insert or replace an episode. */
  upsertEpisode(episode: Episode): Promise<void>;

  /** Query episodes for an actor. */
  findEpisodes(
    actorId: string,
    options?: EpisodeQueryOptions,
  ): Promise<Episode[]>;

  // ── Reflections ─────────────────────────────────────────────────────

  /** Upsert a reflection. Dedupes by (actorId, title). */
  upsertReflection(reflection: Reflection): Promise<void>;

  /** Query reflections for an actor. */
  findReflections(
    actorId: string,
    options?: ReflectionQueryOptions,
  ): Promise<Reflection[]>;

  // ── Cursor ──────────────────────────────────────────────────────────

  /** Read the processing cursor for a namespace. */
  getCursor(namespace: string): Promise<MemoryCursor | null>;

  /** Write the processing cursor. */
  setCursor(cursor: MemoryCursor): Promise<void>;

  // ── Transaction ─────────────────────────────────────────────────────

  /**
   * Execute a set of operations atomically. The callback receives this
   * same store reference. For in-memory adapters this is synchronous;
   * for DB adapters it wraps a real transaction.
   */
  transaction<T>(fn: (store: MemoryStore) => Promise<T>): Promise<T>;

  // ── Debug / Migration ──────────────────────────────────────────────

  /** Export all data as a JSON-serializable object. */
  exportJson(): Promise<MemoryStoreSnapshot>;
}

// ─── Snapshot (debug export) ─────────────────────────────────────────────

export interface MemoryStoreSnapshot {
  events: UiMemoryEvent[];
  preferences: PreferenceMemory[];
  patterns: InteractionPattern[];
  episodes: Episode[];
  reflections: Reflection[];
  cursors: MemoryCursor[];
}
