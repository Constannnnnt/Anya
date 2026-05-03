import type {
  AppliedRecommendation,
  BehaviorAggregate,
  BehaviorComposite,
  BehaviorCompositeKind,
  BehaviorFinding,
  BehaviorSegment,
  BehaviorSessionSummary,
  BehaviorSignal,
} from './schemas';

export interface BehaviorSignalQueryOptions {
  sessionId?: string;
  contextArchetype?: string;
  sourceEventType?: string;
  limit?: number;
}

export interface BehaviorSegmentQueryOptions {
  sessionId?: string;
  contextArchetype?: string;
  limit?: number;
}

export interface BehaviorSessionSummaryQueryOptions {
  sessionId?: string;
  contextArchetype?: string;
  limit?: number;
}

export interface BehaviorAggregateQueryOptions {
  scopeKey?: string;
  contextArchetype?: string;
  limit?: number;
}

export interface BehaviorFindingQueryOptions {
  analyzerId?: string;
  kind?: BehaviorFinding['kind'];
  limit?: number;
}

export interface BehaviorCompositeQueryOptions {
  kind?: BehaviorCompositeKind;
  contextArchetype?: string;
  limit?: number;
}

export interface AppliedRecommendationQueryOptions {
  contextArchetype?: string;
  resolved?: boolean;
  limit?: number;
}

export interface BehaviorStoreSnapshot {
  signals: BehaviorSignal[];
  segments: BehaviorSegment[];
  sessionSummaries: BehaviorSessionSummary[];
  aggregates: BehaviorAggregate[];
  findings: BehaviorFinding[];
  composites: BehaviorComposite[];
  appliedRecommendations: AppliedRecommendation[];
}

export interface BehaviorStore {
  upsertSignals(signals: BehaviorSignal[]): Promise<void>;
  findSignals(actorId: string, options?: BehaviorSignalQueryOptions): Promise<BehaviorSignal[]>;
  upsertSegments(segments: BehaviorSegment[]): Promise<void>;
  findSegments(actorId: string, options?: BehaviorSegmentQueryOptions): Promise<BehaviorSegment[]>;
  upsertSessionSummaries(summaries: BehaviorSessionSummary[]): Promise<void>;
  findSessionSummaries(
    actorId: string,
    options?: BehaviorSessionSummaryQueryOptions,
  ): Promise<BehaviorSessionSummary[]>;
  upsertAggregates(aggregates: BehaviorAggregate[]): Promise<void>;
  findAggregates(actorId: string, options?: BehaviorAggregateQueryOptions): Promise<BehaviorAggregate[]>;
  upsertFindings(findings: BehaviorFinding[]): Promise<void>;
  findFindings(actorId: string, options?: BehaviorFindingQueryOptions): Promise<BehaviorFinding[]>;
  upsertComposites(composites: BehaviorComposite[]): Promise<void>;
  findComposites(actorId: string, options?: BehaviorCompositeQueryOptions): Promise<BehaviorComposite[]>;
  upsertAppliedRecommendations(records: AppliedRecommendation[]): Promise<void>;
  findAppliedRecommendations(
    actorId: string,
    options?: AppliedRecommendationQueryOptions,
  ): Promise<AppliedRecommendation[]>;
  exportJson(): Promise<BehaviorStoreSnapshot>;
}
