export {
  AppliedRecommendationSchema,
  BehaviorAggregateSchema,
  BehaviorCompositeKindSchema,
  BehaviorCompositeSchema,
  BehaviorFindingKindSchema,
  BehaviorFindingSchema,
  BehaviorFindingSeveritySchema,
  BehaviorMetricRecordSchema,
  BehaviorSegmentSchema,
  BehaviorSessionSummarySchema,
  BehaviorSignalSchema,
  InteractionModalitySchema,
  RecommendationOutcomeSchema,
} from './schemas';
export type {
  AppliedRecommendation,
  BehaviorAggregate,
  BehaviorComposite,
  BehaviorCompositeKind,
  BehaviorFinding,
  BehaviorFindingKind,
  BehaviorFindingSeverity,
  BehaviorMetricRecord,
  BehaviorSegment,
  BehaviorSessionSummary,
  BehaviorSignal,
  InteractionModality,
  RecommendationOutcome,
} from './schemas';

export { severityFromScore, severityToScore } from './severity';

export {
  buildBehaviorComposites,
  getCompositeKindForAnalyzer,
  resolveFindingContextArchetype,
  type BuildBehaviorCompositesInput,
} from './composites';

export { InMemoryBehaviorStore } from './inMemoryStore';
export type {
  AppliedRecommendationQueryOptions,
  BehaviorAggregateQueryOptions,
  BehaviorCompositeQueryOptions,
  BehaviorFindingQueryOptions,
  BehaviorSegmentQueryOptions,
  BehaviorSessionSummaryQueryOptions,
  BehaviorSignalQueryOptions,
  BehaviorStore,
  BehaviorStoreSnapshot,
} from './store';

export {
  OUTCOME_DELTA,
  POST_APPLICATION_SESSIONS,
  RECOMMENDATION_OUTCOME_ANALYZER_ID,
  recordAppliedRecommendation,
  reduceRecommendationOutcomes,
  type RecommendationOutcomeReduction,
  type RecordAppliedRecommendationInput,
  type ViewRecommendationLike,
} from './outcomes';

export { projectBehaviorSignals } from './signalProjector';
export { reduceBehaviorSegments } from './segmentReducer';
export type { SegmentReductionConfig } from './segmentReducer';
export { projectBehaviorSessionSummaries } from './sessionSummaryProjector';
export { reduceBehaviorAggregates } from './aggregateReducer';
export type { AggregateReductionConfig } from './aggregateReducer';
export {
  createBehaviorFinding,
  type AnalyzerDependency,
  type AnalyzerReadinessInput,
  type BehaviorAnalyzer,
  type BehaviorAnalyzerFinding,
  type BehaviorAnalyzerInput,
  type BehaviorAnalyzerResult,
} from './analyzers';
export {
  createBuiltinBehaviorAnalyzers,
  createErrorRecoveryCostAnalyzer,
  createFittsLawAnalyzer,
  createFocusSwitchCostAnalyzer,
  createFormFrictionAnalyzer,
  createHickHymanAnalyzer,
  createInformationScentAnalyzer,
  createKlmLightAnalyzer,
  createLostnessLightAnalyzer,
  createPracticeCurveAnalyzer,
  createReworkFrictionAnalyzer,
  createSteeringLawAnalyzer,
} from './heuristics';
export { BehaviorAnalyzerRegistry } from './analyzerRegistry';
export { BehaviorDirtyTracker } from './dirtyTracker';
export {
  BehaviorAnalysisScheduler,
  DEFAULT_BEHAVIOR_SCHEDULER_POLICY,
  type BehaviorSchedulerInput,
  type BehaviorSchedulerPolicy,
  type BehaviorSchedulerResult,
  type BehaviorSchedulerRunRecord,
  type BehaviorSchedulerState,
} from './scheduler';
export {
  DEFAULT_FINDING_INTERPRETER_POLICY,
  isFindingKindAllowed,
  shouldRetainAsDiagnostic,
  shouldPromoteFinding,
  shouldRetainForLocalAdaptation,
  type FindingInterpreterPolicy,
} from './policy';
export {
  integrateBehaviorFindings,
  interpretBehaviorFindings,
  type FindingInterpretationResult,
  type FindingOperation,
  type IntegrateBehaviorFindingsResult,
} from './interpreter';
export {
  CalibrationFixtureSchema,
  CalibrationProfileSchema,
  evaluateCalibrationProfile,
  rankCalibrationProfiles,
  type CalibrationCompositeExpectation,
  type CalibrationCompositeMismatch,
  type CalibrationFixture,
  type CalibrationFixtureExpectation,
  type CalibrationFixtureResult,
  type CalibrationProfile,
  type CalibrationProfileResult,
} from './calibration';
export {
  UiBehaviorPipeline,
  type BehaviorAnalysisRunCapture,
  type UiBehaviorPipelineConfig,
} from './pipeline';
