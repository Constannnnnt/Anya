/**
 * @anya-ui/react �?useAnyaUI Hook
 *
 * Primary hook for session-oriented UI generation.
 * Provides prompt helpers, typed session startup, and runtime/view control.
 *
 * Hosts can either start a typed agent session or manually decode
 * `anya.ui_spec` view payloads when needed.
 */

import { useCallback, useRef, useSyncExternalStore } from 'react';
import { useAnyaContext } from '../Provider';
export type {
  AppliedViewChangeToAppResult,
  AppliedViewChangeToTemplateResult,
  ApplyViewChangeToAppOptions,
  ApplyViewChangeToTemplateOptions,
  CompletedAgentSession,
  CreateViewChangeDraftFromRecommendationOptions,
  FinishAgentSessionOptions,
  PublishViewOptions,
  SaveSessionViewAsAppOptions,
  SaveSessionViewAsTemplateOptions,
  UseAnyaUI,
  ViewChangeDraftResult,
} from './useAnyaUI/types';
import type {
  AppliedViewChangeToAppResult,
  AppliedViewChangeToTemplateResult,
  ApplyViewChangeToAppOptions,
  ApplyViewChangeToTemplateOptions,
  CompletedAgentSession,
  CreateViewChangeDraftFromRecommendationOptions,
  FinishAgentSessionOptions,
  PublishViewOptions,
  UseAnyaUI,
  ViewChangeDraftResult,
} from './useAnyaUI/types';
import type {
  AppView,
  AgentMessage,
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
  RuntimeEvent,
  RuntimeEventListener,
  RuntimeEventPattern,
  RuntimeState,
  ResolvedView,
  SessionArtifact,
  ToolDefinition,
  ToolExecutor,
  InteractionMeasurementHint,
  ViewSpec,
  InteractionEvent,
  ViewContext,
  ViewPlan,
  ViewPolicy,
  ViewRecommendation,
  ViewRecommendationQuery,
  ViewRecommendationUpdateRequest,
  ViewState,
  ViewStrategyName,
  ViewChangeDraft,
  ViewChangePreview,
  ReviewedViewChangeDraft,
  ReviewViewChangeDraftInput,
  ViewTemplate,
  ViewOrigin,
} from '@anya-ui/core';
import {
  decode as coreDecode,
  encode as coreEncode,
  createRuntimeEvent,
  extractActionBindings as coreExtractActionBindings,
  getViewChangePreview as coreGetViewChangePreview,
  reviewViewChangeDraft as coreReviewViewChangeDraft,
} from '@anya-ui/core';
import type { AnyaComponent } from '../defineComponent';
import { createInteractionMeasurementTracker } from '../behavior/interactionTracker';
import { registerComponentRun, removeComponentRegistrationRun } from './useAnyaUI/componentActions';
import {
  handleUserInteractionRun,
  recordInteractionRun,
} from './useAnyaUI/interactionActions';
import {
  buildCurrentViewRecommendationUpdateRequestRun,
  listCurrentViewRecommendationsRun,
  runViewRecommendationUpdateRun,
} from './useAnyaUI/recommendationActions';
import {
  applyReviewedDraftToApp,
  applyReviewedDraftToTemplate,
  createDraftFromRecommendationRun,
  finishAgentSessionRun,
} from './useAnyaUI/sessionActions';
import {
  applyViewPlanRun,
  openAppViewRun,
  openViewTemplateRun,
  publishViewRun,
  saveCurrentViewAsTemplateRun,
} from './useAnyaUI/viewActions';

// ─── Hook ────────────────────────────────────────────────────────────────

/**
 * Main React integration hook.
 * Returns a stable facade for runtime orchestration, view planning,
 * bindings execution, and component/tool registration.
 */
export function useAnyaUI(): UseAnyaUI {
  const ctx = useAnyaContext();
  const measurementTrackerRef = useRef(createInteractionMeasurementTracker());
  const runtimeState = useSyncExternalStore(
    ctx.runtime.subscribe,
    ctx.runtime.getState,
    ctx.runtime.getState,
  );
  const viewState = useSyncExternalStore(
    ctx.viewEngine.subscribe,
    ctx.viewEngine.getState,
    ctx.viewEngine.getState,
  );

  const dispatchRuntimeEvent = useCallback(
    (event: RuntimeEvent) => ctx.runtime.dispatch(event),
    [ctx.runtime]
  );

  const reportDecodeFailure = useCallback(
    (error: unknown, defaultMessage: string) => {
      dispatchRuntimeEvent(createRuntimeEvent('spec.decode_failed', {
        error: error instanceof Error ? error.message : defaultMessage,
      }, { source: 'agent' }));
    },
    [dispatchRuntimeEvent]
  );

  const removeComponentRegistration = useCallback((name: string) => {
    removeComponentRegistrationRun(ctx, name);
  }, [ctx]);

  const buildSystemPrompt = useCallback(
    (opts?: PromptOptions) => {
      const mergedOpts: PromptOptions = {
        ...opts,
        includeMemory: opts?.includeMemory ?? true,
      };
      return ctx.agentBridge.buildSystemPrompt(mergedOpts);
    },
    [ctx.agentBridge]
  );

  const getPromptParts = useCallback(
    () => ctx.agentBridge.getPromptParts(),
    [ctx.agentBridge]
  );

  const buildSelectionPrompt = useCallback(
    (userMessage: string) => ctx.agentBridge.buildSelectionPrompt(userMessage),
    [ctx.agentBridge]
  );

  const setViewContext = useCallback(
    (patch: Partial<ViewContext>) => {
      ctx.viewEngine.setContext(patch);
    },
    [ctx.viewEngine]
  );

  const setViewData = useCallback(
    (nodes: StateNode[]) => setViewContext({ dataNodes: nodes }),
    [setViewContext]
  );

  const setViewTools = useCallback(
    (tools: ToolDefinition[]) => setViewContext({ tools }),
    [setViewContext]
  );

  const setViewCandidate = useCallback(
    (input: { spec: ViewSpec | null; bindings?: ActionBinding[] }) =>
      setViewContext({
        candidateSpec: input.spec,
        candidateBindings: input.bindings ?? [],
      }),
    [setViewContext]
  );

  const setWorkflowContext = useCallback(
    (workflowName?: string) => setViewContext({ workflowContext: workflowName }),
    [setViewContext]
  );

  const decode = useCallback(
    (raw: string) => {
      try {
        return coreDecode(raw, ctx.catalog);
      } catch (error) {
        reportDecodeFailure(error, 'Unknown decode error');
        throw error;
      }
    },
    [ctx.catalog, reportDecodeFailure]
  );

  const encodeInteraction = useCallback(
    (interaction: InteractionEvent) => coreEncode(interaction, ctx.sessionMemory),
    [ctx.sessionMemory]
  );

  const registerComponent = useCallback(
    (component: AnyaComponent) =>
      registerComponentRun(ctx, component, removeComponentRegistration),
    [ctx, removeComponentRegistration]
  );

  const unregisterComponent = useCallback(
    (name: string) => removeComponentRegistration(name),
    [removeComponentRegistration]
  );

  const registerAppView = useCallback(
    (view: AppView) => {
      ctx.viewRegistry.registerAppView(view);
      return () => {
        ctx.viewRegistry.unregisterAppView(view.id);
      };
    },
    [ctx.viewRegistry]
  );

  const registerViewTemplate = useCallback(
    (template: ViewTemplate) => {
      ctx.viewRegistry.registerTemplate(template);
      return () => {
        ctx.viewRegistry.unregisterTemplate(template.id);
      };
    },
    [ctx.viewRegistry]
  );

  const listAppViews = useCallback(
    () => ctx.viewRegistry.listAppViews(),
    [ctx.viewRegistry]
  );

  const listViewTemplates = useCallback(
    () => ctx.viewRegistry.listTemplates(),
    [ctx.viewRegistry]
  );

  const publishView = useCallback(
    (
      spec: ViewSpec,
      input?: PublishViewOptions | 'agent' | 'system',
    ) => publishViewRun(ctx, dispatchRuntimeEvent, spec, input),
    [ctx, dispatchRuntimeEvent]
  );

  const openAppView = useCallback(
    (viewId: string) => openAppViewRun(ctx, publishView, viewId),
    [ctx.viewRegistry, publishView]
  );

  const openViewTemplate = useCallback(
    (
      templateId: string,
      input?: Omit<PublishViewOptions, 'bindings' | 'templateId'>,
    ) => openViewTemplateRun(ctx, publishView, templateId, input),
    [ctx.viewRegistry, publishView]
  );

  const saveCurrentViewAsTemplate = useCallback(
    (input: {
      id: string;
      title: string;
      description?: string;
      workflow?: string;
      tags?: string[];
      metadata?: Record<string, unknown>;
    }) => saveCurrentViewAsTemplateRun(ctx, input),
    [ctx]
  );

  const listViewRecommendations = useCallback(
    async (query?: ViewRecommendationQuery): Promise<ViewRecommendation[]> =>
      ctx.viewRecommendations?.list(query) ?? [],
    [ctx.viewRecommendations]
  );

  const listCurrentViewRecommendations = useCallback(
    async (
      query?: Omit<ViewRecommendationQuery, 'view'>,
    ): Promise<ViewRecommendation[]> =>
      listCurrentViewRecommendationsRun(ctx, query),
    [ctx]
  );

  const buildCurrentViewRecommendationUpdateRequest = useCallback(
    (
      recommendation: ViewRecommendation,
      options?: Omit<BuildViewRecommendationUpdateRequestInput, 'recommendation' | 'view'>,
    ): ViewRecommendationUpdateRequest =>
      buildCurrentViewRecommendationUpdateRequestRun(ctx, recommendation, options),
    [ctx]
  );

  const planView = useCallback(
    (input?: {
      newUserContext?: string;
      workflowContext?: string;
      requestedMode?: 'patch' | 'rebuild';
      plannerStrategy?: ViewStrategyName;
      planningPolicy?: ViewPolicy;
      candidateSpec?: ViewSpec | null;
      candidateBindings?: ActionBinding[];
    }) => ctx.viewEngine.plan(input),
    [ctx.viewEngine]
  );

  const applyViewPlan = useCallback(
    (plan: ViewPlan) => applyViewPlanRun(ctx, publishView, plan),
    [ctx, publishView]
  );

  const extractActionBindings = useCallback(
    (spec: ViewSpec) => coreExtractActionBindings(spec),
    []
  );

  const registerTool = useCallback(
    (tool: ToolDefinition, handler?: ToolExecutor) => ctx.viewEngine.registerTool(tool, handler),
    [ctx.viewEngine]
  );

  const registerToolHandler = useCallback(
    (toolId: string, handler: ToolExecutor) =>
      ctx.viewEngine.registerToolHandler(toolId, handler),
    [ctx.viewEngine]
  );

  const registerActionHandler = useCallback(
    <TType extends ActionCommand['type']>(
      type: TType,
      handler: ActionCommandHandler<Extract<ActionCommand, { type: TType }>>
    ) => ctx.viewEngine.registerBindingActionHandler(type, handler),
    [ctx.viewEngine]
  );

  const executeViewInteraction = useCallback(
    (interaction: InteractionEvent) => ctx.viewEngine.executeInteraction(interaction),
    [ctx.viewEngine]
  );

  const recordInteraction = useCallback(
    (
      interaction: InteractionEvent,
      measurementHint?: InteractionMeasurementHint,
    ) =>
      recordInteractionRun(
        ctx,
        dispatchRuntimeEvent,
        measurementTrackerRef.current,
        interaction,
        measurementHint,
      ),
    [ctx, dispatchRuntimeEvent]
  );

  const handleUserInteraction = useCallback(
    async (
      interaction: InteractionEvent,
      measurementHint?: InteractionMeasurementHint,
    ) =>
      handleUserInteractionRun(
        ctx,
        dispatchRuntimeEvent,
        publishView,
        recordInteraction,
        interaction,
        measurementHint,
      ),
    [ctx, ctx.viewEngine, dispatchRuntimeEvent, publishView, recordInteraction]
  );

  const setUserIntent = useCallback(
    (intent: string, mode?: IntentUpdateMode) => {
      if (mode === 'replace') {
        measurementTrackerRef.current.reset();
      }
      dispatchRuntimeEvent(createRuntimeEvent('session.intent_updated', {
        userIntent: intent,
        mode,
      }, { source: 'user' }));
    },
    [dispatchRuntimeEvent]
  );

  const setAgentStatus = useCallback(
    (status: AgentState) => {
      dispatchRuntimeEvent(createRuntimeEvent('session.status_set', {
        status,
      }, { source: 'system' }));
    },
    [dispatchRuntimeEvent]
  );

  const subscribeRuntimeEvents = useCallback(
    (pattern: RuntimeEventPattern, listener: RuntimeEventListener) =>
      ctx.runtime.subscribeEvent(pattern, listener),
    [ctx.runtime]
  );

  const startAgentSession = useCallback((input: {
    sessionId?: string;
    userIntent: string;
    messages: AgentMessage[];
    promptOptions?: PromptOptions;
    transport?: AgentSessionTransport;
    currentArtifacts?: SessionArtifact[];
    currentViewId?: string;
  }) => ctx.agentBridge.startAgentSession(input), [ctx.agentBridge]);

  const finishAgentSession = useCallback(
    async (
      run: AgentSessionRun,
      options?: FinishAgentSessionOptions,
    ): Promise<CompletedAgentSession> =>
      finishAgentSessionRun(ctx, run, publishView, options),
    [ctx, publishView]
  );

  const runAgentSession = useCallback(
    async (
      input: {
        sessionId?: string;
        userIntent: string;
        messages: AgentMessage[];
        promptOptions?: PromptOptions;
        transport?: AgentSessionTransport;
        currentArtifacts?: SessionArtifact[];
        currentViewId?: string;
      } & FinishAgentSessionOptions,
    ): Promise<CompletedAgentSession> => {
      const run = await startAgentSession(input);
      return finishAgentSession(run, {
        openPrimaryView: input.openPrimaryView,
        savePrimaryViewAsApp: input.savePrimaryViewAsApp,
        savePrimaryViewAsTemplate: input.savePrimaryViewAsTemplate,
      });
    },
    [finishAgentSession, startAgentSession]
  );

  const runViewRecommendationUpdate = useCallback(
    async (
      recommendation: ViewRecommendation,
      options?: {
        sessionId?: string;
        transport?: AgentSessionTransport;
      } & Omit<BuildViewRecommendationUpdateRequestInput, 'recommendation' | 'view'>
        & FinishAgentSessionOptions,
    ): Promise<CompletedAgentSession> =>
      runViewRecommendationUpdateRun(
        recommendation,
        options,
        buildCurrentViewRecommendationUpdateRequest,
        runAgentSession,
      ),
    [buildCurrentViewRecommendationUpdateRequest, runAgentSession]
  );

  const getViewChangePreview = useCallback(
    (draft: AnyViewChangeDraft): ViewChangePreview => coreGetViewChangePreview(draft),
    [],
  );

  const createViewChangeDraft = useCallback(
    async (
      recommendation: ViewRecommendation,
      options?: CreateViewChangeDraftFromRecommendationOptions,
    ): Promise<ViewChangeDraftResult> =>
      createDraftFromRecommendationRun(
        ctx,
        recommendation,
        options,
        buildCurrentViewRecommendationUpdateRequest,
        runAgentSession,
      ),
    [buildCurrentViewRecommendationUpdateRequest, ctx, runAgentSession],
  );

  const reviewViewChangeDraft = useCallback(
    (
      draft: ViewChangeDraft,
      input: ReviewViewChangeDraftInput,
    ): ReviewedViewChangeDraft => coreReviewViewChangeDraft(draft, input),
    [],
  );

  const applyViewChangeToApp = useCallback(
    (
      draft: ReviewedViewChangeDraft,
      options?: ApplyViewChangeToAppOptions,
    ): AppliedViewChangeToAppResult =>
      applyReviewedDraftToApp(ctx, draft, options, openAppView),
    [ctx.viewRegistry, openAppView],
  );

  const applyViewChangeToTemplate = useCallback(
    (
      draft: ReviewedViewChangeDraft,
      options?: ApplyViewChangeToTemplateOptions,
    ): AppliedViewChangeToTemplateResult =>
      applyReviewedDraftToTemplate(ctx, draft, options, openViewTemplate),
    [ctx.viewRegistry, openViewTemplate],
  );

  const getProfile = useCallback(
    () => ctx.userProfile.getContent(),
    [ctx.userProfile]
  );

  const getActionBindings = useCallback(
    () => ctx.viewEngine.getState().bindings,
    [ctx.viewEngine]
  );

  return {
    buildSystemPrompt,
    buildSelectionPrompt,
    getPromptParts,
    viewState,
    setViewContext,
    setViewData,
    setViewTools,
    setViewCandidate,
    setWorkflowContext,
    planView,
    applyViewPlan,
    extractActionBindings,
    registerTool,
    registerToolHandler,
    registerActionHandler,
    executeViewInteraction,
    handleUserInteraction,
    getActionBindings,
    decode,
    encodeInteraction,
    publishView,
    registerAppView,
    registerViewTemplate,
    listAppViews,
    listViewTemplates,
    openAppView,
    openViewTemplate,
    saveCurrentViewAsTemplate,
    listViewRecommendations,
    listCurrentViewRecommendations,
    buildViewRecommendationUpdateRequest: buildCurrentViewRecommendationUpdateRequest,
    runViewRecommendationUpdate,
    createViewChangeDraft,
    reviewViewChangeDraft,
    applyViewChangeToApp,
    applyViewChangeToTemplate,
    getViewChangePreview,
    recordInteraction,
    setUserIntent,
    setAgentStatus,
    dispatchRuntimeEvent,
    subscribeRuntimeEvents,
    startAgentSession,
    finishAgentSession,
    runAgentSession,
    runtimeState,
    getProfile,
    registerComponent,
    unregisterComponent,
    context: ctx,
  };
}


