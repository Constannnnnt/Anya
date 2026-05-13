// Core submodule: memory system and supporting types.
// The memory/behavior HCI measurement system is the retained core.

export type { FileStorage } from './storage/interface';
export { InMemoryStorage } from './storage/memory';
export { getLogger, setLogger, setLogLevel, silentLogger, consoleLogger } from './logging';
export { nextGeneratedId, resetIdGenerator, setIdGenerator } from './id';
export type {
  InteractionModality,
  InteractionAction,
  InteractionTrigger,
  UIInteractionRecord,
  UIInteractionMeasurement,
  UIInteractionMeasurementHint,
  ViewSpec,
  ViewNode,
  ActiveContext,
  ElementHistory,
  ReasoningTrace,
} from './types';
export type { RuntimeEvent, RuntimeEventSource } from './runtime/events';
