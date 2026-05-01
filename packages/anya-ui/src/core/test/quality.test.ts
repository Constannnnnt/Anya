import { describe, expect, it } from 'vitest';
import type { ActionResult, RuntimeTelemetryEvent } from '..';
import {
  evaluateBenchmarkRegression,
  evaluateQualityGates,
  summarizeBindingExecutionHistory,
  summarizeRuntimeTelemetry, } from '../internal';

describe('quality helpers', () => {
  it('summarizes runtime telemetry events', () => {
    const events: RuntimeTelemetryEvent[] = [
      {
        kind: 'runtime.dispatch',
        timestamp: 1000,
        runtimeEvent: {
          id: 'evt-1',
          type: 'spec.decoded',
          timestamp: 900,
          source: 'agent',
          schemaVersion: 1, },
        sessionStatus: 'rendering', },
      {
        kind: 'runtime.dispatch',
        timestamp: 2000,
        runtimeEvent: {
          id: 'evt-2',
          type: 'interaction.recorded',
          timestamp: 1900,
          source: 'user',
          schemaVersion: 1, },
        sessionStatus: 'idle', },
      {
        kind: 'runtime.dispatch',
        timestamp: 3000,
        runtimeEvent: {
          id: 'evt-3',
          type: 'spec.decode_failed',
          timestamp: 2900,
          source: 'agent',
          schemaVersion: 1, },
        sessionStatus: 'error', },
      {
        kind: 'runtime.dispatch',
        timestamp: 4000,
        runtimeEvent: {
          id: 'evt-4',
          type: 'spec.decoded',
          timestamp: 3900,
          source: 'agent',
          schemaVersion: 1, },
        sessionStatus: 'rendering', },
    ];

    const summary = summarizeRuntimeTelemetry(events);

    expect(summary.totalEvents).toBe(4);
    expect(summary.eventTypeCounts).toMatchObject({
      'spec.decoded': 2,
      'spec.decode_failed': 1,
      'interaction.recorded': 1, });
    expect(summary.decodeSampleCount).toBe(3);
    expect(summary.decodeFailureRatio).toBeCloseTo(1 / 3, 5);
    expect(summary.eventsPerSecond).toBeCloseTo(4 / 3, 5); });

  it('summarizes view execution history', () => {
    const records: ActionResult[] = [
      {
        bindingId: 'b-1',
        status: 'success',
        timestamp: 1,
        durationMs: 10,
        lane: 'optimistic',
        risk: 'safe',
        interaction: { timestamp: 1, nodeId: 'a', nodeType: 'Button', action: 'click' }, },
      {
        bindingId: 'b-2',
        status: 'error',
        timestamp: 2,
        durationMs: 20,
        lane: 'optimistic',
        risk: 'safe',
        rolledBack: true,
        error: 'tool failed',
        interaction: { timestamp: 2, nodeId: 'a', nodeType: 'Button', action: 'click' }, },
      {
        bindingId: 'b-3',
        status: 'skipped',
        timestamp: 3,
        lane: 'confirmed',
        risk: 'risky',
        error: 'State changed while interaction was running; skipped stale interaction result.',
        interaction: { timestamp: 3, nodeId: 'a', nodeType: 'Button', action: 'click' }, },
      {
        bindingId: 'b-4',
        status: 'success',
        timestamp: 4,
        lane: 'confirmed',
        risk: 'risky',
        interaction: { timestamp: 4, nodeId: 'a', nodeType: 'Button', action: 'click' }, },
      {
        bindingId: 'b-5',
        status: 'success',
        timestamp: 5,
        durationMs: 30,
        lane: 'optimistic',
        risk: 'safe',
        interaction: { timestamp: 5, nodeId: 'a', nodeType: 'Button', action: 'click' }, },
    ];

    const summary = summarizeBindingExecutionHistory(records);

    expect(summary.totalRecords).toBe(5);
    expect(summary.successCount).toBe(3);
    expect(summary.errorCount).toBe(1);
    expect(summary.skippedCount).toBe(1);
    expect(summary.optimisticSampleCount).toBe(3);
    expect(summary.optimisticRollbackCount).toBe(1);
    expect(summary.optimisticRollbackRate).toBeCloseTo(1 / 3, 5);
    expect(summary.staleSkippedCount).toBe(1);
    expect(summary.staleSkipRate).toBeCloseTo(0.2, 5);
    expect(summary.averageDurationMs).toBeCloseTo(20, 5);
    expect(summary.p95DurationMs).toBe(30); });

  it('evaluates quality gates with pass, fail, and skip checks', () => {
    const pass = evaluateQualityGates({
      benchmarks: {
        runtimeEventsPerSecond: 700_000,
        viewPatchOpsPerSecond: 1_100,
        viewRebuildOpsPerSecond: 1_050, },
      runtimeTelemetry: {
        totalEvents: 50,
        eventTypeCounts: {
          'spec.decoded': 24,
          'spec.decode_failed': 6, },
        decodeSampleCount: 30,
        decodeSuccessCount: 24,
        decodeFailureCount: 6,
        decodeFailureRatio: 0.2,
        windowMs: 1000,
        eventsPerSecond: 50, },
      viewExecutions: {
        totalRecords: 40,
        successCount: 34,
        errorCount: 4,
        skippedCount: 2,
        optimisticSampleCount: 30,
        optimisticRollbackCount: 3,
        optimisticRollbackRate: 0.1,
        staleSkippedCount: 1,
        staleSkipRate: 0.025,
        averageDurationMs: 12,
        p95DurationMs: 35, }, });

    expect(pass.passed).toBe(true);
    expect(pass.checks.every((check) => check.status !== 'fail')).toBe(true);

    const fail = evaluateQualityGates({
      benchmarks: {
        runtimeEventsPerSecond: 200_000,
        viewPatchOpsPerSecond: 900,
        viewRebuildOpsPerSecond: 900, }, });

    expect(fail.passed).toBe(false);
    expect(fail.checks.find((check) => check.id === 'benchmark.runtime.min_events_per_second')?.status)
      .toBe('fail');
    expect(fail.checks.find((check) => check.id === 'runtime.decode.max_failure_ratio')?.status)
      .toBe('skip'); });

  it('evaluates benchmark regression budgets', () => {
    const regression = evaluateBenchmarkRegression(
      {
        runtimeEventsPerSecond: 850,
        viewPatchOpsPerSecond: 70,
        viewRebuildOpsPerSecond: 130, },
      {
        runtimeEventsPerSecond: 1_000,
        viewPatchOpsPerSecond: 100,
        viewRebuildOpsPerSecond: 100, },
      {
        maxRuntimeDropRatio: 0.1,
        maxViewPatchDropRatio: 0.1,
        maxViewRebuildDropRatio: 0.2, }
    );

    expect(regression.passed).toBe(false);
    expect(regression.checks.find((check) => check.id === 'benchmark.runtime.regression')?.status).toBe('fail');
    expect(regression.checks.find((check) => check.id === 'benchmark.view.patch.regression')?.status)
      .toBe('fail');
    expect(regression.checks.find((check) => check.id === 'benchmark.view.rebuild.regression')?.status)
      .toBe('pass'); }); });
