/**
 * @anya-ui/core — Public API
 *
 * Barrel exports. Every module has a single responsibility.
 */

// ─── Types ───────────────────────────────────────────────────────────────
export type {
  InteractionAction,
  InteractionTrigger,
  UIInteractionRecord,
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

// ─── UI Memory Pipeline ──────────────────────────────────────────────────
export * from './memory/ui';

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
export { buildSystemPrompt, buildResponseFormatBlock } from './prompt';

// ─── Transport ───────────────────────────────────────────────────────────
export type {
  ModelTransport,
  ModelTransportRequest,
  ModelTransportResponse,
} from './transport';

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
export { decode, encode, encodeToolResult, normalizeStyleProp } from './translator';

// ─── Utils ───────────────────────────────────────────────────────────────
export { applyOptimisticUpdate } from './utils';

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
  executeBindingAction,
  extractBindingsFromSpec,
  planPresentation,
  buildUIFromData,
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
  BuildUIFromDataOptions,
  DataNode,
  DataNodeKind,
  ContextEnvelope,
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
