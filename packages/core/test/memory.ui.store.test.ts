import { describe, it, expect } from 'vitest';
import { InMemoryMemoryStore } from '../src/memory/ui/inMemoryAdapter';
import {
  UiMemoryEventSchema,
  PreferenceMemorySchema,
  InteractionPatternSchema,
  EpisodeSchema,
  ReflectionSchema,
  MemoryCursorSchema,
} from '../src/memory/ui/schemas';
import type {
  UiMemoryEvent,
  PreferenceMemory,
  InteractionPattern,
  Episode,
  Reflection,
  MemoryCursor,
} from '../src/memory/ui/schemas';

// ─── Fixtures ────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<UiMemoryEvent> = {}): UiMemoryEvent {
  return {
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: Date.now(),
    actorId: 'actor-1',
    sessionId: 'session-1',
    type: 'interaction.recorded',
    source: 'user',
    payloadJson: '{}',
    ...overrides,
  };
}

function makePref(overrides: Partial<PreferenceMemory> = {}): PreferenceMemory {
  return {
    id: `pref-${Math.random().toString(36).slice(2, 8)}`,
    actorId: 'actor-1',
    category: 'layout',
    key: 'density',
    value: 'compact',
    statement: 'User prefers compact layout',
    signalType: 'explicit',
    confidence: 0.8,
    support: 1,
    firstSeenTs: Date.now(),
    lastSeenTs: Date.now(),
    status: 'active',
    ...overrides,
  };
}

function makePattern(
  overrides: Partial<InteractionPattern> = {},
): InteractionPattern {
  return {
    id: `pat-${Math.random().toString(36).slice(2, 8)}`,
    actorId: 'actor-1',
    taskClass: 'dashboard',
    sequenceKey: 'expand->filter->submit',
    sequenceJson: '["expand","filter","submit"]',
    outcome: 'success',
    confidence: 0.9,
    support: 3,
    lastSeenTs: Date.now(),
    ...overrides,
  };
}

function makeEpisode(overrides: Partial<Episode> = {}): Episode {
  return {
    id: `ep-${Math.random().toString(36).slice(2, 8)}`,
    actorId: 'actor-1',
    sessionId: 'session-1',
    caseId: 'case-1',
    intent: 'Create dashboard',
    assessment: 'Yes',
    summary: 'Built a dashboard successfully',
    justification: 'All cards rendered correctly',
    createdTs: Date.now(),
    ...overrides,
  };
}

function makeReflection(overrides: Partial<Reflection> = {}): Reflection {
  return {
    id: `ref-${Math.random().toString(36).slice(2, 8)}`,
    actorId: 'actor-1',
    title: 'Dashboard patterns',
    useCases: 'When building data dashboards',
    hints: 'Group metrics cards first, then charts',
    confidence: 0.85,
    updatedTs: Date.now(),
    ...overrides,
  };
}

// ─── Schema Validation ──────────────────────────────────────────────────

describe('UI Memory Schemas', () => {
  it('validates a well-formed UiMemoryEvent', () => {
    const event = makeEvent();
    expect(UiMemoryEventSchema.parse(event)).toEqual(event);
  });

  it('rejects UiMemoryEvent with invalid source', () => {
    const event = makeEvent({ source: 'invalid' as any });
    expect(() => UiMemoryEventSchema.parse(event)).toThrow();
  });

  it('validates a well-formed PreferenceMemory', () => {
    const pref = makePref();
    expect(PreferenceMemorySchema.parse(pref)).toEqual(pref);
  });

  it('rejects PreferenceMemory with confidence > 1', () => {
    const pref = makePref({ confidence: 1.5 });
    expect(() => PreferenceMemorySchema.parse(pref)).toThrow();
  });

  it('validates a well-formed InteractionPattern', () => {
    const pat = makePattern();
    expect(InteractionPatternSchema.parse(pat)).toEqual(pat);
  });

  it('validates a well-formed Episode', () => {
    const ep = makeEpisode();
    expect(EpisodeSchema.parse(ep)).toEqual(ep);
  });

  it('validates a well-formed Reflection', () => {
    const ref = makeReflection();
    expect(ReflectionSchema.parse(ref)).toEqual(ref);
  });

  it('validates a well-formed MemoryCursor', () => {
    const cursor: MemoryCursor = {
      namespace: 'ui_memory',
      lastProcessedEventId: 'evt-1',
      lastProcessedTs: Date.now(),
      updatedTs: Date.now(),
    };
    expect(MemoryCursorSchema.parse(cursor)).toEqual(cursor);
  });

  it('rejects MemoryCursor with wrong namespace', () => {
    expect(() =>
      MemoryCursorSchema.parse({ namespace: 'other', lastProcessedEventId: 'x', lastProcessedTs: 0, updatedTs: 0 }),
    ).toThrow();
  });
});

// ─── InMemoryMemoryStore Contract ────────────────────────────────────────

describe('InMemoryMemoryStore', () => {
  // ── Events ──────────────────────────────────────────────────────────

  describe('events', () => {
    it('appends and reads events in order', async () => {
      const store = new InMemoryMemoryStore();
      const e1 = makeEvent({ id: 'e1', ts: 1 });
      const e2 = makeEvent({ id: 'e2', ts: 2 });
      const e3 = makeEvent({ id: 'e3', ts: 3 });

      await store.appendEvents([e1, e2, e3]);
      const all = await store.readEvents();
      expect(all).toHaveLength(3);
      expect(all.map((e) => e.id)).toEqual(['e1', 'e2', 'e3']);
    });

    it('reads events after a cursor id (exclusive)', async () => {
      const store = new InMemoryMemoryStore();
      await store.appendEvents([
        makeEvent({ id: 'e1', ts: 1 }),
        makeEvent({ id: 'e2', ts: 2 }),
        makeEvent({ id: 'e3', ts: 3 }),
      ]);

      const result = await store.readEvents({ afterId: 'e1' });
      expect(result.map((e) => e.id)).toEqual(['e2', 'e3']);
    });

    it('reads events before a cursor id (inclusive)', async () => {
      const store = new InMemoryMemoryStore();
      await store.appendEvents([
        makeEvent({ id: 'e1', ts: 1 }),
        makeEvent({ id: 'e2', ts: 2 }),
        makeEvent({ id: 'e3', ts: 3 }),
      ]);

      const result = await store.readEvents({ beforeId: 'e2' });
      expect(result.map((e) => e.id)).toEqual(['e1', 'e2']);
    });

    it('reads events within a range with limit', async () => {
      const store = new InMemoryMemoryStore();
      await store.appendEvents([
        makeEvent({ id: 'e1', ts: 1 }),
        makeEvent({ id: 'e2', ts: 2 }),
        makeEvent({ id: 'e3', ts: 3 }),
        makeEvent({ id: 'e4', ts: 4 }),
      ]);

      const result = await store.readEvents({ afterId: 'e1', limit: 2 });
      expect(result.map((e) => e.id)).toEqual(['e2', 'e3']);
    });

    it('returns latest event id', async () => {
      const store = new InMemoryMemoryStore();
      expect(await store.getLatestEventId()).toBeNull();

      await store.appendEvents([makeEvent({ id: 'e1' })]);
      expect(await store.getLatestEventId()).toBe('e1');

      await store.appendEvents([makeEvent({ id: 'e2' })]);
      expect(await store.getLatestEventId()).toBe('e2');
    });
  });

  // ── Preferences ─────────────────────────────────────────────────────

  describe('preferences', () => {
    it('upserts and retrieves preferences', async () => {
      const store = new InMemoryMemoryStore();
      const pref = makePref();
      await store.upsertPreference(pref);

      const results = await store.findPreferences('actor-1');
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(pref);
    });

    it('dedupes by (actorId, category, key)  value is not part of identity', async () => {
      const store = new InMemoryMemoryStore();
      const pref1 = makePref({ confidence: 0.5 });
      const pref2 = makePref({ confidence: 0.9 });

      await store.upsertPreference(pref1);
      await store.upsertPreference(pref2);

      const results = await store.findPreferences('actor-1');
      expect(results).toHaveLength(1);
      expect(results[0].confidence).toBe(0.9);
    });

    it('filters by category and status', async () => {
      const store = new InMemoryMemoryStore();
      await store.upsertPreference(makePref({ key: 'k1', category: 'layout', status: 'active' }));
      await store.upsertPreference(makePref({ key: 'k2', category: 'theme', status: 'active' }));
      await store.upsertPreference(makePref({ key: 'k3', category: 'layout', status: 'stale' }));

      const layoutActive = await store.findPreferences('actor-1', { category: 'layout', status: 'active' });
      expect(layoutActive).toHaveLength(1);
      expect(layoutActive[0].key).toBe('k1');
    });

    it('sorts by confidence descending', async () => {
      const store = new InMemoryMemoryStore();
      await store.upsertPreference(makePref({ key: 'low', confidence: 0.3 }));
      await store.upsertPreference(makePref({ key: 'high', confidence: 0.95 }));
      await store.upsertPreference(makePref({ key: 'mid', confidence: 0.6 }));

      const results = await store.findPreferences('actor-1');
      expect(results.map((p) => p.key)).toEqual(['high', 'mid', 'low']);
    });

    it('respects limit', async () => {
      const store = new InMemoryMemoryStore();
      await store.upsertPreference(makePref({ key: 'a' }));
      await store.upsertPreference(makePref({ key: 'b' }));
      await store.upsertPreference(makePref({ key: 'c' }));

      const results = await store.findPreferences('actor-1', { limit: 2 });
      expect(results).toHaveLength(2);
    });
  });

  // ── Interaction Patterns ────────────────────────────────────────────

  describe('patterns', () => {
    it('upserts and retrieves patterns', async () => {
      const store = new InMemoryMemoryStore();
      const pat = makePattern();
      await store.upsertPattern(pat);

      const results = await store.findPatterns('actor-1');
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(pat);
    });

    it('dedupes by (actorId, taskClass, sequenceKey)', async () => {
      const store = new InMemoryMemoryStore();
      await store.upsertPattern(makePattern({ support: 1 }));
      await store.upsertPattern(makePattern({ support: 5 }));

      const results = await store.findPatterns('actor-1');
      expect(results).toHaveLength(1);
      expect(results[0].support).toBe(5);
    });

    it('filters by taskClass and outcome', async () => {
      const store = new InMemoryMemoryStore();
      await store.upsertPattern(makePattern({ sequenceKey: 'a', taskClass: 'dashboard', outcome: 'success' }));
      await store.upsertPattern(makePattern({ sequenceKey: 'b', taskClass: 'form', outcome: 'failure' }));

      const dashSuccess = await store.findPatterns('actor-1', { taskClass: 'dashboard', outcome: 'success' });
      expect(dashSuccess).toHaveLength(1);
      expect(dashSuccess[0].sequenceKey).toBe('a');
    });
  });

  // ── Episodes ────────────────────────────────────────────────────────

  describe('episodes', () => {
    it('upserts and retrieves episodes', async () => {
      const store = new InMemoryMemoryStore();
      const ep = makeEpisode();
      await store.upsertEpisode(ep);

      const results = await store.findEpisodes('actor-1');
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(ep);
    });

    it('filters by intent', async () => {
      const store = new InMemoryMemoryStore();
      await store.upsertEpisode(makeEpisode({ id: 'ep1', intent: 'Create dashboard' }));
      await store.upsertEpisode(makeEpisode({ id: 'ep2', intent: 'Edit profile' }));

      const results = await store.findEpisodes('actor-1', { intent: 'Edit profile' });
      expect(results).toHaveLength(1);
      expect(results[0].intent).toBe('Edit profile');
    });

    it('sorts by createdTs descending', async () => {
      const store = new InMemoryMemoryStore();
      await store.upsertEpisode(makeEpisode({ id: 'ep1', createdTs: 100 }));
      await store.upsertEpisode(makeEpisode({ id: 'ep2', createdTs: 300 }));
      await store.upsertEpisode(makeEpisode({ id: 'ep3', createdTs: 200 }));

      const results = await store.findEpisodes('actor-1');
      expect(results.map((e) => e.id)).toEqual(['ep2', 'ep3', 'ep1']);
    });
  });

  // ── Reflections ─────────────────────────────────────────────────────

  describe('reflections', () => {
    it('upserts and retrieves reflections', async () => {
      const store = new InMemoryMemoryStore();
      const ref = makeReflection();
      await store.upsertReflection(ref);

      const results = await store.findReflections('actor-1');
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(ref);
    });

    it('dedupes by (actorId, title)', async () => {
      const store = new InMemoryMemoryStore();
      await store.upsertReflection(makeReflection({ hints: 'old hint' }));
      await store.upsertReflection(makeReflection({ hints: 'updated hint' }));

      const results = await store.findReflections('actor-1');
      expect(results).toHaveLength(1);
      expect(results[0].hints).toBe('updated hint');
    });
  });

  // ── Cursor ──────────────────────────────────────────────────────────

  describe('cursor', () => {
    it('returns null for unknown namespace', async () => {
      const store = new InMemoryMemoryStore();
      expect(await store.getCursor('ui_memory')).toBeNull();
    });

    it('sets and reads cursor', async () => {
      const store = new InMemoryMemoryStore();
      const cursor: MemoryCursor = {
        namespace: 'ui_memory',
        lastProcessedEventId: 'evt-42',
        lastProcessedTs: 1000,
        updatedTs: 1001,
      };

      await store.setCursor(cursor);
      expect(await store.getCursor('ui_memory')).toEqual(cursor);
    });
  });

  // ── Transaction ─────────────────────────────────────────────────────

  describe('transaction', () => {
    it('executes multiple operations atomically', async () => {
      const store = new InMemoryMemoryStore();
      const pref = makePref();
      const cursor: MemoryCursor = {
        namespace: 'ui_memory',
        lastProcessedEventId: 'evt-1',
        lastProcessedTs: 100,
        updatedTs: 100,
      };

      await store.transaction(async (tx) => {
        await tx.upsertPreference(pref);
        await tx.setCursor(cursor);
      });

      const prefs = await store.findPreferences('actor-1');
      expect(prefs).toHaveLength(1);
      expect(await store.getCursor('ui_memory')).toEqual(cursor);
    });
  });

  // ── Export ──────────────────────────────────────────────────────────

  describe('exportJson', () => {
    it('returns a complete snapshot', async () => {
      const store = new InMemoryMemoryStore();
      await store.appendEvents([makeEvent({ id: 'e1' })]);
      await store.upsertPreference(makePref());
      await store.upsertPattern(makePattern());
      await store.upsertEpisode(makeEpisode());
      await store.upsertReflection(makeReflection());
      await store.setCursor({
        namespace: 'ui_memory',
        lastProcessedEventId: 'e1',
        lastProcessedTs: 0,
        updatedTs: 0,
      });

      const snapshot = await store.exportJson();
      expect(snapshot.events).toHaveLength(1);
      expect(snapshot.preferences).toHaveLength(1);
      expect(snapshot.patterns).toHaveLength(1);
      expect(snapshot.episodes).toHaveLength(1);
      expect(snapshot.reflections).toHaveLength(1);
      expect(snapshot.cursors).toHaveLength(1);
    });
  });
});
