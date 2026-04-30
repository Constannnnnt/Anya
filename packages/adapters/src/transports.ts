import type {
  AgentSessionController,
  AgentSessionEvent,
  AgentSessionRun,
  AgentSessionStartInput,
  AgentSessionTransport,
} from '@anya-ui/core';

type Awaitable<T> = T | Promise<T>;

export type SessionEventStream<TEvent = AgentSessionEvent> =
  | AsyncIterable<TEvent>
  | Iterable<TEvent>;

export type SessionControllerLike =
  | AgentSessionController
  | (() => void)
  | undefined;

export interface AgentSessionTransportContext {
  signal: AbortSignal;
}

export interface CreateAgentSessionRunInput {
  sessionId: string;
  events: SessionEventStream<AgentSessionEvent>;
  controller?: SessionControllerLike;
}

export interface AgentSessionTransportResult {
  sessionId?: string;
  events: SessionEventStream<AgentSessionEvent>;
  controller?: SessionControllerLike;
}

export type AgentSessionTransportHandler = (
  input: AgentSessionStartInput,
  context: AgentSessionTransportContext,
) => Awaitable<AgentSessionTransportResult>;

export interface StaticAgentSessionTransportConfig {
  sessionId?: string | ((input: AgentSessionStartInput) => string | undefined);
  events:
    | SessionEventStream<AgentSessionEvent>
    | ((
      input: AgentSessionStartInput,
      context: AgentSessionTransportContext,
    ) => Awaitable<SessionEventStream<AgentSessionEvent>>);
  controller?:
    | SessionControllerLike
    | ((
      input: AgentSessionStartInput,
      context: AgentSessionTransportContext,
    ) => Awaitable<SessionControllerLike | void>);
  onStart?: (
    input: AgentSessionStartInput,
    context: AgentSessionTransportContext,
  ) => Awaitable<void>;
}

let fallbackSessionSequence = 0;

function createFallbackSessionId(): string {
  fallbackSessionSequence += 1;
  return `adapter-session-${fallbackSessionSequence}`;
}

function isAsyncIterable<T>(value: SessionEventStream<T>): value is AsyncIterable<T> {
  return typeof (value as AsyncIterable<T>)[Symbol.asyncIterator] === 'function';
}

function normalizeController(controller?: SessionControllerLike): AgentSessionController {
  if (!controller) {
    return {
      cancel() {},
    };
  }

  if (typeof controller === 'function') {
    return {
      cancel: controller,
    };
  }

  return controller;
}

export function toAsyncEventStream<T>(
  stream: SessionEventStream<T>,
): AsyncIterable<T> {
  if (isAsyncIterable(stream)) {
    return stream;
  }

  return (async function* iterateSyncStream() {
    yield* stream;
  })();
}

export function createAgentSessionRun(
  input: CreateAgentSessionRunInput,
): AgentSessionRun {
  return {
    sessionId: input.sessionId,
    controller: normalizeController(input.controller),
    events: toAsyncEventStream(input.events),
  };
}

export function createAgentSessionTransport(
  handler: AgentSessionTransportHandler,
): AgentSessionTransport {
  return {
    async startSession(input) {
      const abortController = new AbortController();
      const result = await handler(input, {
        signal: abortController.signal,
      });
      const upstreamController = normalizeController(result.controller);

      return createAgentSessionRun({
        sessionId: result.sessionId ?? input.sessionId ?? createFallbackSessionId(),
        events: result.events,
        controller: {
          cancel() {
            abortController.abort();
            upstreamController.cancel();
          },
        },
      });
    },
  };
}

export function createStaticAgentSessionTransport(
  config: StaticAgentSessionTransportConfig,
): AgentSessionTransport {
  return createAgentSessionTransport(async (input, context) => {
    await config.onStart?.(input, context);

    return {
      sessionId:
        typeof config.sessionId === 'function'
          ? config.sessionId(input)
          : config.sessionId,
      controller:
        typeof config.controller === 'function'
          ? (await config.controller(input, context)) ?? undefined
          : config.controller,
      events:
        typeof config.events === 'function'
          ? await config.events(input, context)
          : config.events,
    };
  });
}
