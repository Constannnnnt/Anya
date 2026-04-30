import type { BehaviorAnalyzerInput } from '../analyzers';

export interface AnalyzerConfig {
  now?: () => number;
}

export interface PracticeSample {
  contextArchetype: string;
  sessionId: string;
  updatedTs: number;
  sequenceKey: string;
  burdenScore: number;
  retryCount: number;
  failureRate: number;
  dominantModality: string;
  evidenceRefs: string[];
}

export interface RecoveryTrace {
  contextArchetype: string;
  sessionId: string;
  steps: number;
  waitMs: number;
  signalIds: string[];
  sequenceKey: string;
}

export function resolveNow(input: BehaviorAnalyzerInput, config?: AnalyzerConfig): number {
  return config?.now?.() ?? input.now;
}
