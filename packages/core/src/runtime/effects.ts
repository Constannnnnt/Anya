import type { RuntimeEvent, RuntimeState } from './events';

export interface RuntimeEffectContext {
  getState: () => RuntimeState;
  dispatch: (event: RuntimeEvent) => RuntimeState;
}

export type RuntimeEffect = (
  event: RuntimeEvent,
  context: RuntimeEffectContext
) => void | Promise<void>;

export type RuntimeEffectErrorHandler = (
  error: unknown,
  event: RuntimeEvent
) => void;
