import { describe, expect, it } from 'vitest';
import {
  createBuiltinBehaviorAnalyzers,
  projectBehaviorSessionSummaries,
  projectBehaviorSignals,
  reduceBehaviorAggregates,
  reduceBehaviorSegments, } from '../memory/ui/behavior';
import type { UiMemoryEvent } from '../memory/ui/schemas';

function makeEvent(overrides: Partial<UiMemoryEvent>): UiMemoryEvent {
  return {
    id: `evt-${Math.random().toString(36).slice(2, 8) }`,
    ts: 1,
    actorId: 'actor-1',
    sessionId: 'session-1',
    type: 'interaction.recorded',
    source: 'user',
    payloadJson: '{ }',
    tokenEstimate: 10,
    ...overrides, }; }

function makePresentedEvent(input: {
  id: string;
  ts: number;
  sessionId: string;
  viewId: string;
  layout?: 'stack' | 'row' | 'grid' | 'split' | 'tabs';
  workflow?: string; }): UiMemoryEvent {
  return makeEvent({
    id: input.id,
    ts: input.ts,
    sessionId: input.sessionId,
    type: 'ui.presented',
    payloadJson: JSON.stringify({
      view: {
        id: input.viewId,
        kind: 'generated',
        layout: input.layout ?? 'stack',
        workflow: input.workflow, }, }), }); }

function makeMeasuredEvent(input: {
  id: string;
  ts: number;
  sessionId: string;
  nodeType: string;
  action: string;
  measurement: Record<string, unknown>; }): UiMemoryEvent {
  return makeEvent({
    id: input.id,
    ts: input.ts,
    sessionId: input.sessionId,
    type: 'interaction.measured',
    payloadJson: JSON.stringify({
      nodeId: `${input.sessionId }-${input.id }`,
      nodeType: input.nodeType,
      action: input.action,
      measurement: input.measurement, }), }); }

function makeBindingEvent(input: {
  id: string;
  ts: number;
  sessionId: string;
  nodeType: string;
  action: string;
  status: 'success' | 'failed' | 'skipped';
  durationMs?: number;
  trigger?: string; }): UiMemoryEvent {
  return makeEvent({
    id: input.id,
    ts: input.ts,
    sessionId: input.sessionId,
    source: 'system',
    type: 'binding.executed',
    payloadJson: JSON.stringify({
      record: {
        status: input.status,
        durationMs: input.durationMs,
        interaction: {
          nodeType: input.nodeType,
          action: input.action,
          trigger: input.trigger, }, }, }), }); }

function makeToolEvent(input: {
  id: string;
  ts: number;
  sessionId: string;
  type: 'tool.finished' | 'tool.failed';
  nodeType: string;
  action: string;
  durationMs?: number;
  trigger?: string; }): UiMemoryEvent {
  return makeEvent({
    id: input.id,
    ts: input.ts,
    sessionId: input.sessionId,
    source: 'system',
    type: input.type,
    payloadJson: JSON.stringify({
      durationMs: input.durationMs,
      interaction: {
        nodeType: input.nodeType,
        action: input.action,
        trigger: input.trigger, }, }), }); }

async function runAnalyzerFromEvents(
  analyzerId: string,
  events: UiMemoryEvent[],
) {
  const analyzer = createBuiltinBehaviorAnalyzers({ now: () => 1_000 })
    .find((candidate) => candidate.id === analyzerId);
  if (!analyzer) {
    throw new Error(`Missing analyzer: ${analyzerId }`); }

  const signals = projectBehaviorSignals(events);
  const segments = reduceBehaviorSegments(signals, { maxGapMs: 60_000 });
  const sessionSummaries = projectBehaviorSessionSummaries(segments, signals);
  const aggregates = reduceBehaviorAggregates(sessionSummaries, { now: 2_000 });

  return analyzer.run({
    actorId: 'actor-1',
    signals,
    segments,
    sessionSummaries,
    aggregates,
    now: 1_000, }); }

describe('behavior analyzers activate from runtime event projections', () => {
  it('activates rework friction from repeated correction pressure', async () => {
    const result = await runAnalyzerFromEvents('rework_friction', [
      makePresentedEvent({ id: 'ui-r1', ts: 1, sessionId: 'session-1', viewId: 'compose-1', workflow: 'compose' }),
      makeMeasuredEvent({ id: 'r1-i1', ts: 2, sessionId: 'session-1', nodeType: 'TextInput', action: 'change', measurement: { modality: 'keyboard', componentFamily: 'input', actionFamily: 'input' } }),
      makeMeasuredEvent({ id: 'r1-i2', ts: 3, sessionId: 'session-1', nodeType: 'TextInput', action: 'change', measurement: { modality: 'keyboard', componentFamily: 'input', actionFamily: 'input' } }),
      makeBindingEvent({ id: 'r1-b1', ts: 4, sessionId: 'session-1', nodeType: 'Button', action: 'submit', status: 'failed', durationMs: 180, trigger: 'onClick' }),
      makePresentedEvent({ id: 'ui-r2', ts: 11, sessionId: 'session-2', viewId: 'compose-2', workflow: 'compose' }),
      makeMeasuredEvent({ id: 'r2-i1', ts: 12, sessionId: 'session-2', nodeType: 'TextInput', action: 'change', measurement: { modality: 'keyboard', componentFamily: 'input', actionFamily: 'input' } }),
      makeMeasuredEvent({ id: 'r2-i2', ts: 13, sessionId: 'session-2', nodeType: 'TextInput', action: 'change', measurement: { modality: 'keyboard', componentFamily: 'input', actionFamily: 'input' } }),
      makeBindingEvent({ id: 'r2-b1', ts: 14, sessionId: 'session-2', nodeType: 'Button', action: 'submit', status: 'failed', durationMs: 160, trigger: 'onClick' }),
    ]);

    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ analyzerId: 'rework_friction' }),
    ])); });

  it('activates error recovery cost from failure-to-success chains', async () => {
    const result = await runAnalyzerFromEvents('error_recovery_cost', [
      makePresentedEvent({ id: 'ui-e1', ts: 1, sessionId: 'session-1', viewId: 'recovery-1', workflow: 'compose' }),
      makeBindingEvent({ id: 'e1-b1', ts: 2, sessionId: 'session-1', nodeType: 'Button', action: 'submit', status: 'failed', durationMs: 120, trigger: 'onClick' }),
      makeMeasuredEvent({ id: 'e1-i1', ts: 3, sessionId: 'session-1', nodeType: 'TextInput', action: 'change', measurement: { modality: 'keyboard', componentFamily: 'input', actionFamily: 'input' } }),
      makeToolEvent({ id: 'e1-t1', ts: 4, sessionId: 'session-1', type: 'tool.finished', nodeType: 'Button', action: 'tool:save', durationMs: 400, trigger: 'onClick' }),
      makePresentedEvent({ id: 'ui-e2', ts: 11, sessionId: 'session-2', viewId: 'recovery-2', workflow: 'compose' }),
      makeBindingEvent({ id: 'e2-b1', ts: 12, sessionId: 'session-2', nodeType: 'Button', action: 'submit', status: 'failed', durationMs: 110, trigger: 'onClick' }),
      makeMeasuredEvent({ id: 'e2-i1', ts: 13, sessionId: 'session-2', nodeType: 'TextInput', action: 'change', measurement: { modality: 'keyboard', componentFamily: 'input', actionFamily: 'input' } }),
      makeToolEvent({ id: 'e2-t1', ts: 14, sessionId: 'session-2', type: 'tool.finished', nodeType: 'Button', action: 'tool:save', durationMs: 350, trigger: 'onClick' }),
    ]);

    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ analyzerId: 'error_recovery_cost', kind: 'reflection_candidate' }),
      expect.objectContaining({ analyzerId: 'error_recovery_cost', kind: 'pattern_candidate' }),
    ])); });

  it('activates lostness light from oscillating navigation surfaces', async () => {
    const result = await runAnalyzerFromEvents('lostness_light', [
      makePresentedEvent({ id: 'ui-l1a', ts: 1, sessionId: 'session-1', viewId: 'nav-A', workflow: 'browse' }),
      makeMeasuredEvent({ id: 'l1-a', ts: 2, sessionId: 'session-1', nodeType: 'Link', action: 'navigate', measurement: { modality: 'pointer', componentFamily: 'action', actionFamily: 'navigation' } }),
      makePresentedEvent({ id: 'ui-l1b', ts: 3, sessionId: 'session-1', viewId: 'nav-B', workflow: 'browse' }),
      makeMeasuredEvent({ id: 'l1-b', ts: 4, sessionId: 'session-1', nodeType: 'Link', action: 'navigate', measurement: { modality: 'pointer', componentFamily: 'action', actionFamily: 'navigation' } }),
      makePresentedEvent({ id: 'ui-l1c', ts: 5, sessionId: 'session-1', viewId: 'nav-A', workflow: 'browse' }),
      makeMeasuredEvent({ id: 'l1-c', ts: 6, sessionId: 'session-1', nodeType: 'Link', action: 'navigate', measurement: { modality: 'pointer', componentFamily: 'action', actionFamily: 'navigation' } }),
      makePresentedEvent({ id: 'ui-l2a', ts: 11, sessionId: 'session-2', viewId: 'nav-A', workflow: 'browse' }),
      makeMeasuredEvent({ id: 'l2-a', ts: 12, sessionId: 'session-2', nodeType: 'Link', action: 'navigate', measurement: { modality: 'pointer', componentFamily: 'action', actionFamily: 'navigation' } }),
      makePresentedEvent({ id: 'ui-l2b', ts: 13, sessionId: 'session-2', viewId: 'nav-C', workflow: 'browse' }),
      makeMeasuredEvent({ id: 'l2-b', ts: 14, sessionId: 'session-2', nodeType: 'Link', action: 'navigate', measurement: { modality: 'pointer', componentFamily: 'action', actionFamily: 'navigation' } }),
      makePresentedEvent({ id: 'ui-l2c', ts: 15, sessionId: 'session-2', viewId: 'nav-A', workflow: 'browse' }),
      makeMeasuredEvent({ id: 'l2-c', ts: 16, sessionId: 'session-2', nodeType: 'Link', action: 'navigate', measurement: { modality: 'pointer', componentFamily: 'action', actionFamily: 'navigation' } }),
    ]);

    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ analyzerId: 'lostness_light' }),
    ])); });

  it('activates Hick-Hyman from measured large alternative sets', async () => {
    const result = await runAnalyzerFromEvents('hick_hyman', [
      makePresentedEvent({ id: 'ui-h1', ts: 1, sessionId: 'session-1', viewId: 'search-1', workflow: 'search_catalog' }),
      makeMeasuredEvent({ id: 'h1-a', ts: 2, sessionId: 'session-1', nodeType: 'Select', action: 'value_change', measurement: { modality: 'unknown', componentFamily: 'input', actionFamily: 'navigation', choiceSetSize: 8 } }),
      makeMeasuredEvent({ id: 'h1-b', ts: 3, sessionId: 'session-1', nodeType: 'Tabs', action: 'tab_change', measurement: { modality: 'pointer', componentFamily: 'action', actionFamily: 'navigation', choiceSetSize: 7 } }),
      makePresentedEvent({ id: 'ui-h2', ts: 11, sessionId: 'session-2', viewId: 'search-2', workflow: 'search_catalog' }),
      makeMeasuredEvent({ id: 'h2-a', ts: 12, sessionId: 'session-2', nodeType: 'Select', action: 'value_change', measurement: { modality: 'unknown', componentFamily: 'input', actionFamily: 'navigation', choiceSetSize: 9 } }),
      makeMeasuredEvent({ id: 'h2-b', ts: 13, sessionId: 'session-2', nodeType: 'Tabs', action: 'tab_change', measurement: { modality: 'pointer', componentFamily: 'action', actionFamily: 'navigation', choiceSetSize: 8 } }),
    ]);

    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ analyzerId: 'hick_hyman' }),
    ])); });

  it('activates KLM-light from modality-switching interaction sequences', async () => {
    const result = await runAnalyzerFromEvents('klm_light', [
      makePresentedEvent({ id: 'ui-k1', ts: 1, sessionId: 'session-1', viewId: 'edit-1', workflow: 'compose' }),
      makeMeasuredEvent({ id: 'k1-a', ts: 2, sessionId: 'session-1', nodeType: 'TextInput', action: 'change', measurement: { modality: 'keyboard', componentFamily: 'input', actionFamily: 'input' } }),
      makeMeasuredEvent({ id: 'k1-b', ts: 3, sessionId: 'session-1', nodeType: 'Button', action: 'submit', measurement: { modality: 'pointer', componentFamily: 'action', actionFamily: 'activate' } }),
      makeBindingEvent({ id: 'k1-c', ts: 4, sessionId: 'session-1', nodeType: 'Button', action: 'submit', status: 'success', durationMs: 450, trigger: 'onClick' }),
      makePresentedEvent({ id: 'ui-k2', ts: 11, sessionId: 'session-2', viewId: 'edit-2', workflow: 'compose' }),
      makeMeasuredEvent({ id: 'k2-a', ts: 12, sessionId: 'session-2', nodeType: 'TextInput', action: 'change', measurement: { modality: 'keyboard', componentFamily: 'input', actionFamily: 'input' } }),
      makeMeasuredEvent({ id: 'k2-b', ts: 13, sessionId: 'session-2', nodeType: 'Button', action: 'submit', measurement: { modality: 'pointer', componentFamily: 'action', actionFamily: 'activate' } }),
      makeBindingEvent({ id: 'k2-c', ts: 14, sessionId: 'session-2', nodeType: 'Button', action: 'submit', status: 'success', durationMs: 430, trigger: 'onClick' }),
    ]);

    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ analyzerId: 'klm_light' }),
    ])); });

  it('activates practice curve from repeated flows that get cheaper across sessions', async () => {
    const result = await runAnalyzerFromEvents('practice_curve', [
      makePresentedEvent({ id: 'ui-p1', ts: 1, sessionId: 'session-1', viewId: 'practice-1', workflow: 'compose' }),
      makeMeasuredEvent({ id: 'p1-a', ts: 2, sessionId: 'session-1', nodeType: 'TextInput', action: 'change', measurement: { modality: 'keyboard', componentFamily: 'input', actionFamily: 'input' } }),
      makeMeasuredEvent({ id: 'p1-b', ts: 3, sessionId: 'session-1', nodeType: 'Button', action: 'submit', measurement: { modality: 'pointer', componentFamily: 'action', actionFamily: 'activate' } }),
      makeBindingEvent({ id: 'p1-c', ts: 4, sessionId: 'session-1', nodeType: 'Button', action: 'tool:save', status: 'success', durationMs: 1600, trigger: 'onClick' }),
      makePresentedEvent({ id: 'ui-p2', ts: 11, sessionId: 'session-2', viewId: 'practice-2', workflow: 'compose' }),
      makeMeasuredEvent({ id: 'p2-a', ts: 12, sessionId: 'session-2', nodeType: 'TextInput', action: 'change', measurement: { modality: 'keyboard', componentFamily: 'input', actionFamily: 'input' } }),
      makeMeasuredEvent({ id: 'p2-b', ts: 13, sessionId: 'session-2', nodeType: 'Button', action: 'submit', measurement: { modality: 'pointer', componentFamily: 'action', actionFamily: 'activate' } }),
      makeBindingEvent({ id: 'p2-c', ts: 14, sessionId: 'session-2', nodeType: 'Button', action: 'tool:save', status: 'success', durationMs: 600, trigger: 'onClick' }),
      makePresentedEvent({ id: 'ui-p3', ts: 21, sessionId: 'session-3', viewId: 'practice-3', workflow: 'compose' }),
      makeMeasuredEvent({ id: 'p3-a', ts: 22, sessionId: 'session-3', nodeType: 'TextInput', action: 'change', measurement: { modality: 'keyboard', componentFamily: 'input', actionFamily: 'input' } }),
      makeMeasuredEvent({ id: 'p3-b', ts: 23, sessionId: 'session-3', nodeType: 'Button', action: 'submit', measurement: { modality: 'pointer', componentFamily: 'action', actionFamily: 'activate' } }),
      makeBindingEvent({ id: 'p3-c', ts: 24, sessionId: 'session-3', nodeType: 'Button', action: 'tool:save', status: 'success', durationMs: 100, trigger: 'onClick' }),
    ]);

    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ analyzerId: 'practice_curve', kind: 'pattern_candidate' }),
      expect.objectContaining({ analyzerId: 'practice_curve', kind: 'reflection_candidate' }),
    ])); });

  it('activates Fitts law from pointer target acquisition geometry', async () => {
    const result = await runAnalyzerFromEvents('fitts_law', [
      makePresentedEvent({ id: 'ui-f1', ts: 1, sessionId: 'session-1', viewId: 'targets-1', workflow: 'browse' }),
      makeMeasuredEvent({ id: 'f1-a', ts: 2, sessionId: 'session-1', nodeType: 'Button', action: 'submit', measurement: { modality: 'pointer', componentFamily: 'action', actionFamily: 'activate', targetWidthPx: 22, travelPx: 300 } }),
      makeBindingEvent({ id: 'f1-b', ts: 3, sessionId: 'session-1', nodeType: 'Button', action: 'submit', status: 'success', durationMs: 850, trigger: 'onClick' }),
      makePresentedEvent({ id: 'ui-f2', ts: 11, sessionId: 'session-2', viewId: 'targets-2', workflow: 'browse' }),
      makeMeasuredEvent({ id: 'f2-a', ts: 12, sessionId: 'session-2', nodeType: 'Button', action: 'submit', measurement: { modality: 'pointer', componentFamily: 'action', actionFamily: 'activate', targetWidthPx: 24, travelPx: 280 } }),
      makeBindingEvent({ id: 'f2-b', ts: 13, sessionId: 'session-2', nodeType: 'Button', action: 'submit', status: 'success', durationMs: 780, trigger: 'onClick' }),
    ]);

    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ analyzerId: 'fitts_law' }),
    ])); });

  it('activates steering law from measured drag paths', async () => {
    const result = await runAnalyzerFromEvents('steering_law', [
      makePresentedEvent({ id: 'ui-s1', ts: 1, sessionId: 'session-1', viewId: 'board-1', workflow: 'dashboard_customize' }),
      makeMeasuredEvent({ id: 's1-a', ts: 2, sessionId: 'session-1', nodeType: 'Card', action: 'drop', measurement: { modality: 'pointer', componentFamily: 'layout', actionFamily: 'drag', pathLengthPx: 520, pathWidthPx: 20, dragDistancePx: 430 } }),
      makeMeasuredEvent({ id: 's1-b', ts: 3, sessionId: 'session-1', nodeType: 'Card', action: 'drop', measurement: { modality: 'pointer', componentFamily: 'layout', actionFamily: 'drag', pathLengthPx: 480, pathWidthPx: 19, dragDistancePx: 400 } }),
      makeMeasuredEvent({ id: 's1-c', ts: 4, sessionId: 'session-1', nodeType: 'Card', action: 'drop', measurement: { modality: 'pointer', componentFamily: 'layout', actionFamily: 'drag', pathLengthPx: 450, pathWidthPx: 18, dragDistancePx: 390 } }),
    ]);

    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ analyzerId: 'steering_law' }),
    ])); });

  it('activates form friction from large edit deltas and retries', async () => {
    const result = await runAnalyzerFromEvents('form_friction', [
      makePresentedEvent({ id: 'ui-ff1', ts: 1, sessionId: 'session-1', viewId: 'form-1', workflow: 'compose' }),
      makeMeasuredEvent({ id: 'ff1-a', ts: 2, sessionId: 'session-1', nodeType: 'TextInput', action: 'change', measurement: { modality: 'keyboard', componentFamily: 'input', actionFamily: 'input', valueLength: 10, deltaLength: 6 } }),
      makeMeasuredEvent({ id: 'ff1-b', ts: 3, sessionId: 'session-1', nodeType: 'TextInput', action: 'change', measurement: { modality: 'keyboard', componentFamily: 'input', actionFamily: 'input', valueLength: 12, deltaLength: 5 } }),
      makePresentedEvent({ id: 'ui-ff2', ts: 11, sessionId: 'session-2', viewId: 'form-2', workflow: 'compose' }),
      makeMeasuredEvent({ id: 'ff2-a', ts: 12, sessionId: 'session-2', nodeType: 'TextInput', action: 'change', measurement: { modality: 'keyboard', componentFamily: 'input', actionFamily: 'input', valueLength: 9, deltaLength: 7 } }),
      makeMeasuredEvent({ id: 'ff2-b', ts: 13, sessionId: 'session-2', nodeType: 'TextInput', action: 'change', measurement: { modality: 'keyboard', componentFamily: 'input', actionFamily: 'input', valueLength: 11, deltaLength: 6 } }),
    ]);

    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ analyzerId: 'form_friction' }),
    ])); });

  it('activates focus-switch cost from measured focus and homing transitions', async () => {
    const result = await runAnalyzerFromEvents('focus_switch_cost', [
      makePresentedEvent({ id: 'ui-c1', ts: 1, sessionId: 'session-1', viewId: 'focus-1', workflow: 'compose' }),
      makeMeasuredEvent({ id: 'c1-a', ts: 2, sessionId: 'session-1', nodeType: 'TextInput', action: 'change', measurement: { modality: 'keyboard', componentFamily: 'input', actionFamily: 'input', focusMovesSinceLast: 1, homingTransitionsSinceLast: 1 } }),
      makeMeasuredEvent({ id: 'c1-b', ts: 3, sessionId: 'session-1', nodeType: 'Button', action: 'submit', measurement: { modality: 'pointer', componentFamily: 'action', actionFamily: 'activate', focusMovesSinceLast: 1, homingTransitionsSinceLast: 1 } }),
      makeMeasuredEvent({ id: 'c1-c', ts: 4, sessionId: 'session-1', nodeType: 'TextInput', action: 'change', measurement: { modality: 'keyboard', componentFamily: 'input', actionFamily: 'input', focusMovesSinceLast: 1, homingTransitionsSinceLast: 1 } }),
      makePresentedEvent({ id: 'ui-c2', ts: 11, sessionId: 'session-2', viewId: 'focus-2', workflow: 'compose' }),
      makeMeasuredEvent({ id: 'c2-a', ts: 12, sessionId: 'session-2', nodeType: 'TextInput', action: 'change', measurement: { modality: 'keyboard', componentFamily: 'input', actionFamily: 'input', focusMovesSinceLast: 1, homingTransitionsSinceLast: 1 } }),
      makeMeasuredEvent({ id: 'c2-b', ts: 13, sessionId: 'session-2', nodeType: 'Button', action: 'submit', measurement: { modality: 'pointer', componentFamily: 'action', actionFamily: 'activate', focusMovesSinceLast: 2, homingTransitionsSinceLast: 1 } }),
      makeMeasuredEvent({ id: 'c2-c', ts: 14, sessionId: 'session-2', nodeType: 'TextInput', action: 'change', measurement: { modality: 'keyboard', componentFamily: 'input', actionFamily: 'input', focusMovesSinceLast: 1, homingTransitionsSinceLast: 1 } }),
    ]);

    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ analyzerId: 'focus_switch_cost' }),
    ])); });

  it('activates information scent from revisit-heavy search flows', async () => {
    const result = await runAnalyzerFromEvents('information_scent', [
      makePresentedEvent({ id: 'ui-i1a', ts: 1, sessionId: 'session-1', viewId: 'search', workflow: 'search_catalog' }),
      makeMeasuredEvent({ id: 'i1-a', ts: 2, sessionId: 'session-1', nodeType: 'Tabs', action: 'tab_change', measurement: { modality: 'pointer', componentFamily: 'action', actionFamily: 'navigation', choiceSetSize: 6 } }),
      makePresentedEvent({ id: 'ui-i1b', ts: 3, sessionId: 'session-1', viewId: 'results', workflow: 'search_catalog' }),
      makeMeasuredEvent({ id: 'i1-b', ts: 4, sessionId: 'session-1', nodeType: 'Tabs', action: 'tab_change', measurement: { modality: 'pointer', componentFamily: 'action', actionFamily: 'navigation', choiceSetSize: 6 } }),
      makePresentedEvent({ id: 'ui-i1c', ts: 5, sessionId: 'session-1', viewId: 'search', workflow: 'search_catalog' }),
      makeMeasuredEvent({ id: 'i1-c', ts: 6, sessionId: 'session-1', nodeType: 'Tabs', action: 'tab_change', measurement: { modality: 'pointer', componentFamily: 'action', actionFamily: 'navigation', choiceSetSize: 6 } }),
      makePresentedEvent({ id: 'ui-i2a', ts: 11, sessionId: 'session-2', viewId: 'search', workflow: 'search_catalog' }),
      makeMeasuredEvent({ id: 'i2-a', ts: 12, sessionId: 'session-2', nodeType: 'Tabs', action: 'tab_change', measurement: { modality: 'pointer', componentFamily: 'action', actionFamily: 'navigation', choiceSetSize: 7 } }),
      makePresentedEvent({ id: 'ui-i2b', ts: 13, sessionId: 'session-2', viewId: 'results', workflow: 'search_catalog' }),
      makeMeasuredEvent({ id: 'i2-b', ts: 14, sessionId: 'session-2', nodeType: 'Tabs', action: 'tab_change', measurement: { modality: 'pointer', componentFamily: 'action', actionFamily: 'navigation', choiceSetSize: 7 } }),
      makePresentedEvent({ id: 'ui-i2c', ts: 15, sessionId: 'session-2', viewId: 'search', workflow: 'search_catalog' }),
      makeMeasuredEvent({ id: 'i2-c', ts: 16, sessionId: 'session-2', nodeType: 'Tabs', action: 'tab_change', measurement: { modality: 'pointer', componentFamily: 'action', actionFamily: 'navigation', choiceSetSize: 7 } }),
    ]);

    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ analyzerId: 'information_scent' }),
    ])); }); });

