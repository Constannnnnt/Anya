import {
  createInitialAgentSessionState,
  type AgentSessionEvent,
  type AgentSessionState,
} from './types';
import {
  agentSessionReducer,
  type AgentSessionReducer,
} from './reducer';

export interface AgentSessionStore {
  getState(): AgentSessionState;
  dispatch(event: AgentSessionEvent): AgentSessionState;
  subscribe(listener: () => void): () => void;
  replaceReducer(reducer: AgentSessionReducer): void;
}

export function createAgentSessionStore(opts?: {
  initialState?: Partial<AgentSessionState>;
  reducer?: AgentSessionReducer;
}): AgentSessionStore {
  let state: AgentSessionState = {
    ...createInitialAgentSessionState(opts?.initialState?.sessionId),
    ...opts?.initialState,
    artifacts: opts?.initialState?.artifacts ?? {},
    artifactOrder: opts?.initialState?.artifactOrder ?? [],
  };
  let reducer = opts?.reducer ?? agentSessionReducer;
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of [...listeners]) {
      listener();
    }
  };

  return {
    getState() {
      return state;
    },

    dispatch(event) {
      state = reducer(state, event);
      notify();
      return state;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    replaceReducer(nextReducer) {
      reducer = nextReducer;
    },
  };
}
