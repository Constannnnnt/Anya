import { describe, it, expect } from 'vitest';
import { RetrievalComposer } from '../src/memory/ui/retrieval';
import { InMemoryMemoryStore } from '../src/memory/ui/inMemoryAdapter';
import type { PreferenceMemory, InteractionPattern, Reflection } from '../src/memory/ui/schemas';

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
    firstSeenTs: 1000,
    lastSeenTs: 1000,
    status: 'active',
    ...overrides,
  };
}

function makePattern(overrides: Partial<InteractionPattern> = {}): InteractionPattern {
  return {
    id: `pat-${Math.random().toString(36).slice(2, 8)}`,
    actorId: 'actor-1',
    taskClass: 'dashboard',
    sequenceKey: 'expand->filter->submit',
    sequenceJson: '["expand","filter","submit"]',
    outcome: 'success',
    confidence: 0.9,
    support: 3,
    lastSeenTs: 1000,
    ...overrides,
  };
}

function makeReflection(overrides: Partial<Reflection> = {}): Reflection {
  return {
    id: `ref-${Math.random().toString(36).slice(2, 8)}`,
    actorId: 'actor-1',
    title: 'Dashboard patterns',
    useCases: 'When building dashboards',
    hints: 'Group metrics first',
    confidence: 0.85,
    updatedTs: 1000,
    ...overrides,
  };
}

describe('RetrievalComposer', () => {
  describe('retrievePlanningContext', () => {
    it('retrieves preferences, patterns, and reflections', async () => {
      const store = new InMemoryMemoryStore();
      await store.upsertPreference(makePref());
      await store.upsertPattern(makePattern());
      await store.upsertReflection(makeReflection());

      const composer = new RetrievalComposer();
      const ctx = await composer.retrievePlanningContext(store, 'actor-1');

      expect(ctx.preferences).toHaveLength(1);
      expect(ctx.patterns).toHaveLength(1);
      expect(ctx.reflections).toHaveLength(1);
    });

    it('returns empty context when no data exists', async () => {
      const store = new InMemoryMemoryStore();
      const composer = new RetrievalComposer();
      const ctx = await composer.retrievePlanningContext(store, 'actor-1');

      expect(ctx.preferences).toHaveLength(0);
      expect(ctx.patterns).toHaveLength(0);
      expect(ctx.reflections).toHaveLength(0);
    });

    it('respects maxPreferences limit', async () => {
      const store = new InMemoryMemoryStore();
      for (let i = 0; i < 10; i++) {
        await store.upsertPreference(makePref({
          key: `key-${i}`,
          confidence: 0.5 + i * 0.05,
        }));
      }

      const composer = new RetrievalComposer({ maxPreferences: 3 });
      const ctx = await composer.retrievePlanningContext(store, 'actor-1');

      expect(ctx.preferences).toHaveLength(3);
    });

    it('filters patterns by taskClass', async () => {
      const store = new InMemoryMemoryStore();
      await store.upsertPattern(makePattern({ sequenceKey: 'a', taskClass: 'dashboard' }));
      await store.upsertPattern(makePattern({ sequenceKey: 'b', taskClass: 'form' }));

      const composer = new RetrievalComposer();
      const ctx = await composer.retrievePlanningContext(store, 'actor-1', {
        taskClass: 'dashboard',
      });

      expect(ctx.patterns).toHaveLength(1);
      expect(ctx.patterns[0].taskClass).toBe('dashboard');
    });

    it('only returns active preferences', async () => {
      const store = new InMemoryMemoryStore();
      await store.upsertPreference(makePref({ key: 'active', status: 'active' }));
      await store.upsertPreference(makePref({ key: 'candidate', status: 'candidate' }));
      await store.upsertPreference(makePref({ key: 'stale', status: 'stale' }));

      const composer = new RetrievalComposer();
      const ctx = await composer.retrievePlanningContext(store, 'actor-1');

      expect(ctx.preferences).toHaveLength(1);
      expect(ctx.preferences[0].key).toBe('active');
    });

    it('only returns successful patterns', async () => {
      const store = new InMemoryMemoryStore();
      await store.upsertPattern(makePattern({ sequenceKey: 'ok', outcome: 'success' }));
      await store.upsertPattern(makePattern({ sequenceKey: 'bad', outcome: 'failure' }));

      const composer = new RetrievalComposer();
      const ctx = await composer.retrievePlanningContext(store, 'actor-1');

      expect(ctx.patterns).toHaveLength(1);
      expect(ctx.patterns[0].outcome).toBe('success');
    });
  });

  describe('ranking', () => {
    it('ranks by confidence + recency + support', async () => {
      const store = new InMemoryMemoryStore();
      const now = Date.now();

      await store.upsertPreference(makePref({
        key: 'high-conf',
        confidence: 0.95,
        support: 1,
        lastSeenTs: now - 10000,
      }));
      await store.upsertPreference(makePref({
        key: 'high-recent',
        confidence: 0.5,
        support: 1,
        lastSeenTs: now,
      }));
      await store.upsertPreference(makePref({
        key: 'high-support',
        confidence: 0.5,
        support: 10,
        lastSeenTs: now - 10000,
      }));

      const composer = new RetrievalComposer();
      const ctx = await composer.retrievePlanningContext(store, 'actor-1');

      // All ranked items should have a rank property
      expect(ctx.preferences.length).toBe(3);
      for (const p of ctx.preferences) {
        expect(p.rank).toBeGreaterThan(0);
      }
    });
  });

  describe('formatForPrompt', () => {
    it('formats a complete context into markdown', async () => {
      const composer = new RetrievalComposer();
      const formatted = composer.formatForPrompt({
        preferences: [
          { ...makePref(), rank: 0.9 },
        ],
        patterns: [
          { ...makePattern(), rank: 0.85 },
        ],
        reflections: [makeReflection()],
      });

      expect(formatted).toContain('## UI Memory Priors');
      expect(formatted).toContain('### Preferences');
      expect(formatted).toContain('### Interaction Patterns');
      expect(formatted).toContain('### Reflections');
      expect(formatted).toContain('explicit user instructions always take precedence');
    });

    it('returns empty string when no data', () => {
      const composer = new RetrievalComposer();
      const formatted = composer.formatForPrompt({
        preferences: [],
        patterns: [],
        reflections: [],
      });

      expect(formatted).toBe('');
    });
  });
});
