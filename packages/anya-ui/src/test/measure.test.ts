import { describe, it, expect } from 'vitest';
import { mount } from '../index';
import { withMeasurement } from '../measure';

describe('withMeasurement', () => {
  it('collects action signals', () => {
    const target = document.createElement('div');
    const raw = `\`\`\`action
name: test_click
label: Click Me
\`\`\`
`;
    const instance = mount(raw, target);
    const measured = withMeasurement(instance, target.querySelector('.anya')!);

    target.querySelector('button')!.click();

    const signals = measured.signals();
    expect(signals).toHaveLength(1);
    expect(signals[0].action).toBe('test_click');
    expect(signals[0].kind).toBe('click');
    expect(signals[0].choiceCount).toBe(1);

    measured.destroy();
  });

  it('computes cognitive friction from choice count', () => {
    const target = document.createElement('div');
    const raw = `\`\`\`action
name: a
label: A
\`\`\`
\`\`\`action
name: b
label: B
\`\`\`
\`\`\`action
name: c
label: C
\`\`\`
`;
    const instance = mount(raw, target);
    const measured = withMeasurement(instance, target.querySelector('.anya')!);

    const scores = measured.scores();
    const cognitive = scores.find(s => s.kind === 'cognitive');
    expect(cognitive).toBeDefined();
    expect(cognitive!.detail).toContain('3 interactive elements');

    measured.destroy();
  });

  it('returns empty scores with insufficient interactive elements', () => {
    const target = document.createElement('div');
    const instance = mount('# Hello', target);
    const measured = withMeasurement(instance, target.querySelector('.anya')!);

    const scores = measured.scores();
    expect(scores).toEqual([]);

    measured.destroy();
  });

  it('cleans up on destroy', () => {
    const target = document.createElement('div');
    const instance = mount('# Test', target);
    const measured = withMeasurement(instance, target.querySelector('.anya')!);

    measured.destroy();
    expect(instance.getSpec()).toBeNull();
  });
});
