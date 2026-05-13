import { describe, it, expect } from 'vitest';
import { mount } from '../index';
import { withMeasurement } from '../measure';

describe('withMeasurement', () => {
  it('collects action feedback as signals', () => {
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
    expect(signals.length).toBeGreaterThan(0);
    expect(signals[0].action).toBe('test_click');

    measured.destroy();
  });

  it('computes friction scores from sufficient data', () => {
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

    // Click all three buttons
    const buttons = target.querySelectorAll('button');
    buttons[0].click();
    buttons[1].click();
    buttons[2].click();

    const scores = measured.scores();
    // With no pointer travel data, motor friction won't fire
    // With 3 actions, cognitive load should have data (choiceSetSize=3)
    expect(scores).toBeInstanceOf(Array);

    measured.destroy();
  });

  it('returns empty scores with insufficient data', () => {
    const target = document.createElement('div');
    const instance = mount('# Hello', target);
    const measured = withMeasurement(instance, target.querySelector('.anya')!);

    const scores = measured.scores();
    expect(scores).toEqual([]);

    measured.destroy();
  });

  it('resets collected signals', () => {
    const target = document.createElement('div');
    const raw = `\`\`\`action
name: x
label: X
\`\`\`
`;
    const instance = mount(raw, target);
    const measured = withMeasurement(instance, target.querySelector('.anya')!);

    target.querySelector('button')!.click();
    expect(measured.signals().length).toBe(1);

    measured.reset();
    expect(measured.signals().length).toBe(0);

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
