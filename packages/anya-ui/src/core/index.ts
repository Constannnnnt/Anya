/**
 * ../core — Public API
 *
 * Barrel exports. Every module has a single responsibility.
 */

// ─── Types ───────────────────────────────────────────────────────────────
export type {
  InteractionModality,
  InteractionAction,
  InteractionTrigger,
  UIInteractionMeasurement as InteractionMeasurement,
  UIInteractionMeasurementHint as InteractionMeasurementHint,
  UIInteractionRecord as InteractionEvent,
  UIPresentedView as PresentedView,
  ViewMetadata,
  ViewOrigin,
  ActiveContext,
  ElementHistory,
  ReasoningTrace,
  ViewSpec as ViewSpec,
  ViewNode as ViewNode,
  UIBindTarget as ViewBindingTarget,
  UIInteractionDefinition as InteractionSpec,
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

// ─── Shared State ────────────────────────────────────────────────────────
export type { StateGraph, StateMutationOptions } from './state';

// ─── Memory ──────────────────────────────────────────────────────────────
export {
  ContextMemoryManager as SessionMemory,
} from './memory/context';
export {
  AdaptiveProfile as UserProfile,
} from './memory/profile';
export type {
  BehaviorAnalysisRunCapture,
} from './memory/ui/behavior';

// ─── Registry ────────────────────────────────────────────────────────────
export {
  NodeCatalog,
  type NodeCatalogOptions,
  type NodeCapability,
  type NodeDefinition,
} from './registry/catalog';
export {
  SkillRegistry as WorkflowRegistry,
  type SkillChecklistItem as WorkflowChecklistItem,
  type SkillDefinition as WorkflowDefinition,
  type SkillSOP as WorkflowSOP,
} from './registry/skills';

// ─── Prompt ──────────────────────────────────────────────────────────────
export { buildSystemPrompt, buildResponseFormatBlock, buildSelectionPrompt, parseSelectionResponse } from './prompt';

export {
  agentSessionReducer,
  collectAgentSessionState,
  collectAgentSessionEvents,
  collectArtifactsFromSessionEvents,
  getViewBindings,
  createAgentSessionStore,
  createInitialAgentSessionState,
  createSessionArtifact,
  getViewDescriptor,
  getViewSpec,
  isViewArtifact,
  resolvePrimaryViewArtifact,
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
  CanonicalViewArtifact,
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
  ViewArtifact,
  ViewArtifactPayload,
  ViewDescriptor,
  ViewFormat,
  TextDeltaEvent,
  ToolCallArtifact,
  ToolCallArtifactPayload,
  ToolResultArtifact,
  ToolResultArtifactPayload,
} from './session';

// ─── View Recommendations ───────────────────────────────────────────────
export {
  buildViewRecommendationUpdateRequest,
  ViewRecommendationEngine,
} from './viewRecommendations';
export type {
  BuildViewRecommendationUpdateRequestInput,
  ViewRecommendation,
  ViewRecommendationEngineConfig,
  ViewRecommendationQuery,
  ViewRecommendationRanking,
  ViewRecommendationTarget,
  ViewRecommendationUpdateRequest,
} from './viewRecommendations';

// ─── View Changes ───────────────────────────────────────────────────────
export {
  buildViewChangeAuditRecord,
  createAppViewFromDraft,
  createTemplateFromDraft,
  createViewChangeDraft,
  getViewChangePreview,
  reviewViewChangeDraft,
} from './viewChanges';
export type {
  AnyViewChangeDraft,
  CreateAppViewFromDraftInput,
  CreateTemplateFromDraftInput,
  CreateViewChangeDraftInput,
  ReviewViewChangeDraftInput,
  ReviewedViewChangeDraft,
  ViewChangeAuditRecord,
  ViewChangeDraft,
  ViewChangeDraftSource,
  ViewChangeImpact,
  ViewChangePreview,
  ViewChangeReview,
  ViewChangeSnapshot,
} from './viewChanges';

// ─── Logging ─────────────────────────────────────────────────────────────
export type { Logger } from './logging';
export { 
  consoleLogger, 
  silentLogger, 
  getLogger, 
  setLogger,
  LogLevel,
  setLogLevel
} from './logging';

// ─── Orchestrator ────────────────────────────────────────────────────────
export {
  DynamicOrchestrator as AgentBridge,
  createOrchestrator as createAgentBridge,
} from './orchestrator';
export type { OrchestratorConfig as AgentBridgeConfig } from './orchestrator';
export { createAnyaRuntime } from './kernel';
export type {
  AnyaRuntime,
  AnyaRuntimeConfig,
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
  CreateDefaultRuntimeEffectsOptions,
  RuntimeEventListener,
  RuntimeEventPattern,
  RuntimeEventSource,
  IntentUpdateMode,
  RuntimeHydrationState,
  RuntimeReducer,
  RuntimeSessionState,
  RuntimeState,
  RuntimeStore,
  UiPresentedEvent,
} from './runtime';

// ─── Views ───────────────────────────────────────────────────────────────
export {
  CURRENT_VIEW_PLAN_VERSION,
  applyLocalViewChanges,
  applyViewChanges,
  applyViewPlan,
  createViewEngine,
  planView,
  buildViewFromState,
  extractActionBindings,
  planViewFromContext,
  toViewContext,
  ToolRunner,
  ActionCommandRunner,
  runActionCommand,
  resolveBindingValue,
  ViewRegistry,
  toViewMetadata,
} from './views';
export type {
  ActionCommand,
  ActionCommandHandler,
  ActionCommandHandlerContext,
  ActionCommandInput,
  ActionExecutionContext,
  ActionExecutionOutcome,
  ActionResult,
  ValueExpression,
  StateNode,
  StateNodeKind,
  ViewNodeSlots,
  LocalViewChange,
  ViewInputs,
  StateContext,
  AppView,
  CreateViewFromTemplateOptions,
  PromoteViewToTemplateInput,
  ResolvedView,
  ViewDraft,
  ViewTemplate,
  ViewRecipe,
  ViewPolicy,
  ViewStrategyName,
  ViewContext,
  ViewEngine,
  ViewChange,
  ViewPlan,
  ApplyViewPlanResult,
  ViewPlanRequest,
  ViewState,
  ViewRequest,
  ViewResult,
  ToolPolicy,
  ToolContract,
  ToolContractFailure,
  ToolContractResult,
  ToolContractSuccess,
  ToolMode,
  ToolLane,
  ToolDefinition,
  ToolExecutor,
  ToolRisk,
  ActionBinding,
} from './views';



// ─── Theme ───────────────────────────────────────────────────────────────
export {
  THEME_STORAGE_KEY,
  loadThemeTokens,
  saveThemeTokens,
} from './theme';

// ─── Internal ────────────────────────────────────────────────────────────
export * from './internal';
