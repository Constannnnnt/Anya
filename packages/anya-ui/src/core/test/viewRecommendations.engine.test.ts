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

    expect(runtime.viewRecommendations).toBeInstanceOf(ViewRecommendationEngine); }); });
