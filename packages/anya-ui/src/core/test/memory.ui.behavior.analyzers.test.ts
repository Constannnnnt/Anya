import { describe, expect, it } from 'vitest';
import {
  createErrorRecoveryCostAnalyzer,
  createFittsLawAnalyzer,
  createFocusSwitchCostAnalyzer,
  createFormFrictionAnalyzer,
  createHickHymanAnalyzer,
  createInformationScentAnalyzer,
  createKlmLightAnalyzer,
  createLostnessLightAnalyzer,
  createPracticeCurveAnalyzer,
  createReworkFrictionAnalyzer,
  createSteeringLawAnalyzer, } from '../memory/ui/behavior/heuristics';
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
    interactionCount: 2,
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
    signalCount: 4,
    segmentCount: 1,
    interactionCount: 4,
    aggregateMetrics: { },
    updatedTs: 10,
    ...overrides, }; }

function makeAggregate(overrides: Partial<BehaviorAggregate> = { }): BehaviorAggregate {
  return {
    id: `agg-${Math.random().toString(36).slice(2, 8) }`,
    actorId: 'actor-1',
    scopeKey: 'global',
    windowStartTs: 1,
    windowEndTs: 10,
    sessionCount: 2,
    interactionCount: 8,
    aggregateMetrics: { },
    updatedTs: 10,
    ...overrides, }; }

const BASE_INPUT = {
  actorId: 'actor-1',
  signals: [] as BehaviorSignal[],
  segments: [] as BehaviorSegment[],
  sessionSummaries: [] as BehaviorSessionSummary[],
  aggregates: [] as BehaviorAggregate[],
  now: 100, };

describe('builtin behavior analyzers', () => {
  it('creates a rework friction finding from repeated retry/failure pressure', async () => {
    const analyzer = createReworkFrictionAnalyzer();
    const result = await analyzer.run({
      ...BASE_INPUT,
      sessionSummaries: [
        makeSummary({ id: 'sum-1', contextArchetype: 'edit_compose', aggregateMetrics: { retry_rate: 0.4, failure_rate: 0.2 } }),
        makeSummary({ id: 'sum-2', sessionId: 'session-2', contextArchetype: 'edit_compose', aggregateMetrics: { retry_rate: 0.2, failure_rate: 0.15 } }),
      ], });

    expect(result.findings).toEqual([
      expect.objectContaining({
        analyzerId: 'rework_friction',
        kind: 'reflection_candidate',
        conceptKey: 'rework-friction:edit_compose',
        support: 2, }),
    ]); });

  it('creates recovery cost findings from failure-to-success traces', async () => {
    const analyzer = createErrorRecoveryCostAnalyzer();
    const result = await analyzer.run({
      ...BASE_INPUT,
      signals: [
        makeSignal({ id: 's1', sessionId: 'session-1', contextArchetype: 'edit_compose', sourceEventType: 'binding.executed', success: false, actionFamily: 'tool', waitMs: 0 }),
        makeSignal({ id: 's2', sessionId: 'session-1', contextArchetype: 'edit_compose', sourceEventType: 'interaction.measured', actionFamily: 'input', ts: 2 }),
        makeSignal({ id: 's3', sessionId: 'session-1', contextArchetype: 'edit_compose', sourceEventType: 'tool.finished', actionFamily: 'tool', success: true, waitMs: 800, ts: 3 }),
        makeSignal({ id: 's4', sessionId: 'session-2', contextArchetype: 'edit_compose', sourceEventType: 'binding.executed', success: false, actionFamily: 'tool', ts: 4 }),
        makeSignal({ id: 's5', sessionId: 'session-2', contextArchetype: 'edit_compose', sourceEventType: 'interaction.measured', actionFamily: 'input', ts: 5 }),
        makeSignal({ id: 's6', sessionId: 'session-2', contextArchetype: 'edit_compose', sourceEventType: 'tool.finished', actionFamily: 'tool', success: true, waitMs: 900, ts: 6 }),
      ], });

    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        analyzerId: 'error_recovery_cost',
        kind: 'reflection_candidate',
        conceptKey: 'error-recovery-cost:edit_compose', }),
      expect.objectContaining({
        analyzerId: 'error_recovery_cost',
        kind: 'pattern_candidate', }),
    ])); });

  it('creates a lostness finding from navigation oscillation and revisits', async () => {
    const analyzer = createLostnessLightAnalyzer();
    const result = await analyzer.run({
      ...BASE_INPUT,
      signals: [
        makeSignal({ id: 'n1', sessionId: 'session-1', contextArchetype: 'navigate_drilldown', actionFamily: 'navigation', viewId: 'A', ts: 1 }),
        makeSignal({ id: 'n2', sessionId: 'session-1', contextArchetype: 'navigate_drilldown', actionFamily: 'navigation', viewId: 'B', ts: 2 }),
        makeSignal({ id: 'n3', sessionId: 'session-1', contextArchetype: 'navigate_drilldown', actionFamily: 'navigation', viewId: 'A', ts: 3 }),
        makeSignal({ id: 'n4', sessionId: 'session-1', contextArchetype: 'navigate_drilldown', actionFamily: 'navigation', viewId: 'B', ts: 4 }),
        makeSignal({ id: 'n5', sessionId: 'session-2', contextArchetype: 'navigate_drilldown', actionFamily: 'navigation', viewId: 'A', ts: 5 }),
        makeSignal({ id: 'n6', sessionId: 'session-2', contextArchetype: 'navigate_drilldown', actionFamily: 'navigation', viewId: 'C', ts: 6 }),
        makeSignal({ id: 'n7', sessionId: 'session-2', contextArchetype: 'navigate_drilldown', actionFamily: 'navigation', viewId: 'A', ts: 7 }),
      ], });

    expect(result.findings).toEqual([
      expect.objectContaining({
        analyzerId: 'lostness_light',
        kind: 'reflection_candidate',
        conceptKey: 'lostness-light:navigate_drilldown',
        support: 2, }),
    ]); });

  it('creates a Hick-Hyman finding from large recurring choice sets', async () => {
    const analyzer = createHickHymanAnalyzer();
    const result = await analyzer.run({
      ...BASE_INPUT,
      sessionSummaries: [
        makeSummary({ id: 'sum-1', contextArchetype: 'search_filter', aggregateMetrics: { avg_choice_set_size: 8, retry_rate: 0.2 } }),
        makeSummary({ id: 'sum-2', sessionId: 'session-2', contextArchetype: 'search_filter', aggregateMetrics: { avg_choice_set_size: 10, retry_rate: 0.25 } }),
      ],
      aggregates: [makeAggregate()], });

    expect(result.findings).toEqual([
      expect.objectContaining({
        analyzerId: 'hick_hyman',
        kind: 'reflection_candidate',
        conceptKey: 'choice-overload:search_filter',
        support: 2, }),
    ]); });

  it('creates a KLM-light finding from high operator burden across sessions', async () => {
    const analyzer = createKlmLightAnalyzer();
    const result = await analyzer.run({
      ...BASE_INPUT,
      signals: [
        makeSignal({ id: 'k1', sessionId: 'session-1', contextArchetype: 'edit_compose', modality: 'keyboard', actionFamily: 'input', ts: 1, waitMs: 100 }),
        makeSignal({ id: 'k2', sessionId: 'session-1', contextArchetype: 'edit_compose', modality: 'pointer', actionFamily: 'activate', ts: 2, waitMs: 200 }),
        makeSignal({ id: 'k3', sessionId: 'session-1', contextArchetype: 'edit_compose', modality: 'keyboard', actionFamily: 'input', ts: 3, waitMs: 400 }),
        makeSignal({ id: 'k4', sessionId: 'session-2', contextArchetype: 'edit_compose', modality: 'keyboard', actionFamily: 'input', ts: 4, waitMs: 100 }),
        makeSignal({ id: 'k5', sessionId: 'session-2', contextArchetype: 'edit_compose', modality: 'pointer', actionFamily: 'activate', ts: 5, waitMs: 200 }),
        makeSignal({ id: 'k6', sessionId: 'session-2', contextArchetype: 'edit_compose', modality: 'keyboard', actionFamily: 'input', ts: 6, waitMs: 500 }),
      ], });

    expect(result.findings).toEqual([
      expect.objectContaining({
        analyzerId: 'klm_light',
        kind: 'reflection_candidate',
        conceptKey: 'operator-burden:edit_compose',
        support: 2, }),
    ]); });

  it('creates a Fitts-law finding from difficult pointer target acquisition', async () => {
    const analyzer = createFittsLawAnalyzer();
    const result = await analyzer.run({
      ...BASE_INPUT,
      signals: [
        makeSignal({ id: 'f1', sessionId: 'session-1', contextArchetype: 'browse_scan', modality: 'pointer', actionFamily: 'activate', travelPx: 320, targetWidthPx: 24, waitMs: 900 }),
        makeSignal({ id: 'f2', sessionId: 'session-2', contextArchetype: 'browse_scan', modality: 'pointer', actionFamily: 'activate', travelPx: 280, targetWidthPx: 22, waitMs: 800 }),
        makeSignal({ id: 'f3', sessionId: 'session-2', contextArchetype: 'browse_scan', modality: 'touch', actionFamily: 'activate', travelPx: 260, targetWidthPx: 28, waitMs: 700 }),
      ],
      sessionSummaries: [
        makeSummary({ id: 'sum-f1', sessionId: 'session-1', contextArchetype: 'browse_scan' }),
        makeSummary({ id: 'sum-f2', sessionId: 'session-2', contextArchetype: 'browse_scan' }),
      ], });

    expect(result.findings).toEqual([
      expect.objectContaining({
        analyzerId: 'fitts_law',
        kind: 'reflection_candidate',
        conceptKey: 'target-acquisition-difficulty:browse_scan', }),
    ]); });

  it('creates a steering-law finding from constrained drag paths', async () => {
    const analyzer = createSteeringLawAnalyzer();
    const result = await analyzer.run({
      ...BASE_INPUT,
      signals: [
        makeSignal({ id: 's1', sessionId: 'session-1', contextArchetype: 'arrange_customize', actionFamily: 'drag', pathLengthPx: 500, pathWidthPx: 20, dragDistancePx: 420 }),
        makeSignal({ id: 's2', sessionId: 'session-2', contextArchetype: 'arrange_customize', actionFamily: 'drag', pathLengthPx: 450, pathWidthPx: 18, dragDistancePx: 380 }),
        makeSignal({ id: 's3', sessionId: 'session-2', contextArchetype: 'arrange_customize', actionFamily: 'drag', pathLengthPx: 420, pathWidthPx: 25, dragDistancePx: 360 }),
      ],
      sessionSummaries: [
        makeSummary({ id: 'sum-s1', sessionId: 'session-1', contextArchetype: 'arrange_customize' }),
      ], });

    expect(result.findings).toEqual([
      expect.objectContaining({
        analyzerId: 'steering_law',
        kind: 'reflection_candidate',
        conceptKey: 'path-constrained-drag-difficulty:arrange_customize', }),
    ]); });

  it('creates a form-friction finding from high correction pressure', async () => {
    const analyzer = createFormFrictionAnalyzer();
    const result = await analyzer.run({
      ...BASE_INPUT,
      signals: [
        makeSignal({ id: 'ff1', sessionId: 'session-1', contextArchetype: 'edit_compose', componentFamily: 'input', valueLength: 8, deltaLength: 6 }),
        makeSignal({ id: 'ff2', sessionId: 'session-1', contextArchetype: 'edit_compose', componentFamily: 'input', valueLength: 10, deltaLength: 5 }),
        makeSignal({ id: 'ff3', sessionId: 'session-2', contextArchetype: 'edit_compose', componentFamily: 'input', valueLength: 9, deltaLength: 7 }),
      ],
      sessionSummaries: [
        makeSummary({ id: 'sum-ff1', sessionId: 'session-1', contextArchetype: 'edit_compose', aggregateMetrics: { retry_rate: 0.22 } }),
        makeSummary({ id: 'sum-ff2', sessionId: 'session-2', contextArchetype: 'edit_compose', aggregateMetrics: { retry_rate: 0.18 } }),
      ], });

    expect(result.findings).toEqual([
      expect.objectContaining({
        analyzerId: 'form_friction',
        kind: 'reflection_candidate',
        conceptKey: 'form-friction:edit_compose', }),
    ]); });

  it('creates a focus-switch-cost finding from repeated modality and focus switching', async () => {
    const analyzer = createFocusSwitchCostAnalyzer();
    const result = await analyzer.run({
      ...BASE_INPUT,
      signals: [
        makeSignal({ id: 'fc1', sessionId: 'session-1', contextArchetype: 'edit_compose', modality: 'keyboard', actionFamily: 'input', focusMovesSinceLast: 1, homingTransitionsSinceLast: 1 }),
        makeSignal({ id: 'fc2', sessionId: 'session-1', contextArchetype: 'edit_compose', modality: 'pointer', actionFamily: 'activate', focusMovesSinceLast: 2, homingTransitionsSinceLast: 1 }),
        makeSignal({ id: 'fc3', sessionId: 'session-1', contextArchetype: 'edit_compose', modality: 'keyboard', actionFamily: 'input', focusMovesSinceLast: 1, homingTransitionsSinceLast: 1 }),
        makeSignal({ id: 'fc4', sessionId: 'session-2', contextArchetype: 'edit_compose', modality: 'keyboard', actionFamily: 'input', focusMovesSinceLast: 1, homingTransitionsSinceLast: 1 }),
        makeSignal({ id: 'fc5', sessionId: 'session-2', contextArchetype: 'edit_compose', modality: 'pointer', actionFamily: 'activate', focusMovesSinceLast: 2, homingTransitionsSinceLast: 1 }),
        makeSignal({ id: 'fc6', sessionId: 'session-2', contextArchetype: 'edit_compose', modality: 'keyboard', actionFamily: 'input', focusMovesSinceLast: 1, homingTransitionsSinceLast: 1 }),
      ], });

    expect(result.findings).toEqual([
      expect.objectContaining({
        analyzerId: 'focus_switch_cost',
        kind: 'reflection_candidate',
        conceptKey: 'focus-switch-cost:edit_compose',
        support: 2, }),
    ]); });

  it('creates an information-scent finding from repeated revisits in navigation-heavy contexts', async () => {
    const analyzer = createInformationScentAnalyzer();
    const result = await analyzer.run({
      ...BASE_INPUT,
      signals: [
        makeSignal({ id: 'i1', sessionId: 'session-1', contextArchetype: 'search_filter', actionFamily: 'navigation', viewId: 'search', choiceSetSize: 6, ts: 1 }),
        makeSignal({ id: 'i2', sessionId: 'session-1', contextArchetype: 'search_filter', actionFamily: 'navigation', viewId: 'results', choiceSetSize: 6, ts: 2 }),
        makeSignal({ id: 'i3', sessionId: 'session-1', contextArchetype: 'search_filter', actionFamily: 'navigation', viewId: 'search', choiceSetSize: 6, ts: 3 }),
        makeSignal({ id: 'i4', sessionId: 'session-2', contextArchetype: 'search_filter', actionFamily: 'navigation', viewId: 'search', choiceSetSize: 7, ts: 4 }),
        makeSignal({ id: 'i5', sessionId: 'session-2', contextArchetype: 'search_filter', actionFamily: 'navigation', viewId: 'results', choiceSetSize: 7, ts: 5 }),
        makeSignal({ id: 'i6', sessionId: 'session-2', contextArchetype: 'search_filter', actionFamily: 'navigation', viewId: 'search', choiceSetSize: 7, ts: 6 }),
      ],
      sessionSummaries: [
        makeSummary({ id: 'sum-i1', sessionId: 'session-1', contextArchetype: 'search_filter' }),
        makeSummary({ id: 'sum-i2', sessionId: 'session-2', contextArchetype: 'search_filter' }),
      ],
      aggregates: [makeAggregate({ scopeKey: 'context:search_filter', contextArchetype: 'search_filter' })], });

    expect(result.findings).toEqual([
      expect.objectContaining({
        analyzerId: 'information_scent',
        kind: 'reflection_candidate',
        conceptKey: 'information-scent:search_filter',
        support: 2, }),
    ]); });

  it('creates practice-curve findings from repeated flows that become cheaper over time', async () => {
    const analyzer = createPracticeCurveAnalyzer();
    const result = await analyzer.run({
      ...BASE_INPUT,
      signals: [
        makeSignal({ id: 'p1', sessionId: 'session-1', contextArchetype: 'edit_compose', actionFamily: 'input', modality: 'keyboard', ts: 1 }),
        makeSignal({ id: 'p2', sessionId: 'session-1', contextArchetype: 'edit_compose', actionFamily: 'activate', modality: 'pointer', ts: 2 }),
        makeSignal({ id: 'p3', sessionId: 'session-1', contextArchetype: 'edit_compose', sourceEventType: 'binding.executed', actionFamily: 'tool', success: true, waitMs: 1600, ts: 3 }),
        makeSignal({ id: 'p4', sessionId: 'session-2', contextArchetype: 'edit_compose', actionFamily: 'input', modality: 'keyboard', ts: 4 }),
        makeSignal({ id: 'p5', sessionId: 'session-2', contextArchetype: 'edit_compose', actionFamily: 'activate', modality: 'pointer', ts: 5 }),
        makeSignal({ id: 'p6', sessionId: 'session-2', contextArchetype: 'edit_compose', sourceEventType: 'binding.executed', actionFamily: 'tool', success: true, waitMs: 600, ts: 6 }),
        makeSignal({ id: 'p7', sessionId: 'session-3', contextArchetype: 'edit_compose', actionFamily: 'input', modality: 'keyboard', ts: 7 }),
        makeSignal({ id: 'p8', sessionId: 'session-3', contextArchetype: 'edit_compose', actionFamily: 'activate', modality: 'pointer', ts: 8 }),
        makeSignal({ id: 'p9', sessionId: 'session-3', contextArchetype: 'edit_compose', sourceEventType: 'binding.executed', actionFamily: 'tool', success: true, waitMs: 100, ts: 9 }),
      ],
      sessionSummaries: [
        makeSummary({ id: 'sum-p1', sessionId: 'session-1', contextArchetype: 'edit_compose', interactionCount: 2, updatedTs: 3 }),
        makeSummary({ id: 'sum-p2', sessionId: 'session-2', contextArchetype: 'edit_compose', interactionCount: 2, updatedTs: 6 }),
        makeSummary({ id: 'sum-p3', sessionId: 'session-3', contextArchetype: 'edit_compose', interactionCount: 2, updatedTs: 9 }),
      ],
      aggregates: [makeAggregate({ scopeKey: 'context:edit_compose', contextArchetype: 'edit_compose' })], });

    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        analyzerId: 'practice_curve',
        kind: 'pattern_candidate',
        conceptKey: 'practice-sequence:edit_compose:input -> activate -> tool', }),
      expect.objectContaining({
        analyzerId: 'practice_curve',
        kind: 'reflection_candidate',
        conceptKey: 'practice-curve:edit_compose', }),
    ])); }); });
