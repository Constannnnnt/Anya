import { describe, it, expect, vi } from 'vitest';
import { mount } from '../index';

describe('mount', () => {
  it('mounts a spec string into a target element', () => {
    const target = document.createElement('div');
    const instance = mount('# Hello', target);

    expect(target.querySelector('h1')?.textContent).toBe('Hello');
    instance.destroy();
  });

  it('fires action callback when button is clicked', () => {
    const target = document.createElement('div');
    const raw = `\`\`\`action
name: test_action
label: Click Me
params:
  id: 1
\`\`\`
`;
    const instance = mount(raw, target);
    const handler = vi.fn();
    instance.on('action', handler);

    target.querySelector('button')!.click();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].action).toBe('test_action');
    expect(handler.mock.calls[0][0].params).toEqual({ id: 1 });
    expect(handler.mock.calls[0][0].timestamp).toBeGreaterThan(0);

    instance.destroy();
  });

  it('updates the rendered UI when update is called', () => {
    const target = document.createElement('div');
    const instance = mount('# First', target);

    expect(target.querySelector('h1')?.textContent).toBe('First');

    instance.update('# Second');
    expect(target.querySelector('h1')?.textContent).toBe('Second');

    instance.destroy();
  });

  it('unsubscribes listeners', () => {
    const target = document.createElement('div');
    const raw = `\`\`\`action
name: x
label: X
\`\`\`
`;
    const instance = mount(raw, target);
    const handler = vi.fn();
    const unsub = instance.on('action', handler);

    unsub();
    target.querySelector('button')!.click();

    expect(handler).not.toHaveBeenCalled();
    instance.destroy();
  });

  it('cleans up DOM on destroy', () => {
    const target = document.createElement('div');
    mount('# Hello', target);
    expect(target.children.length).toBe(1);

    const instance = mount('# World', target);
    expect(target.children.length).toBe(2);

    instance.destroy();
    expect(target.children.length).toBe(1);
  });

  it('getSpec returns the current spec', () => {
    const target = document.createElement('div');
    const instance = mount('# Test', target);

    const spec = instance.getSpec();
    expect(spec).not.toBeNull();
    expect(spec!.nodes).toHaveLength(1);

    instance.destroy();
    expect(instance.getSpec()).toBeNull();
  });
});
