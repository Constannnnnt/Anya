/**
 * @anya-ui/core — Public API
 *
 * Barrel exports. Every module has a single responsibility.
 */

// ─── Types ───────────────────────────────────────────────────────────────
export type {
  InteractionModality,
  InteractionAction,
  InteractionTrigger,
  UIInteractionMeasurement,
  UIInteractionMeasurementHint,
  UIInteractionRecord,
  UIPresentedSurface,
  ActiveContext,
  ElementHistory,
  ReasoningTrace,
  UIRenderSpec,
  UIComponentSpec,
  UIInteractionDefinition,
  ThemeTokens,
  AgentState,
  AgentMessage,
  PromptOptions,
  PromptParts,
} from './types';

// ─── Storage ─────────────────────────────────────────────────────────────
export type { FileStorage } from './storage/interface';
export { InMemoryStorage } from './storage/memory';
export { LocalStorageAdapter } from './storage/localStorage';

// ─── Memory ──────────────────────────────────────────────────────────────
export { ContextMemoryManager } from './memory/context';
export { AdaptiveProfile } from './memory/profile';

// ─── Registry ────────────────────────────────────────────────────────────
export {
  ComponentCatalog,
  type ComponentCatalogOptions,
  type ComponentCapability,
  type ComponentDefinition,
} from './registry/catalog';
export {
  SkillRegistry as WorkflowContextRegistry,
  type SkillChecklistItem as WorkflowChecklistItem,
  type SkillDefinition as WorkflowContextDefinition,
  type SkillSOP as WorkflowSOP,
} from './registry/skills';

// ─── Prompt ──────────────────────────────────────────────────────────────
export { buildSystemPrompt, buildResponseFormatBlock, buildSelectionPrompt, parseSelectionResponse } from './prompt';

export {
  agentSessionReducer,
  collectAgentSessionEvents,
  collectArtifactsFromSessionEvents,
  createAgentSessionStore,
  createInitialAgentSessionState,
  createSessionArtifact,
} from './session';
export type {
  AgentSessionController,
  AgentSessionEvent,
  AgentSessionMessage,
  AgentSessionRun,
  AgentSessionStartInput,
  AgentSessionState,
  AgentSessionStatus,
  AgentSessionStore,
  AgentSessionTransport,
  ApprovalRequestArtifact,
  ApprovalRequestArtifactPayload,
  ApprovalResultArtifact,
  ApprovalResultArtifactPayload,
  ArtifactAudience,
  ArtifactKind,
  ArtifactRegion,
  ArtifactUpsertedEvent,
  ErrorArtifact,
  ErrorArtifactPayload,
  MessageArtifact,
  MessageArtifactPayload,
  MemoryPatchArtifact,
  MemoryPatchArtifactPayload,
  PlanArtifact,
  PlanArtifactPayload,
  PlanStep,
  SessionArtifact,
  SessionArtifactBase,
  SessionCompletedEvent,
  SessionFailedEvent,
  SessionMessageRole,
  SessionStartedEvent,
  SessionStatusEvent,
  SourceBundleArtifact,
  SourceBundleArtifactPayload,
  SourceRef,
  SurfaceArtifact,
  SurfaceArtifactPayload,
  SurfaceDescriptor,
  SurfaceKind,
  TextDeltaEvent,
  ToolCallArtifact,
  ToolCallArtifactPayload,
  ToolResultArtifact,
  ToolResultArtifactPayload,
} from './session';

// ─── Logging ─────────────────────────────────────────────────────────────
export type { Logger } from './logging';
export { consoleLogger, silentLogger, getLogger, setLogger } from './logging';

// ─── Orchestrator ────────────────────────────────────────────────────────
export { DynamicOrchestrator, createOrchestrator } from './orchestrator';
export type { OrchestratorConfig } from './orchestrator';
export { applyDecodedSpec } from './specLifecycle';
export type {
  ApplySpecDependencies,
  ApplySpecOptions,
  ApplySpecResult,
} from './specLifecycle';
export { createAnyaKernel } from './kernel';
export type {
  AnyaKernel,
  AnyaKernelConfig,
  HydrationResult,
} from './kernel';

// ─── Translator ──────────────────────────────────────────────────────────
export {
  decode,
  encode,
  encodeToolResult,
  findStableSpecCandidate,
  normalizeStyleProp,
} from './translator';

// ─── Utils ───────────────────────────────────────────────────────────────
export { applyOptimisticUpdate } from './utils';
export { nextGeneratedId, resetIdGenerator, setIdGenerator } from './id';

// ─── Quality (Phase 6) ───────────────────────────────────────────────────
export {
  DEFAULT_BENCHMARK_REGRESSION_POLICY,
  DEFAULT_QUALITY_GATE_POLICY,
  evaluateBenchmarkRegression,
  evaluateQualityGates,
  summarizeBindingExecutionHistory,
  summarizeRuntimeTelemetry,
} from './quality';
export type {
  BenchmarkRegressionCheck,
  BenchmarkRegressionEvaluation,
  BenchmarkRegressionPolicy,
  BenchmarkThroughputMetrics,
  PresentationExecutionSummary,
  QualityCheckStatus,
  QualityGateCheck,
  QualityGateEvaluation,
  QualityGateInput,
  QualityGatePolicy,
  RuntimeTelemetrySummary,
} from './quality';

// ─── Spec Versioning ─────────────────────────────────────────────────────
export {
  CURRENT_UI_SPEC_VERSION,
  normalizeUISpecEnvelope,
  withSpecVersion,
} from './spec';
export {
  CURRENT_MEMORY_SNAPSHOT_VERSION,
  MemorySnapshotSchema,
  normalizeMemorySnapshot,
  parseMemorySnapshot,
  serializeMemorySnapshot,
} from './memory/snapshot';
export type { MemorySnapshot } from './memory/snapshot';

// ─── Runtime (Phase 1 Foundation) ────────────────────────────────────────
export {
  createInitialRuntimeState,
  createDefaultRuntimeEffects,
  createRuntimeEvent,
  createRuntimeStore,
  runtimeReducer,
} from './runtime';
export type {
  RuntimeEvent,
  RuntimeEventEnvelope,
  RuntimeEffect,
  RuntimeEffectContext,
  RuntimeEffectErrorHandler,
  InteractionMeasuredEvent,
  RuntimeFailureBudgetExceeded,
  RuntimeFailureBudgetOptions,
  RuntimeFailureBudgetPolicy,
  RuntimeFailureBudgetRecovered,
  RuntimeFailureBudgetSignal,
  RuntimeFailureBudgetSnapshot,
  RuntimeFailureOutcome,
  CreateDefaultRuntimeEffectsOptions,
  RuntimeEventListener,
  RuntimeEventPattern,
  RuntimeEventSource,
  IntentUpdateMode,
  RuntimeHydrationState,
  RuntimeReducer,
  RuntimeSessionState,
  RuntimeState,
  RuntimeTelemetryEvent,
  RuntimeTelemetryOptions,
  RuntimeTelemetrySink,
  RuntimeStore,
  UiPresentedEvent,
} from './runtime';
export {
  createRuntimeFailureBudgetEffect,
  createRuntimeTelemetryEffect,
} from './runtime';

// ─── Presentation (v0) ───────────────────────────────────────────────────
export {
  CURRENT_PRESENTATION_PLAN_VERSION,
  applyLocalUIUpdates,
  applyPresentationOperations,
  applyPresentationPlan,
  createPresentationEngine,
  planUIUpdate,
  BindingActionExecutor,
  DEFAULT_PROJECTION_COMPONENT_TYPES,
  executeBindingAction,
  extractBindingsFromSpec,
  planPresentation,
  buildProjectionFromContext,
  resolveBindingValue,
  setComponentProp,
  toPresentationContext,
  ToolRuntime,
} from './presentation';
export type {
  BindingAction,
  BindingActionExecutionInput,
  BindingActionHandler,
  BindingActionHandlerContext,
  BindingExecutionContext,
  BindingExecutionOutcome,
  BindingExecutionRecord,
  BindingValueExpression,
  BuildProjectionFromContextOptions,
  DataNode,
  DataNodeKind,
  ContextEnvelope,
  ProjectionComponentTypes,
  LocalPatchOperation,
  PresentationContext,
  PresentationEngine,
  PresentationPlanningPolicy,
  PresentationPlannerStrategyName,
  PresentationMode,
  PresentationOperation,
  PresentationPlan,
  PresentationPlanApplicationResult,
  PresentationPlanRequest,
  PresentationSkill,
  PresentationRequest,
  PresentationResult,
  PresentationProjection,
  PresentationState,
  ToolCallPolicy,
  ToolSchemaContract,
  ToolSchemaValidationFailure,
  ToolSchemaValidationResult,
  ToolSchemaValidationSuccess,
  ToolExecutionMode,
  ToolExecutionLane,
  ToolHandler,
  ToolManifest,
  ToolRiskLevel,
  UIBinding,
} from './presentation';

// ─── Interaction QA ─────────────────────────────────────────────────────
export { validateInteractionResolvability } from './presentation/interactionQA';
export type {
  InteractionQAFailureCode,
  InteractionQAFailure,
  InteractionQAResult,
  InteractionQAOptions,
} from './presentation/interactionQA';
export {
  enforceButtonOnClickContract,
  validateSpecForPublish,
} from './presentation/specQA';
export type {
  ButtonContractRepairResult,
  SpecQAFailure,
  SpecQAFailureCode,
  SpecQAOptions,
  SpecQAResult,
} from './presentation/specQA';

// ─── Theme ───────────────────────────────────────────────────────────────
export {
  THEME_STORAGE_KEY,
  loadThemeTokens,
  saveThemeTokens,
} from './theme';

// ─── UI Memory / Behavior ────────────────────────────────────────────────
export type {
  BehaviorAnalysisRunCapture,
  BehaviorAnalyzer,
  BehaviorAnalyzerFinding,
  BehaviorStore,
  FindingInterpreterPolicy,
  CalibrationFixture,
  CalibrationFixtureExpectation,
  CalibrationFixtureResult,
  CalibrationProfile,
  CalibrationProfileResult,
  UiBehaviorPipelineConfig,
} from './memory/ui';
export {
  InMemoryBehaviorStore,
  UiBehaviorPipeline,
  createBehaviorFinding,
  evaluateCalibrationProfile,
  integrateBehaviorFindings,
  interpretBehaviorFindings,
  rankCalibrationProfiles,
  CalibrationFixtureSchema,
  CalibrationProfileSchema,
} from './memory/ui';
