import { describe, expect, it, vi } from 'vitest';
import { createAnyaRuntime } from '../kernel';
import { createRuntimeEvent } from '../runtime';
import { createFittsLawAnalyzer } from '../memory/ui/behavior/heuristics/fittsLaw';

describe('Adaptive Flow Integration', () => {
  it('processes pointer events through behavioral pipeline and updates behavior store', async () => {
    const analyzer = createFittsLawAnalyzer();
    analyzer.minSessions = 1;
    analyzer.minInteractions = 1;

    // 1. Initialize Runtime with Behavior Pipeline enabled
    const runtime = createAnyaRuntime({
      uiMemory: {
        enabled: true,
        actorId: 'test-user',
        behavior: {
          enabled: true,
          analyzers: [analyzer], }, }, });

    // 2. Dispatch pointer interactions
    const interactions = Array.from({ length: 5 }).map((_, i) => 
      createRuntimeEvent('interaction.measured', {
        interactionEventId: `evt-${i }`,
        nodeId: 'small-btn',
        nodeType: 'Button',
        action: 'click',
        measurement: {
          modality: 'pointer',
          targetWidthPx: 10,  // Very small
          travelPx: 500,     // Far away
  } }, { source: 'user' })
    );

    for (const event of interactions) {
      runtime.runtime.dispatch(event); }

    // 3. Manually flush the pipeline (since interaction.measured doesn't trigger automatically)
    await runtime.uiBehaviorPipeline!.flush('sync');

    // 4. Verify findings
    const findings = await runtime.uiBehaviorStore!.findFindings('test-user');
    expect(findings.length).toBeGreaterThan(0);
    const fittsFinding = findings.find(f => f.analyzerId === 'fitts_law');
    expect(fittsFinding).toBeDefined();
    expect(fittsFinding.severity).toBe('high');

    // 5. Verify recommendations (optional but good)
    if (runtime.viewRecommendations) {
      const recommendations = await runtime.viewRecommendations.list();
      expect(recommendations.length).toBeGreaterThan(0);
      // Fitts' law usually recommends increasing target size or moving it closer
  } }); });
