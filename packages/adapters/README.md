# @anya-ui/adapters

Adapter utilities for Anya UI.

Use this package when you want to connect Anya to an external agent runtime without writing `AgentSessionTransport` objects and session artifacts by hand.

## Install

```bash
npm install @anya-ui/adapters @anya-ui/core
```

## What This Package Is For

- build `AgentSessionTransport` implementations
- normalize sync or async session event streams
- create canonical session artifacts and session events
- keep runtime integrations out of `@anya-ui/core` internals

## Quick Start

```ts
import {
  createArtifactUpsertedEvent,
  createSessionCompletedEvent,
  createSessionStartedEvent,
  createStaticAgentSessionTransport,
  createViewArtifact,
} from '@anya-ui/adapters';

const transport = createStaticAgentSessionTransport({
  sessionId: 'session-orders',
  events(input) {
    const sessionId = input.sessionId ?? 'session-orders';

    return [
      createSessionStartedEvent({
        sessionId,
        timestamp: 1,
      }),
      createArtifactUpsertedEvent({
        sessionId,
        timestamp: 2,
        artifact: createViewArtifact({
          id: 'artifact-orders',
          sessionId,
          createdAt: 2,
          audience: 'user',
          region: 'main',
          title: 'Orders',
          view: {
            id: 'orders-main',
            format: 'ui_spec',
            workflow: 'orders',
            title: 'Orders',
            spec: {
              spec_version: 1,
              layout: 'stack',
              components: [],
            },
          },
        }),
      }),
      createSessionCompletedEvent({
        sessionId,
        timestamp: 3,
      }),
    ];
  },
});
```

## Custom Runtime Adapter

```ts
import {
  createAgentSessionTransport,
  createArtifactUpsertedEvent,
  createSessionCompletedEvent,
  createSessionStartedEvent,
  createViewArtifact,
} from '@anya-ui/adapters';

const transport = createAgentSessionTransport(async (input, context) => {
  const response = await fetch('https://example.com/session', {
    method: 'POST',
    signal: context.signal,
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  const data = await response.json();
  const sessionId = data.sessionId as string;

  return {
    sessionId,
    events: [
      createSessionStartedEvent({ sessionId, timestamp: Date.now() }),
      createArtifactUpsertedEvent({
        sessionId,
        timestamp: Date.now(),
        artifact: createViewArtifact({
          id: 'artifact-main',
          sessionId,
          createdAt: Date.now(),
          audience: 'user',
          region: 'main',
          view: data.view,
        }),
      }),
      createSessionCompletedEvent({ sessionId, timestamp: Date.now() }),
    ],
  };
});
```

## Package Boundary

- Use `@anya-ui/core` for the runtime, state graph, views, and session helpers.
- Use `@anya-ui/react` for the provider, hooks, and renderers.
- Use `@anya-ui/adapters` for transport adapters, session events, and artifact builders.
- Use `@anya-ui/core/experimental` only for unstable UI-memory internals.

The transport boundary is stable. The UI-memory analysis internals are not.

See also:

- `docs/package-boundaries.md`
