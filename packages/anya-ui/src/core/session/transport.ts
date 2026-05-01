import type {
  AgentSessionState,
  AgentSessionEvent,
  AgentSessionRun,
  SessionArtifact,
  ViewArtifact,
  ViewDescriptor,
} from './types';
import { agentSessionReducer } from './reducer';
import { createInitialAgentSessionState } from './types';

export async function collectAgentSessionEvents(run: AgentSessionRun): Promise<AgentSessionEvent[]> {
  const events: AgentSessionEvent[] = [];
  for await (const event of run.events) {
    events.push(event);
  }
  return events;
}

export function collectArtifactsFromSessionEvents(events: AgentSessionEvent[]): SessionArtifact[] {
  const artifacts = new Map<string, SessionArtifact>();
  for (const event of events) {
    if (event.type === 'artifact.upserted') {
      artifacts.set(event.artifact.id, event.artifact);
      continue;
    }
    if (event.type === 'artifact.removed') {
      artifacts.delete(event.artifactId);
    }
  }
  return [...artifacts.values()];
}

export function collectAgentSessionState(events: AgentSessionEvent[]): AgentSessionState {
  const initialSessionId = events[0]?.sessionId ?? 'session-0';
  return events.reduce(
    (state, event) => agentSessionReducer(state, event),
    createInitialAgentSessionState(initialSessionId),
  );
}

export function isViewArtifact(artifact: SessionArtifact | undefined): artifact is ViewArtifact {
  return Boolean(artifact && artifact.kind === 'view');
}

export function getViewDescriptor(artifact: SessionArtifact | undefined): ViewDescriptor | undefined {
  if (!isViewArtifact(artifact)) return undefined;
  return artifact.payload.view;
}

export function getViewSpec(artifact: SessionArtifact | undefined) {
  const descriptor = getViewDescriptor(artifact);
  if (!descriptor) return undefined;
  return descriptor.spec;
}

export function getViewBindings(artifact: SessionArtifact | undefined) {
  const descriptor = getViewDescriptor(artifact);
  return descriptor?.bindings;
}

export function resolvePrimaryViewArtifact(
  input: AgentSessionEvent[] | AgentSessionState,
): ViewArtifact | undefined {
  const state = Array.isArray(input) ? collectAgentSessionState(input) : input;
  const artifactId = state.primaryViewArtifactId;
  if (!artifactId) return undefined;
  const artifact = state.artifacts[artifactId];
  return isViewArtifact(artifact) ? artifact : undefined;
}
