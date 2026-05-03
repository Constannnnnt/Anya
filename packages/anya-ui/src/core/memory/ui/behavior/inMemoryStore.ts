import type {
  AppliedRecommendation,
  BehaviorAggregate,
  BehaviorComposite,
  BehaviorFinding,
  BehaviorSegment,
  BehaviorSessionSummary,
  BehaviorSignal,
} from './schemas';
import type {
  AppliedRecommendationQueryOptions,
  BehaviorAggregateQueryOptions,
  BehaviorCompositeQueryOptions,
  BehaviorFindingQueryOptions,
  BehaviorSegmentQueryOptions,
  BehaviorSessionSummaryQueryOptions,
  BehaviorSignalQueryOptions,
  BehaviorStore,
  BehaviorStoreSnapshot,
} from './store';

export class InMemoryBehaviorStore implements BehaviorStore {
  private readonly signals = new Map<string, BehaviorSignal>();
  private readonly signalIdsByActor = new Map<string, Set<string>>();
  private readonly segments = new Map<string, BehaviorSegment>();
  private readonly segmentIdsByActor = new Map<string, Set<string>>();
  private readonly sessionSummaries = new Map<string, BehaviorSessionSummary>();
  private readonly sessionSummaryIdsByActor = new Map<string, Set<string>>();
  private readonly aggregates = new Map<string, BehaviorAggregate>();
  private readonly aggregateIdsByActor = new Map<string, Set<string>>();
  private readonly findings = new Map<string, BehaviorFinding>();
  private readonly findingIdsByActor = new Map<string, Set<string>>();
  private readonly composites = new Map<string, BehaviorComposite>();
  private readonly compositeIdsByActor = new Map<string, Set<string>>();
  private readonly appliedRecommendations = new Map<string, AppliedRecommendation>();
  private readonly appliedRecommendationIdsByActor = new Map<string, Set<string>>();

  async upsertSignals(signals: BehaviorSignal[]): Promise<void> {
    for (const signal of signals) {
      upsertRecord(this.signals, this.signalIdsByActor, cloneSignal(signal));
    }
  }

  async findSignals(actorId: string, options?: BehaviorSignalQueryOptions): Promise<BehaviorSignal[]> {
    return collectIndexedRecords(
      this.signals,
      this.signalIdsByActor,
      actorId,
      options,
      (signal) =>
        (!options?.sessionId || signal.sessionId === options.sessionId)
        && (!options?.contextArchetype || signal.contextArchetype === options.contextArchetype)
        && (!options?.sourceEventType || signal.sourceEventType === options.sourceEventType),
      (record) => record.ts,
      cloneSignal,
    );
  }

  async upsertSegments(segments: BehaviorSegment[]): Promise<void> {
    for (const segment of segments) {
      upsertRecord(this.segments, this.segmentIdsByActor, cloneSegment(segment));
    }
  }

  async findSegments(actorId: string, options?: BehaviorSegmentQueryOptions): Promise<BehaviorSegment[]> {
    return collectIndexedRecords(
      this.segments,
      this.segmentIdsByActor,
      actorId,
      options,
      (segment) =>
        (!options?.sessionId || segment.sessionId === options.sessionId)
        && (!options?.contextArchetype || segment.contextArchetype === options.contextArchetype),
      (record) => record.endedTs,
      cloneSegment,
    );
  }

  async upsertSessionSummaries(summaries: BehaviorSessionSummary[]): Promise<void> {
    for (const summary of summaries) {
      upsertRecord(this.sessionSummaries, this.sessionSummaryIdsByActor, cloneSummary(summary));
    }
  }

  async findSessionSummaries(
    actorId: string,
    options?: BehaviorSessionSummaryQueryOptions,
  ): Promise<BehaviorSessionSummary[]> {
    return collectIndexedRecords(
      this.sessionSummaries,
      this.sessionSummaryIdsByActor,
      actorId,
      options,
      (summary) =>
        (!options?.sessionId || summary.sessionId === options.sessionId)
        && (!options?.contextArchetype || summary.contextArchetype === options.contextArchetype),
      (record) => record.updatedTs,
      cloneSummary,
    );
  }

  async upsertAggregates(aggregates: BehaviorAggregate[]): Promise<void> {
    for (const aggregate of aggregates) {
      upsertRecord(this.aggregates, this.aggregateIdsByActor, cloneAggregate(aggregate));
    }
  }

  async findAggregates(
    actorId: string,
    options?: BehaviorAggregateQueryOptions,
  ): Promise<BehaviorAggregate[]> {
    return collectIndexedRecords(
      this.aggregates,
      this.aggregateIdsByActor,
      actorId,
      options,
      (aggregate) =>
        (!options?.scopeKey || aggregate.scopeKey === options.scopeKey)
        && (!options?.contextArchetype || aggregate.contextArchetype === options.contextArchetype),
      (record) => record.updatedTs,
      cloneAggregate,
    );
  }

  async upsertFindings(findings: BehaviorFinding[]): Promise<void> {
    for (const finding of findings) {
      upsertRecord(this.findings, this.findingIdsByActor, cloneFinding(finding));
    }
  }

  async findFindings(
    actorId: string,
    options?: BehaviorFindingQueryOptions,
  ): Promise<BehaviorFinding[]> {
    return collectIndexedRecords(
      this.findings,
      this.findingIdsByActor,
      actorId,
      options,
      (finding) =>
        (!options?.analyzerId || finding.analyzerId === options.analyzerId)
        && (!options?.kind || finding.kind === options.kind),
      (record) => record.createdTs,
      cloneFinding,
    );
  }

  async upsertComposites(composites: BehaviorComposite[]): Promise<void> {
    for (const composite of composites) {
      upsertRecord(this.composites, this.compositeIdsByActor, cloneComposite(composite));
    }
  }

  async findComposites(
    actorId: string,
    options?: BehaviorCompositeQueryOptions,
  ): Promise<BehaviorComposite[]> {
    return collectIndexedRecords(
      this.composites,
      this.compositeIdsByActor,
      actorId,
      options,
      (composite) =>
        (!options?.kind || composite.kind === options.kind)
        && (!options?.contextArchetype || composite.contextArchetype === options.contextArchetype),
      (record) => record.updatedTs,
      cloneComposite,
    );
  }

  async upsertAppliedRecommendations(records: AppliedRecommendation[]): Promise<void> {
    for (const record of records) {
      upsertRecord(
        this.appliedRecommendations,
        this.appliedRecommendationIdsByActor,
        cloneAppliedRecommendation(record),
      );
    }
  }

  async findAppliedRecommendations(
    actorId: string,
    options?: AppliedRecommendationQueryOptions,
  ): Promise<AppliedRecommendation[]> {
    return collectIndexedRecords(
      this.appliedRecommendations,
      this.appliedRecommendationIdsByActor,
      actorId,
      options,
      (record) =>
        (!options?.contextArchetype || record.contextArchetype === options.contextArchetype)
        && (options?.resolved === undefined
          || (options.resolved ? record.resolvedTs !== undefined : record.resolvedTs === undefined)),
      (record) => record.appliedTs,
      cloneAppliedRecommendation,
    );
  }

  async exportJson(): Promise<BehaviorStoreSnapshot> {
    return {
      signals: [...this.signals.values()].map(cloneSignal),
      segments: [...this.segments.values()].map(cloneSegment),
      sessionSummaries: [...this.sessionSummaries.values()].map(cloneSummary),
      aggregates: [...this.aggregates.values()].map(cloneAggregate),
      findings: [...this.findings.values()].map(cloneFinding),
      composites: [...this.composites.values()].map(cloneComposite),
      appliedRecommendations: [...this.appliedRecommendations.values()].map(cloneAppliedRecommendation),
    };
  }
}

function ensureIndexBucket(index: Map<string, Set<string>>, actorId: string): Set<string> {
  let bucket = index.get(actorId);
  if (!bucket) {
    bucket = new Set<string>();
    index.set(actorId, bucket);
  }
  return bucket;
}

function upsertRecord<T extends { id: string; actorId: string }>(
  records: Map<string, T>,
  actorIndex: Map<string, Set<string>>,
  record: T,
): void {
  const previous = records.get(record.id);
  if (previous && previous.actorId !== record.actorId) {
    actorIndex.get(previous.actorId)?.delete(record.id);
  }

  ensureIndexBucket(actorIndex, record.actorId).add(record.id);
  records.set(record.id, record);
}

function collectIndexedRecords<T extends { actorId: string }>(
  records: Map<string, T>,
  actorIndex: Map<string, Set<string>>,
  actorId: string,
  options: { limit?: number } | undefined,
  predicate: (record: T) => boolean,
  sortValue: (record: T) => number,
  clone: (record: T) => T,
): T[] {
  if (options?.limit === 0) {
    return [];
  }

  const actorKeys = actorIndex.get(actorId);
  if (!actorKeys || actorKeys.size === 0) {
    return [];
  }

  const results: T[] = [];
  for (const key of actorKeys) {
    const record = records.get(key);
    if (record && predicate(record)) {
      results.push(record);
    }
  }

  results.sort((left, right) => sortValue(right) - sortValue(left));
  if (options?.limit !== undefined && options.limit >= 0) {
    return results.slice(0, options.limit).map(clone);
  }

  return results.map(clone);
}

function cloneSignal(signal: BehaviorSignal): BehaviorSignal {
  return { ...signal };
}

function cloneSegment(segment: BehaviorSegment): BehaviorSegment {
  return {
    ...segment,
    signalIds: [...segment.signalIds],
    modalityMix: [...segment.modalityMix],
  };
}

function cloneSummary(summary: BehaviorSessionSummary): BehaviorSessionSummary {
  return {
    ...summary,
    aggregateMetrics: { ...summary.aggregateMetrics },
  };
}

function cloneAggregate(aggregate: BehaviorAggregate): BehaviorAggregate {
  return {
    ...aggregate,
    aggregateMetrics: { ...aggregate.aggregateMetrics },
  };
}

function cloneFinding(finding: BehaviorFinding): BehaviorFinding {
  return {
    ...finding,
    evidenceRefs: [...finding.evidenceRefs],
    payload: { ...finding.payload },
  };
}

function cloneComposite(composite: BehaviorComposite): BehaviorComposite {
  return {
    ...composite,
    contributingAnalyzers: [...composite.contributingAnalyzers],
    findingIds: [...composite.findingIds],
  };
}

function cloneAppliedRecommendation(record: AppliedRecommendation): AppliedRecommendation {
  return { ...record };
}
