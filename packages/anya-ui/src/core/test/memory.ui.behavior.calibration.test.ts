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
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score); }); });
