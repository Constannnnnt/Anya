import type { RuntimeEffect } from './effects';
import type { RuntimeEvent, RuntimeState } from './events';

export type RuntimeFailureOutcome = 'success' | 'failure' | null;

export interface RuntimeTelemetryEvent {
  kind: 'runtime.dispatch';
  timestamp: number;
  runtimeEvent: Pick<
    RuntimeEvent,
    'id' | 'type' | 'timestamp' | 'source' | 'correlationId' | 'causationId' | 'schemaVersion'
  >;
  sessionStatus: RuntimeState['session']['status'];
  lastEventId?: string;
  payload?: unknown;
  state?: RuntimeState;
}

export type RuntimeTelemetrySink = (event: RuntimeTelemetryEvent) => void;

export interface RuntimeTelemetryOptions {
  sink: RuntimeTelemetrySink;
  includePayload?: boolean;
  includeState?: boolean;
}

export function createRuntimeTelemetryEffect(opts: RuntimeTelemetryOptions): RuntimeEffect {
  return (event, context) => {
    const state = context.getState();
    opts.sink({
      kind: 'runtime.dispatch',
      timestamp: Date.now(),
      runtimeEvent: {
        id: event.id,
        type: event.type,
        timestamp: event.timestamp,
        source: event.source,
        correlationId: event.correlationId,
        causationId: event.causationId,
        schemaVersion: event.schemaVersion,
      },
      sessionStatus: state.session.status,
      lastEventId: state.lastEventId,
      payload: opts.includePayload === false ? undefined : event.payload,
      state: opts.includeState ? state : undefined,
    });
  };
}

export interface RuntimeFailureBudgetPolicy {
  /**
   * Policy label used in telemetry and alerting.
   */
  name?: string;
  /**
   * Sliding window size for classified outcomes.
   */
  windowSize?: number;
  /**
   * Number of classified samples before alerting can trigger.
   */
  minSamples?: number;
  /**
   * Failure ratio threshold for alerting.
   */
  thresholdRatio?: number;
  /**
   * Maps runtime events to success/failure outcomes.
   */
  classify?: (event: RuntimeEvent) => RuntimeFailureOutcome;
}

export interface RuntimeFailureBudgetSnapshot {
  policyName: string;
  timestamp: number;
  ratio: number;
  failureCount: number;
  sampleCount: number;
  thresholdRatio: number;
  windowSize: number;
  failingEventTypes: string[];
}

export interface RuntimeFailureBudgetExceeded extends RuntimeFailureBudgetSnapshot {
  kind: 'runtime.failure_budget.exceeded';
}

export interface RuntimeFailureBudgetRecovered extends RuntimeFailureBudgetSnapshot {
  kind: 'runtime.failure_budget.recovered';
}

export type RuntimeFailureBudgetSignal =
  | RuntimeFailureBudgetExceeded
  | RuntimeFailureBudgetRecovered;

export interface RuntimeFailureBudgetOptions {
  policy?: RuntimeFailureBudgetPolicy;
  onSignal: (signal: RuntimeFailureBudgetSignal) => void;
}

interface ClassifiedOutcome {
  outcome: 'success' | 'failure';
  eventType: string;
}

function defaultClassify(event: RuntimeEvent): RuntimeFailureOutcome {
  if (event.type === 'spec.decoded') return 'success';
  if (event.type === 'spec.decode_failed') return 'failure';
  return null;
}

function summarizeSignal(
  policyName: string,
  thresholdRatio: number,
  windowSize: number,
  samples: ClassifiedOutcome[]
): RuntimeFailureBudgetSnapshot {
  const sampleCount = samples.length;
  const failures = samples.filter((sample) => sample.outcome === 'failure');
  const failureCount = failures.length;
  const ratio = sampleCount > 0 ? failureCount / sampleCount : 0;
  const failingEventTypes = Array.from(new Set(failures.map((sample) => sample.eventType)));

  return {
    policyName,
    timestamp: Date.now(),
    ratio,
    failureCount,
    sampleCount,
    thresholdRatio,
    windowSize,
    failingEventTypes,
  };
}

export function createRuntimeFailureBudgetEffect(
  opts: RuntimeFailureBudgetOptions
): RuntimeEffect {
  const policyName = opts.policy?.name ?? 'spec_decode_slo';
  const windowSize = opts.policy?.windowSize ?? 50;
  const minSamples = opts.policy?.minSamples ?? 25;
  const thresholdRatio = opts.policy?.thresholdRatio ?? 0.2;
  const classify = opts.policy?.classify ?? defaultClassify;
  const samples: ClassifiedOutcome[] = [];
  let isAlerting = false;

  return (event) => {
    const outcome = classify(event);
    if (!outcome) return;

    samples.push({
      outcome,
      eventType: event.type,
    });
    if (samples.length > windowSize) {
      samples.shift();
    }

    if (samples.length < minSamples) return;

    const summary = summarizeSignal(policyName, thresholdRatio, windowSize, samples);
    const exceeds = summary.ratio > thresholdRatio;

    if (exceeds && !isAlerting) {
      isAlerting = true;
      opts.onSignal({
        kind: 'runtime.failure_budget.exceeded',
        ...summary,
      });
      return;
    }

    if (!exceeds && isAlerting) {
      isAlerting = false;
      opts.onSignal({
        kind: 'runtime.failure_budget.recovered',
        ...summary,
      });
    }
  };
}
