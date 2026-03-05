/**
 * @anya-ui/core — In-Memory UI Memory Store
 *
 * Portable MemoryStore implementation backed by plain arrays and maps.
 * Works in Node, browser, and test environments with zero external deps.
 *
 * Transaction semantics: snapshot-and-rollback on failure for test/dev parity.
 */

import type {
  UiMemoryEvent,
  PreferenceMemory,
  InteractionPattern,
  Episode,
  Reflection,
  MemoryCursor,
} from './schemas';
import type {
  MemoryStore,
  MemoryStoreSnapshot,
  EventReadOptions,
  PreferenceQueryOptions,
  PatternQueryOptions,
  EpisodeQueryOptions,
  ReflectionQueryOptions,
} from './store';

// ─── Helpers ─────────────────────────────────────────────────────────────

/** Preference identity: (actorId, category, key) — value is NOT part of identity */
function prefKey(p: { actorId: string; category: string; key: string }): string {
  return `${p.actorId}::${p.category}::${p.key}`;
}

function patternKey(p: InteractionPattern): string {
  return `${p.actorId}::${p.taskClass}::${p.sequenceKey}`;
}

function reflectionKey(r: Reflection): string {
  return `${r.actorId}::${r.title}`;
}

// ─── In-Memory Adapter ──────────────────────────────────────────────────

export class InMemoryMemoryStore implements MemoryStore {
  private events: UiMemoryEvent[] = [];
  private preferences = new Map<string, PreferenceMemory>();
  private patterns = new Map<string, InteractionPattern>();
  private episodes = new Map<string, Episode>();
  private reflections = new Map<string, Reflection>();
  private cursors = new Map<string, MemoryCursor>();

  // ── Events ──────────────────────────────────────────────────────────

  async appendEvents(events: UiMemoryEvent[]): Promise<void> {
    for (const event of events) {
      this.events.push(event);
    }
  }

  async readEvents(options?: EventReadOptions): Promise<UiMemoryEvent[]> {
    let result = this.events;

    if (options?.afterId) {
      const afterIdx = result.findIndex((e) => e.id === options.afterId);
      // Fix 6: If afterId not found, return all events (cursor drift recovery)
      // instead of empty array which would stall extraction.
      result = afterIdx === -1 ? result : result.slice(afterIdx + 1);
    }

    if (options?.beforeId) {
      const beforeIdx = result.findIndex((e) => e.id === options.beforeId);
      if (beforeIdx !== -1) {
        result = result.slice(0, beforeIdx + 1);
      }
    }

    if (options?.limit !== undefined && options.limit >= 0) {
      result = result.slice(0, options.limit);
    }

    return result;
  }

  async getLatestEventId(): Promise<string | null> {
    return this.events.length > 0
      ? this.events[this.events.length - 1].id
      : null;
  }

  // ── Preferences ─────────────────────────────────────────────────────

  async upsertPreference(pref: PreferenceMemory): Promise<void> {
    this.preferences.set(prefKey(pref), pref);
  }

  async findPreferences(
    actorId: string,
    options?: PreferenceQueryOptions,
  ): Promise<PreferenceMemory[]> {
    let results = [...this.preferences.values()].filter(
      (p) => p.actorId === actorId,
    );

    if (options?.category) {
      results = results.filter((p) => p.category === options.category);
    }
    if (options?.status) {
      results = results.filter((p) => p.status === options.status);
    }

    // Sort by confidence descending, then lastSeenTs descending
    results.sort(
      (a, b) => b.confidence - a.confidence || b.lastSeenTs - a.lastSeenTs,
    );

    if (options?.limit !== undefined && options.limit >= 0) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  // ── Interaction Patterns ────────────────────────────────────────────

  async upsertPattern(pattern: InteractionPattern): Promise<void> {
    this.patterns.set(patternKey(pattern), pattern);
  }

  async findPatterns(
    actorId: string,
    options?: PatternQueryOptions,
  ): Promise<InteractionPattern[]> {
    let results = [...this.patterns.values()].filter(
      (p) => p.actorId === actorId,
    );

    if (options?.taskClass) {
      results = results.filter((p) => p.taskClass === options.taskClass);
    }
    if (options?.outcome) {
      results = results.filter((p) => p.outcome === options.outcome);
    }

    results.sort(
      (a, b) => b.confidence - a.confidence || b.lastSeenTs - a.lastSeenTs,
    );

    if (options?.limit !== undefined && options.limit >= 0) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  // ── Episodes ────────────────────────────────────────────────────────

  async upsertEpisode(episode: Episode): Promise<void> {
    this.episodes.set(episode.id, episode);
  }

  async findEpisodes(
    actorId: string,
    options?: EpisodeQueryOptions,
  ): Promise<Episode[]> {
    let results = [...this.episodes.values()].filter(
      (e) => e.actorId === actorId,
    );

    if (options?.intent) {
      results = results.filter((e) => e.intent === options.intent);
    }
    if (options?.sessionId) {
      results = results.filter((e) => e.sessionId === options.sessionId);
    }

    results.sort((a, b) => b.createdTs - a.createdTs);

    if (options?.limit !== undefined && options.limit >= 0) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  // ── Reflections ─────────────────────────────────────────────────────

  async upsertReflection(reflection: Reflection): Promise<void> {
    this.reflections.set(reflectionKey(reflection), reflection);
  }

  async findReflections(
    actorId: string,
    options?: ReflectionQueryOptions,
  ): Promise<Reflection[]> {
    let results = [...this.reflections.values()].filter(
      (r) => r.actorId === actorId,
    );

    results.sort(
      (a, b) => b.confidence - a.confidence || b.updatedTs - a.updatedTs,
    );

    if (options?.limit !== undefined && options.limit >= 0) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  // ── Cursor ──────────────────────────────────────────────────────────

  async getCursor(namespace: string): Promise<MemoryCursor | null> {
    return this.cursors.get(namespace) ?? null;
  }

  async setCursor(cursor: MemoryCursor): Promise<void> {
    this.cursors.set(cursor.namespace, cursor);
  }

  // ── Transaction (snapshot + rollback on error) ──────────────────────

  async transaction<T>(fn: (store: MemoryStore) => Promise<T>): Promise<T> {
    // Snapshot current state for rollback on failure
    const snapshot = this.takeSnapshot();
    try {
      return await fn(this);
    } catch (error) {
      // Rollback all state to pre-transaction snapshot
      this.restoreSnapshot(snapshot);
      throw error;
    }
  }

  // ── Debug / Migration ──────────────────────────────────────────────

  async exportJson(): Promise<MemoryStoreSnapshot> {
    return {
      events: [...this.events],
      preferences: [...this.preferences.values()],
      patterns: [...this.patterns.values()],
      episodes: [...this.episodes.values()],
      reflections: [...this.reflections.values()],
      cursors: [...this.cursors.values()],
    };
  }

  // ── Snapshot / Restore (for transaction rollback) ──────────────────

  private takeSnapshot(): InMemorySnapshot {
    return {
      events: this.events.map((e) => ({ ...e })),
      preferences: new Map(
        [...this.preferences].map(([k, v]) => [k, { ...v }]),
      ),
      patterns: new Map(
        [...this.patterns].map(([k, v]) => [k, { ...v }]),
      ),
      episodes: new Map(
        [...this.episodes].map(([k, v]) => [k, { ...v }]),
      ),
      reflections: new Map(
        [...this.reflections].map(([k, v]) => [k, { ...v }]),
      ),
      cursors: new Map(
        [...this.cursors].map(([k, v]) => [k, { ...v }]),
      ),
    };
  }

  private restoreSnapshot(snapshot: InMemorySnapshot): void {
    this.events = snapshot.events;
    this.preferences = snapshot.preferences;
    this.patterns = snapshot.patterns;
    this.episodes = snapshot.episodes;
    this.reflections = snapshot.reflections;
    this.cursors = snapshot.cursors;
  }
}

interface InMemorySnapshot {
  events: UiMemoryEvent[];
  preferences: Map<string, PreferenceMemory>;
  patterns: Map<string, InteractionPattern>;
  episodes: Map<string, Episode>;
  reflections: Map<string, Reflection>;
  cursors: Map<string, MemoryCursor>;
}
