import { describe, expect, it } from 'vitest';
import {
  projectBehaviorSignals,
  projectBehaviorSessionSummaries,
  reduceBehaviorAggregates,
  reduceBehaviorSegments, } from '../memory/ui/behavior';
import type { UiMemoryEvent } from '../memory/ui/schemas';

function makeEvent(overrides: Partial<UiMemoryEvent>): UiMemoryEvent {
  return {
    id: `evt-${Math.random().toString(36).slice(2, 8) }`,
    ts: Date.now(),
    actorId: 'actor-1',
    sessionId: 'session-1',
    type: 'interaction.recorded',
    source: 'user',
    payloadJson: '{ }',
    tokenEstimate: 10,
    ...overrides, }; }

describe('behavior projectors', () => {
  it('projects behavior signals from presented surfaces, measurements, and outcomes', () => {
    const events: UiMemoryEvent[] = [
      makeEvent({
        id: 'evt-ui',
        ts: 1,
        type: 'ui.presented',
        payloadJson: JSON.stringify({
          view: {
            id: 'ui-1',
            kind: 'generated',
            layout: 'split',
            workflow: 'analysis', }, }), }),
      makeEvent({
        id: 'evt-measured',
        ts: 2,
        type: 'interaction.measured',
        payloadJson: JSON.stringify({
          nodeId: 'search-1',
          nodeType: 'SearchInput',
          action: 'change',
          measurement: {
            modality: 'keyboard',
            componentRole: 'textbox',
            componentFamily: 'input',
            actionFamily: 'input',
            choiceSetSize: 8,
            valueLength: 5, }, }), }),
      makeEvent({
        id: 'evt-tool',
        ts: 3,
        type: 'tool.finished',
        payloadJson: JSON.stringify({
          durationMs: 120,
          interaction: {
            nodeType: 'Button',
            action: 'submit',
            trigger: 'onClick', }, }), }),
    ];

    const signals = projectBehaviorSignals(events);
    expect(signals).toHaveLength(2);
    expect(signals[0]).toMatchObject({
      sourceEventType: 'interaction.measured',
      viewId: 'ui-1',
      workflow: 'analysis',
      contextArchetype: 'compare',
      modality: 'keyboard',
      componentFamily: 'input',
      actionFamily: 'input',
      choiceSetSize: 8,
      valueLength: 5, });
    expect(signals[1]).toMatchObject({
      sourceEventType: 'tool.finished',
      actionFamily: 'tool',
      success: true,
      waitMs: 120, }); });

  it('reduces signals into segments, session summaries, and rolling aggregates', () => {
    const signals = [
      {
        id: 'sig-1',
        actorId: 'actor-1',
        sessionId: 'session-1',
        sourceEventId: 'evt-1',
        sourceEventType: 'interaction.measured',
        ts: 1,
        contextArchetype: 'edit_compose',
        modality: 'keyboard' as const,
        componentFamily: 'input',
        actionFamily: 'input',
        choiceSetSize: 4,
        targetWidthPx: 200,
        valueLength: 4, },
      {
        id: 'sig-2',
        actorId: 'actor-1',
        sessionId: 'session-1',
        sourceEventId: 'evt-2',
        sourceEventType: 'binding.executed',
        ts: 2,
        contextArchetype: 'edit_compose',
        modality: 'keyboard' as const,
        componentFamily: 'input',
        actionFamily: 'input',
        success: true,
        waitMs: 40, },
      {
        id: 'sig-3',
        actorId: 'actor-1',
        sessionId: 'session-2',
        sourceEventId: 'evt-3',
        sourceEventType: 'interaction.measured',
        ts: 10,
        contextArchetype: 'edit_compose',
        modality: 'keyboard' as const,
        componentFamily: 'input',
        actionFamily: 'input',
        choiceSetSize: 6,
        targetWidthPx: 180,
        valueLength: 8, },
    ];

    const segments = reduceBehaviorSegments(signals, { maxGapMs: 5 });
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({
      sessionId: 'session-1',
      contextArchetype: 'edit_compose',
      interactionCount: 1,
      successCount: 1,
      failureCount: 0,
      retryCount: 0, });

    const summaries = projectBehaviorSessionSummaries(segments, signals);
    expect(summaries).toHaveLength(2);
    const latestSummary = summaries.find((summary) => summary.sessionId === 'session-2');
    expect(latestSummary?.aggregateMetrics).toMatchObject({
      avg_choice_set_size: 6,
      avg_target_width_px: 180,
      avg_value_length: 8,
      keyboard_share: 1, });

    const aggregates = reduceBehaviorAggregates(summaries, { now: 20 });
    expect(aggregates).toHaveLength(2);
    const contextAggregate = aggregates.find((aggregate) => aggregate.scopeKey === 'context:edit_compose');
    expect(contextAggregate).toMatchObject({
      actorId: 'actor-1',
      sessionCount: 2,
      interactionCount: 2, });
    expect(contextAggregate?.aggregateMetrics.avg_choice_set_size).toBeCloseTo(4.666666666666667, 10); });

  it('routes measured interactions into review, search, and arrangement contexts using workflow and action cues', () => {
    const events: UiMemoryEvent[] = [
      makeEvent({
        id: 'evt-review-ui',
        ts: 1,
        sessionId: 'session-review',
        type: 'ui.presented',
        payloadJson: JSON.stringify({
          view: {
            id: 'ui-review',
            kind: 'generated',
            layout: 'stack',
            workflow: 'review_approval', }, }), }),
      makeEvent({
        id: 'evt-review-action',
        ts: 2,
        sessionId: 'session-review',
        type: 'interaction.measured',
        payloadJson: JSON.stringify({
          nodeId: 'approve',
          nodeType: 'Button',
          action: 'submit',
          measurement: {
            modality: 'pointer',
            componentFamily: 'action',
            actionFamily: 'activate', }, }), }),
      makeEvent({
        id: 'evt-search-ui',
        ts: 3,
        sessionId: 'session-search',
        type: 'ui.presented',
        payloadJson: JSON.stringify({
          view: {
            id: 'ui-search',
            kind: 'generated',
            layout: 'stack',
            workflow: 'search_catalog', }, }), }),
      makeEvent({
        id: 'evt-search-action',
        ts: 4,
        sessionId: 'session-search',
        type: 'interaction.measured',
        payloadJson: JSON.stringify({
          nodeId: 'tab-filter',
          nodeType: 'Tabs',
          action: 'tab_change',
          measurement: {
            modality: 'pointer',
            componentFamily: 'action',
            actionFamily: 'navigation',
            choiceSetSize: 5, }, }), }),
      makeEvent({
        id: 'evt-arrange-ui',
        ts: 5,
        sessionId: 'session-arrange',
        type: 'ui.presented',
        payloadJson: JSON.stringify({
          view: {
            id: 'ui-arrange',
            kind: 'generated',
            layout: 'grid',
            workflow: 'dashboard_customize', }, }), }),
      makeEvent({
        id: 'evt-arrange-action',
        ts: 6,
        sessionId: 'session-arrange',
        type: 'interaction.measured',
        payloadJson: JSON.stringify({
          nodeId: 'card-1',
          nodeType: 'Card',
          action: 'drop',
          measurement: {
            modality: 'pointer',
            componentFamily: 'layout',
            actionFamily: 'drag',
            pathLengthPx: 260,
            pathWidthPx: 32,
            dragDistancePx: 220, }, }), }),
    ];

    const signals = projectBehaviorSignals(events);
    expect(signals.find((signal) => signal.sessionId === 'session-review')?.contextArchetype).toBe('review_confirm');
    expect(signals.find((signal) => signal.sessionId === 'session-search')?.contextArchetype).toBe('search_filter');
    expect(signals.find((signal) => signal.sessionId === 'session-arrange')?.contextArchetype).toBe('arrange_customize'); }); });
