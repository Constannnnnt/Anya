import type { AnyaContextValue } from '../../Provider';
import type { AnyaComponent } from '../../defineComponent';
import type {
  AppView,
  AgentMessage,
  AgentSessionEvent,
  AgentSessionRun,
  AgentSessionTransport,
  AgentState,
  ActionBinding,
  ActionCommand,
  ActionCommandHandler,
  ActionResult,
  AnyViewChangeDraft,
  ApplyViewPlanResult,
  BuildViewRecommendationUpdateRequestInput,
  StateNode,
  IntentUpdateMode,
  PromptOptions,
  PromptParts,
  ResolvedView,
  RuntimeEvent,
  RuntimeEventListener,
  RuntimeEventPattern,
  RuntimeState,
  SessionArtifact,
  ToolDefinition,
  ToolExecutor,
  InteractionMeasurementHint,
  ViewSpec,
  InteractionEvent,
  ViewArtifact,
  ViewChangeAuditRecord,
  ViewChangeDraft,
  ViewChangePreview,
  ViewContext,
  ViewOrigin,
  ViewPlan,
  ViewPolicy,
  ViewRecommendation,
  ViewRecommendationQuery,
  ViewRecommendationUpdateRequest,
  ViewState,
  ViewStrategyName,
  ReviewedViewChangeDraft,
  ReviewViewChangeDraftInput,
  ViewTemplate,
} from '@anya-ui/core';

export interface PublishViewOptions {
  source?: 'agent' | 'system';
  kind?: ViewOrigin;
  id?: string;
  title?: string;
  templateId?: string;
  workflow?: string;
  bindings?: ActionBinding[];
}

export interface SaveSessionViewAsAppOptions {
  id?: string;
  title?: string;
  description?: string;
  workflow?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface SaveSessionViewAsTemplateOptions {
  id: string;
  title: string;
  description?: string;
  workflow?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface FinishAgentSessionOptions {
  openPrimaryView?: boolean | Omit<PublishViewOptions, 'bindings'>;
  savePrimaryViewAsApp?: SaveSessionViewAsAppOptions;
  savePrimaryViewAsTemplate?: SaveSessionViewAsTemplateOptions;
}

export interface CompletedAgentSession {
  run: AgentSessionRun;
  events: AgentSessionEvent[];
  artifacts: SessionArtifact[];
  primaryViewArtifact?: ViewArtifact;
  primaryViewSpec?: ViewSpec;
  appView?: AppView;
  viewTemplate?: ViewTemplate;
}

export interface CreateViewChangeDraftFromRecommendationOptions
  extends Omit<BuildViewRecommendationUpdateRequestInput, 'recommendation' | 'view'> {
  sessionId?: string;
  transport?: AgentSessionTransport;
}

export interface ViewChangeDraftResult {
  draft: ViewChangeDraft;
  preview: ViewChangePreview;
  session: CompletedAgentSession;
}

export interface ApplyViewChangeToAppOptions {
  id?: string;
  title?: string;
  description?: string;
  workflow?: string;
  templateId?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  openAfterApply?: boolean;
}

export interface ApplyViewChangeToTemplateOptions {
  id?: string;
  title?: string;
  description?: string;
  workflow?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  openAfterApply?: boolean;
  openView?: Omit<PublishViewOptions, 'bindings' | 'templateId'>;
}

export interface AppliedViewChangeToAppResult {
  reviewedDraft: ReviewedViewChangeDraft;
  audit: ViewChangeAuditRecord;
  appView: AppView;
  openedView?: AppView;
}

export interface AppliedViewChangeToTemplateResult {
  reviewedDraft: ReviewedViewChangeDraft;
  audit: ViewChangeAuditRecord;
  viewTemplate: ViewTemplate;
  openedView?: ResolvedView;
}

export interface UseAnyaUI {
  buildSystemPrompt: (opts?: PromptOptions) => string;
  buildSelectionPrompt: (userMessage: string) => string;
  getPromptParts: () => PromptParts;
  decode: (raw: string) => ViewSpec;
  encodeInteraction: (interaction: InteractionEvent) => string;
  publishView: (
    spec: ViewSpec,
    input?: PublishViewOptions | 'agent' | 'system',
  ) => void;
  registerAppView: (view: AppView) => () => void;
  registerViewTemplate: (template: ViewTemplate) => () => void;
  listAppViews: () => AppView[];
  listViewTemplates: () => ViewTemplate[];
  openAppView: (viewId: string) => AppView | undefined;
  openViewTemplate: (
    templateId: string,
    input?: Omit<PublishViewOptions, 'bindings' | 'templateId'>,
  ) => ResolvedView | undefined;
  saveCurrentViewAsTemplate: (input: {
    id: string;
    title: string;
    description?: string;
    workflow?: string;
    tags?: string[];
    metadata?: Record<string, unknown>;
  }) => ViewTemplate;
  listViewRecommendations: (query?: ViewRecommendationQuery) => Promise<ViewRecommendation[]>;
  listCurrentViewRecommendations: (
    query?: Omit<ViewRecommendationQuery, 'view'>,
  ) => Promise<ViewRecommendation[]>;
  buildViewRecommendationUpdateRequest: (
    recommendation: ViewRecommendation,
    options?: Omit<BuildViewRecommendationUpdateRequestInput, 'recommendation' | 'view'>,
  ) => ViewRecommendationUpdateRequest;
  runViewRecommendationUpdate: (
    recommendation: ViewRecommendation,
    options?: {
      sessionId?: string;
      transport?: AgentSessionTransport;
    } & Omit<BuildViewRecommendationUpdateRequestInput, 'recommendation' | 'view'>
      & FinishAgentSessionOptions,
  ) => Promise<CompletedAgentSession>;
  createViewChangeDraft: (
    recommendation: ViewRecommendation,
    options?: CreateViewChangeDraftFromRecommendationOptions,
  ) => Promise<ViewChangeDraftResult>;
  reviewViewChangeDraft: (
    draft: ViewChangeDraft,
    input: ReviewViewChangeDraftInput,
  ) => ReviewedViewChangeDraft;
  applyViewChangeToApp: (
    draft: ReviewedViewChangeDraft,
    options?: ApplyViewChangeToAppOptions,
  ) => AppliedViewChangeToAppResult;
  applyViewChangeToTemplate: (
    draft: ReviewedViewChangeDraft,
    options?: ApplyViewChangeToTemplateOptions,
  ) => AppliedViewChangeToTemplateResult;
  getViewChangePreview: (draft: AnyViewChangeDraft) => ViewChangePreview;
  recordInteraction: (
    interaction: InteractionEvent,
    measurementHint?: InteractionMeasurementHint,
  ) => void;
  setUserIntent: (intent: string, mode?: IntentUpdateMode) => void;
  setAgentStatus: (status: AgentState) => void;
  dispatchRuntimeEvent: (event: RuntimeEvent) => RuntimeState;
  subscribeRuntimeEvents: (
    pattern: RuntimeEventPattern,
    listener: RuntimeEventListener,
  ) => () => void;
  viewState: ViewState;
  setViewContext: (patch: Partial<ViewContext>) => void;
  setViewData: (nodes: StateNode[]) => void;
  setViewTools: (tools: ToolDefinition[]) => void;
  setViewCandidate: (input: { spec: ViewSpec | null; bindings?: ActionBinding[] }) => void;
  setWorkflowContext: (workflowName?: string) => void;
  planView: (input?: {
    newUserContext?: string;
    workflowContext?: string;
    requestedMode?: 'patch' | 'rebuild';
    plannerStrategy?: ViewStrategyName;
    planningPolicy?: ViewPolicy;
    candidateSpec?: ViewSpec | null;
    candidateBindings?: ActionBinding[];
  }) => ViewPlan;
  applyViewPlan: (plan: ViewPlan) => ApplyViewPlanResult;
  extractActionBindings: (spec: ViewSpec) => ViewPlan;
  registerTool: (tool: ToolDefinition, handler?: ToolExecutor) => () => void;
  registerToolHandler: (toolId: string, handler: ToolExecutor) => () => void;
  registerActionHandler: <TType extends ActionCommand['type']>(
    type: TType,
    handler: ActionCommandHandler<Extract<ActionCommand, { type: TType }>>
  ) => () => void;
  executeViewInteraction: (interaction: InteractionEvent) => Promise<ActionResult[]>;
  handleUserInteraction: (
    interaction: InteractionEvent,
    measurementHint?: InteractionMeasurementHint,
  ) => Promise<ActionResult[]>;
  getActionBindings: () => ActionBinding[];
  startAgentSession: (input: {
    sessionId?: string;
    userIntent: string;
    messages: AgentMessage[];
    promptOptions?: PromptOptions;
    transport?: AgentSessionTransport;
    currentArtifacts?: SessionArtifact[];
    currentViewId?: string;
  }) => Promise<AgentSessionRun>;
  finishAgentSession: (
    run: AgentSessionRun,
    options?: FinishAgentSessionOptions,
  ) => Promise<CompletedAgentSession>;
  runAgentSession: (
    input: {
      sessionId?: string;
      userIntent: string;
      messages: AgentMessage[];
      promptOptions?: PromptOptions;
      transport?: AgentSessionTransport;
      currentArtifacts?: SessionArtifact[];
      currentViewId?: string;
    } & FinishAgentSessionOptions,
  ) => Promise<CompletedAgentSession>;
  runtimeState: RuntimeState;
  getProfile: () => string;
  registerComponent: (component: AnyaComponent) => () => void;
  unregisterComponent: (name: string) => void;
  context: AnyaContextValue;
}

