import {
  createInitialAgentSessionState,
  type AgentSessionEvent,
  type AgentSessionState,
  type ArtifactRegion,
  type MessageArtifact,
  type SessionArtifact,
  type SurfaceArtifact,
} from './types';

export type AgentSessionReducer = (
  state: AgentSessionState,
  event: AgentSessionEvent
) => AgentSessionState;

function upsertArtifact(
  state: AgentSessionState,
  artifact: SessionArtifact,
  timestamp: number
): AgentSessionState {
  const exists = Boolean(state.artifacts[artifact.id]);
  const artifacts = {
    ...state.artifacts,
    [artifact.id]: artifact,
  };
  const artifactOrder = exists
    ? state.artifactOrder
    : [...state.artifactOrder, artifact.id];

  return {
    ...state,
    sessionId: artifact.sessionId,
    artifacts,
    artifactOrder,
    primarySurfaceArtifactId: resolvePrimarySurfaceArtifactId(
      artifacts,
      artifactOrder,
      state.primarySurfaceArtifactId,
      artifact,
    ),
    completedAt: state.completedAt,
    startedAt: state.startedAt ?? timestamp,
  };
}

function removeArtifact(state: AgentSessionState, artifactId: string): AgentSessionState {
  if (!state.artifacts[artifactId]) return state;

  const artifacts = { ...state.artifacts };
  delete artifacts[artifactId];
  const artifactOrder = state.artifactOrder.filter((id) => id !== artifactId);

  return {
    ...state,
    artifacts,
    artifactOrder,
    primarySurfaceArtifactId: resolvePrimarySurfaceArtifactId(
      artifacts,
      artifactOrder,
      state.primarySurfaceArtifactId === artifactId ? undefined : state.primarySurfaceArtifactId,
    ),
  };
}

function createDraftMessageArtifact(
  sessionId: string,
  artifactId: string,
  timestamp: number,
  text: string
): MessageArtifact {
  return {
    id: artifactId,
    sessionId,
    kind: 'message',
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    audience: 'agent',
    region: 'hidden',
    status: 'streaming',
    title: 'Streaming response',
    payload: {
      role: 'assistant',
      text,
      format: 'plain',
    },
  };
}

function appendTextDelta(
  state: AgentSessionState,
  event: Extract<AgentSessionEvent, { type: 'text.delta' }>
): AgentSessionState {
  const current = state.artifacts[event.artifactId];
  const artifact: MessageArtifact = current?.kind === 'message'
    ? {
        ...current,
        updatedAt: event.timestamp,
        status: 'streaming',
        payload: {
          ...current.payload,
          text: `${current.payload.text}${event.delta}`,
        },
      }
    : createDraftMessageArtifact(event.sessionId, event.artifactId, event.timestamp, event.delta);

  return upsertArtifact(state, artifact, event.timestamp);
}

function isVisibleSurfaceRegion(region: ArtifactRegion | undefined): boolean {
  return region !== 'hidden';
}

function isPromotableSurface(artifact: SessionArtifact | undefined): artifact is SurfaceArtifact {
  return Boolean(
    artifact
    && artifact.kind === 'surface'
    && isVisibleSurfaceRegion(artifact.region)
    && artifact.status !== 'failed'
    && artifact.status !== 'superseded'
  );
}

function resolvePrimarySurfaceArtifactId(
  artifacts: Record<string, SessionArtifact>,
  artifactOrder: string[],
  previousId?: string,
  lastArtifact?: SessionArtifact,
): string | undefined {
  if (isPromotableSurface(lastArtifact)) {
    const shouldReplace = lastArtifact.payload.surface.replace !== false;
    const prefersMain = !lastArtifact.region || lastArtifact.region === 'main';
    if (!previousId || shouldReplace || prefersMain) {
      return lastArtifact.id;
    }
  }

  if (previousId && isPromotableSurface(artifacts[previousId])) {
    return previousId;
  }

  for (let index = artifactOrder.length - 1; index >= 0; index -= 1) {
    const candidate = artifacts[artifactOrder[index]!];
    if (isPromotableSurface(candidate)) {
      return candidate.id;
    }
  }

  return undefined;
}

export const agentSessionReducer: AgentSessionReducer = (state, event) => {
  switch (event.type) {
    case 'session.started':
      return {
        ...createInitialAgentSessionState(event.sessionId),
        status: 'running',
        startedAt: event.timestamp,
      };

    case 'session.status':
      return {
        ...state,
        sessionId: event.sessionId,
        status: event.status,
        startedAt: state.startedAt ?? event.timestamp,
        completedAt:
          event.status === 'completed'
          || event.status === 'failed'
          || event.status === 'cancelled'
            ? event.timestamp
            : state.completedAt,
      };

    case 'artifact.upserted':
      return upsertArtifact(state, event.artifact, event.timestamp);

    case 'artifact.removed':
      return removeArtifact(state, event.artifactId);

    case 'text.delta':
      return appendTextDelta(state, event);

    case 'session.completed':
      return {
        ...state,
        sessionId: event.sessionId,
        status: state.status === 'cancelled' ? 'cancelled' : 'completed',
        completedAt: event.timestamp,
      };

    case 'session.failed':
      return {
        ...state,
        sessionId: event.sessionId,
        status: 'failed',
        lastError: event.error,
        completedAt: event.timestamp,
      };

    default:
      return state;
  }
};
