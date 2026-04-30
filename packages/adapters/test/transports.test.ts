import { describe, expect, it, vi } from 'vitest';
import {
  collectAgentSessionEvents,
  getViewSpec,
  resolvePrimaryViewArtifact,
} from '@anya-ui/core';
import {
  createAgentSessionTransport,
  createArtifactUpsertedEvent,
  createMessageArtifact,
  createSessionCompletedEvent,
  createSessionStartedEvent,
  createStaticAgentSessionTransport,
  createViewArtifact,
  toAsyncEventStream,
} from '../src/index';

describe('@anya-ui/adapters transports', () => {
  it('normalizes sync event collections into async streams', async () => {
    const stream = toAsyncEventStream([1, 2, 3]);
    const collected: number[] = [];

    for await (const value of stream) {
      collected.push(value);
    }

    expect(collected).toEqual([1, 2, 3]);
  });

  it('creates a static transport that core session helpers can consume', async () => {
    const transport = createStaticAgentSessionTransport({
      sessionId: 'session-static',
      events(input) {
        const sessionId = input.sessionId ?? 'session-static';
        const viewArtifact = createViewArtifact({
          id: 'artifact-profile',
          sessionId,
          createdAt: 2,
          audience: 'user',
          region: 'main',
          title: 'Profile View',
          view: {
            id: 'profile-main',
            format: 'ui_spec',
            kind: 'app',
            title: 'Profile View',
            workflow: 'profile',
            spec: {
              spec_version: 1,
              skill: 'profile',
              layout: 'stack',
              components: [
                {
                  id: 'heading-1',
                  type: 'Heading',
                  props: { text: 'Profile' },
                },
              ],
            },
            bindings: [],
          },
        });

        return [
          createSessionStartedEvent({
            sessionId,
            timestamp: 1,
          }),
          createArtifactUpsertedEvent({
            sessionId,
            timestamp: 2,
            artifact: viewArtifact,
          }),
          createSessionCompletedEvent({
            sessionId,
            timestamp: 3,
          }),
        ];
      },
    });

    const run = await transport.startSession({
      userIntent: 'Build a profile view',
      messages: [],
      currentViewId: 'profile-main',
    });
    const events = await collectAgentSessionEvents(run);
    const primaryView = resolvePrimaryViewArtifact(events);

    expect(run.sessionId).toBe('session-static');
    expect(primaryView?.id).toBe('artifact-profile');
    expect(getViewSpec(primaryView)?.components[0]?.props).toEqual({ text: 'Profile' });
  });

  it('aborts adapter handlers through the stable transport wrapper', async () => {
    const upstreamCancel = vi.fn();
    let capturedSignal: AbortSignal | undefined;
    const transport = createAgentSessionTransport(async (input, context) => {
      capturedSignal = context.signal;
      return {
        sessionId: input.sessionId ?? 'session-abort',
        controller: upstreamCancel,
        events: [
          createSessionStartedEvent({
            sessionId: input.sessionId ?? 'session-abort',
            timestamp: 1,
          }),
        ],
      };
    });

    const run = await transport.startSession({
      sessionId: 'session-abort',
      userIntent: 'Abortable path',
      messages: [],
    });

    expect(capturedSignal?.aborted).toBe(false);
    run.controller.cancel();
    expect(capturedSignal?.aborted).toBe(true);
    expect(upstreamCancel).toHaveBeenCalledTimes(1);
  });

  it('builds message and view artifacts with the canonical core shapes', () => {
    const messageArtifact = createMessageArtifact({
      id: 'artifact-message',
      sessionId: 'session-artifacts',
      createdAt: 1,
      role: 'assistant',
      text: 'Hello from the adapter',
      format: 'markdown',
    });
    const viewArtifact = createViewArtifact({
      id: 'artifact-view',
      sessionId: 'session-artifacts',
      createdAt: 2,
      audience: 'user',
      title: 'Orders View',
      view: {
        id: 'orders-main',
        format: 'ui_spec',
        title: 'Orders View',
        workflow: 'orders',
        spec: {
          spec_version: 1,
          layout: 'stack',
          components: [],
        },
      },
    });

    expect(messageArtifact).toEqual(
      expect.objectContaining({
        kind: 'message',
        payload: expect.objectContaining({
          role: 'assistant',
          text: 'Hello from the adapter',
        }),
      }),
    );
    expect(viewArtifact).toEqual(
      expect.objectContaining({
        kind: 'view',
        payload: expect.objectContaining({
          view: expect.objectContaining({
            id: 'orders-main',
            workflow: 'orders',
          }),
        }),
      }),
    );
  });
});
