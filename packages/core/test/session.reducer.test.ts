import { describe, expect, it } from 'vitest';
import { agentSessionReducer } from '../src/session/reducer';
import {
  createInitialAgentSessionState,
  createSessionArtifact,
} from '../src/session/types';

describe('agentSessionReducer', () => {
  it('appends text deltas into a draft message artifact', () => {
    let state = createInitialAgentSessionState('session-1');

    state = agentSessionReducer(state, {
      type: 'text.delta',
      sessionId: 'session-1',
      timestamp: 10,
      artifactId: 'draft-1',
      delta: 'Hello',
    });
    state = agentSessionReducer(state, {
      type: 'text.delta',
      sessionId: 'session-1',
      timestamp: 20,
      artifactId: 'draft-1',
      delta: ' world',
    });

    const artifact = state.artifacts['draft-1'];
    expect(artifact?.kind).toBe('message');
    expect(artifact?.payload.text).toBe('Hello world');
    expect(artifact?.status).toBe('streaming');
  });

  it('promotes the latest replacing main view as the primary view', () => {
    let state = createInitialAgentSessionState('session-2');

    state = agentSessionReducer(state, {
      type: 'artifact.upserted',
      sessionId: 'session-2',
      timestamp: 10,
      artifact: createSessionArtifact({
        id: 'view-main-1',
        sessionId: 'session-2',
        kind: 'view',
        createdAt: 10,
        audience: 'user',
        region: 'main',
        status: 'complete',
        payload: {
          view: {
            id: 'view-1',
            format: 'ui_spec',
            replace: true,
            spec: {
              spec_version: 1,
              layout: 'stack',
              components: [],
            },
          },
        },
      }),
    });

    state = agentSessionReducer(state, {
      type: 'artifact.upserted',
      sessionId: 'session-2',
      timestamp: 20,
      artifact: createSessionArtifact({
        id: 'view-sidebar-1',
        sessionId: 'session-2',
        kind: 'view',
        createdAt: 20,
        audience: 'user',
        region: 'sidebar',
        status: 'complete',
        payload: {
          view: {
            id: 'view-2',
            format: 'custom',
            replace: false,
            rendererId: 'sidebar',
            data: { title: 'Sidebar' },
          },
        },
      }),
    });

    expect(state.primaryViewArtifactId).toBe('view-main-1');

    state = agentSessionReducer(state, {
      type: 'artifact.upserted',
      sessionId: 'session-2',
      timestamp: 30,
      artifact: createSessionArtifact({
        id: 'view-main-2',
        sessionId: 'session-2',
        kind: 'view',
        createdAt: 30,
        audience: 'user',
        region: 'main',
        status: 'complete',
        payload: {
          view: {
            id: 'view-3',
            format: 'ui_spec',
            replace: true,
            spec: {
              spec_version: 1,
              layout: 'grid',
              components: [],
            },
          },
        },
      }),
    });

    expect(state.primaryViewArtifactId).toBe('view-main-2');
  });
});
