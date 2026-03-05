/**
 * Runtime event contracts and event factory helpers.
 * Invariant: all dispatched events carry stable ids and schemaVersion.
 */
import type {
  AgentState,
  ThemeTokens,
  UIInteractionRecord,
  UIRenderSpec,
} from '../types';
import type { BindingExecutionRecord } from '../presentation/types';

export type RuntimeEventSource = 'user' | 'agent' | 'system';
export type IntentUpdateMode = 'auto' | 'continue' | 'replace';

export interface RuntimeEventEnvelope<TType extends string, TPayload> {
  id: string;
  type: TType;
  timestamp: number;
  source: RuntimeEventSource;
  correlationId?: string;
  causationId?: string;
  schemaVersion: number;
  payload: TPayload;
}

export interface RuntimeSessionState {
  status: AgentState;
  workflowContext?: string;
  userIntent?: string;
  lastError?: string;
}

export interface RuntimeState {
  session: RuntimeSessionState;
  ui: {
    spec: UIRenderSpec | null;
    schemaVersion: number;
  };
  memory: {
    interactions: UIInteractionRecord[];
  };
  theme: {
    tokens: Partial<Record<keyof ThemeTokens, string>>;
  };
  lastEventId?: string;
}

export interface RuntimeHydrationState {
  session?: Partial<RuntimeSessionState>;
  ui?: Partial<RuntimeState['ui']>;
  memory?: Partial<RuntimeState['memory']>;
  theme?: {
    tokens?: Partial<Record<keyof ThemeTokens, string>>;
  };
}

export type SessionIntentUpdatedEvent = RuntimeEventEnvelope<
  'session.intent_updated',
  {
    userIntent: string;
    mode?: IntentUpdateMode;
  }
>;

export type SessionStatusSetEvent = RuntimeEventEnvelope<
  'session.status_set',
  { status: AgentState }
>;

export type SessionContextCompactedEvent = RuntimeEventEnvelope<
  'session.context_compacted',
  {
    strategy?: string;
    previousTokenCount?: number;
    nextTokenCount?: number;
    summary?: string;
  }
>;

export type SessionContextPressureEvent = RuntimeEventEnvelope<
  'session.context_pressure',
  {
    remainingTokens?: number;
    remainingRatio?: number;
    windowSizeTokens?: number;
    usedTokens?: number;
  }
>;

export type InteractionRecordedEvent = RuntimeEventEnvelope<
  'interaction.recorded',
  { record: UIInteractionRecord }
>;

export type BindingExecutedEvent = RuntimeEventEnvelope<
  'binding.executed',
  { record: BindingExecutionRecord }
>;

export type ToolStartedEvent = RuntimeEventEnvelope<
  'tool.started',
  {
    toolId: string;
    bindingId?: string;
    interaction: UIInteractionRecord;
  }
>;

export type ToolFinishedEvent = RuntimeEventEnvelope<
  'tool.finished',
  {
    toolId: string;
    bindingId?: string;
    interaction: UIInteractionRecord;
    durationMs?: number;
    result?: unknown;
  }
>;

export type ToolFailedEvent = RuntimeEventEnvelope<
  'tool.failed',
  {
    toolId: string;
    bindingId?: string;
    interaction: UIInteractionRecord;
    durationMs?: number;
    error: string;
  }
>;

export type QaPassedEvent = RuntimeEventEnvelope<
  'qa.passed',
  {
    source: string;
    roundCount: number;
    issueCount: number;
  }
>;

export type QaFailedEvent = RuntimeEventEnvelope<
  'qa.failed',
  {
    source: string;
    roundCount: number;
    issueCodes: string[];
  }
>;

export type SpecDecodedEvent = RuntimeEventEnvelope<
  'spec.decoded',
  { spec: UIRenderSpec }
>;

export type SpecDecodeFailedEvent = RuntimeEventEnvelope<
  'spec.decode_failed',
  { error: string }
>;

export type ThemeUpdatedEvent = RuntimeEventEnvelope<
  'theme.updated',
  { tokens: Partial<Record<keyof ThemeTokens, string>> }
>;

export type MemoryHydratedEvent = RuntimeEventEnvelope<
  'memory.hydrated',
  { state: RuntimeHydrationState }
>;


export type PreferenceExplicitEvent = RuntimeEventEnvelope<
  'preference.explicit',
  { category: string; key: string; value: string; statement: string }
>;

export type PreferencePreRenderBlockingEvent = RuntimeEventEnvelope<
  'preference.pre_render_blocking',
  { category: string; key: string; value: string; statement: string }
>;

export type RuntimeEvent =
  | SessionIntentUpdatedEvent
  | SessionStatusSetEvent
  | SessionContextCompactedEvent
  | SessionContextPressureEvent
  | InteractionRecordedEvent
  | BindingExecutedEvent
  | ToolStartedEvent
  | ToolFinishedEvent
  | ToolFailedEvent
  | QaPassedEvent
  | QaFailedEvent
  | SpecDecodedEvent
  | SpecDecodeFailedEvent
  | ThemeUpdatedEvent
  | MemoryHydratedEvent
  | PreferenceExplicitEvent
  | PreferencePreRenderBlockingEvent;

let eventCounter = 0;
function nextEventId(): string {
  return `evt-${Date.now()}-${++eventCounter}`;
}

/** Creates a runtime event envelope with generated id/timestamp defaults. */
export function createRuntimeEvent<TType extends string, TPayload>(
  type: TType,
  payload: TPayload,
  opts?: {
    id?: string;
    source?: RuntimeEventSource;
    correlationId?: string;
    causationId?: string;
    schemaVersion?: number;
    timestamp?: number;
  }
): RuntimeEventEnvelope<TType, TPayload> {
  return {
    id: opts?.id ?? nextEventId(),
    type,
    timestamp: opts?.timestamp ?? Date.now(),
    source: opts?.source ?? 'system',
    correlationId: opts?.correlationId,
    causationId: opts?.causationId,
    schemaVersion: opts?.schemaVersion ?? 1,
    payload,
  };
}

/** Returns the initial runtime store state used for bootstrapping. */
export function createInitialRuntimeState(): RuntimeState {
  return {
    session: { status: 'idle' },
    ui: {
      spec: null,
      schemaVersion: 1,
    },
    memory: {
      interactions: [],
    },
    theme: {
      tokens: {},
    },
  };
}
