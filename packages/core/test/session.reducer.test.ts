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

  it('promotes the latest replacing main surface as the primary surface', () => {
    let state = createInitialAgentSessionState('session-2');

    state = agentSessionReducer(state, {
      type: 'artifact.upserted',
      sessionId: 'session-2',
      timestamp: 10,
      artifact: createSessionArtifact({
        id: 'surface-main-1',
        sessionId: 'session-2',
        kind: 'surface',
        createdAt: 10,
        audience: 'user',
        region: 'main',
        status: 'complete',
        payload: {
          surface: {
            surfaceKind: 'ui_spec',
            surfaceId: 'surface-1',
            replace: true,
            schema: {
              type: 'anya.ui_spec',
              spec: {
                spec_version: 1,
                layout: 'stack',
                components: [],
              },
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
        id: 'surface-sidebar-1',
        sessionId: 'session-2',
        kind: 'surface',
        createdAt: 20,
        audience: 'user',
        region: 'sidebar',
        status: 'complete',
        payload: {
          surface: {
            surfaceKind: 'custom',
            surfaceId: 'surface-2',
            replace: false,
            schema: {
              type: 'custom',
              rendererId: 'sidebar',
              data: { title: 'Sidebar' },
            },
          },
        },
      }),
    });

    expect(state.primarySurfaceArtifactId).toBe('surface-main-1');

    state = agentSessionReducer(state, {
      type: 'artifact.upserted',
      sessionId: 'session-2',
      timestamp: 30,
      artifact: createSessionArtifact({
        id: 'surface-main-2',
        sessionId: 'session-2',
        kind: 'surface',
        createdAt: 30,
        audience: 'user',
        region: 'main',
        status: 'complete',
        payload: {
          surface: {
            surfaceKind: 'ui_spec',
            surfaceId: 'surface-3',
            replace: true,
            schema: {
              type: 'anya.ui_spec',
              spec: {
                spec_version: 1,
                layout: 'grid',
                components: [],
              },
            },
          },
        },
      }),
    });

    expect(state.primarySurfaceArtifactId).toBe('surface-main-2');
  });
});
