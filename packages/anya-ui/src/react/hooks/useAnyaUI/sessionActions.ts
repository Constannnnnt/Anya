import type { AnyaContextValue } from '../../Provider';
import {
  buildViewChangeAuditRecord as coreBuildViewChangeAuditRecord,
  collectAgentSessionEvents,
  collectArtifactsFromSessionEvents,
  createAppViewFromDraft as coreCreateAppViewFromDraft,
  createTemplateFromDraft as coreCreateTemplateFromDraft,
  createViewChangeDraft as coreCreateViewChangeDraft,
  getViewChangePreview as coreGetViewChangePreview,
  resolvePrimaryViewArtifact,
} from '../../../core';
import type {
  ViewRecommendation,
  BuildViewRecommendationUpdateRequestInput,
  ViewRecommendationUpdateRequest,
  ReviewedViewChangeDraft,
} from '../../../core';
import type {
  AppliedViewChangeToAppResult,
  AppliedViewChangeToTemplateResult,
  ApplyViewChangeToAppOptions,
  ApplyViewChangeToTemplateOptions,
  CompletedAgentSession,
  CreateViewChangeDraftFromRecommendationOptions,
  FinishAgentSessionOptions,
  PublishViewOptions,
  ViewChangeDraftResult,
} from './types';
import {
  buildPublishOptionsFromSessionArtifact,
  getCurrentViewMetadata,
  getSessionArtifactViewData,
  mergeSessionArtifactMetadata,
} from './helpers';

export async function finishAgentSessionRun(
  ctx: AnyaContextValue,
  run: import('../../../core').AgentSessionRun,
  publishView: (
    spec: import('../../../core').ViewSpec,
    input?: PublishViewOptions | 'agent' | 'system',
  ) => void,
  options?: FinishAgentSessionOptions,
): Promise<CompletedAgentSession> {
  const events = await collectAgentSessionEvents(run);
  const artifacts = collectArtifactsFromSessionEvents(events);
  const primaryViewArtifact = resolvePrimaryViewArtifact(events);
  const primaryView = getSessionArtifactViewData(primaryViewArtifact);

  if (primaryView && options?.openPrimaryView !== false) {
    publishView(
      primaryView.spec,
      buildPublishOptionsFromSessionArtifact(
        primaryView,
        options?.openPrimaryView === true ? undefined : options?.openPrimaryView,
      ),
    );
  }

  let appView: import('../../../core').AppView | undefined;
  if (primaryView && options?.savePrimaryViewAsApp) {
    appView = {
      id: options.savePrimaryViewAsApp.id ?? primaryView.descriptor.id,
      title:
        options.savePrimaryViewAsApp.title
        ?? primaryView.descriptor.title
        ?? primaryView.artifact.title
        ?? primaryView.descriptor.id,
      description: options.savePrimaryViewAsApp.description,
      workflow:
        options.savePrimaryViewAsApp.workflow
        ?? primaryView.descriptor.workflow
        ?? primaryView.spec.skill,
      spec: primaryView.spec,
      bindings: primaryView.bindings,
      tags: options.savePrimaryViewAsApp.tags,
      metadata: mergeSessionArtifactMetadata(
        primaryView.artifact,
        options.savePrimaryViewAsApp.metadata,
      ),
    };
    ctx.viewRegistry.registerAppView(appView);
  }

  let viewTemplate: import('../../../core').ViewTemplate | undefined;
  if (primaryView && options?.savePrimaryViewAsTemplate) {
    viewTemplate = ctx.viewRegistry.promoteViewToTemplate({
      id: options.savePrimaryViewAsTemplate.id,
      title: options.savePrimaryViewAsTemplate.title,
      description: options.savePrimaryViewAsTemplate.description,
      workflow:
        options.savePrimaryViewAsTemplate.workflow
        ?? primaryView.descriptor.workflow
        ?? primaryView.spec.skill,
      sourceViewId: primaryView.descriptor.id,
      tags: options.savePrimaryViewAsTemplate.tags,
      metadata: mergeSessionArtifactMetadata(
        primaryView.artifact,
        options.savePrimaryViewAsTemplate.metadata,
      ),
      spec: primaryView.spec,
      bindings: primaryView.bindings,
    });
  }

  return {
    run,
    events,
    artifacts,
    primaryViewArtifact,
    primaryViewSpec: primaryView?.spec,
    appView,
    viewTemplate,
  };
}

export async function createDraftFromRecommendationRun(
  ctx: AnyaContextValue,
  recommendation: ViewRecommendation,
  options: CreateViewChangeDraftFromRecommendationOptions | undefined,
  buildRequest: (
    recommendation: ViewRecommendation,
    options?: Omit<BuildViewRecommendationUpdateRequestInput, 'recommendation' | 'view'>,
  ) => ViewRecommendationUpdateRequest,
  runAgentSession: (input: {
    sessionId?: string;
    userIntent: string;
    messages: import('../../../core').AgentMessage[];
    promptOptions?: import('../../../core').PromptOptions;
    transport?: import('../../../core').AgentSessionTransport;
    currentArtifacts?: import('../../../core').SessionArtifact[];
    currentViewId?: string;
  } & FinishAgentSessionOptions) => Promise<CompletedAgentSession>,
): Promise<ViewChangeDraftResult> {
  const currentState = ctx.viewEngine.getState();
  if (!currentState.currentSpec) {
    throw new Error('Cannot create a view change draft before a view is active.');
  }

  const request = buildRequest(recommendation, options);
  const session = await runAgentSession({
    sessionId: options?.sessionId,
    transport: options?.transport,
    userIntent: request.userIntent,
    messages: [request.message],
    promptOptions: request.promptOptions,
    currentViewId: request.currentViewId,
    openPrimaryView: false,
  });

  const primaryView = getSessionArtifactViewData(session.primaryViewArtifact);
  if (!primaryView) {
    throw new Error('Expected the recommendation revision session to return a primary view artifact.');
  }

  const draft = coreCreateViewChangeDraft({
    recommendation,
    currentView: getCurrentViewMetadata(ctx),
    currentSpec: currentState.currentSpec,
    currentBindings: currentState.bindings,
    proposedView: {
      id: primaryView.descriptor.id,
      kind: primaryView.descriptor.kind ?? 'generated',
      title: primaryView.descriptor.title ?? primaryView.artifact.title,
      templateId: primaryView.descriptor.templateId,
      workflow: primaryView.descriptor.workflow ?? primaryView.spec.skill,
    },
    proposedSpec: primaryView.spec,
    proposedBindings: primaryView.bindings,
    sessionId: session.run.sessionId,
    artifactId: primaryView.artifact.id,
  });

  return {
    draft,
    preview: coreGetViewChangePreview(draft),
    session,
  };
}

export function applyReviewedDraftToApp(
  ctx: AnyaContextValue,
  draft: ReviewedViewChangeDraft,
  options: ApplyViewChangeToAppOptions | undefined,
  openAppView: (viewId: string) => import('../../../core').AppView | undefined,
): AppliedViewChangeToAppResult {
  const appView = coreCreateAppViewFromDraft(draft, options);
  ctx.viewRegistry.registerAppView(appView);

  const openedView = options?.openAfterApply
    ? openAppView(appView.id)
    : undefined;

  return {
    reviewedDraft: draft,
    audit: coreBuildViewChangeAuditRecord(draft),
    appView,
    openedView,
  };
}

export function applyReviewedDraftToTemplate(
  ctx: AnyaContextValue,
  draft: ReviewedViewChangeDraft,
  options: ApplyViewChangeToTemplateOptions | undefined,
  openViewTemplate: (
    templateId: string,
    input?: Omit<PublishViewOptions, 'bindings' | 'templateId'>,
  ) => import('../../../core').ResolvedView | undefined,
): AppliedViewChangeToTemplateResult {
  const templateInput = coreCreateTemplateFromDraft(draft, options);
  const viewTemplate = ctx.viewRegistry.promoteViewToTemplate(templateInput);

  const openedView = options?.openAfterApply
    ? openViewTemplate(viewTemplate.id, options.openView)
    : undefined;

  return {
    reviewedDraft: draft,
    audit: coreBuildViewChangeAuditRecord(draft),
    viewTemplate,
    openedView,
  };
}

