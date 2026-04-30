import { buildViewRecommendationUpdateRequest } from '@anya-ui/core';
import type {
  BuildViewRecommendationUpdateRequestInput,
  ViewRecommendation,
  ViewRecommendationQuery,
  ViewRecommendationUpdateRequest,
  AgentSessionTransport,
} from '@anya-ui/core';
import type { AnyaContextValue } from '../../Provider';
import { getCurrentViewMetadata } from './helpers';
import type { CompletedAgentSession, FinishAgentSessionOptions } from './types';

export async function listCurrentViewRecommendationsRun(
  ctx: AnyaContextValue,
  query?: Omit<ViewRecommendationQuery, 'view'>,
): Promise<ViewRecommendation[]> {
  return (
    ctx.viewRecommendations?.list({
      ...query,
      view: getCurrentViewMetadata(ctx),
    }) ?? []
  );
}

export function buildCurrentViewRecommendationUpdateRequestRun(
  ctx: AnyaContextValue,
  recommendation: ViewRecommendation,
  options?: Omit<BuildViewRecommendationUpdateRequestInput, 'recommendation' | 'view'>,
): ViewRecommendationUpdateRequest {
  return buildViewRecommendationUpdateRequest({
    ...options,
    recommendation,
    view: getCurrentViewMetadata(ctx),
  });
}

export async function runViewRecommendationUpdateRun(
  recommendation: ViewRecommendation,
  options:
    | ({
        sessionId?: string;
        transport?: AgentSessionTransport;
      } & Omit<BuildViewRecommendationUpdateRequestInput, 'recommendation' | 'view'>
        & FinishAgentSessionOptions)
    | undefined,
  buildRequest: (
    recommendation: ViewRecommendation,
    options?: Omit<BuildViewRecommendationUpdateRequestInput, 'recommendation' | 'view'>,
  ) => ViewRecommendationUpdateRequest,
  runAgentSession: (
    input: {
      sessionId?: string;
      userIntent: string;
      messages: import('@anya-ui/core').AgentMessage[];
      promptOptions?: import('@anya-ui/core').PromptOptions;
      transport?: AgentSessionTransport;
      currentArtifacts?: import('@anya-ui/core').SessionArtifact[];
      currentViewId?: string;
    } & FinishAgentSessionOptions,
  ) => Promise<CompletedAgentSession>,
): Promise<CompletedAgentSession> {
  const request = buildRequest(recommendation, options);

  return runAgentSession({
    sessionId: options?.sessionId,
    transport: options?.transport,
    userIntent: request.userIntent,
    messages: [request.message],
    promptOptions: request.promptOptions,
    currentViewId: request.currentViewId,
    openPrimaryView: options?.openPrimaryView,
    savePrimaryViewAsApp: options?.savePrimaryViewAsApp,
    savePrimaryViewAsTemplate: options?.savePrimaryViewAsTemplate,
  });
}
