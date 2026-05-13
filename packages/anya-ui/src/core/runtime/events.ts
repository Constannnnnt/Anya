export type RuntimeEventSource = 'user' | 'system' | 'agent' | 'effect' | (string & {});

export interface RuntimeEvent {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  timestamp: number;
  source: RuntimeEventSource;
  metadata?: Record<string, unknown>;
  correlationId?: string;
  causationId?: string;
}
