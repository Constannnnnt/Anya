import { describe, expect, it, vi } from 'vitest';
import { createAnyaRuntime } from '../kernel';
import { createRuntimeEvent } from '../runtime';
import { type BehaviorAnalyzer, type BehaviorFinding } from '../memory/ui/behavior';

// A mock analyzer that immediately produces a finding
const createMockAnalyzer = (finding: Partial<BehaviorFinding>): BehaviorAnalyzer => ({
  id: finding.analyzerId || 'mock_analyzer',
  dependencies: ['signals'],
  cadence: 'rollup',
  run: async () => ({
      findings: [
        {
          id: 'finding-' + Date.now(),
          actorId: 'test-user',
          ts: Date.now(),
          createdTs: Date.now(),
          kind: 'diagnostic',
          analyzerId: finding.analyzerId || 'mock_analyzer',
          conceptKey: finding.conceptKey || 'test-concept',
          scopeKey: finding.scopeKey || 'test-scope',
          confidence: finding.confidence ?? 1.0,
          support: finding.support ?? 1,
          severity: finding.severity || 'high',
          payload: finding.payload || { },
          evidenceRefs: finding.evidenceRefs || [],
          summary: finding.summary || 'Mock finding',
          ...finding, } as BehaviorFinding,
      ], }), });

describe('Adaptive Loop Integration (Phase 3)', () => {
  it('unifies behavioral findings into session memory and view engine', async () => {
    const analyzer = createMockAnalyzer({
      analyzerId: 'rework_friction', // Allowed kind: reflection_candidate, diagnostic, warning
      kind: 'diagnostic',
      summary: 'User is struggling with small targets', });

    const runtime = createAnyaRuntime({
      uiMemory: {
        enabled: true,
        actorId: 'test-user',
        behavior: {
          enabled: true,
          analyzers: [analyzer], }, }, });

    // 1. Dispatch events
    runtime.runtime.dispatch(createRuntimeEvent('ui.presented', {
      view: {
        spec: { layout: 'stack', nodes: [] },
        schemaVersion: 1, }, }, { source: 'system' }));

    runtime.runtime.dispatch(createRuntimeEvent('interaction.measured', {
      interactionEventId: 'evt-1',
      nodeId: 'btn-1',
      nodeType: 'Button',
      action: 'click',
      measurement: { modality: 'pointer' } }, { source: 'user' }));

    // 2. Flush the pipeline
    await runtime.uiBehaviorPipeline!.flush('sync');

    // 3. Verify Session Memory consolidation
    const sessionFindings = await runtime.uiBehaviorStore!.findFindings('test-user');
    expect(sessionFindings.length).toBeGreaterThan(0);
    expect(sessionFindings[0].summary).toBe('User is struggling with small targets');

    // 4. Verify View Engine integration
    // @ts-ignore - access internal engine state for testing
    const engineContext = runtime.viewEngine.getState().context;
    expect(engineContext.findings).toBeDefined();
    expect(engineContext.findings!.length).toBeGreaterThan(0);
    expect(engineContext.findings![0].summary).toBe('User is struggling with small targets'); });

  it('materializes high-confidence patterns into the persistent UserProfile', async () => {
    const analyzer = createMockAnalyzer({
      analyzerId: 'practice_curve', // Allowed kind: pattern_candidate
      kind: 'pattern_candidate',
      confidence: 0.95,
      summary: 'User consistently prefers dark mode during evening hours',
      payload: { }, });

    const runtime = createAnyaRuntime({
      uiMemory: {
        enabled: true,
        actorId: 'test-user',
        behavior: {
          enabled: true,
          analyzers: [analyzer],
          materializationThreshold: 0.9, }, }, });

    // 1. Trigger analysis
    runtime.runtime.dispatch(createRuntimeEvent('ui.presented', {
      view: {
        spec: { layout: 'stack', nodes: [] },
        schemaVersion: 1, }, }, { source: 'system' }));

    runtime.runtime.dispatch(createRuntimeEvent('interaction.measured', {
      interactionEventId: 'evt-2',
      nodeId: 'btn-2',
      nodeType: 'Button',
      action: 'click',
      measurement: { modality: 'pointer' } }, { source: 'user' }));

    await runtime.uiBehaviorPipeline!.flush('sync');

    // 2. Wait a bit for the async profile update
    await new Promise(resolve => setTimeout(resolve, 50));

    // 3. Verify User Profile materialization
    const observations = runtime.userProfile.getObservations();
    expect(observations.some(obs => obs.includes('User consistently prefers dark mode during evening hours'))).toBe(true); });

  it('does NOT materialize low-confidence patterns', async () => {
    const analyzer = createMockAnalyzer({
      analyzerId: 'practice_curve',
      kind: 'pattern_candidate',
      confidence: 0.7,
      payload: {
        summary: 'Uncertain pattern', }, });

    const runtime = createAnyaRuntime({
      uiMemory: {
        enabled: true,
        actorId: 'test-user',
        behavior: {
          enabled: true,
          analyzers: [analyzer],
          materializationThreshold: 0.9, }, }, });

    runtime.runtime.dispatch(createRuntimeEvent('interaction.measured', {
      interactionEventId: 'evt-3',
      nodeId: 'btn-3',
      nodeType: 'Button',
      action: 'click',
      measurement: { modality: 'pointer' } }, { source: 'user' }));

    await runtime.uiBehaviorPipeline!.flush('sync');
    await new Promise(resolve => setTimeout(resolve, 50));

    const observations = runtime.userProfile.getObservations();
    expect(observations).not.toContain('Uncertain pattern'); }); });
