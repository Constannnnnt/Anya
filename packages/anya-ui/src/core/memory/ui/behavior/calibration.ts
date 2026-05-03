import { z } from 'zod';
import type {
  BehaviorComposite,
  BehaviorCompositeKind,
  BehaviorFinding,
  BehaviorFindingKind,
  BehaviorFindingSeverity,
} from './schemas';
import type { FindingInterpreterPolicy } from './policy';
import { interpretBehaviorFindings } from './interpreter';
import { buildBehaviorComposites } from './composites';

export interface CalibrationProfile {
  name: string;
  description?: string;
  policy: FindingInterpreterPolicy;
}

export interface CalibrationFixtureExpectation {
  operations: Array<{
    type: 'promote_preference' | 'promote_pattern' | 'promote_reflection' | 'retain_diagnostic' | 'ignore';
    conceptKey: string;
  }>;
  composites?: Array<CalibrationCompositeExpectation>;
}

export interface CalibrationCompositeExpectation {
  kind: BehaviorCompositeKind;
  contextArchetype: string;
  scoreMin?: number;
  scoreMax?: number;
  severity?: BehaviorFindingSeverity;
}

export interface CalibrationFixture {
  id: string;
  name: string;
  actorId: string;
  findings: BehaviorFinding[];
  expected: CalibrationFixtureExpectation;
}

export interface CalibrationCompositeMismatch {
  kind: BehaviorCompositeKind;
  contextArchetype: string;
  reason: 'missing' | 'score_out_of_range' | 'severity_mismatch';
  actualScore?: number;
  actualSeverity?: BehaviorFindingSeverity;
  expectedScoreMin?: number;
  expectedScoreMax?: number;
  expectedSeverity?: BehaviorFindingSeverity;
}

export interface CalibrationFixtureResult {
  fixtureId: string;
  fixtureName: string;
  matchedOperations: number;
  expectedOperations: number;
  actualOperations: number;
  precision: number;
  recall: number;
  exactMatch: boolean;
  missingOperations: string[];
  unexpectedOperations: string[];
  matchedComposites: number;
  expectedComposites: number;
  compositeMatchRate: number;
  compositeMismatches: CalibrationCompositeMismatch[];
}

export interface CalibrationProfileResult {
  profile: CalibrationProfile;
  fixtures: CalibrationFixtureResult[];
  averagePrecision: number;
  averageRecall: number;
  exactMatchRate: number;
  averageCompositeMatchRate: number;
  matchedOperations: number;
  expectedOperations: number;
  actualOperations: number;
  matchedComposites: number;
  expectedComposites: number;
  score: number;
}

export const CalibrationProfileSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  policy: z.object({
    mode: z.literal('calibration_required'),
    allowResolvedMemoryPromotion: z.boolean(),
    diagnosticConfidenceMin: z.number(),
    localAdaptationConfidenceMin: z.number(),
    localAdaptationSeverityMin: z.enum(['low', 'medium', 'high']),
    allowedKindsByAnalyzer: z.record(z.array(z.enum([
      'preference_candidate',
      'pattern_candidate',
      'reflection_candidate',
      'diagnostic',
      'warning',
    ]))),
    promotionRules: z.record(z.object({
      confidenceMin: z.number(),
      supportMin: z.number().int().min(0),
    })).optional(),
  }),
});

export const CalibrationFixtureSchema = z.object({
  id: z.string(),
  name: z.string(),
  actorId: z.string(),
  findings: z.array(z.object({
    id: z.string(),
    actorId: z.string(),
    analyzerId: z.string(),
    kind: z.enum([
      'preference_candidate',
      'pattern_candidate',
      'reflection_candidate',
      'diagnostic',
      'warning',
    ]),
    conceptKey: z.string(),
    scopeKey: z.string().optional(),
    confidence: z.number(),
    support: z.number().int().min(0),
    severity: z.enum(['low', 'medium', 'high']).optional(),
    evidenceRefs: z.array(z.string()),
    payload: z.record(z.unknown()),
    createdTs: z.number(),
  })),
  expected: z.object({
    operations: z.array(z.object({
      type: z.enum([
        'promote_preference',
        'promote_pattern',
        'promote_reflection',
        'retain_diagnostic',
        'ignore',
      ]),
      conceptKey: z.string(),
    })),
    composites: z.array(z.object({
      kind: z.enum([
        'motor_friction',
        'cognitive_load',
        'wayfinding_health',
        'input_friction',
      ]),
      contextArchetype: z.string(),
      scoreMin: z.number().min(0).max(1).optional(),
      scoreMax: z.number().min(0).max(1).optional(),
      severity: z.enum(['low', 'medium', 'high']).optional(),
    })).optional(),
  }),
});

export function evaluateCalibrationProfile(
  profile: CalibrationProfile,
  fixtures: CalibrationFixture[],
): CalibrationProfileResult {
  const fixtureResults = fixtures.map((fixture) => evaluateFixture(profile, fixture));
  const matchedOperations = fixtureResults.reduce((sum, result) => sum + result.matchedOperations, 0);
  const expectedOperations = fixtureResults.reduce((sum, result) => sum + result.expectedOperations, 0);
  const actualOperations = fixtureResults.reduce((sum, result) => sum + result.actualOperations, 0);
  const matchedComposites = fixtureResults.reduce((sum, result) => sum + result.matchedComposites, 0);
  const expectedComposites = fixtureResults.reduce((sum, result) => sum + result.expectedComposites, 0);
  const averagePrecision = average(fixtureResults.map((result) => result.precision));
  const averageRecall = average(fixtureResults.map((result) => result.recall));
  const exactMatchRate = average(fixtureResults.map((result) => (result.exactMatch ? 1 : 0)));
  const averageCompositeMatchRate = average(
    fixtureResults
      .filter((result) => result.expectedComposites > 0)
      .map((result) => result.compositeMatchRate),
  );
  const score =
    averagePrecision * 0.30
    + averageRecall * 0.30
    + exactMatchRate * 0.15
    + averageCompositeMatchRate * 0.25;

  return {
    profile,
    fixtures: fixtureResults,
    averagePrecision,
    averageRecall,
    exactMatchRate,
    averageCompositeMatchRate,
    matchedOperations,
    expectedOperations,
    actualOperations,
    matchedComposites,
    expectedComposites,
    score,
  };
}

export function rankCalibrationProfiles(
  profiles: CalibrationProfile[],
  fixtures: CalibrationFixture[],
): CalibrationProfileResult[] {
  return profiles
    .map((profile) => evaluateCalibrationProfile(profile, fixtures))
    .sort((left, right) =>
      right.score - left.score
      || right.averageRecall - left.averageRecall
      || right.averagePrecision - left.averagePrecision,
    );
}

function evaluateFixture(
  profile: CalibrationProfile,
  fixture: CalibrationFixture,
): CalibrationFixtureResult {
  const interpreted = interpretBehaviorFindings(
    fixture.actorId,
    fixture.findings,
    profile.policy,
  );

  const actual = interpreted.operations.map((operation) => serializeOperation(operation.type, operation.finding.conceptKey));
  const expected = fixture.expected.operations.map((operation) => serializeOperation(operation.type, operation.conceptKey));
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const matchedOperations = expected.filter((entry) => actualSet.has(entry)).length;
  const missingOperations = expected.filter((entry) => !actualSet.has(entry));
  const unexpectedOperations = actual.filter((entry) => !expectedSet.has(entry));

  const expectedComposites = fixture.expected.composites ?? [];
  const actualComposites = expectedComposites.length > 0
    ? buildBehaviorComposites({
      actorId: fixture.actorId,
      findings: interpreted.retainedFindings,
      now: latestFindingTs(fixture.findings),
    })
    : [];
  const compositeEvaluation = evaluateComposites(expectedComposites, actualComposites);

  return {
    fixtureId: fixture.id,
    fixtureName: fixture.name,
    matchedOperations,
    expectedOperations: expected.length,
    actualOperations: actual.length,
    precision: actual.length === 0 ? (expected.length === 0 ? 1 : 0) : matchedOperations / actual.length,
    recall: expected.length === 0 ? 1 : matchedOperations / expected.length,
    exactMatch: missingOperations.length === 0 && unexpectedOperations.length === 0,
    missingOperations,
    unexpectedOperations,
    matchedComposites: compositeEvaluation.matched,
    expectedComposites: expectedComposites.length,
    compositeMatchRate: expectedComposites.length === 0 ? 1 : compositeEvaluation.matched / expectedComposites.length,
    compositeMismatches: compositeEvaluation.mismatches,
  };
}

function evaluateComposites(
  expected: CalibrationCompositeExpectation[],
  actual: BehaviorComposite[],
): { matched: number; mismatches: CalibrationCompositeMismatch[] } {
  const mismatches: CalibrationCompositeMismatch[] = [];
  let matched = 0;

  for (const expectation of expected) {
    const found = actual.find((composite) =>
      composite.kind === expectation.kind
      && composite.contextArchetype === expectation.contextArchetype,
    );

    if (!found) {
      mismatches.push({
        kind: expectation.kind,
        contextArchetype: expectation.contextArchetype,
        reason: 'missing',
        expectedScoreMin: expectation.scoreMin,
        expectedScoreMax: expectation.scoreMax,
        expectedSeverity: expectation.severity,
      });
      continue;
    }

    if (
      (expectation.scoreMin !== undefined && found.score < expectation.scoreMin)
      || (expectation.scoreMax !== undefined && found.score > expectation.scoreMax)
    ) {
      mismatches.push({
        kind: expectation.kind,
        contextArchetype: expectation.contextArchetype,
        reason: 'score_out_of_range',
        actualScore: found.score,
        expectedScoreMin: expectation.scoreMin,
        expectedScoreMax: expectation.scoreMax,
      });
      continue;
    }

    if (expectation.severity !== undefined && found.severity !== expectation.severity) {
      mismatches.push({
        kind: expectation.kind,
        contextArchetype: expectation.contextArchetype,
        reason: 'severity_mismatch',
        actualSeverity: found.severity,
        expectedSeverity: expectation.severity,
      });
      continue;
    }

    matched += 1;
  }

  return { matched, mismatches };
}

function latestFindingTs(findings: BehaviorFinding[]): number {
  if (findings.length === 0) return Date.now();
  return findings.reduce((max, finding) => Math.max(max, finding.createdTs), 0);
}

function serializeOperation(type: string, conceptKey: string): string {
  return `${type}::${conceptKey}`;
}

function average(values: number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}
