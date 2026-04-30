import { describe, expect, it } from 'vitest';
import {
  collectAgentSessionEvents,
  collectAgentSessionState,
  collectArtifactsFromSessionEvents,
  getViewSpec,
  resolvePrimaryViewArtifact,
} from '../src/session';
import type {
  AgentSessionEvent,
  AgentSessionRun,
  SessionArtifact,
} from '../src/session';

function createRun(events: AgentSessionEvent[]): AgentSessionRun {
  return {
    sessionId: 'session-test',
    controller: { cancel() {} },
    events: (async function* () {
      for (const event of events) {
        yield event;
      }
    })(),
  };
}

function createViewArtifact(): SessionArtifact {
  return {
    id: 'artifact-view',
    sessionId: 'session-test',
    kind: 'view',
    version: 1,
    createdAt: 3,
    audience: 'user',
    region: 'main',
    payload: {
      view: {
        id: 'view-main',
        format: 'ui_spec',
        title: 'Main View',
        workflow: 'greeting',
        spec: {
          spec_version: 1,
          layout: 'stack',
          components: [
            {
              id: 'text-1',
              type: 'Text',
              props: { content: 'Hello' },
            },
          ],
        },
        bindings: [],
      },
    },
  };
}

describe('session transport utilities', () => {
  it('collects streamed events and final artifacts from a session run', async () => {
    const events = await collectAgentSessionEvents(createRun([
      {
        type: 'session.started',
        sessionId: 'session-test',
        timestamp: 1,
      },
      {
        type: 'artifact.upserted',
        sessionId: 'session-test',
        timestamp: 2,
        artifact: {
          id: 'artifact-message',
          sessionId: 'session-test',
          kind: 'message',
          version: 1,
          createdAt: 2,
          audience: 'agent',
          region: 'activity',
          payload: {
            role: 'assistant',
            text: 'Researching',
            format: 'plain',
          },
        },
      },
      {
        type: 'artifact.upserted',
        sessionId: 'session-test',
        timestamp: 3,
        artifact: createViewArtifact(),
      },
      {
        type: 'session.completed',
        sessionId: 'session-test',
        timestamp: 4,
      },
    ]));
    const artifacts = collectArtifactsFromSessionEvents(events);

    expect(events).toHaveLength(4);
    expect(artifacts).toHaveLength(2);
    expect(artifacts.map((artifact) => artifact.kind)).toEqual(['message', 'view']);
  });

  it('drops artifacts removed later in the event stream', async () => {
    const artifacts = collectArtifactsFromSessionEvents(await collectAgentSessionEvents(createRun([
      {
        type: 'artifact.upserted',
        sessionId: 'session-test',
        timestamp: 1,
        artifact: createViewArtifact(),
      },
      {
        type: 'artifact.removed',
        sessionId: 'session-test',
        timestamp: 2,
        artifactId: 'artifact-view',
      },
    ])));

    expect(artifacts).toHaveLength(0);
  });

  it('resolves the primary view artifact and its spec from the event stream', async () => {
    const events = await collectAgentSessionEvents(createRun([
      {
        type: 'artifact.upserted',
        sessionId: 'session-test',
        timestamp: 1,
        artifact: createViewArtifact(),
      },
    ]));

    const state = collectAgentSessionState(events);
    const primary = resolvePrimaryViewArtifact(state);

    expect(primary?.id).toBe('artifact-view');
    expect(getViewSpec(primary)?.components[0]?.id).toBe('text-1');
  });
});
