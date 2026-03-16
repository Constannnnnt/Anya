export {
  BehaviorAggregateSchema,
  BehaviorFindingKindSchema,
  BehaviorFindingSchema,
  BehaviorFindingSeveritySchema,
  BehaviorMetricRecordSchema,
  BehaviorSegmentSchema,
  BehaviorSessionSummarySchema,
  BehaviorSignalSchema,
  InteractionModalitySchema,
} from './schemas';
export type {
  BehaviorAggregate,
  BehaviorFinding,
  BehaviorFindingKind,
  BehaviorFindingSeverity,
  BehaviorMetricRecord,
  BehaviorSegment,
  BehaviorSessionSummary,
  BehaviorSignal,
  InteractionModality,
} from './schemas';

export { InMemoryBehaviorStore } from './inMemoryStore';
export type {
  BehaviorAggregateQueryOptions,
  BehaviorFindingQueryOptions,
  BehaviorSegmentQueryOptions,
  BehaviorSessionSummaryQueryOptions,
  BehaviorSignalQueryOptions,
  BehaviorStore,
  BehaviorStoreSnapshot,
} from './store';

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
} from './builtinAnalyzers';
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
