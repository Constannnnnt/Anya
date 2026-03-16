import { describe, expect, it } from 'vitest';
import { InMemoryMemoryStore } from '../src/memory/ui/inMemoryAdapter';
import { AdaptiveProfile } from '../src/memory/profile';
import { InMemoryStorage } from '../src/storage/memory';
import { RetrievalComposer } from '../src/memory/ui/retrieval';
import { materializeToProfile } from '../src/memory/ui/materializer';
import {
  InMemoryBehaviorStore,
  type BehaviorFinding,
} from '../src/memory/ui/behavior';
import {
  DEFAULT_FINDING_INTERPRETER_POLICY,
} from '../src/memory/ui/behavior/policy';
import {
  integrateBehaviorFindings,
  interpretBehaviorFindings,
} from '../src/memory/ui/behavior/interpreter';

function makeFinding(overrides: Partial<BehaviorFinding> = {}): BehaviorFinding {
  return {
    id: `bf-${Math.random().toString(36).slice(2, 8)}`,
    actorId: 'actor-1',
    analyzerId: 'rework_friction',
    kind: 'reflection_candidate',
    conceptKey: 'rework-friction:edit_compose',
    scopeKey: 'context:edit_compose',
    confidence: 0.8,
    support: 3,
    severity: 'medium',
    evidenceRefs: ['sig-1'],
    payload: {
      contextArchetype: 'edit_compose',
      hints: 'Reduce repeated edits in the compose flow.',
      useCases: 'Applies in edit flows.',
    },
    createdTs: 100,
    ...overrides,
  };
}

describe('behavior finding interpreter', () => {
  it('retains promotable findings as diagnostics when promotion is disabled', async () => {
    const behaviorStore = new InMemoryBehaviorStore();
    const memoryStore = new InMemoryMemoryStore();
    const finding = makeFinding();

    const result = await integrateBehaviorFindings({
      actorId: 'actor-1',
      findings: [finding],
      policy: DEFAULT_FINDING_INTERPRETER_POLICY,
      memoryStore,
      behaviorStore,
      now: 200,
    });

    expect(result).toMatchObject({
      retainedFindings: 1,
      promotedPreferences: 0,
      promotedPatterns: 0,
      promotedReflections: 0,
      ignored: 0,
    });
    expect(await behaviorStore.findFindings('actor-1')).toHaveLength(1);
    expect(await memoryStore.findReflections('actor-1')).toHaveLength(0);
  });

  it('promotes findings into resolved preferences, patterns, and reflections when explicit promotion rules are provided', async () => {
    const behaviorStore = new InMemoryBehaviorStore();
    const memoryStore = new InMemoryMemoryStore();
    const policy = {
      ...DEFAULT_FINDING_INTERPRETER_POLICY,
      allowResolvedMemoryPromotion: true,
      allowedKindsByAnalyzer: {
        ...DEFAULT_FINDING_INTERPRETER_POLICY.allowedKindsByAnalyzer,
        practice_curve: [
          ...DEFAULT_FINDING_INTERPRETER_POLICY.allowedKindsByAnalyzer.practice_curve,
          'preference_candidate',
        ],
      },
      promotionRules: {
        reflection_candidate: { confidenceMin: 0.7, supportMin: 2 },
        pattern_candidate: { confidenceMin: 0.7, supportMin: 2 },
        preference_candidate: { confidenceMin: 0.8, supportMin: 2 },
      },
    };

    const findings: BehaviorFinding[] = [
      makeFinding(),
      makeFinding({
        id: 'bf-pattern',
        analyzerId: 'error_recovery_cost',
        kind: 'pattern_candidate',
        conceptKey: 'recovery-sequence:edit_compose:input -> tool',
        payload: {
          contextArchetype: 'edit_compose',
          sequenceKey: 'input -> tool',
          sequence: ['input', 'tool'],
        },
      }),
      makeFinding({
        id: 'bf-pref',
        analyzerId: 'practice_curve',
        kind: 'preference_candidate',
        conceptKey: 'keyboard-first:global',
        payload: {
          category: 'interaction',
          statement: 'Prefers keyboard-first interaction in edit flows',
        },
      }),
    ];

    const result = await integrateBehaviorFindings({
      actorId: 'actor-1',
      findings,
      policy,
      memoryStore,
      behaviorStore,
      now: 300,
    });

    expect(result).toMatchObject({
      retainedFindings: 3,
      promotedPreferences: 1,
      promotedPatterns: 1,
      promotedReflections: 1,
      ignored: 0,
    });
    expect(await memoryStore.findPreferences('actor-1', { status: 'active' })).toEqual([
      expect.objectContaining({
        statement: 'Prefers keyboard-first interaction in edit flows',
        derivation: expect.objectContaining({
          source: 'behavior_analysis',
          analyzerId: 'practice_curve',
          support: 3,
        }),
      }),
    ]);
    expect(await memoryStore.findPatterns('actor-1')).toEqual([
      expect.objectContaining({
        sequenceKey: 'input -> tool',
        taskClass: 'edit_compose',
        derivation: expect.objectContaining({
          source: 'behavior_analysis',
          analyzerId: 'error_recovery_cost',
        }),
      }),
    ]);
    expect(await memoryStore.findReflections('actor-1')).toEqual([
      expect.objectContaining({
        title: 'Rework Friction Edit Compose',
        derivation: expect.objectContaining({
          source: 'behavior_analysis',
          analyzerId: 'rework_friction',
          support: 3,
        }),
      }),
    ]);
  });

  it('feeds promoted findings through retrieval and materialization via existing resolved stores', async () => {
    const behaviorStore = new InMemoryBehaviorStore();
    const memoryStore = new InMemoryMemoryStore();
    const storage = new InMemoryStorage();
    const profile = new AdaptiveProfile(storage);
    await profile.load();
    const policy = {
      ...DEFAULT_FINDING_INTERPRETER_POLICY,
      allowResolvedMemoryPromotion: true,
      promotionRules: {
        reflection_candidate: { confidenceMin: 0.7, supportMin: 2 },
      },
    };

    await integrateBehaviorFindings({
      actorId: 'actor-1',
      findings: [makeFinding()],
      policy,
      memoryStore,
      behaviorStore,
      now: 400,
    });

    const retrieval = new RetrievalComposer({ maxReflections: 5 });
    const ctx = await retrieval.retrievePlanningContext(memoryStore, 'actor-1');
    expect(ctx.reflections).toEqual([
      expect.objectContaining({
        title: 'Rework Friction Edit Compose',
        derivation: expect.objectContaining({
          source: 'behavior_analysis',
        }),
      }),
    ]);
    expect(ctx.behaviorAdaptations).toEqual([]);

    await materializeToProfile(memoryStore, 'actor-1', profile);
    expect(profile.getContent()).toContain('Rework Friction Edit Compose');
  });
});

describe('interpretBehaviorFindings', () => {
  it('ignores analyzer kinds that are not allowed by policy', () => {
    const policy = {
      ...DEFAULT_FINDING_INTERPRETER_POLICY,
      allowResolvedMemoryPromotion: true,
      promotionRules: {
        preference_candidate: { confidenceMin: 0.8, supportMin: 2 },
      },
    };
    const finding = makeFinding({ analyzerId: 'fitts_law', kind: 'preference_candidate' });

    const result = interpretBehaviorFindings('actor-1', [finding], policy, 500);
    expect(result.operations).toEqual([
      expect.objectContaining({ type: 'ignore', reason: 'kind-not-allowed-for-analyzer' }),
    ]);
    expect(result.ignored).toHaveLength(1);
  });
});
