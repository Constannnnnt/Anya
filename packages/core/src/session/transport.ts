import type {
  AgentSessionEvent,
  AgentSessionRun,
  SessionArtifact,
} from './types';

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
