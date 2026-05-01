import { describe, it, expect } from 'vitest';
import { RetrievalComposer } from '../memory/ui/retrieval';
import { InMemoryMemoryStore } from '../memory/ui/inMemoryAdapter';
import { InMemoryBehaviorStore, type BehaviorFinding } from '../memory/ui/behavior';
import { DEFAULT_FINDING_INTERPRETER_POLICY } from '../memory/ui/behavior/policy';
import type { PreferenceMemory, InteractionPattern, Reflection } from '../memory/ui/schemas';

function makePref(overrides: Partial<PreferenceMemory> = { }): PreferenceMemory {
  return {
    id: `pref-${Math.random().toString(36).slice(2, 8) }`,
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
    ...overrides, }; }

function makePattern(overrides: Partial<InteractionPattern> = { }): InteractionPattern {
  return {
    id: `pat-${Math.random().toString(36).slice(2, 8) }`,
    actorId: 'actor-1',
    taskClass: 'dashboard',
    sequenceKey: 'expand->filter->submit',
    sequenceJson: '["expand","filter","submit"]',
    outcome: 'success',
    confidence: 0.9,
    support: 3,
    lastSeenTs: 1000,
    ...overrides, }; }

function makeReflection(overrides: Partial<Reflection> = { }): Reflection {
  return {
    id: `ref-${Math.random().toString(36).slice(2, 8) }`,
    actorId: 'actor-1',
    title: 'Dashboard patterns',
    useCases: 'When building dashboards',
    hints: 'Group metrics first',
    confidence: 0.85,
    updatedTs: 1000,
    ...overrides, }; }

function makeBehaviorFinding(overrides: Partial<BehaviorFinding> = { }): BehaviorFinding {
  return {
    id: `bf-${Math.random().toString(36).slice(2, 8) }`,
    actorId: 'actor-1',
    analyzerId: 'rework_friction',
    kind: 'reflection_candidate',
    conceptKey: 'rework-friction:edit_compose',
    scopeKey: 'context:edit_compose',
    confidence: 0.91,
    support: 4,
    severity: 'high',
    evidenceRefs: ['sig-1', 'sig-2'],
    payload: {
      contextArchetype: 'edit_compose',
      avgRetryRate: 0.28,
      avgFailureRate: 0.14, },
    createdTs: 1000,
    ...overrides, }; }

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
      expect(ctx.behaviorAdaptations).toHaveLength(0); });

    it('returns empty context when no data exists', async () => {
      const store = new InMemoryMemoryStore();
      const composer = new RetrievalComposer();
      const ctx = await composer.retrievePlanningContext(store, 'actor-1');

      expect(ctx.preferences).toHaveLength(0);
      expect(ctx.patterns).toHaveLength(0);
      expect(ctx.reflections).toHaveLength(0);
      expect(ctx.behaviorAdaptations).toHaveLength(0); });

    it('respects maxPreferences limit', async () => {
      const store = new InMemoryMemoryStore();
      for (let i = 0; i < 10; i++) {
        await store.upsertPreference(makePref({
          key: `key-${i }`,
          confidence: 0.5 + i * 0.05, })); }

      const composer = new RetrievalComposer({ maxPreferences: 3 });
      const ctx = await composer.retrievePlanningContext(store, 'actor-1');

      expect(ctx.preferences).toHaveLength(3); });

    it('filters patterns by taskClass', async () => {
      const store = new InMemoryMemoryStore();
      await store.upsertPattern(makePattern({ sequenceKey: 'a', taskClass: 'dashboard' }));
      await store.upsertPattern(makePattern({ sequenceKey: 'b', taskClass: 'form' }));

      const composer = new RetrievalComposer();
      const ctx = await composer.retrievePlanningContext(store, 'actor-1', {
        taskClass: 'dashboard', });

      expect(ctx.patterns).toHaveLength(1);
      expect(ctx.patterns[0].taskClass).toBe('dashboard'); });

    it('only returns active preferences', async () => {
      const store = new InMemoryMemoryStore();
      await store.upsertPreference(makePref({ key: 'active', status: 'active' }));
      await store.upsertPreference(makePref({ key: 'candidate', status: 'candidate' }));
      await store.upsertPreference(makePref({ key: 'stale', status: 'stale' }));

      const composer = new RetrievalComposer();
      const ctx = await composer.retrievePlanningContext(store, 'actor-1');

      expect(ctx.preferences).toHaveLength(1);
      expect(ctx.preferences[0].key).toBe('active'); });

    it('only returns successful patterns', async () => {
      const store = new InMemoryMemoryStore();
      await store.upsertPattern(makePattern({ sequenceKey: 'ok', outcome: 'success' }));
      await store.upsertPattern(makePattern({ sequenceKey: 'bad', outcome: 'failure' }));

      const composer = new RetrievalComposer();
      const ctx = await composer.retrievePlanningContext(store, 'actor-1');

      expect(ctx.patterns).toHaveLength(1);
      expect(ctx.patterns[0].outcome).toBe('success'); });

    it('retrieves local adaptations from retained measured interaction findings', async () => {
      const store = new InMemoryMemoryStore();
      const behaviorStore = new InMemoryBehaviorStore();
      await behaviorStore.upsertFindings([
        makeBehaviorFinding(),
        makeBehaviorFinding({
          id: 'bf-other',
          conceptKey: 'choice-overload:search_filter',
          scopeKey: 'context:search_filter',
          analyzerId: 'hick_hyman',
          payload: {
            contextArchetype: 'search_filter',
            avgChoiceSetSize: 8,
            avgChoiceBits: 3.17, }, }),
      ]);

      const composer = new RetrievalComposer();
      const ctx = await composer.retrievePlanningContext(
        store,
        'actor-1',
        { taskClass: 'edit_compose' },
        {
          store: behaviorStore,
          policy: {
            ...DEFAULT_FINDING_INTERPRETER_POLICY,
            localAdaptationConfidenceMin: 0.8,
            localAdaptationSeverityMin: 'high',
            allowedKindsByAnalyzer: {
              ...DEFAULT_FINDING_INTERPRETER_POLICY.allowedKindsByAnalyzer, }, }, },
      );

      expect(ctx.behaviorAdaptations).toHaveLength(2);
      expect(ctx.behaviorAdaptations[0]).toEqual(expect.objectContaining({
        analyzerId: 'rework_friction', })); }); });

  describe('ranking', () => {
    it('ranks by confidence + recency + support', async () => {
      const store = new InMemoryMemoryStore();
      const now = Date.now();

      await store.upsertPreference(makePref({
        key: 'high-conf',
        confidence: 0.95,
        support: 1,
        lastSeenTs: now - 10000, }));
      await store.upsertPreference(makePref({
        key: 'high-recent',
        confidence: 0.5,
        support: 1,
        lastSeenTs: now, }));
      await store.upsertPreference(makePref({
        key: 'high-support',
        confidence: 0.5,
        support: 10,
        lastSeenTs: now - 10000, }));

      const composer = new RetrievalComposer();
      const ctx = await composer.retrievePlanningContext(store, 'actor-1');

      // All ranked items should have a rank property
      expect(ctx.preferences.length).toBe(3);
      for (const p of ctx.preferences) {
        expect(p.rank).toBeGreaterThan(0); } }); });

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
        behaviorAdaptations: [], });

      expect(formatted).toContain('## UI Memory Priors');
      expect(formatted).toContain('### Preferences');
      expect(formatted).toContain('### Interaction Patterns');
      expect(formatted).toContain('### Reflections');
      expect(formatted).toContain('explicit user instructions always take precedence'); });

    it('returns empty string when no data', () => {
      const composer = new RetrievalComposer();
      const formatted = composer.formatForPrompt({
        preferences: [],
        patterns: [],
        reflections: [],
        behaviorAdaptations: [], });

      expect(formatted).toBe(''); });

    it('formats measured interaction signals and behavior-derived memory distinctly', () => {
      const composer = new RetrievalComposer();
      const formatted = composer.formatForPrompt({
        preferences: [
          {
            ...makePref({
              signalType: 'implicit',
              derivation: {
                source: 'behavior_analysis',
                analyzerId: 'practice_curve',
                support: 3, }, }),
            rank: 0.82, },
        ],
        patterns: [],
        reflections: [],
        behaviorAdaptations: [
          {
            findingId: 'bf-1',
            analyzerId: 'rework_friction',
            confidence: 0.91,
            support: 4,
            severity: 'high',
            scopeKey: 'context:edit_compose',
            summary: 'Repeated correction loops are showing up in Edit Compose.',
            recommendation: 'Simplify the flow and strengthen defaults.',
            metrics: [
              { label: 'avgRetryRate', value: '28%' },
            ],
            rank: 1.2, },
        ], });

      expect(formatted).toContain('behavior-derived');
      expect(formatted).toContain('### Measured Interaction Signals');
      expect(formatted).toContain('Repeated correction loops are showing up in Edit Compose.');
      expect(formatted).toContain('avgRetryRate=28%'); });

    it('preserves practice-curve guidance as adaptation rather than generic preference text', () => {
      const composer = new RetrievalComposer();
      const formatted = composer.formatForPrompt({
        preferences: [],
        patterns: [],
        reflections: [],
        behaviorAdaptations: [
          {
            findingId: 'bf-practice',
            analyzerId: 'practice_curve',
            confidence: 0.88,
            support: 3,
            severity: 'medium',
            scopeKey: 'context:edit_compose',
            summary: 'A repeated successful sequence is emerging in Edit Compose: input -> activate -> tool.',
            recommendation: 'Preserve the successful sequence and avoid redesigns that break the learned path.',
            metrics: [
              { label: 'burdenImprovement', value: '2.4' },
            ],
            rank: 1.05, },
        ], });

      expect(formatted).toContain('### Measured Interaction Signals');
      expect(formatted).toContain('A repeated successful sequence is emerging in Edit Compose');
      expect(formatted).toContain('Preserve the successful sequence and avoid redesigns that break the learned path.');
      expect(formatted).not.toContain('preference'); }); }); });
