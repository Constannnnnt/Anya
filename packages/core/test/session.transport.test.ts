import { describe, expect, it } from 'vitest';
import {
  collectAgentSessionEvents,
  collectArtifactsFromSessionEvents,
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

function createSurfaceArtifact(): SessionArtifact {
  return {
    id: 'artifact-surface',
    sessionId: 'session-test',
    kind: 'surface',
    version: 1,
    createdAt: 3,
    audience: 'user',
    region: 'main',
    payload: {
      surface: {
        surfaceKind: 'ui_spec',
        surfaceId: 'surface-main',
        schema: {
          type: 'anya.ui_spec',
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
        },
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
        artifact: createSurfaceArtifact(),
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
    expect(artifacts.map((artifact) => artifact.kind)).toEqual(['message', 'surface']);
  });

  it('drops artifacts removed later in the event stream', async () => {
    const artifacts = collectArtifactsFromSessionEvents(await collectAgentSessionEvents(createRun([
      {
        type: 'artifact.upserted',
        sessionId: 'session-test',
        timestamp: 1,
        artifact: createSurfaceArtifact(),
      },
      {
        type: 'artifact.removed',
        sessionId: 'session-test',
        timestamp: 2,
        artifactId: 'artifact-surface',
      },
    ])));

    expect(artifacts).toHaveLength(0);
  });
});
