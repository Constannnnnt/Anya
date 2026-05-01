import { describe, expect, it } from 'vitest';
import type { BehaviorAnalyzer } from '../memory/ui/behavior/analyzers';
import { BehaviorAnalyzerRegistry } from '../memory/ui/behavior/analyzerRegistry';

function makeAnalyzer(id: string): BehaviorAnalyzer {
  return {
    id,
    dependencies: ['aggregates'],
    cadence: 'rollup',
    run: async () => ({ findings: [] }), }; }

describe('BehaviorAnalyzerRegistry', () => {
  it('registers, replaces, lists, and unregisters analyzers', () => {
    const registry = new BehaviorAnalyzerRegistry();
    const first = makeAnalyzer('lostness_light');
    const second = makeAnalyzer('hick_hyman');
    const replacement = makeAnalyzer('lostness_light');

    registry.register(first).register(second).register(replacement);

    expect(registry.list().map((analyzer) => analyzer.id)).toEqual(['lostness_light', 'hick_hyman']);
    expect(registry.get('lostness_light')).toBe(replacement);
    expect(registry.unregister('hick_hyman')).toBe(true);
    expect(registry.get('hick_hyman')).toBeUndefined(); }); });
