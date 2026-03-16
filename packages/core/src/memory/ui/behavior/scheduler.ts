import type {
  AnalyzerDependency,
  AnalyzerReadinessInput,
  BehaviorAnalyzer,
  BehaviorAnalyzerFinding,
  BehaviorAnalyzerInput,
  BehaviorAnalyzerResult,
} from './analyzers';
import { BehaviorDirtyTracker } from './dirtyTracker';
import { BehaviorAnalyzerRegistry } from './analyzerRegistry';
import type {
  BehaviorAggregate,
  BehaviorSegment,
  BehaviorSessionSummary,
  BehaviorSignal,
} from './schemas';

export interface BehaviorSchedulerState {
  lastRunAtByAnalyzer: Record<string, number>;
}

export interface BehaviorSchedulerPolicy {
  maxRuntimeMs: number;
  maxAnalyzersPerRun: number;
  continueOnAnalyzerError: boolean;
  now?: () => number;
}

export interface BehaviorSchedulerRunRecord {
  analyzerId: string;
  status: 'completed' | 'skipped' | 'failed';
  reason?: string;
  durationMs?: number;
  findingCount?: number;
}

export interface BehaviorSchedulerResult {
  findings: BehaviorAnalyzerFinding[];
  diagnostics: string[];
  runRecords: BehaviorSchedulerRunRecord[];
  nextState: BehaviorSchedulerState;
}

export interface BehaviorSchedulerInput {
  actorId: string;
  signals: BehaviorSignal[];
  segments: BehaviorSegment[];
  sessionSummaries: BehaviorSessionSummary[];
  aggregates: BehaviorAggregate[];
  dirtyTracker: BehaviorDirtyTracker;
  state?: BehaviorSchedulerState;
}

export const DEFAULT_BEHAVIOR_SCHEDULER_POLICY: BehaviorSchedulerPolicy = Object.freeze({
  maxRuntimeMs: 250,
  maxAnalyzersPerRun: 12,
  continueOnAnalyzerError: true,
});

export class BehaviorAnalysisScheduler {
  private readonly registry: BehaviorAnalyzerRegistry;
  private readonly policy: BehaviorSchedulerPolicy;

  constructor(
    registry: BehaviorAnalyzerRegistry,
    policy?: Partial<BehaviorSchedulerPolicy>,
  ) {
    this.registry = registry;
    this.policy = {
      ...DEFAULT_BEHAVIOR_SCHEDULER_POLICY,
      ...policy,
    };
  }

  async run(input: BehaviorSchedulerInput): Promise<BehaviorSchedulerResult> {
    const nowFn = this.policy.now ?? Date.now;
    const dirtyDependencies = input.dirtyTracker.snapshot();
    const state: BehaviorSchedulerState = {
      lastRunAtByAnalyzer: { ...(input.state?.lastRunAtByAnalyzer ?? {}) },
    };
    const findings: BehaviorAnalyzerFinding[] = [];
    const diagnostics: string[] = [];
    const runRecords: BehaviorSchedulerRunRecord[] = [];
    const startedAt = nowFn();
    let executed = 0;

    for (const analyzer of this.registry.list()) {
      const shouldRunCheck = buildReadinessInput(analyzer, input.actorId, dirtyDependencies, input, state, nowFn());
      const skipReason = getSkipReason(analyzer, shouldRunCheck, this.policy, startedAt, nowFn, executed);
      if (skipReason) {
        runRecords.push({ analyzerId: analyzer.id, status: 'skipped', reason: skipReason });
        continue;
      }
      if (analyzer.shouldRun && !analyzer.shouldRun(shouldRunCheck)) {
        runRecords.push({ analyzerId: analyzer.id, status: 'skipped', reason: 'custom-should-run-returned-false' });
        continue;
      }

      const runStartedAt = nowFn();
      try {
        const result = await analyzer.run({
          actorId: input.actorId,
          signals: input.signals,
          segments: input.segments,
          sessionSummaries: input.sessionSummaries,
          aggregates: input.aggregates,
          now: runStartedAt,
        });
        findings.push(...result.findings);
        if (result.diagnostics?.length) {
          diagnostics.push(...result.diagnostics.map((message) => `[${analyzer.id}] ${message}`));
        }
        const durationMs = Math.max(0, nowFn() - runStartedAt);
        runRecords.push({
          analyzerId: analyzer.id,
          status: 'completed',
          durationMs,
          findingCount: result.findings.length,
        });
        state.lastRunAtByAnalyzer[analyzer.id] = runStartedAt;
        executed += 1;
      } catch (error) {
        const durationMs = Math.max(0, nowFn() - runStartedAt);
        const message = error instanceof Error ? error.message : String(error);
        runRecords.push({ analyzerId: analyzer.id, status: 'failed', durationMs, reason: message });
        diagnostics.push(`[${analyzer.id}] ${message}`);
        if (!this.policy.continueOnAnalyzerError) {
          break;
        }
      }
    }

    return {
      findings,
      diagnostics,
      runRecords,
      nextState: state,
    };
  }
}

function buildReadinessInput(
  analyzer: BehaviorAnalyzer,
  actorId: string,
  dirtyDependencies: Set<AnalyzerDependency>,
  input: BehaviorSchedulerInput,
  state: BehaviorSchedulerState,
  now: number,
): AnalyzerReadinessInput {
  return {
    actorId,
    dirtyDependencies,
    interactionCount: input.segments.reduce((sum, segment) => sum + segment.interactionCount, 0),
    sessionCount: new Set(input.sessionSummaries.map((summary) => summary.sessionId)).size,
    contextArchetypeCount: new Set(input.sessionSummaries.map((summary) => summary.contextArchetype)).size,
    lastRunAt: state.lastRunAtByAnalyzer[analyzer.id],
    now,
  };
}

function getSkipReason(
  analyzer: BehaviorAnalyzer,
  readiness: AnalyzerReadinessInput,
  policy: BehaviorSchedulerPolicy,
  startedAt: number,
  nowFn: () => number,
  executed: number,
): string | null {
  if (!hasDirtyDependency(analyzer.dependencies, readiness.dirtyDependencies)) {
    return 'no-dirty-dependencies';
  }
  if (typeof analyzer.minInteractions === 'number' && readiness.interactionCount < analyzer.minInteractions) {
    return 'insufficient-interactions';
  }
  if (typeof analyzer.minSessions === 'number' && readiness.sessionCount < analyzer.minSessions) {
    return 'insufficient-sessions';
  }
  if (
    typeof analyzer.minContextArchetypes === 'number'
    && readiness.contextArchetypeCount < analyzer.minContextArchetypes
  ) {
    return 'insufficient-context-archetypes';
  }
  const cooldownMs = analyzer.cooldownMs ?? 0;
  if (typeof readiness.lastRunAt === 'number' && readiness.now - readiness.lastRunAt < cooldownMs) {
    return 'cooldown-active';
  }
  if (executed >= policy.maxAnalyzersPerRun) {
    return 'max-analyzers-per-run-exceeded';
  }
  if (nowFn() - startedAt >= policy.maxRuntimeMs) {
    return 'runtime-budget-exceeded';
  }
  return null;
}

function hasDirtyDependency(
  dependencies: AnalyzerDependency[],
  dirtyDependencies: Set<AnalyzerDependency>,
): boolean {
  return dependencies.some((dependency) => dirtyDependencies.has(dependency));
}
