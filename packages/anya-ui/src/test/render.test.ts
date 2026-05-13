import { describe, it, expect, vi } from 'vitest';
import { render } from '../render';
import { parse } from '../parse';
import type { Spec } from '../spec';

describe('render', () => {
  it('renders content as HTML', () => {
    const spec: Spec = { nodes: [{ markdown: '# Hello\n\nWorld' }] };
    const onAction = vi.fn();
    const el = render(spec, { onAction });

    expect(el.className).toBe('anya');
    expect(el.querySelector('h1')?.textContent).toBe('Hello');
    expect(el.querySelector('p')?.textContent).toBe('World');
  });

  it('renders action as button', () => {
    const spec: Spec = { nodes: [{ action: 'test', label: 'Click me' }] };
    const onAction = vi.fn();
    const el = render(spec, { onAction });

    const btn = el.querySelector('button');
    expect(btn).not.toBeNull();
    expect(btn!.textContent).toBe('Click me');
    expect(btn!.className).toBe('anya-action');

    btn!.click();
    expect(onAction).toHaveBeenCalledWith('test', { params: undefined });
  });

  it('renders action with params', () => {
    const spec: Spec = { nodes: [{ action: 'complete', label: 'Done', params: { id: 42 } }] };
    const onAction = vi.fn();
    const el = render(spec, { onAction });

    el.querySelector('button')!.click();
    expect(onAction).toHaveBeenCalledWith('complete', { params: { id: 42 } });
  });

  it('renders disabled actions', () => {
    const spec: Spec = { nodes: [{ action: 'nope', label: 'Disabled', disabled: true }] };
    const onAction = vi.fn();
    const el = render(spec, { onAction });

    const btn = el.querySelector('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('renders input as form', () => {
    const spec: Spec = {
      nodes: [{
        input: 'add_task',
        submit: 'Add',
        fields: [
          { name: 'title', type: 'text', placeholder: 'Task name' },
          { name: 'priority', type: 'select', options: ['high', 'low'] },
        ],
      }],
    };
    const onAction = vi.fn();
    const el = render(spec, { onAction });

    const form = el.querySelector('form');
    expect(form).not.toBeNull();
    expect(form!.querySelector('input[name="title"]')).not.toBeNull();
    expect(form!.querySelector('select[name="priority"]')).not.toBeNull();

    const submitBtn = form!.querySelector('button[type="submit"]');
    expect(submitBtn!.textContent).toBe('Add');
  });

  it('renders group with layout class', () => {
    const spec: Spec = {
      nodes: [{
        layout: 'row',
        content: [{ markdown: 'Item 1' }, { markdown: 'Item 2' }],
      }],
    };
    const onAction = vi.fn();
    const el = render(spec, { onAction });

    const group = el.querySelector('.anya-group');
    expect(group).not.toBeNull();
    expect(group!.classList.contains('anya-layout-row')).toBe(true);
    expect(group!.children).toHaveLength(2);
  });

  it('renders a full parsed spec end-to-end', () => {
    const raw = `# Welcome

Click below:

\`\`\`action
name: greet
label: Say Hello
\`\`\`
`;
    const spec = parse(raw);
    const onAction = vi.fn();
    const el = render(spec, { onAction });

    expect(el.querySelector('h1')?.textContent).toBe('Welcome');
    expect(el.querySelector('button')?.textContent).toBe('Say Hello');
  });

  it('strips javascript: URIs from links', () => {
    const spec: Spec = { nodes: [{ markdown: '[click](javascript:alert(1))' }] };
    const onAction = vi.fn();
    const el = render(spec, { onAction });

    const link = el.querySelector('a');
    if (link) {
      expect(link.getAttribute('href') ?? '').not.toMatch(/javascript:/i);
    }
  });

  it('strips entity-encoded javascript: URIs', () => {
    const spec: Spec = { nodes: [{ markdown: '[x](&#106;avascript:alert(1))' }] };
    const onAction = vi.fn();
    const el = render(spec, { onAction });

    const link = el.querySelector('a');
    expect(link).toBeNull();
  });

  it('strips data: URIs from links', () => {
    const spec: Spec = { nodes: [{ markdown: '[x](data:text/html,<script>alert(1)</script>)' }] };
    const onAction = vi.fn();
    const el = render(spec, { onAction });

    const link = el.querySelector('a');
    expect(link).toBeNull();
  });

  it('strips vbscript: URIs from links', () => {
    const spec: Spec = { nodes: [{ markdown: '[x](vbscript:MsgBox)' }] };
    const onAction = vi.fn();
    const el = render(spec, { onAction });

    const link = el.querySelector('a');
    expect(link).toBeNull();
  });

  it('strips raw HTML tags', () => {
    const spec: Spec = { nodes: [{ markdown: '<script>alert(1)</script><p>safe</p>' }] };
    const onAction = vi.fn();
    const el = render(spec, { onAction });

    expect(el.querySelector('script')).toBeNull();
    expect(el.innerHTML).not.toContain('<script>');
  });
});
