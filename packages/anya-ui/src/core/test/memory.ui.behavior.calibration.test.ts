import { describe, expect, it } from 'vitest';
import {
  evaluateCalibrationProfile,
  rankCalibrationProfiles,
  type CalibrationFixture,
  type CalibrationProfile, } from '../memory/ui/behavior';
import { DEFAULT_FINDING_INTERPRETER_POLICY } from '../memory/ui/behavior/policy';
import type { BehaviorFinding } from '../memory/ui/behavior';

function makeFinding(overrides: Partial<BehaviorFinding> = { }): BehaviorFinding {
  return {
    id: `bf-${Math.random().toString(36).slice(2, 8) }`,
    actorId: 'actor-1',
    analyzerId: 'rework_friction',
    kind: 'reflection_candidate',
    conceptKey: 'rework-friction:edit_compose',
    scopeKey: 'context:edit_compose',
    confidence: 0.82,
    support: 3,
    severity: 'medium',
    evidenceRefs: ['sig-1'],
    payload: {
      hints: 'Reduce repeated edits in the compose flow.',
      useCases: 'Applies in edit flows.', },
    createdTs: 100,
    ...overrides, }; }

describe('behavior calibration evaluator', () => {
  it('evaluates a profile against fixture expectations', () => {
    const profile: CalibrationProfile = {
      name: 'strict-diagnostic',
      policy: DEFAULT_FINDING_INTERPRETER_POLICY, };
    const fixtures: CalibrationFixture[] = [
      {
        id: 'fixture-1',
        name: 'reflection retained as diagnostic',
        actorId: 'actor-1',
        findings: [makeFinding()],
        expected: {
          operations: [
            {
              type: 'retain_diagnostic',
              conceptKey: 'rework-friction:edit_compose', },
          ], }, },
    ];

    const result = evaluateCalibrationProfile(profile, fixtures);
    expect(result.averagePrecision).toBe(1);
    expect(result.averageRecall).toBe(1);
    expect(result.exactMatchRate).toBe(1);
    expect(result.fixtures[0].exactMatch).toBe(true); });

  it('ranks profiles by score over shared fixtures', () => {
    const fixtures: CalibrationFixture[] = [
      {
        id: 'fixture-1',
        name: 'promotion expected',
        actorId: 'actor-1',
        findings: [makeFinding()],
        expected: {
          operations: [
            {
              type: 'promote_reflection',
              conceptKey: 'rework-friction:edit_compose', },
          ], }, },
    ];

    const profiles: CalibrationProfile[] = [
      {
        name: 'diagnostic-only',
        policy: DEFAULT_FINDING_INTERPRETER_POLICY, },
      {
        name: 'promoting',
        policy: {
          ...DEFAULT_FINDING_INTERPRETER_POLICY,
          allowResolvedMemoryPromotion: true,
          promotionRules: {
            reflection_candidate: { confidenceMin: 0.7, supportMin: 2 }, }, }, },
    ];

    const ranked = rankCalibrationProfiles(profiles, fixtures);
    expect(ranked[0].profile.name).toBe('promoting');
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score); });

  it('asserts composite scores within the configured range', () => {
    const profile: CalibrationProfile = {
      name: 'strict-diagnostic',
      policy: DEFAULT_FINDING_INTERPRETER_POLICY,
    };
    const fixtures: CalibrationFixture[] = [
      {
        id: 'fixture-composites',
        name: 'fitts + steering should produce high motor friction',
        actorId: 'actor-1',
        findings: [
          makeFinding({
            analyzerId: 'fitts_law',
            conceptKey: 'fitts:browse_scan',
            scopeKey: 'context:browse_scan',
            severity: 'high',
            confidence: 0.85,
            payload: { contextArchetype: 'browse_scan' },
          }),
          makeFinding({
            analyzerId: 'steering_law',
            conceptKey: 'steering:browse_scan',
            scopeKey: 'context:browse_scan',
            severity: 'high',
            confidence: 0.8,
            payload: { contextArchetype: 'browse_scan' },
          }),
        ],
        expected: {
          operations: [
            { type: 'retain_diagnostic', conceptKey: 'fitts:browse_scan' },
            { type: 'retain_diagnostic', conceptKey: 'steering:browse_scan' },
          ],
          composites: [
            {
              kind: 'motor_friction',
              contextArchetype: 'browse_scan',
              scoreMin: 0.7,
              severity: 'high',
            },
          ],
        },
      },
    ];

    const result = evaluateCalibrationProfile(profile, fixtures);
    expect(result.matchedComposites).toBe(1);
    expect(result.expectedComposites).toBe(1);
    expect(result.averageCompositeMatchRate).toBe(1);
    expect(result.fixtures[0].compositeMismatches).toEqual([]);
  });

  it('flags composite mismatches when score is out of range', () => {
    const profile: CalibrationProfile = {
      name: 'strict',
      policy: DEFAULT_FINDING_INTERPRETER_POLICY,
    };
    const fixtures: CalibrationFixture[] = [
      {
        id: 'fixture-low-score',
        name: 'low severity should not produce high motor friction',
        actorId: 'actor-1',
        findings: [
          makeFinding({
            analyzerId: 'fitts_law',
            conceptKey: 'fitts:edit_compose',
            scopeKey: 'context:edit_compose',
            severity: 'low',
            confidence: 0.85,
            payload: { contextArchetype: 'edit_compose' },
          }),
        ],
        expected: {
          operations: [
            { type: 'retain_diagnostic', conceptKey: 'fitts:edit_compose' },
          ],
          composites: [
            {
              kind: 'motor_friction',
              contextArchetype: 'edit_compose',
              scoreMin: 0.7,
            },
          ],
        },
      },
    ];

    const result = evaluateCalibrationProfile(profile, fixtures);
    expect(result.matchedComposites).toBe(0);
    expect(result.fixtures[0].compositeMismatches[0].reason).toBe('score_out_of_range');
  });
});
