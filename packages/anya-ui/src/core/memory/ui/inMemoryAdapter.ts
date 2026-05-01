/**
 * ../../../core — In-Memory UI Memory Store
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

function prefActorCategoryKey(actorId: string, category: string): string {
  return `${actorId}::${category}`;
}

function patternKey(p: InteractionPattern): string {
  return `${p.actorId}::${p.taskClass}::${p.sequenceKey}`;
}

function patternActorTaskClassKey(actorId: string, taskClass: string): string {
  return `${actorId}::${taskClass}`;
}

function patternActorOutcomeKey(
  actorId: string,
  outcome: InteractionPattern['outcome'],
): string {
  return `${actorId}::${outcome}`;
}

function episodeActorIntentKey(actorId: string, intent: string): string {
  return `${actorId}::${intent}`;
}

function episodeActorSessionKey(actorId: string, sessionId: string): string {
  return `${actorId}::${sessionId}`;
}

function reflectionKey(r: Reflection): string {
  return `${r.actorId}::${r.title}`;
}

function compareReflections(a: Reflection, b: Reflection): number {
  return b.confidence - a.confidence || b.updatedTs - a.updatedTs;
}

function cloneEvent(event: UiMemoryEvent): UiMemoryEvent {
  return { ...event };
}

function clonePreference(pref: PreferenceMemory): PreferenceMemory {
  return { ...pref };
}

function clonePattern(pattern: InteractionPattern): InteractionPattern {
  return { ...pattern };
}

function cloneEpisode(episode: Episode): Episode {
  return { ...episode };
}

function cloneReflection(reflection: Reflection): Reflection {
  return { ...reflection };
}

function cloneCursor(cursor: MemoryCursor): MemoryCursor {
  return { ...cursor };
}

function ensureIndexBucket(
  index: Map<string, Set<string>>,
  key: string,
): Set<string> {
  let bucket = index.get(key);
  if (!bucket) {
    bucket = new Set<string>();
    index.set(key, bucket);
  }
  return bucket;
}

function cloneIndexMap(
  index: Map<string, Set<string>>,
): Map<string, Set<string>> {
  return new Map(
    [...index].map(([key, values]) => [key, new Set(values)]),
  );
}

function cloneArrayIndexMap(
  index: Map<string, string[]>,
): Map<string, string[]> {
  return new Map(
    [...index].map(([key, values]) => [key, [...values]]),
  );
}

function intersectIndexBuckets(
  a: Set<string>,
  b: Set<string>,
): Set<string> {
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  const result = new Set<string>();
  for (const key of smaller) {
    if (larger.has(key)) result.add(key);
  }
  return result;
}

function collectRecordsByKeys<T>(
  source: Map<string, T>,
  keys: Set<string>,
): T[] {
  const results: T[] = [];
  for (const key of keys) {
    const record = source.get(key);
    if (record) results.push(record);
  }
  return results;
}

// ─── In-Memory Adapter ──────────────────────────────────────────────────

export class InMemoryMemoryStore implements MemoryStore {
  private events: UiMemoryEvent[] = [];
  private eventIndex = new Map<string, number>();
  private preferences = new Map<string, PreferenceMemory>();
  private preferenceKeysByActor = new Map<string, Set<string>>();
  private preferenceKeysByActorCategory = new Map<string, Set<string>>();
  private patterns = new Map<string, InteractionPattern>();
  private patternKeysByActor = new Map<string, Set<string>>();
  private patternKeysByActorTaskClass = new Map<string, Set<string>>();
  private patternKeysByActorOutcome = new Map<string, Set<string>>();
  private episodes = new Map<string, Episode>();
  private episodeKeysByActor = new Map<string, Set<string>>();
  private episodeKeysByActorIntent = new Map<string, Set<string>>();
  private episodeKeysByActorSession = new Map<string, Set<string>>();
  private reflections = new Map<string, Reflection>();
  private reflectionKeysByActor = new Map<string, Set<string>>();
  private reflectionSortedKeysByActor = new Map<string, string[]>();
  private reflectionSortDirtyActors = new Set<string>();
  private cursors = new Map<string, MemoryCursor>();

  // ── Events ──────────────────────────────────────────────────────────

  async appendEvents(events: UiMemoryEvent[]): Promise<void> {
    for (const event of events) {
      const next = cloneEvent(event);
      this.events.push(next);
      // Preserve first occurrence semantics (matches previous findIndex behavior).
      if (!this.eventIndex.has(next.id)) {
        this.eventIndex.set(next.id, this.events.length - 1);
      }
    }
  }

  async readEvents(options?: EventReadOptions): Promise<UiMemoryEvent[]> {
    let start = 0;
    let endExclusive = this.events.length;

    if (options?.afterId) {
      const afterIdx = this.eventIndex.get(options.afterId);
      // If afterId is not found, return all events (cursor drift recovery).
      start = afterIdx === undefined ? 0 : afterIdx + 1;
    }

    if (options?.beforeId) {
      const beforeIdx = this.eventIndex.get(options.beforeId);
      if (beforeIdx !== undefined) {
        endExclusive = Math.min(endExclusive, beforeIdx + 1);
      }
    }

    if (start > endExclusive) {
      return [];
    }

    let result = this.events.slice(start, endExclusive);

    if (options?.limit !== undefined && options.limit >= 0) {
      result = result.slice(0, options.limit);
    }

    return result.map(cloneEvent);
  }

  async getLatestEventId(): Promise<string | null> {
    return this.events.length > 0
      ? this.events[this.events.length - 1].id
      : null;
  }

  // ── Preferences ─────────────────────────────────────────────────────

  async upsertPreference(pref: PreferenceMemory): Promise<void> {
    const key = prefKey(pref);
    if (!this.preferences.has(key)) {
      ensureIndexBucket(this.preferenceKeysByActor, pref.actorId).add(key);
      ensureIndexBucket(
        this.preferenceKeysByActorCategory,
        prefActorCategoryKey(pref.actorId, pref.category),
      ).add(key);
    }
    this.preferences.set(key, clonePreference(pref));
  }

  async findPreferences(
    actorId: string,
    options?: PreferenceQueryOptions,
  ): Promise<PreferenceMemory[]> {
    const keys = options?.category
      ? this.preferenceKeysByActorCategory.get(
        prefActorCategoryKey(actorId, options.category),
      )
      : this.preferenceKeysByActor.get(actorId);
    if (!keys || keys.size === 0) {
      return [];
    }

    let results = collectRecordsByKeys(this.preferences, keys);

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

    return results.map(clonePreference);
  }

  // ── Interaction Patterns ────────────────────────────────────────────

  async upsertPattern(pattern: InteractionPattern): Promise<void> {
    const key = patternKey(pattern);
    const next = clonePattern(pattern);
    const previous = this.patterns.get(key);

    if (!previous) {
      ensureIndexBucket(this.patternKeysByActor, next.actorId).add(key);
      ensureIndexBucket(
        this.patternKeysByActorTaskClass,
        patternActorTaskClassKey(next.actorId, next.taskClass),
      ).add(key);
      ensureIndexBucket(
        this.patternKeysByActorOutcome,
        patternActorOutcomeKey(next.actorId, next.outcome),
      ).add(key);
    } else if (previous.outcome !== next.outcome) {
      this.patternKeysByActorOutcome.get(
        patternActorOutcomeKey(previous.actorId, previous.outcome),
      )?.delete(key);
      ensureIndexBucket(
        this.patternKeysByActorOutcome,
        patternActorOutcomeKey(next.actorId, next.outcome),
      ).add(key);
    }

    this.patterns.set(key, next);
  }

  async findPatterns(
    actorId: string,
    options?: PatternQueryOptions,
  ): Promise<InteractionPattern[]> {
    const keys = this.getPatternIndexKeys(actorId, options);
    if (!keys || keys.size === 0) {
      return [];
    }

    let results = collectRecordsByKeys(this.patterns, keys);

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

    return results.map(clonePattern);
  }

  // ── Episodes ────────────────────────────────────────────────────────

  async upsertEpisode(episode: Episode): Promise<void> {
    const next = cloneEpisode(episode);
    const previous = this.episodes.get(next.id);

    if (!previous) {
      ensureIndexBucket(this.episodeKeysByActor, next.actorId).add(next.id);
      ensureIndexBucket(
        this.episodeKeysByActorIntent,
        episodeActorIntentKey(next.actorId, next.intent),
      ).add(next.id);
      ensureIndexBucket(
        this.episodeKeysByActorSession,
        episodeActorSessionKey(next.actorId, next.sessionId),
      ).add(next.id);
    } else {
      if (previous.actorId !== next.actorId) {
        this.episodeKeysByActor.get(previous.actorId)?.delete(next.id);
        ensureIndexBucket(this.episodeKeysByActor, next.actorId).add(next.id);
      }
      if (previous.actorId !== next.actorId || previous.intent !== next.intent) {
        this.episodeKeysByActorIntent.get(
          episodeActorIntentKey(previous.actorId, previous.intent),
        )?.delete(next.id);
        ensureIndexBucket(
          this.episodeKeysByActorIntent,
          episodeActorIntentKey(next.actorId, next.intent),
        ).add(next.id);
      }
      if (previous.actorId !== next.actorId || previous.sessionId !== next.sessionId) {
        this.episodeKeysByActorSession.get(
          episodeActorSessionKey(previous.actorId, previous.sessionId),
        )?.delete(next.id);
        ensureIndexBucket(
          this.episodeKeysByActorSession,
          episodeActorSessionKey(next.actorId, next.sessionId),
        ).add(next.id);
      }
    }

    this.episodes.set(next.id, next);
  }

  async findEpisodes(
    actorId: string,
    options?: EpisodeQueryOptions,
  ): Promise<Episode[]> {
    const keys = this.getEpisodeIndexKeys(actorId, options);
    if (!keys || keys.size === 0) {
      return [];
    }
    let results = collectRecordsByKeys(this.episodes, keys);

    results.sort((a, b) => b.createdTs - a.createdTs);

    if (options?.limit !== undefined && options.limit >= 0) {
      results = results.slice(0, options.limit);
    }

    return results.map(cloneEpisode);
  }

  // ── Reflections ─────────────────────────────────────────────────────

  async upsertReflection(reflection: Reflection): Promise<void> {
    const key = reflectionKey(reflection);
    if (!this.reflections.has(key)) {
      ensureIndexBucket(this.reflectionKeysByActor, reflection.actorId).add(key);
    }
    this.reflections.set(key, cloneReflection(reflection));
    this.reflectionSortDirtyActors.add(reflection.actorId);
  }

  async findReflections(
    actorId: string,
    options?: ReflectionQueryOptions,
  ): Promise<Reflection[]> {
    const sortedKeys = this.getSortedReflectionKeys(actorId);
    if (sortedKeys.length === 0) {
      return [];
    }
    const keys = options?.limit !== undefined && options.limit >= 0
      ? sortedKeys.slice(0, options.limit)
      : sortedKeys;
    const results: Reflection[] = [];
    for (const key of keys) {
      const record = this.reflections.get(key);
      if (record) {
        results.push(cloneReflection(record));
      }
    }
    return results;
  }

  // ── Cursor ──────────────────────────────────────────────────────────

  async getCursor(namespace: string): Promise<MemoryCursor | null> {
    const cursor = this.cursors.get(namespace);
    return cursor ? cloneCursor(cursor) : null;
  }

  async setCursor(cursor: MemoryCursor): Promise<void> {
    this.cursors.set(cursor.namespace, cloneCursor(cursor));
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
      events: this.events.map(cloneEvent),
      preferences: [...this.preferences.values()].map(clonePreference),
      patterns: [...this.patterns.values()].map(clonePattern),
      episodes: [...this.episodes.values()].map(cloneEpisode),
      reflections: [...this.reflections.values()].map(cloneReflection),
      cursors: [...this.cursors.values()].map(cloneCursor),
    };
  }

  // ── Snapshot / Restore (for transaction rollback) ──────────────────

  private takeSnapshot(): InMemorySnapshot {
    return {
      events: this.events.map(cloneEvent),
      eventIndex: new Map(this.eventIndex),
      preferences: new Map(
        [...this.preferences].map(([k, v]) => [k, clonePreference(v)]),
      ),
      preferenceKeysByActor: new Map(
        cloneIndexMap(this.preferenceKeysByActor),
      ),
      preferenceKeysByActorCategory: new Map(
        cloneIndexMap(this.preferenceKeysByActorCategory),
      ),
      patterns: new Map(
        [...this.patterns].map(([k, v]) => [k, clonePattern(v)]),
      ),
      patternKeysByActor: new Map(
        cloneIndexMap(this.patternKeysByActor),
      ),
      patternKeysByActorTaskClass: new Map(
        cloneIndexMap(this.patternKeysByActorTaskClass),
      ),
      patternKeysByActorOutcome: new Map(
        cloneIndexMap(this.patternKeysByActorOutcome),
      ),
      episodes: new Map(
        [...this.episodes].map(([k, v]) => [k, cloneEpisode(v)]),
      ),
      episodeKeysByActor: new Map(
        cloneIndexMap(this.episodeKeysByActor),
      ),
      episodeKeysByActorIntent: new Map(
        cloneIndexMap(this.episodeKeysByActorIntent),
      ),
      episodeKeysByActorSession: new Map(
        cloneIndexMap(this.episodeKeysByActorSession),
      ),
      reflections: new Map(
        [...this.reflections].map(([k, v]) => [k, cloneReflection(v)]),
      ),
      reflectionKeysByActor: new Map(
        cloneIndexMap(this.reflectionKeysByActor),
      ),
      reflectionSortedKeysByActor: new Map(
        cloneArrayIndexMap(this.reflectionSortedKeysByActor),
      ),
      reflectionSortDirtyActors: new Set(this.reflectionSortDirtyActors),
      cursors: new Map(
        [...this.cursors].map(([k, v]) => [k, cloneCursor(v)]),
      ),
    };
  }

  private restoreSnapshot(snapshot: InMemorySnapshot): void {
    this.events = snapshot.events;
    this.eventIndex = snapshot.eventIndex;
    this.preferences = snapshot.preferences;
    this.preferenceKeysByActor = snapshot.preferenceKeysByActor;
    this.preferenceKeysByActorCategory = snapshot.preferenceKeysByActorCategory;
    this.patterns = snapshot.patterns;
    this.patternKeysByActor = snapshot.patternKeysByActor;
    this.patternKeysByActorTaskClass = snapshot.patternKeysByActorTaskClass;
    this.patternKeysByActorOutcome = snapshot.patternKeysByActorOutcome;
    this.episodes = snapshot.episodes;
    this.episodeKeysByActor = snapshot.episodeKeysByActor;
    this.episodeKeysByActorIntent = snapshot.episodeKeysByActorIntent;
    this.episodeKeysByActorSession = snapshot.episodeKeysByActorSession;
    this.reflections = snapshot.reflections;
    this.reflectionKeysByActor = snapshot.reflectionKeysByActor;
    this.reflectionSortedKeysByActor = snapshot.reflectionSortedKeysByActor;
    this.reflectionSortDirtyActors = snapshot.reflectionSortDirtyActors;
    this.cursors = snapshot.cursors;
  }

  private getPatternIndexKeys(
    actorId: string,
    options?: PatternQueryOptions,
  ): Set<string> | undefined {
    if (options?.taskClass && options?.outcome) {
      const byTaskClass = this.patternKeysByActorTaskClass.get(
        patternActorTaskClassKey(actorId, options.taskClass),
      );
      const byOutcome = this.patternKeysByActorOutcome.get(
        patternActorOutcomeKey(actorId, options.outcome),
      );
      if (!byTaskClass || !byOutcome) return undefined;
      return intersectIndexBuckets(byTaskClass, byOutcome);
    }

    if (options?.taskClass) {
      return this.patternKeysByActorTaskClass.get(
        patternActorTaskClassKey(actorId, options.taskClass),
      );
    }

    if (options?.outcome) {
      return this.patternKeysByActorOutcome.get(
        patternActorOutcomeKey(actorId, options.outcome),
      );
    }

    return this.patternKeysByActor.get(actorId);
  }

  private getEpisodeIndexKeys(
    actorId: string,
    options?: EpisodeQueryOptions,
  ): Set<string> | undefined {
    if (options?.intent && options?.sessionId) {
      const byIntent = this.episodeKeysByActorIntent.get(
        episodeActorIntentKey(actorId, options.intent),
      );
      const bySession = this.episodeKeysByActorSession.get(
        episodeActorSessionKey(actorId, options.sessionId),
      );
      if (!byIntent || !bySession) return undefined;
      return intersectIndexBuckets(byIntent, bySession);
    }

    if (options?.intent) {
      return this.episodeKeysByActorIntent.get(
        episodeActorIntentKey(actorId, options.intent),
      );
    }

    if (options?.sessionId) {
      return this.episodeKeysByActorSession.get(
        episodeActorSessionKey(actorId, options.sessionId),
      );
    }

    return this.episodeKeysByActor.get(actorId);
  }

  private getSortedReflectionKeys(actorId: string): string[] {
    const keys = this.reflectionKeysByActor.get(actorId);
    if (!keys || keys.size === 0) {
      return [];
    }

    const isDirty = this.reflectionSortDirtyActors.has(actorId);
    const cached = this.reflectionSortedKeysByActor.get(actorId);
    if (cached && !isDirty) {
      return cached;
    }

    const sorted = [...keys].sort((left, right) => {
      const leftReflection = this.reflections.get(left);
      const rightReflection = this.reflections.get(right);
      if (!leftReflection && !rightReflection) return 0;
      if (!leftReflection) return 1;
      if (!rightReflection) return -1;
      return compareReflections(leftReflection, rightReflection);
    });

    this.reflectionSortedKeysByActor.set(actorId, sorted);
    this.reflectionSortDirtyActors.delete(actorId);
    return sorted;
  }
}

interface InMemorySnapshot {
  events: UiMemoryEvent[];
  eventIndex: Map<string, number>;
  preferences: Map<string, PreferenceMemory>;
  preferenceKeysByActor: Map<string, Set<string>>;
  preferenceKeysByActorCategory: Map<string, Set<string>>;
  patterns: Map<string, InteractionPattern>;
  patternKeysByActor: Map<string, Set<string>>;
  patternKeysByActorTaskClass: Map<string, Set<string>>;
  patternKeysByActorOutcome: Map<string, Set<string>>;
  episodes: Map<string, Episode>;
  episodeKeysByActor: Map<string, Set<string>>;
  episodeKeysByActorIntent: Map<string, Set<string>>;
  episodeKeysByActorSession: Map<string, Set<string>>;
  reflections: Map<string, Reflection>;
  reflectionKeysByActor: Map<string, Set<string>>;
  reflectionSortedKeysByActor: Map<string, string[]>;
  reflectionSortDirtyActors: Set<string>;
  cursors: Map<string, MemoryCursor>;
}
