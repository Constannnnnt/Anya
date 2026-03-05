import { describe, it, expect, vi } from 'vitest';
import { ExtractionWorker } from '../src/memory/ui/extractionWorker';
import { ConsolidationManager } from '../src/memory/ui/consolidator';
import { InMemoryMemoryStore } from '../src/memory/ui/inMemoryAdapter';
import type { ExtractionContext } from '../src/memory/ui/extractionPayload';
import type { ExtractedPreferenceCandidate } from '../src/memory/ui/schemas';

// ─── ExtractionWorker Tests ─────────────────────────────────────────────

describe('ExtractionWorker', () => {
  const mockContext: ExtractionContext = {
    events: [],
    conversations: ['[user] intent: Build a dashboard'],
    uiEvents: ['[1000] Button#btn-1 → click: User clicked submit'],
    workflowContext: 'dashboard',
    toolManifest: [],
  };

  describe('runPreferenceExtraction', () => {
    it('parses valid preference candidates from LLM output', async () => {
      const mockOutput = JSON.stringify([
        {
          context: 'User explicitly stated preference',
          preference: 'Use compact card layout for dashboards',
          categories: ['layout'],
          signal_type: 'explicit',
          confidence: 0.9,
        },
      ]);

      const worker = new ExtractionWorker({ runPrompt: async () => mockOutput });
      const result = await worker.runPreferenceExtraction(mockContext);

      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].preference).toBe('Use compact card layout for dashboards');
      expect(result.errors).toHaveLength(0);
    });

    it('handles empty array output', async () => {
      const worker = new ExtractionWorker({ runPrompt: async () => '[]' });
      const result = await worker.runPreferenceExtraction(mockContext);

      expect(result.candidates).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects invalid candidates and collects errors', async () => {
      const mockOutput = JSON.stringify([
        { context: 'valid' }, // missing required fields
        {
          context: 'ok',
          preference: 'Valid pref',
          categories: ['theme'],
          signal_type: 'explicit',
          confidence: 0.8,
        },
      ]);

      const worker = new ExtractionWorker({ runPrompt: async () => mockOutput });
      const result = await worker.runPreferenceExtraction(mockContext);

      expect(result.candidates).toHaveLength(1);
      expect(result.errors).toHaveLength(1);
    });

    it('extracts JSON array from wrapped LLM output', async () => {
      const mockOutput = `Here are the preferences:\n${JSON.stringify([
        {
          context: 'reason',
          preference: 'Dark theme for reading',
          categories: ['theme'],
          signal_type: 'implicit',
          confidence: 0.7,
        },
      ])}\nEnd of output.`;

      const worker = new ExtractionWorker({ runPrompt: async () => mockOutput });
      const result = await worker.runPreferenceExtraction(mockContext);

      expect(result.candidates).toHaveLength(1);
    });

    it('handles completely invalid LLM output gracefully', async () => {
      const worker = new ExtractionWorker({ runPrompt: async () => 'not json at all' });
      const result = await worker.runPreferenceExtraction(mockContext);

      expect(result.candidates).toHaveLength(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('runEpisodicExtraction', () => {
    it('runs full episodic pipeline with valid outputs', async () => {
      let callCount = 0;
      const responses = [
        // Turn summaries
        JSON.stringify([
          {
            situation: 'User requested dashboard',
            intent: 'Build dashboard',
            action: 'Generated card layout',
            thought: 'Selected dashboard skill',
            assessment_assistant: 'Yes',
            assessment_user: 'Yes',
          },
        ]),
        // Episode consolidation
        JSON.stringify({
          situation: 'Dashboard creation task',
          intent: 'Build dashboard',
          assessment: 'Yes',
          justification: 'Successfully built',
          reflection: 'Card layout works well for dashboards',
        }),
        // Reflection synthesis
        JSON.stringify([
          {
            operator: 'add',
            title: 'Dashboard Layout',
            use_cases: 'When building data dashboards',
            hints: 'Start with card layout',
            confidence: 0.85,
          },
        ]),
      ];

      const worker = new ExtractionWorker({
        runPrompt: async () => responses[callCount++],
      });

      const result = await worker.runEpisodicExtraction(mockContext);

      expect(result.turns).toHaveLength(1);
      expect(result.episode).not.toBeNull();
      expect(result.episode!.intent).toBe('Build dashboard');
      expect(result.reflections).toHaveLength(1);
      expect(result.reflections[0].title).toBe('Dashboard Layout');
      expect(result.errors).toHaveLength(0);
    });

    it('returns early when no turns extracted', async () => {
      const worker = new ExtractionWorker({ runPrompt: async () => '[]' });
      const result = await worker.runEpisodicExtraction(mockContext);

      expect(result.turns).toHaveLength(0);
      expect(result.episode).toBeNull();
      expect(result.reflections).toHaveLength(0);
    });
  });
});

// ─── ConsolidationManager Tests ─────────────────────────────────────────

describe('ConsolidationManager', () => {
  const consolidator = new ConsolidationManager();

  describe('consolidatePreferences', () => {
    it('adds new preferences when none exist', async () => {
      const store = new InMemoryMemoryStore();
      const candidates: ExtractedPreferenceCandidate[] = [
        {
          context: 'User said so',
          preference: 'Use dark theme',
          categories: ['theme'],
          signal_type: 'explicit',
          confidence: 0.9,
        },
      ];

      const result = await consolidator.consolidatePreferences(
        candidates, 'actor-1', store, 'evt-1', 1000,
      );

      expect(result.added).toBe(1);
      const prefs = await store.findPreferences('actor-1');
      expect(prefs).toHaveLength(1);
      expect(prefs[0].value).toBe('Use dark theme');
      expect(prefs[0].status).toBe('active'); // high confidence
    });

    it('updates existing preference when same key/value found', async () => {
      const store = new InMemoryMemoryStore();

      // Pre-populate with the key that deriveKey('Use dark theme', 'theme') produces
      await store.upsertPreference({
        id: 'existing',
        actorId: 'actor-1',
        category: 'theme',
        key: 'use_dark_theme',
        value: 'Use dark theme',
        statement: 'Use dark theme',
        signalType: 'implicit',
        confidence: 0.5,
        support: 1,
        firstSeenTs: 500,
        lastSeenTs: 500,
        status: 'candidate',
      });

      const candidates: ExtractedPreferenceCandidate[] = [
        {
          context: 'Confirmed again',
          preference: 'Use dark theme',
          categories: ['theme'],
          signal_type: 'explicit',
          confidence: 0.9,
        },
      ];

      const result = await consolidator.consolidatePreferences(
        candidates, 'actor-1', store, 'evt-2', 2000,
      );

      expect(result.updated).toBe(1);
      const prefs = await store.findPreferences('actor-1');
      expect(prefs).toHaveLength(1);
      expect(prefs[0].support).toBe(2);
    });

    it('skips low-confidence candidates', async () => {
      const store = new InMemoryMemoryStore();
      const candidates: ExtractedPreferenceCandidate[] = [
        {
          context: 'Weak signal',
          preference: 'Maybe use blue',
          categories: ['theme'],
          signal_type: 'implicit',
          confidence: 0.1,
        },
      ];

      const result = await consolidator.consolidatePreferences(
        candidates, 'actor-1', store, 'evt-1', 1000,
      );

      expect(result.skipped).toBe(1);
      const prefs = await store.findPreferences('actor-1');
      expect(prefs).toHaveLength(0);
    });

    it('advances cursor on successful consolidation', async () => {
      const store = new InMemoryMemoryStore();
      const candidates: ExtractedPreferenceCandidate[] = [
        {
          context: 'reason',
          preference: 'Compact layout',
          categories: ['layout'],
          signal_type: 'explicit',
          confidence: 0.8,
        },
      ];

      await consolidator.consolidatePreferences(
        candidates, 'actor-1', store, 'evt-5', 5000,
      );

      const cursor = await store.getCursor('ui_memory');
      expect(cursor).not.toBeNull();
      expect(cursor!.lastProcessedEventId).toBe('evt-5');
      expect(cursor!.lastProcessedTs).toBe(5000);
    });
  });

  describe('consolidateEpisode', () => {
    it('stores a consolidated episode', async () => {
      const store = new InMemoryMemoryStore();

      await consolidator.consolidateEpisode(
        {
          situation: 'Dashboard task',
          intent: 'Build dashboard',
          assessment: 'Yes',
          justification: 'All cards rendered',
          reflection: 'Card layout works well',
        },
        'actor-1',
        'session-1',
        'case-1',
        store,
      );

      const episodes = await store.findEpisodes('actor-1');
      expect(episodes).toHaveLength(1);
      expect(episodes[0].intent).toBe('Build dashboard');
      expect(episodes[0].assessment).toBe('Yes');
    });
  });

  describe('consolidateReflections', () => {
    it('adds new reflections', async () => {
      const store = new InMemoryMemoryStore();

      const result = await consolidator.consolidateReflections(
        [
          {
            operator: 'add',
            title: 'Dashboard Patterns',
            use_cases: 'Building data dashboards',
            hints: 'Group metrics first',
            confidence: 0.85,
          },
        ],
        'actor-1',
        store,
      );

      expect(result.added).toBe(1);
      const refs = await store.findReflections('actor-1');
      expect(refs).toHaveLength(1);
      expect(refs[0].title).toBe('Dashboard Patterns');
    });

    it('updates existing reflections', async () => {
      const store = new InMemoryMemoryStore();

      // Pre-populate
      await store.upsertReflection({
        id: 'existing',
        actorId: 'actor-1',
        title: 'Dashboard Patterns',
        useCases: 'Old use cases',
        hints: 'Old hints',
        confidence: 0.5,
        updatedTs: 1000,
      });

      const result = await consolidator.consolidateReflections(
        [
          {
            operator: 'update',
            title: 'Dashboard Patterns',
            use_cases: 'Updated use cases',
            hints: 'Updated hints',
            confidence: 0.9,
          },
        ],
        'actor-1',
        store,
      );

      expect(result.updated).toBe(1);
      const refs = await store.findReflections('actor-1');
      expect(refs).toHaveLength(1);
      expect(refs[0].hints).toBe('Updated hints');
      expect(refs[0].confidence).toBe(0.9);
    });
  });

  describe('consolidatePattern', () => {
    it('adds a new interaction pattern', async () => {
      const store = new InMemoryMemoryStore();

      const result = await consolidator.consolidatePattern(
        {
          taskClass: 'compare_profiles',
          sequenceKey: 'ui:click -> tool:web-search:success',
          sequence: ['ui:click', 'tool:web-search:success'],
          outcome: 'success',
          confidence: 0.82,
        },
        'actor-1',
        store,
      );

      expect(result.added).toBe(1);
      const patterns = await store.findPatterns('actor-1');
      expect(patterns).toHaveLength(1);
      expect(patterns[0].taskClass).toBe('compare_profiles');
      expect(patterns[0].support).toBe(1);
    });

    it('updates support/confidence for an existing pattern', async () => {
      const store = new InMemoryMemoryStore();
      await store.upsertPattern({
        id: 'pat-1',
        actorId: 'actor-1',
        taskClass: 'compare_profiles',
        sequenceKey: 'ui:click -> tool:web-search:success',
        sequenceJson: JSON.stringify(['ui:click', 'tool:web-search:success']),
        outcome: 'success',
        confidence: 0.6,
        support: 2,
        lastSeenTs: 1000,
      });

      const result = await consolidator.consolidatePattern(
        {
          taskClass: 'compare_profiles',
          sequenceKey: 'ui:click -> tool:web-search:success',
          sequence: ['ui:click', 'tool:web-search:success'],
          outcome: 'success',
          confidence: 0.9,
        },
        'actor-1',
        store,
      );

      expect(result.updated).toBe(1);
      const patterns = await store.findPatterns('actor-1');
      expect(patterns).toHaveLength(1);
      expect(patterns[0].support).toBe(3);
      expect(patterns[0].confidence).toBeGreaterThan(0.6);
    });
  });
});
