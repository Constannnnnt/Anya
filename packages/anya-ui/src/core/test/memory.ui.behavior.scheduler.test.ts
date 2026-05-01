import { describe, expect, it, vi } from 'vitest';
import { createBehaviorFinding, type BehaviorAnalyzer } from '../memory/ui/behavior/analyzers';
import { BehaviorAnalyzerRegistry } from '../memory/ui/behavior/analyzerRegistry';
import { BehaviorDirtyTracker } from '../memory/ui/behavior/dirtyTracker';
import {
  BehaviorAnalysisScheduler,
  DEFAULT_BEHAVIOR_SCHEDULER_POLICY, } from '../memory/ui/behavior/scheduler';
import {
  DEFAULT_FINDING_INTERPRETER_POLICY,
  isFindingKindAllowed,
  shouldRetainAsDiagnostic,
  shouldRetainForLocalAdaptation, } from '../memory/ui/behavior/policy';
import type {
  BehaviorAggregate,
  BehaviorSegment,
  BehaviorSessionSummary,
  BehaviorSignal, } from '../memory/ui/behavior';

function makeSignal(overrides: Partial<BehaviorSignal> = { }): BehaviorSignal {
  return {
    id: `sig-${Math.random().toString(36).slice(2, 8) }`,
    actorId: 'actor-1',
    sessionId: 'session-1',
    sourceEventId: 'evt-1',
    sourceEventType: 'interaction.measured',
    ts: 1,
    contextArchetype: 'browse_scan',
    modality: 'pointer',
    ...overrides, }; }

function makeSegment(overrides: Partial<BehaviorSegment> = { }): BehaviorSegment {
  return {
    id: `seg-${Math.random().toString(36).slice(2, 8) }`,
    actorId: 'actor-1',
    sessionId: 'session-1',
    contextArchetype: 'browse_scan',
    startedTs: 1,
    endedTs: 2,
    signalIds: ['sig-1'],
    interactionCount: 1,
    modalityMix: ['pointer'],
    successCount: 1,
    failureCount: 0,
    retryCount: 0,
    ...overrides, }; }

function makeSummary(overrides: Partial<BehaviorSessionSummary> = { }): BehaviorSessionSummary {
  return {
    id: `sum-${Math.random().toString(36).slice(2, 8) }`,
    actorId: 'actor-1',
    sessionId: 'session-1',
    contextArchetype: 'browse_scan',
    signalCount: 1,
    segmentCount: 1,
    interactionCount: 1,
    aggregateMetrics: { },
    updatedTs: 3,
    ...overrides, }; }

function makeAggregate(overrides: Partial<BehaviorAggregate> = { }): BehaviorAggregate {
  return {
    id: `agg-${Math.random().toString(36).slice(2, 8) }`,
    actorId: 'actor-1',
    scopeKey: 'global',
    windowStartTs: 1,
    windowEndTs: 10,
    sessionCount: 1,
    interactionCount: 1,
    aggregateMetrics: { },
    updatedTs: 10,
    ...overrides, }; }

describe('BehaviorAnalysisScheduler', () => {
  it('runs only analyzers with dirty dependencies and sufficient readiness', async () => {
    const registry = new BehaviorAnalyzerRegistry();
    const runLostness = vi.fn(async () => ({
      findings: [createBehaviorFinding({
        actorId: 'actor-1',
        analyzerId: 'lostness_light',
        kind: 'reflection_candidate',
        conceptKey: 'navigation-lostness',
        confidence: 0.8,
        support: 3,
        evidenceRefs: ['sig-1'],
        payload: { }, })], }));
    const runHick = vi.fn(async () => ({ findings: [] }));
    registry.register({
      id: 'lostness_light',
      dependencies: ['aggregates'],
      cadence: 'rollup',
      minInteractions: 2,
      minSessions: 2,
      minContextArchetypes: 1,
      run: runLostness, }).register({
      id: 'hick_hyman',
      dependencies: ['session_summaries'],
      cadence: 'checkpoint',
      run: runHick, });

    const tracker = new BehaviorDirtyTracker();
    tracker.markDirty('aggregates');

    const scheduler = new BehaviorAnalysisScheduler(registry);
    const result = await scheduler.run({
      actorId: 'actor-1',
      signals: [makeSignal(), makeSignal({ id: 'sig-2', sessionId: 'session-2', ts: 2 })],
      segments: [makeSegment(), makeSegment({ id: 'seg-2', sessionId: 'session-2' })],
      sessionSummaries: [makeSummary(), makeSummary({ id: 'sum-2', sessionId: 'session-2' })],
      aggregates: [makeAggregate()],
      dirtyTracker: tracker, });

    expect(runLostness).toHaveBeenCalledTimes(1);
    expect(runHick).not.toHaveBeenCalled();
    expect(result.findings).toHaveLength(1);
    expect(result.runRecords).toEqual([
      expect.objectContaining({ analyzerId: 'lostness_light', status: 'completed' }),
      expect.objectContaining({ analyzerId: 'hick_hyman', status: 'skipped', reason: 'no-dirty-dependencies' }),
    ]); });

  it('enforces cooldowns and continues on analyzer errors by policy', async () => {
    const registry = new BehaviorAnalyzerRegistry();
    const sequence = [1000, 1000, 1006, 1006, 1006, 1006];
    const now = vi.fn(() => sequence.shift() ?? 1006);
    const failingAnalyzer: BehaviorAnalyzer = {
      id: 'error_recovery_cost',
      dependencies: ['aggregates'],
      cadence: 'rollup',
      run: async () => {
        throw new Error('boom'); }, };
    const skippedAnalyzer: BehaviorAnalyzer = {
      id: 'practice_curve',
      dependencies: ['aggregates'],
      cadence: 'rollup',
      cooldownMs: 100,
      run: async () => ({ findings: [] }), };
    registry.register(failingAnalyzer).register(skippedAnalyzer);

    const tracker = new BehaviorDirtyTracker();
    tracker.markDirty('aggregates');

    const scheduler = new BehaviorAnalysisScheduler(registry, {
      ...DEFAULT_BEHAVIOR_SCHEDULER_POLICY,
      now,
      maxRuntimeMs: 50, });

    const result = await scheduler.run({
      actorId: 'actor-1',
      signals: [makeSignal()],
      segments: [makeSegment()],
      sessionSummaries: [makeSummary()],
      aggregates: [makeAggregate()],
      dirtyTracker: tracker,
      state: {
        lastRunAtByAnalyzer: {
          practice_curve: 990, }, }, });

    expect(result.runRecords[0]).toEqual(expect.objectContaining({
      analyzerId: 'error_recovery_cost',
      status: 'failed', }));
    expect(result.runRecords[1]).toEqual(expect.objectContaining({
      analyzerId: 'practice_curve',
      status: 'skipped',
      reason: 'cooldown-active', }));
    expect(result.diagnostics[0]).toContain('boom'); });

  it('skips analyzers once the runtime budget is exhausted', async () => {
    const registry = new BehaviorAnalyzerRegistry();
    const sequence = [1000, 1000, 1000, 1010, 1010, 1010, 1010];
    const now = vi.fn(() => sequence.shift() ?? 1010);
    registry.register({
      id: 'lostness_light',
      dependencies: ['aggregates'],
      cadence: 'rollup',
      run: async () => ({ findings: [] }), }).register({
      id: 'hick_hyman',
      dependencies: ['aggregates'],
      cadence: 'rollup',
      run: async () => ({ findings: [] }), });

    const tracker = new BehaviorDirtyTracker();
    tracker.markDirty('aggregates');

    const scheduler = new BehaviorAnalysisScheduler(registry, {
      ...DEFAULT_BEHAVIOR_SCHEDULER_POLICY,
      now,
      maxRuntimeMs: 5, });

    const result = await scheduler.run({
      actorId: 'actor-1',
      signals: [makeSignal()],
      segments: [makeSegment()],
      sessionSummaries: [makeSummary()],
      aggregates: [makeAggregate()],
      dirtyTracker: tracker, });

    expect(result.runRecords[0]).toEqual(expect.objectContaining({
      analyzerId: 'lostness_light',
      status: 'completed', }));
    expect(result.runRecords[1]).toEqual(expect.objectContaining({
      analyzerId: 'hick_hyman',
      status: 'skipped',
      reason: 'runtime-budget-exceeded', })); }); });

describe('Finding interpreter policy defaults', () => {
  it('exposes safe default analyzer-kind rules and retention gates', () => {
    expect(DEFAULT_FINDING_INTERPRETER_POLICY.allowResolvedMemoryPromotion).toBe(false);
    expect(isFindingKindAllowed(DEFAULT_FINDING_INTERPRETER_POLICY, 'fitts_law', 'reflection_candidate')).toBe(true);
    expect(isFindingKindAllowed(DEFAULT_FINDING_INTERPRETER_POLICY, 'fitts_law', 'preference_candidate')).toBe(false);
    expect(shouldRetainAsDiagnostic(DEFAULT_FINDING_INTERPRETER_POLICY, { confidence: 0.6 })).toBe(true);
    expect(shouldRetainForLocalAdaptation(DEFAULT_FINDING_INTERPRETER_POLICY, { confidence: 0.8, severity: 'high' })).toBe(true); }); });
