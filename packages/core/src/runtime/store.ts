/**
 * Deterministic runtime store with reducer + effect orchestration.
 * Dispatch is queue-based to keep nested events replay-safe.
 */
import {
  createInitialRuntimeState,
  type RuntimeEvent,
  type RuntimeState,
} from './events';
import type {
  RuntimeEffect,
  RuntimeEffectContext,
  RuntimeEffectErrorHandler,
} from './effects';
import { runtimeReducer, type RuntimeReducer } from './reducer';

export type RuntimeEventPattern = RuntimeEvent['type'] | `${string}.*` | '*';
export type RuntimeEventListener = (event: RuntimeEvent, state: RuntimeState) => void;

export interface RuntimeStore {
  getState(): RuntimeState;
  dispatch(event: RuntimeEvent): RuntimeState;
  subscribe(listener: () => void): () => void;
  subscribeEvent(pattern: RuntimeEventPattern, listener: RuntimeEventListener): () => void;
  replaceReducer(reducer: RuntimeReducer): void;
  replaceEffects(effects: RuntimeEffect[]): void;
}

function mergeInitialState(
  base: RuntimeState,
  patch?: Partial<RuntimeState>
): RuntimeState {
  if (!patch) return base;
  return {
    ...base,
    ...patch,
    session: {
      ...base.session,
      ...patch.session,
    },
    ui: {
      ...base.ui,
      ...patch.ui,
    },
    memory: {
      ...base.memory,
      ...patch.memory,
    },
    theme: {
      ...base.theme,
      ...patch.theme,
      tokens: {
        ...base.theme.tokens,
        ...patch.theme?.tokens,
      },
    },
  };
}

function matchesPattern(pattern: RuntimeEventPattern, eventType: RuntimeEvent['type']): boolean {
  if (pattern === '*') return true;
  if (pattern.endsWith('.*')) {
    const namespace = pattern.slice(0, -2);
    return eventType.startsWith(`${namespace}.`);
  }
  return pattern === eventType;
}

function runEffects(
  effects: RuntimeEffect[],
  event: RuntimeEvent,
  effectContext: RuntimeEffectContext,
  onEffectError: RuntimeEffectErrorHandler
) {
  for (const effect of [...effects]) {
    try {
      const result = effect(event, effectContext);
      if (result && typeof (result as Promise<void>).then === 'function') {
        void (result as Promise<void>).catch((error) => onEffectError(error, event));
      }
    } catch (error) {
      onEffectError(error, event);
    }
  }
}

function notifyStateListeners(
  listeners: Set<() => void>,
  event: RuntimeEvent,
  onEffectError: RuntimeEffectErrorHandler
) {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch (error) {
      onEffectError(error, event);
    }
  }
}

function notifyEventListeners(
  eventListeners: Set<{ pattern: RuntimeEventPattern; listener: RuntimeEventListener }>,
  event: RuntimeEvent,
  state: RuntimeState,
  onEffectError: RuntimeEffectErrorHandler
) {
  for (const { pattern, listener } of [...eventListeners]) {
    if (!matchesPattern(pattern, event.type)) continue;
    try {
      listener(event, state);
    } catch (error) {
      onEffectError(error, event);
    }
  }
}

/** Creates a runtime store instance scoped to one host session. */
export function createRuntimeStore(opts?: {
  initialState?: Partial<RuntimeState>;
  reducer?: RuntimeReducer;
  effects?: RuntimeEffect[];
  onEffectError?: RuntimeEffectErrorHandler;
  maxDispatchDepth?: number;
  dedupeNestedEventIds?: boolean;
}): RuntimeStore {
  let state = mergeInitialState(createInitialRuntimeState(), opts?.initialState);
  let reducer = opts?.reducer ?? runtimeReducer;
  let effects = opts?.effects ?? [];
  const onEffectError: RuntimeEffectErrorHandler = opts?.onEffectError ?? (() => {});
  const maxDispatchDepth = opts?.maxDispatchDepth ?? 32;
  const dedupeNestedEventIds = opts?.dedupeNestedEventIds ?? true;
  const listeners = new Set<() => void>();
  const eventListeners = new Set<{ pattern: RuntimeEventPattern; listener: RuntimeEventListener }>();
  const dispatchQueue: RuntimeEvent[] = [];
  let processingQueue = false;
  let storeRef: RuntimeStore;

  const effectContext: RuntimeEffectContext = {
    getState: () => state,
    dispatch: (event) => storeRef.dispatch(event),
  };

  const processQueue = () => {
    if (processingQueue) return;

    processingQueue = true;
    const seenEventIdsInCycle = new Set<string>();
    let processedInCycle = 0;
    let readIndex = 0;

    try {
      while (readIndex < dispatchQueue.length) {
        const event = dispatchQueue[readIndex]!;
        readIndex += 1;

        if (dedupeNestedEventIds && seenEventIdsInCycle.has(event.id)) {
          onEffectError(
            new Error(`[RuntimeStore] Re-entrant dispatch blocked for event id '${event.id}'.`),
            event
          );
          continue;
        }

        if (processedInCycle >= maxDispatchDepth) {
          onEffectError(
            new Error(`[RuntimeStore] Max dispatch depth (${maxDispatchDepth}) exceeded.`),
            event
          );
          dispatchQueue.length = 0;
          break;
        }

        processedInCycle += 1;
        seenEventIdsInCycle.add(event.id);
        state = reducer(state, event);
        runEffects(effects, event, effectContext, onEffectError);
        notifyStateListeners(listeners, event, onEffectError);
        notifyEventListeners(eventListeners, event, state, onEffectError);
      }
    } finally {
      if (readIndex > 0) {
        dispatchQueue.splice(0, readIndex);
      }
      processingQueue = false;
    }
  };

  storeRef = {
    getState() {
      return state;
    },
    dispatch(event) {
      dispatchQueue.push(event);
      processQueue();
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    subscribeEvent(pattern, listener) {
      const entry = { pattern, listener };
      eventListeners.add(entry);
      return () => {
        eventListeners.delete(entry);
      };
    },
    replaceReducer(nextReducer) {
      reducer = nextReducer;
    },
    replaceEffects(nextEffects) {
      effects = [...nextEffects];
    },
  };

  return storeRef;
}
