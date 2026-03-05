import type {
  RuntimeEvent,
  RuntimeState,
  SessionIntentUpdatedEvent,
  SessionStatusSetEvent,
  InteractionRecordedEvent,
  SpecDecodedEvent,
  SpecDecodeFailedEvent,
  ThemeUpdatedEvent,
  MemoryHydratedEvent,
} from './events';
import { applyOptimisticUpdate } from '../utils';

export type RuntimeReducer = (state: RuntimeState, event: RuntimeEvent) => RuntimeState;

const MAX_INTERACTIONS = 100;

type RuntimeHandler<E extends RuntimeEvent = RuntimeEvent> = (
  state: RuntimeState,
  event: E
) => RuntimeState;

const handleIntentUpdated: RuntimeHandler<SessionIntentUpdatedEvent> = (state, event) => ({
  ...state,
  session: {
    ...state.session,
    userIntent: event.payload.userIntent,
  },
  lastEventId: event.id,
});

const handleStatusSet: RuntimeHandler<SessionStatusSetEvent> = (state, event) => ({
  ...state,
  session: {
    ...state.session,
    status: event.payload.status,
  },
  lastEventId: event.id,
});

const handleInteractionRecorded: RuntimeHandler<InteractionRecordedEvent> = (state, event) => {
  const nextSpec = state.ui.spec
    ? applyOptimisticUpdate(state.ui.spec, event.payload.record)
    : state.ui.spec;

  return {
    ...state,
    ui: {
      ...state.ui,
      spec: nextSpec,
    },
    memory: {
      ...state.memory,
      interactions: [...state.memory.interactions, event.payload.record].slice(-MAX_INTERACTIONS),
    },
    lastEventId: event.id,
  };
};

const handleSpecDecoded: RuntimeHandler<SpecDecodedEvent> = (state, event) => {
  const workflowContext = event.payload.spec.skill ?? state.session.workflowContext;
  return {
    ...state,
    session: {
      ...state.session,
      status: 'rendering',
      workflowContext,
      lastError: undefined,
    },
    ui: {
      ...state.ui,
      spec: event.payload.spec,
    },
    lastEventId: event.id,
  };
};

const handleSpecDecodeFailed: RuntimeHandler<SpecDecodeFailedEvent> = (state, event) => ({
  ...state,
  session: {
    ...state.session,
    status: 'error',
    lastError: event.payload.error,
  },
  lastEventId: event.id,
});

const handleThemeUpdated: RuntimeHandler<ThemeUpdatedEvent> = (state, event) => ({
  ...state,
  theme: {
    ...state.theme,
    tokens: {
      ...state.theme.tokens,
      ...event.payload.tokens,
    },
  },
  lastEventId: event.id,
});

const handleMemoryHydrated: RuntimeHandler<MemoryHydratedEvent> = (state, event) => {
  const incomingWorkflowContext = event.payload.state.session?.workflowContext;
  return {
    ...state,
    session: {
      ...state.session,
      ...event.payload.state.session,
      workflowContext: incomingWorkflowContext ?? state.session.workflowContext,
    },
    ui: {
      ...state.ui,
      ...event.payload.state.ui,
    },
    memory: {
      ...state.memory,
      ...event.payload.state.memory,
    },
    theme: {
      ...state.theme,
      ...event.payload.state.theme,
    },
    lastEventId: event.id,
  };
};

const handlePassthrough: RuntimeHandler = (state, event) => ({
  ...state,
  lastEventId: event.id,
});

const handlers: { [K in RuntimeEvent['type']]: RuntimeHandler<Extract<RuntimeEvent, { type: K }>> } = {
  'session.intent_updated': handleIntentUpdated,
  'session.status_set': handleStatusSet,
  'session.context_compacted': handlePassthrough,
  'session.context_pressure': handlePassthrough,
  'interaction.recorded': handleInteractionRecorded,
  'binding.executed': handlePassthrough,
  'tool.started': handlePassthrough,
  'tool.finished': handlePassthrough,
  'tool.failed': handlePassthrough,
  'qa.passed': handlePassthrough,
  'qa.failed': handlePassthrough,
  'spec.decoded': handleSpecDecoded,
  'spec.decode_failed': handleSpecDecodeFailed,
  'theme.updated': handleThemeUpdated,
  'memory.hydrated': handleMemoryHydrated,
  'preference.explicit': handlePassthrough,
  'preference.pre_render_blocking': handlePassthrough,
};

function assertNever(value: never): never {
  throw new Error(`Unhandled runtime event: ${JSON.stringify(value)}`);
}

export const runtimeReducer: RuntimeReducer = (state, event) => {
  const handler = handlers[event.type];
  if (handler) {
    return handler(state, event as any);
  }

  assertNever(event as never);
  return state;
};
