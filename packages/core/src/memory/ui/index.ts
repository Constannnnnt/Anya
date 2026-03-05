/**
 * @anya-ui/core — UI Memory Module
 *
 * Barrel exports for the persistent UI memory pipeline.
 */

// ─── Schemas & Types ─────────────────────────────────────────────────────
export {
  UiMemoryEventSourceSchema,
  UiMemoryEventSchema,
  InteractionPayloadSchema,
  PreferenceStatusSchema,
  PreferenceSignalTypeSchema,
  PreferenceMemorySchema,
  PatternOutcomeSchema,
  InteractionPatternSchema,
  EpisodeAssessmentSchema,
  EpisodeSchema,
  ReflectionSchema,
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
  PreferenceMemory,
  InteractionPattern,
  Episode,
  Reflection,
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
export { SQLiteMemoryStore } from './sqliteAdapter';
export type { SQLiteMemoryStoreOptions } from './sqliteAdapter';
export { IndexedDbMemoryStore } from './indexedDbAdapter';
export type { IndexedDbMemoryStoreOptions } from './indexedDbAdapter';
export {
  createMemoryStoreByPolicySync,
  createMemoryStoreByPolicy,
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
  PlanningMemoryContext,
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
