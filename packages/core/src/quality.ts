/**
 * Quality gate evaluators and summary builders used in release checks.
 * All functions are deterministic and side-effect free.
 */
import type { BindingExecutionRecord } from './presentation/types';
import type { RuntimeTelemetryEvent } from './runtime';

export interface BenchmarkThroughputMetrics {
  runtimeEventsPerSecond: number;
  presentationPatchOpsPerSecond: number;
  presentationRebuildOpsPerSecond: number;
}

export interface RuntimeTelemetrySummary {
  totalEvents: number;
  eventTypeCounts: Record<string, number>;
  decodeSampleCount: number;
  decodeSuccessCount: number;
  decodeFailureCount: number;
  decodeFailureRatio: number | null;
  firstTimestamp?: number;
  lastTimestamp?: number;
  windowMs: number;
  eventsPerSecond: number | null;
}

export interface PresentationExecutionSummary {
  totalRecords: number;
  successCount: number;
  errorCount: number;
  skippedCount: number;
  optimisticSampleCount: number;
  optimisticRollbackCount: number;
  optimisticRollbackRate: number | null;
  staleSkippedCount: number;
  staleSkipRate: number | null;
  averageDurationMs: number | null;
  p95DurationMs: number | null;
}

export interface QualityGatePolicy {
  minRuntimeEventsPerSecond: number;
  minPresentationPatchOpsPerSecond: number;
  minPresentationRebuildOpsPerSecond: number;
  maxDecodeFailureRatio: number;
  minDecodeSamples: number;
  maxOptimisticRollbackRate: number;
  minOptimisticSamples: number;
  maxStaleSkipRate: number;
  minExecutionSamples: number;
}

export const DEFAULT_QUALITY_GATE_POLICY: QualityGatePolicy = {
  minRuntimeEventsPerSecond: 500_000,
  minPresentationPatchOpsPerSecond: 800,
  minPresentationRebuildOpsPerSecond: 800,
  maxDecodeFailureRatio: 0.2,
  minDecodeSamples: 25,
  maxOptimisticRollbackRate: 0.15,
  minOptimisticSamples: 20,
  maxStaleSkipRate: 0.05,
  minExecutionSamples: 20,
};

export interface BenchmarkRegressionPolicy {
  maxRuntimeDropRatio: number;
  maxPresentationPatchDropRatio: number;
  maxPresentationRebuildDropRatio: number;
}

export const DEFAULT_BENCHMARK_REGRESSION_POLICY: BenchmarkRegressionPolicy = {
  maxRuntimeDropRatio: 0.3,
  maxPresentationPatchDropRatio: 0.25,
  maxPresentationRebuildDropRatio: 0.25,
};

export type QualityCheckStatus = 'pass' | 'fail' | 'skip';

export interface QualityGateCheck {
  id: string;
  status: QualityCheckStatus;
  message: string;
  actual?: number | null;
  expected?: number;
}

export interface QualityGateInput {
  benchmarks: BenchmarkThroughputMetrics;
  runtimeTelemetry?: RuntimeTelemetrySummary;
  presentationExecutions?: PresentationExecutionSummary;
  policy?: Partial<QualityGatePolicy>;
}

export interface QualityGateEvaluation {
  passed: boolean;
  policy: QualityGatePolicy;
  checks: QualityGateCheck[];
}

export interface BenchmarkRegressionCheck {
  id: string;
  status: QualityCheckStatus;
  message: string;
  current: number;
  baseline: number;
  minAllowed?: number;
  dropRatio?: number;
}

export interface BenchmarkRegressionEvaluation {
  passed: boolean;
  policy: BenchmarkRegressionPolicy;
  checks: BenchmarkRegressionCheck[];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function ratio(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return numerator / denominator;
}

function percentile(values: number[], quantile: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(quantile * sorted.length) - 1));
  return sorted[index];
}

function buildQualityPolicy(policy?: Partial<QualityGatePolicy>): QualityGatePolicy {
  return {
    ...DEFAULT_QUALITY_GATE_POLICY,
    ...policy,
  };
}

function buildRegressionPolicy(policy?: Partial<BenchmarkRegressionPolicy>): BenchmarkRegressionPolicy {
  return {
    ...DEFAULT_BENCHMARK_REGRESSION_POLICY,
    ...policy,
  };
}

export function summarizeRuntimeTelemetry(events: RuntimeTelemetryEvent[]): RuntimeTelemetrySummary {
  const eventTypeCounts: Record<string, number> = {};
  let decodeSuccessCount = 0;
  let decodeFailureCount = 0;
  let firstTimestamp: number | undefined;
  let lastTimestamp: number | undefined;

  for (const event of events) {
    const eventType = event.runtimeEvent.type;
    eventTypeCounts[eventType] = (eventTypeCounts[eventType] ?? 0) + 1;

    if (eventType === 'spec.decoded') decodeSuccessCount += 1;
    if (eventType === 'spec.decode_failed') decodeFailureCount += 1;

    if (firstTimestamp === undefined || event.timestamp < firstTimestamp) {
      firstTimestamp = event.timestamp;
    }
    if (lastTimestamp === undefined || event.timestamp > lastTimestamp) {
      lastTimestamp = event.timestamp;
    }
  }

  const decodeSampleCount = decodeSuccessCount + decodeFailureCount;
  const windowMs = firstTimestamp !== undefined && lastTimestamp !== undefined
    ? Math.max(0, lastTimestamp - firstTimestamp)
    : 0;
  const eventsPerSecond = windowMs > 0
    ? (events.length / windowMs) * 1000
    : null;

  return {
    totalEvents: events.length,
    eventTypeCounts,
    decodeSampleCount,
    decodeSuccessCount,
    decodeFailureCount,
    decodeFailureRatio: ratio(decodeFailureCount, decodeSampleCount),
    firstTimestamp,
    lastTimestamp,
    windowMs,
    eventsPerSecond,
  };
}

export function summarizeBindingExecutionHistory(
  records: BindingExecutionRecord[]
): PresentationExecutionSummary {
  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;
  let optimisticSampleCount = 0;
  let optimisticRollbackCount = 0;
  let staleSkippedCount = 0;
  const durations: number[] = [];

  for (const record of records) {
    if (record.status === 'success') successCount += 1;
    if (record.status === 'error') errorCount += 1;
    if (record.status === 'skipped') skippedCount += 1;

    if (record.lane === 'optimistic') {
      optimisticSampleCount += 1;
      if (record.rolledBack) optimisticRollbackCount += 1;
    }

    const message = record.error?.toLowerCase() ?? '';
    if (record.status === 'skipped' && message.includes('stale')) {
      staleSkippedCount += 1;
    }

    if (isFiniteNumber(record.durationMs) && record.durationMs >= 0) {
      durations.push(record.durationMs);
    }
  }

  const averageDurationMs = durations.length > 0
    ? durations.reduce((sum, value) => sum + value, 0) / durations.length
    : null;

  return {
    totalRecords: records.length,
    successCount,
    errorCount,
    skippedCount,
    optimisticSampleCount,
    optimisticRollbackCount,
    optimisticRollbackRate: ratio(optimisticRollbackCount, optimisticSampleCount),
    staleSkippedCount,
    staleSkipRate: ratio(staleSkippedCount, records.length),
    averageDurationMs,
    p95DurationMs: percentile(durations, 0.95),
  };
}

function minCheck(id: string, label: string, actual: number, expectedMin: number): QualityGateCheck {
  if (!isFiniteNumber(actual)) {
    return {
      id,
      status: 'fail',
      message: `${label} is not a finite number.`,
      actual: null,
      expected: expectedMin,
    };
  }

  if (actual >= expectedMin) {
    return {
      id,
      status: 'pass',
      message: `${label} passed.`,
      actual,
      expected: expectedMin,
    };
  }

  return {
    id,
    status: 'fail',
    message: `${label} below threshold.`,
    actual,
    expected: expectedMin,
  };
}

function maxCheck(id: string, label: string, actual: number, expectedMax: number): QualityGateCheck {
  if (!isFiniteNumber(actual)) {
    return {
      id,
      status: 'fail',
      message: `${label} is not a finite number.`,
      actual: null,
      expected: expectedMax,
    };
  }

  if (actual <= expectedMax) {
    return {
      id,
      status: 'pass',
      message: `${label} passed.`,
      actual,
      expected: expectedMax,
    };
  }

  return {
    id,
    status: 'fail',
    message: `${label} above threshold.`,
    actual,
    expected: expectedMax,
  };
}

export function evaluateQualityGates(input: QualityGateInput): QualityGateEvaluation {
  const policy = buildQualityPolicy(input.policy);
  const checks: QualityGateCheck[] = [];

  checks.push(minCheck(
    'benchmark.runtime.min_events_per_second',
    'Runtime throughput',
    input.benchmarks.runtimeEventsPerSecond,
    policy.minRuntimeEventsPerSecond
  ));
  checks.push(minCheck(
    'benchmark.presentation.min_patch_ops_per_second',
    'Presentation patch throughput',
    input.benchmarks.presentationPatchOpsPerSecond,
    policy.minPresentationPatchOpsPerSecond
  ));
  checks.push(minCheck(
    'benchmark.presentation.min_rebuild_ops_per_second',
    'Presentation rebuild throughput',
    input.benchmarks.presentationRebuildOpsPerSecond,
    policy.minPresentationRebuildOpsPerSecond
  ));

  if (!input.runtimeTelemetry || input.runtimeTelemetry.decodeSampleCount < policy.minDecodeSamples) {
    checks.push({
      id: 'runtime.decode.max_failure_ratio',
      status: 'skip',
      message: `Not enough decode samples (need ${policy.minDecodeSamples}).`,
      actual: input.runtimeTelemetry?.decodeSampleCount ?? 0,
      expected: policy.maxDecodeFailureRatio,
    });
  } else {
    checks.push(maxCheck(
      'runtime.decode.max_failure_ratio',
      'Runtime decode failure ratio',
      input.runtimeTelemetry.decodeFailureRatio ?? 0,
      policy.maxDecodeFailureRatio
    ));
  }

  if (
    !input.presentationExecutions
    || input.presentationExecutions.optimisticSampleCount < policy.minOptimisticSamples
  ) {
    checks.push({
      id: 'presentation.optimistic.max_rollback_rate',
      status: 'skip',
      message: `Not enough optimistic samples (need ${policy.minOptimisticSamples}).`,
      actual: input.presentationExecutions?.optimisticSampleCount ?? 0,
      expected: policy.maxOptimisticRollbackRate,
    });
  } else {
    checks.push(maxCheck(
      'presentation.optimistic.max_rollback_rate',
      'Optimistic rollback rate',
      input.presentationExecutions.optimisticRollbackRate ?? 0,
      policy.maxOptimisticRollbackRate
    ));
  }

  if (
    !input.presentationExecutions
    || input.presentationExecutions.totalRecords < policy.minExecutionSamples
  ) {
    checks.push({
      id: 'presentation.execution.max_stale_skip_rate',
      status: 'skip',
      message: `Not enough execution samples (need ${policy.minExecutionSamples}).`,
      actual: input.presentationExecutions?.totalRecords ?? 0,
      expected: policy.maxStaleSkipRate,
    });
  } else {
    checks.push(maxCheck(
      'presentation.execution.max_stale_skip_rate',
      'Stale interaction skip rate',
      input.presentationExecutions.staleSkipRate ?? 0,
      policy.maxStaleSkipRate
    ));
  }

  return {
    passed: checks.every((check) => check.status !== 'fail'),
    policy,
    checks,
  };
}

function regressionCheck(
  id: string,
  label: string,
  current: number,
  baseline: number,
  maxDropRatio: number
): BenchmarkRegressionCheck {
  if (!isFiniteNumber(current) || !isFiniteNumber(baseline) || baseline <= 0) {
    return {
      id,
      status: 'skip',
      message: `${label} skipped due to invalid baseline/current metric.`,
      current,
      baseline,
    };
  }

  const minAllowed = baseline * (1 - maxDropRatio);
  const dropRatio = (baseline - current) / baseline;

  if (current >= minAllowed) {
    return {
      id,
      status: 'pass',
      message: `${label} within allowed regression budget.`,
      current,
      baseline,
      minAllowed,
      dropRatio,
    };
  }

  return {
    id,
    status: 'fail',
    message: `${label} regressed beyond allowed budget.`,
    current,
    baseline,
    minAllowed,
    dropRatio,
  };
}

export function evaluateBenchmarkRegression(
  current: BenchmarkThroughputMetrics,
  baseline: BenchmarkThroughputMetrics,
  policy?: Partial<BenchmarkRegressionPolicy>
): BenchmarkRegressionEvaluation {
  const resolvedPolicy = buildRegressionPolicy(policy);
  const checks: BenchmarkRegressionCheck[] = [
    regressionCheck(
      'benchmark.runtime.regression',
      'Runtime throughput regression',
      current.runtimeEventsPerSecond,
      baseline.runtimeEventsPerSecond,
      resolvedPolicy.maxRuntimeDropRatio
    ),
    regressionCheck(
      'benchmark.presentation.patch.regression',
      'Presentation patch throughput regression',
      current.presentationPatchOpsPerSecond,
      baseline.presentationPatchOpsPerSecond,
      resolvedPolicy.maxPresentationPatchDropRatio
    ),
    regressionCheck(
      'benchmark.presentation.rebuild.regression',
      'Presentation rebuild throughput regression',
      current.presentationRebuildOpsPerSecond,
      baseline.presentationRebuildOpsPerSecond,
      resolvedPolicy.maxPresentationRebuildDropRatio
    ),
  ];

  return {
    passed: checks.every((check) => check.status !== 'fail'),
    policy: resolvedPolicy,
    checks,
  };
}
