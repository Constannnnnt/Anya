/**
 * ../../../core — UI Memory Module
 *
 * Barrel exports for the persistent UI memory pipeline.
 */

// ─── Schemas & Types ─────────────────────────────────────────────────────
export {
  UiMemoryEventSourceSchema,
  UiMemoryEventSchema,
  InteractionPayloadSchema,
  MemoryDerivationSourceSchema,
  MemoryDerivationSeveritySchema,
  MemoryDerivationSchema,
  PreferenceStatusSchema,
  PreferenceSignalTypeSchema,
  PreferenceMemorySchema,
  PatternOutcomeSchema,
  InteractionPatternSchema,
  EpisodeAssessmentSchema,
  EpisodeSchema,
  ReflectionSchema,
  MemoryCursorNamespaceSchema,
  MemoryCursorSchema,
  ExtractedPreferenceCandidateSchema,
  ConsolidationOperationSchema,
  ConsolidationDecisionSchema,
  EpisodicTurnSummarySchema,
  ConsolidatedEpisodeSchema,
  ReflectionSynthesisSchema,
} from './schemas';

export type {
  UiMemoryEventSource,
  UiMemoryEvent,
  InteractionPayload,
  MemoryDerivationSource,
  MemoryDerivationSeverity,
  MemoryDerivation,
  PreferenceMemory,
  InteractionPattern,
  Episode,
  Reflection,
  MemoryCursorNamespace,
  MemoryCursor,
  ExtractedPreferenceCandidate,
  ConsolidationOperation,
  ConsolidationDecision,
  EpisodicTurnSummary,
  ConsolidatedEpisode,
  ReflectionSynthesis,
} from './schemas';

// ─── Store Interface ─────────────────────────────────────────────────────
export type {
  MemoryStore,
  MemoryStoreSnapshot,
  EventReadOptions,
  PreferenceQueryOptions,
  PatternQueryOptions,
  EpisodeQueryOptions,
  ReflectionQueryOptions,
} from './store';

// ─── Adapters ────────────────────────────────────────────────────────────
export { InMemoryMemoryStore } from './inMemoryAdapter';
export { PersistentMemoryStore } from './persistentAdapter';
export {
  NodeStorageProvider,
  BrowserStorageProvider,
} from './storageProvider';
export type { StorageProvider } from './storageProvider';
export {
  createMemoryStoreByPolicySync,
  type MemoryStorePolicy,
  type MemoryStoreRuntime,
  type MemoryStoreFactoryOptions,
} from './storeFactory';

// ─── Event Capture ───────────────────────────────────────────────────────
export { UiEventCollector } from './eventCollector';
export type { EventCollectorConfig } from './eventCollector';
export { TriggerManager } from './triggerManager';
export type { TriggerConfig, TriggerResult, TriggerCallback } from './triggerManager';
export { UiMemoryPipeline } from './pipeline';
export type { UiMemoryPipelineConfig } from './pipeline';

// ─── Extraction ──────────────────────────────────────────────────────────
export {
  buildExtractionWindow,
  buildExtractionContext,
} from './extractionPayload';
export type {
  ExtractionWindowConfig,
  ExtractionContext,
} from './extractionPayload';
export { ExtractionWorker } from './extractionWorker';
export type {
  PromptRunner,
  ExtractionWorkerConfig,
  PreferenceExtractionResult,
  EpisodicExtractionResult,
} from './extractionWorker';

// ─── Consolidation ───────────────────────────────────────────────────────
export { ConsolidationManager } from './consolidator';
export type { ConsolidationResult } from './consolidator';

// ─── Retrieval ───────────────────────────────────────────────────────────
export { RetrievalComposer } from './retrieval';
export type {
  BehaviorAdaptation,
  BehaviorEvidenceMetric,
  BehaviorRetrievalInput,
  PlanningMemoryContext,
  RankedBehaviorAdaptation,
  RankedPreference,
  RankedPattern,
  RetrievalConfig,
} from './retrieval';
export { buildPatternCandidate } from './patterns';
export type { PatternCandidate } from './patterns';

// ─── Materialization ─────────────────────────────────────────────────────
export { materializeToProfile } from './materializer';
export type {
  MaterializationResult,
  MaterializationConfig,
} from './materializer';

// ─── Behavior Intelligence Projections ───────────────────────────────────
export {
  BehaviorAggregateSchema,
  CalibrationFixtureSchema,
  CalibrationProfileSchema,
  BehaviorAnalysisScheduler,
  BehaviorAnalyzerRegistry,
  BehaviorDirtyTracker,
  BehaviorMetricRecordSchema,
  BehaviorSegmentSchema,
  BehaviorSessionSummarySchema,
  BehaviorSignalSchema,
  DEFAULT_BEHAVIOR_SCHEDULER_POLICY,
  DEFAULT_FINDING_INTERPRETER_POLICY,
  InMemoryBehaviorStore,
  InteractionModalitySchema,
  UiBehaviorPipeline,
  createBehaviorFinding,
  evaluateCalibrationProfile,
  integrateBehaviorFindings,
  isFindingKindAllowed,
  interpretBehaviorFindings,
  projectBehaviorSessionSummaries,
  projectBehaviorSignals,
  reduceBehaviorAggregates,
  reduceBehaviorSegments,
  rankCalibrationProfiles,
  shouldRetainAsDiagnostic,
  shouldRetainForLocalAdaptation,
} from './behavior';
export type {
  AggregateReductionConfig,
  AnalyzerDependency,
  AnalyzerReadinessInput,
  BehaviorAggregate,
  BehaviorAggregateQueryOptions,
  CalibrationFixture,
  CalibrationFixtureExpectation,
  CalibrationFixtureResult,
  CalibrationProfile,
  CalibrationProfileResult,
  BehaviorAnalyzer,
  BehaviorAnalyzerFinding,
  BehaviorAnalyzerInput,
  BehaviorAnalyzerResult,
  BehaviorMetricRecord,
  BehaviorSegment,
  BehaviorSegmentQueryOptions,
  BehaviorSchedulerInput,
  BehaviorSchedulerPolicy,
  BehaviorSchedulerResult,
  BehaviorSchedulerRunRecord,
  BehaviorSchedulerState,
  BehaviorAnalysisRunCapture,
  BehaviorSessionSummary,
  BehaviorSessionSummaryQueryOptions,
  BehaviorSignal,
  BehaviorSignalQueryOptions,
  BehaviorStore,
  BehaviorStoreSnapshot,
  BehaviorFindingKind,
  BehaviorFindingSeverity,
  FindingInterpreterPolicy,
  FindingInterpretationResult,
  FindingOperation,
  IntegrateBehaviorFindingsResult,
  InteractionModality,
  UiBehaviorPipelineConfig,
  SegmentReductionConfig,
} from './behavior';
