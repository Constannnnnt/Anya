import { describe, expect, it } from 'vitest';
import {
  buildViewRecommendationUpdateRequest,
  createAnyaRuntime,
  ViewRecommendationEngine, } from '../index';
import {
  createBehaviorFinding,
  DEFAULT_FINDING_INTERPRETER_POLICY,
  InMemoryBehaviorStore, } from '../experimental';

describe('ViewRecommendationEngine', () => {
  it('ranks view recommendations and scopes them to the requested view', async () => {
    const behaviorStore = new InMemoryBehaviorStore();
    await behaviorStore.upsertFindings([
      createBehaviorFinding({
        id: 'finding-form-friction',
        actorId: 'actor-checkout',
        analyzerId: 'form_friction',
        kind: 'reflection_candidate',
        conceptKey: 'form-friction:checkout',
        scopeKey: 'context:checkout',
        confidence: 0.84,
        support: 5,
        severity: 'high',
        evidenceRefs: ['signal-1'],
        payload: {
          contextArchetype: 'checkout',
          avgRetryRate: 0.28, },
        createdTs: 200, }),
      createBehaviorFinding({
        id: 'finding-info-scent',
        actorId: 'actor-checkout',
        analyzerId: 'information_scent',
        kind: 'reflection_candidate',
        conceptKey: 'information-scent:browse_scan',
        scopeKey: 'context:browse_scan',
        confidence: 0.77,
        support: 2,
        severity: 'high',
        evidenceRefs: ['signal-2'],
        payload: {
          contextArchetype: 'browse_scan', },
        createdTs: 100, }),
    ]);

    const engine = new ViewRecommendationEngine({
      actorId: 'actor-checkout',
      behaviorStore,
      policy: DEFAULT_FINDING_INTERPRETER_POLICY, });

    const recommendations = await engine.forView({
      id: 'checkout-view',
      kind: 'app',
      templateId: 'checkout-template',
      workflow: 'checkout', });

    expect(recommendations).toHaveLength(2);
    expect(recommendations[0]).toEqual(
      expect.objectContaining({
        id: 'finding-form-friction',
        analyzer: 'form_friction',
        priority: 1,
        target: {
          viewId: 'checkout-view',
          viewKind: 'app',
          templateId: 'checkout-template',
          workflow: 'checkout', }, }),
    );
    expect(recommendations[0].recommendation).toContain('Shorten forms');
    expect(recommendations[0].score).toBeGreaterThan(recommendations[1].score); });

  it('builds a session-ready update request from a recommendation', () => {
    const request = buildViewRecommendationUpdateRequest({
      recommendation: {
        id: 'finding-form-friction',
        analyzer: 'form_friction',
        priority: 1,
        score: 0.93,
        severity: 'high',
        confidence: 0.84,
        support: 5,
        summary: 'Repeated correction loops are showing up in checkout.',
        recommendation: 'Shorten forms, prefill where possible, and add inline validation.',
        evidence: [
          { label: 'avgRetryRate', value: '28%' },
        ],
        target: {
          viewId: 'checkout-view',
          viewKind: 'app',
          templateId: 'checkout-template',
          workflow: 'checkout', }, },
      view: {
        id: 'checkout-view',
        kind: 'app',
        templateId: 'checkout-template',
        workflow: 'checkout', },
      now: 42, });

    expect(request.userIntent).toContain('checkout');
    expect(request.currentViewId).toBe('checkout-view');
    expect(request.message.role).toBe('user');
    expect(request.message.timestamp).toBe(42);
    expect(request.message.content).toContain('Shorten forms');
    expect(request.promptOptions.additionalInstructions).toContain('baseline'); });

  it('is attached to the runtime when behavior analysis is enabled', () => {
    const runtime = createAnyaRuntime({
      uiMemory: {
        enabled: true,
        actorId: 'actor-runtime',
        behavior: {
          enabled: true,
          store: new InMemoryBehaviorStore(), }, }, });

    expect(runtime.viewRecommendations).toBeInstanceOf(ViewRecommendationEngine); });

  it('boosts a recommendation whose composite has a higher score', async () => {
    const behaviorStore = new InMemoryBehaviorStore();
    await behaviorStore.upsertFindings([
      createBehaviorFinding({
        id: 'finding-fitts',
        actorId: 'actor-1',
        analyzerId: 'fitts_law',
        kind: 'reflection_candidate',
        conceptKey: 'fitts:browse_scan',
        scopeKey: 'context:browse_scan',
        confidence: 0.8,
        support: 3,
        severity: 'high',
        evidenceRefs: [],
        payload: { contextArchetype: 'browse_scan' },
        createdTs: 100, }),
      createBehaviorFinding({
        id: 'finding-form',
        actorId: 'actor-1',
        analyzerId: 'form_friction',
        kind: 'reflection_candidate',
        conceptKey: 'form-friction:checkout',
        scopeKey: 'context:checkout',
        confidence: 0.8,
        support: 3,
        severity: 'high',
        evidenceRefs: [],
        payload: { contextArchetype: 'checkout' },
        createdTs: 100, }),
    ]);

    // Composite for fitts is much higher than for form_friction
    await behaviorStore.upsertComposites([
      {
        id: 'bcomp:actor-1:motor_friction:browse_scan',
        actorId: 'actor-1',
        kind: 'motor_friction',
        contextArchetype: 'browse_scan',
        score: 0.9,
        severity: 'high',
        confidence: 0.85,
        support: 3,
        contributingAnalyzers: ['fitts_law'],
        findingIds: ['finding-fitts'],
        windowStartTs: 100,
        windowEndTs: 100,
        updatedTs: 100,
      },
      {
        id: 'bcomp:actor-1:input_friction:checkout',
        actorId: 'actor-1',
        kind: 'input_friction',
        contextArchetype: 'checkout',
        score: 0.3,
        severity: 'low',
        confidence: 0.6,
        support: 3,
        contributingAnalyzers: ['form_friction'],
        findingIds: ['finding-form'],
        windowStartTs: 100,
        windowEndTs: 100,
        updatedTs: 100,
      },
    ]);

    const engine = new ViewRecommendationEngine({
      actorId: 'actor-1',
      behaviorStore,
      policy: DEFAULT_FINDING_INTERPRETER_POLICY,
    });

    const recommendations = await engine.list();
    expect(recommendations[0].id).toBe('finding-fitts');
    expect(recommendations[0].score).toBeGreaterThan(recommendations[1].score);
  });

  it('penalizes recommendations whose prior outcome regressed', async () => {
    const behaviorStore = new InMemoryBehaviorStore();
    await behaviorStore.upsertFindings([
      createBehaviorFinding({
        id: 'finding-fitts-improved',
        actorId: 'actor-1',
        analyzerId: 'fitts_law',
        kind: 'reflection_candidate',
        conceptKey: 'fitts:browse_scan',
        scopeKey: 'context:browse_scan',
        confidence: 0.8,
        support: 3,
        severity: 'high',
        evidenceRefs: [],
        payload: { contextArchetype: 'browse_scan' },
        createdTs: 100, }),
      createBehaviorFinding({
        id: 'finding-form-regressed',
        actorId: 'actor-1',
        analyzerId: 'form_friction',
        kind: 'reflection_candidate',
        conceptKey: 'form-friction:checkout',
        scopeKey: 'context:checkout',
        confidence: 0.8,
        support: 3,
        severity: 'high',
        evidenceRefs: [],
        payload: { contextArchetype: 'checkout' },
        createdTs: 100, }),
      // Outcome history: fitts improved, form regressed
      createBehaviorFinding({
        id: 'outcome-fitts',
        actorId: 'actor-1',
        analyzerId: 'recommendation_outcome',
        kind: 'reflection_candidate',
        conceptKey: 'recommendation-outcome:fitts_law:browse_scan:improved',
        scopeKey: 'context:browse_scan',
        confidence: 0.8,
        support: 3,
        severity: 'medium',
        evidenceRefs: [],
        payload: {
          contextArchetype: 'browse_scan',
          sourceAnalyzer: 'fitts_law',
          outcome: 'improved',
        },
        createdTs: 200, }),
      createBehaviorFinding({
        id: 'outcome-form',
        actorId: 'actor-1',
        analyzerId: 'recommendation_outcome',
        kind: 'reflection_candidate',
        conceptKey: 'recommendation-outcome:form_friction:checkout:regressed',
        scopeKey: 'context:checkout',
        confidence: 0.85,
        support: 3,
        severity: 'high',
        evidenceRefs: [],
        payload: {
          contextArchetype: 'checkout',
          sourceAnalyzer: 'form_friction',
          outcome: 'regressed',
        },
        createdTs: 200, }),
    ]);

    const engine = new ViewRecommendationEngine({
      actorId: 'actor-1',
      behaviorStore,
      policy: DEFAULT_FINDING_INTERPRETER_POLICY,
    });

    const recommendations = await engine.list();
    // Outcome reflections should be filtered out of the recommendations themselves.
    expect(recommendations.find((r) => r.analyzer === 'recommendation_outcome')).toBeUndefined();
    // The improved adaptation outranks the regressed one.
    expect(recommendations[0].id).toBe('finding-fitts-improved');
    expect(recommendations[1].id).toBe('finding-form-regressed');
  });

  it('records an applied recommendation with the current composite as baseline', async () => {
    const behaviorStore = new InMemoryBehaviorStore();
    await behaviorStore.upsertComposites([
      {
        id: 'bcomp:actor-1:motor_friction:browse_scan',
        actorId: 'actor-1',
        kind: 'motor_friction',
        contextArchetype: 'browse_scan',
        score: 0.82,
        severity: 'high',
        confidence: 0.8,
        support: 3,
        contributingAnalyzers: ['fitts_law'],
        findingIds: ['bf-1'],
        windowStartTs: 100,
        windowEndTs: 100,
        updatedTs: 100,
      },
    ]);

    const engine = new ViewRecommendationEngine({
      actorId: 'actor-1',
      behaviorStore,
      policy: DEFAULT_FINDING_INTERPRETER_POLICY,
    });

    const record = await engine.recordApplication({
      recommendation: {
        id: 'bf-1',
        analyzer: 'fitts_law',
        priority: 1,
        score: 1.0,
        severity: 'high',
        confidence: 0.8,
        support: 3,
        summary: 'fitts',
        recommendation: 'enlarge targets',
        evidence: [],
        target: {},
      },
      contextArchetype: 'browse_scan',
      now: 500,
    });

    expect(record.baselineScore).toBe(0.82);
    expect(record.compositeKind).toBe('motor_friction');
    const persisted = await behaviorStore.findAppliedRecommendations('actor-1', { resolved: false });
    expect(persisted).toHaveLength(1);
  }); });
