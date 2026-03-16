import { nextGeneratedId } from '../../../id';
import type {
  BehaviorAggregate,
  BehaviorFinding,
  BehaviorFindingKind,
  BehaviorFindingSeverity,
  BehaviorSegment,
  BehaviorSessionSummary,
  BehaviorSignal,
} from './schemas';

export type AnalyzerDependency =
  | 'signals'
  | 'segments'
  | 'session_summaries'
  | 'aggregates'
  | 'resolved_preferences'
  | 'resolved_pattern_families'
  | 'resolved_reflections';

export type BehaviorAnalyzerFinding = BehaviorFinding;

export interface BehaviorAnalyzerInput {
  actorId: string;
  signals: BehaviorSignal[];
  segments: BehaviorSegment[];
  sessionSummaries: BehaviorSessionSummary[];
  aggregates: BehaviorAggregate[];
  now: number;
}

export interface BehaviorAnalyzerResult {
  findings: BehaviorAnalyzerFinding[];
  diagnostics?: string[];
}

export interface AnalyzerReadinessInput {
  actorId: string;
  dirtyDependencies: Set<AnalyzerDependency>;
  interactionCount: number;
  sessionCount: number;
  contextArchetypeCount: number;
  lastRunAt?: number;
  now: number;
}

export interface BehaviorAnalyzer {
  id: string;
  dependencies: AnalyzerDependency[];
  cadence: 'checkpoint' | 'rollup';
  minInteractions?: number;
  minSessions?: number;
  minContextArchetypes?: number;
  cooldownMs?: number;
  shouldRun?(input: AnalyzerReadinessInput): boolean;
  run(input: BehaviorAnalyzerInput): Promise<BehaviorAnalyzerResult> | BehaviorAnalyzerResult;
}

export function createBehaviorFinding(
  input: Omit<BehaviorAnalyzerFinding, 'id' | 'createdTs'> & {
    id?: string;
    createdTs?: number;
  },
): BehaviorAnalyzerFinding {
  return {
    ...input,
    id: input.id ?? nextGeneratedId('bfnd'),
    createdTs: input.createdTs ?? Date.now(),
  };
}
