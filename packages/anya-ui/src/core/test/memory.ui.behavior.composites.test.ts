import { describe, expect, it } from 'vitest';
import {
  buildBehaviorComposites,
  getCompositeKindForAnalyzer,
  resolveFindingContextArchetype,
} from '../memory/ui/behavior/composites';
import type { BehaviorFinding, BehaviorFindingSeverity } from '../memory/ui/behavior';

function makeFinding(overrides: Partial<BehaviorFinding> = {}): BehaviorFinding {
  return {
    id: `bfnd-${Math.random().toString(36).slice(2, 8)}`,
    actorId: 'actor-1',
    analyzerId: 'fitts_law',
    kind: 'reflection_candidate',
    conceptKey: 'fitts:browse_scan',
    scopeKey: 'context:browse_scan',
    confidence: 0.8,
    support: 4,
    severity: 'high' as BehaviorFindingSeverity,
    evidenceRefs: [],
    payload: { contextArchetype: 'browse_scan' },
    createdTs: 1000,
    ...overrides,
  };
}

describe('buildBehaviorComposites', () => {
  it('maps fitts_law and steering_law into motor_friction', () => {
    const composites = buildBehaviorComposites({
      actorId: 'actor-1',
      now: 100,
      findings: [
        makeFinding({ analyzerId: 'fitts_law', confidence: 0.8, severity: 'high' }),
        makeFinding({ analyzerId: 'steering_law', confidence: 0.7, severity: 'medium' }),
      ],
    });

    expect(composites).toHaveLength(1);
    expect(composites[0].kind).toBe('motor_friction');
    expect(composites[0].contextArchetype).toBe('browse_scan');
    expect(composites[0].contributingAnalyzers.sort()).toEqual(['fitts_law', 'steering_law']);
  });

  it('groups by contextArchetype, producing separate composites per context', () => {
    const composites = buildBehaviorComposites({
      actorId: 'actor-1',
      now: 100,
      findings: [
        makeFinding({
          analyzerId: 'hick_hyman',
          payload: { contextArchetype: 'browse_scan' },
        }),
        makeFinding({
          analyzerId: 'klm_light',
          payload: { contextArchetype: 'edit_compose' },
          scopeKey: 'context:edit_compose',
        }),
      ],
    });

    expect(composites.map((c) => c.contextArchetype).sort()).toEqual(['browse_scan', 'edit_compose']);
    expect(composites.every((c) => c.kind === 'cognitive_load')).toBe(true);
  });

  it('uses confidence-weighted severity averaging', () => {
    const composites = buildBehaviorComposites({
      actorId: 'actor-1',
      now: 100,
      findings: [
        makeFinding({ analyzerId: 'fitts_law', confidence: 1.0, severity: 'high' }),
        makeFinding({ analyzerId: 'steering_law', confidence: 1.0, severity: 'low' }),
      ],
    });

    // (1.0 * 1 + 1.0 * 0.25) / (1.0 + 1.0) = 0.625
    expect(composites[0].score).toBeCloseTo(0.625, 5);
    expect(composites[0].severity).toBe('medium');
  });

  it('weights higher-confidence findings more heavily', () => {
    const composites = buildBehaviorComposites({
      actorId: 'actor-1',
      now: 100,
      findings: [
        makeFinding({ analyzerId: 'fitts_law', confidence: 0.9, severity: 'high' }),
        makeFinding({ analyzerId: 'steering_law', confidence: 0.1, severity: 'low' }),
      ],
    });

    // (0.9 * 1 + 0.1 * 0.25) / (0.9 + 0.1) = 0.925 → high
    expect(composites[0].score).toBeCloseTo(0.925, 5);
    expect(composites[0].severity).toBe('high');
  });

  it('skips analyzers that do not map to a composite (e.g. practice_curve)', () => {
    const composites = buildBehaviorComposites({
      actorId: 'actor-1',
      now: 100,
      findings: [
        makeFinding({ analyzerId: 'practice_curve', kind: 'pattern_candidate' }),
      ],
    });

    expect(composites).toHaveLength(0);
  });

  it('skips findings without a resolvable contextArchetype', () => {
    const composites = buildBehaviorComposites({
      actorId: 'actor-1',
      now: 100,
      findings: [
        makeFinding({ payload: {}, scopeKey: undefined }),
      ],
    });

    expect(composites).toHaveLength(0);
  });

  it('uses a deterministic id derived from actor + kind + context', () => {
    const a = buildBehaviorComposites({
      actorId: 'actor-1',
      now: 100,
      findings: [makeFinding()],
    });
    const b = buildBehaviorComposites({
      actorId: 'actor-1',
      now: 200,
      findings: [makeFinding({ id: 'different-finding-id' })],
    });

    expect(a[0].id).toBe(b[0].id);
    expect(a[0].id).toBe('bcomp:actor-1:motor_friction:browse_scan');
  });

  it('aggregates support across all contributing findings', () => {
    const composites = buildBehaviorComposites({
      actorId: 'actor-1',
      now: 100,
      findings: [
        makeFinding({ analyzerId: 'form_friction', support: 3 }),
        makeFinding({ analyzerId: 'rework_friction', support: 5 }),
        makeFinding({ analyzerId: 'error_recovery_cost', support: 2 }),
      ],
    });

    expect(composites[0].kind).toBe('input_friction');
    expect(composites[0].support).toBe(10);
    expect(composites[0].contributingAnalyzers).toHaveLength(3);
  });

  it('computes severity from score thresholds', () => {
    const high = buildBehaviorComposites({
      actorId: 'actor-1',
      now: 100,
      findings: [makeFinding({ confidence: 1, severity: 'high' })],
    });
    const medium = buildBehaviorComposites({
      actorId: 'actor-1',
      now: 100,
      findings: [makeFinding({ confidence: 1, severity: 'medium' })],
    });
    const low = buildBehaviorComposites({
      actorId: 'actor-1',
      now: 100,
      findings: [makeFinding({ confidence: 1, severity: 'low' })],
    });

    expect(high[0].severity).toBe('high');
    expect(medium[0].severity).toBe('medium');
    expect(low[0].severity).toBe('low');
  });

  it('captures the time window of contributing findings', () => {
    const composites = buildBehaviorComposites({
      actorId: 'actor-1',
      now: 999,
      findings: [
        makeFinding({ analyzerId: 'fitts_law', createdTs: 1000 }),
        makeFinding({ analyzerId: 'steering_law', createdTs: 5000 }),
      ],
    });

    expect(composites[0].windowStartTs).toBe(1000);
    expect(composites[0].windowEndTs).toBe(5000);
    expect(composites[0].updatedTs).toBe(999);
  });
});

describe('getCompositeKindForAnalyzer', () => {
  it('returns mapping for known analyzer ids', () => {
    expect(getCompositeKindForAnalyzer('fitts_law')).toBe('motor_friction');
    expect(getCompositeKindForAnalyzer('hick_hyman')).toBe('cognitive_load');
    expect(getCompositeKindForAnalyzer('lostness_light')).toBe('wayfinding_health');
    expect(getCompositeKindForAnalyzer('form_friction')).toBe('input_friction');
  });

  it('returns undefined for unmapped analyzers', () => {
    expect(getCompositeKindForAnalyzer('practice_curve')).toBeUndefined();
    expect(getCompositeKindForAnalyzer('nonexistent_analyzer')).toBeUndefined();
  });
});

describe('resolveFindingContextArchetype', () => {
  it('reads from payload.contextArchetype first', () => {
    const finding = {
      ...makeFinding({ payload: { contextArchetype: 'edit_compose' } }),
      scopeKey: 'context:other_context',
    };
    expect(resolveFindingContextArchetype(finding)).toBe('edit_compose');
  });

  it('falls back to scopeKey if payload is missing', () => {
    const finding = makeFinding({ payload: {}, scopeKey: 'context:browse_scan' });
    expect(resolveFindingContextArchetype(finding)).toBe('browse_scan');
  });

  it('returns undefined when neither source is set', () => {
    const finding = makeFinding({ payload: {}, scopeKey: undefined });
    expect(resolveFindingContextArchetype(finding)).toBeUndefined();
  });
});
