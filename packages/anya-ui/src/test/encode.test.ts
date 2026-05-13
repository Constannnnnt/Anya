import { describe, it, expect } from 'vitest';
import { encode, encodeHistory } from '../encode';
import type { ActionFeedback } from '../spec';

describe('encode', () => {
  it('encodes a simple action click', () => {
    const feedback: ActionFeedback = { action: 'submit', timestamp: 1000 };
    expect(encode(feedback)).toBe('User clicked "submit"');
  });

  it('encodes an action with params', () => {
    const feedback: ActionFeedback = { action: 'complete', params: { id: 42 }, timestamp: 1000 };
    expect(encode(feedback)).toBe('User clicked "complete" (id=42)');
  });

  it('encodes a form submission with values', () => {
    const feedback: ActionFeedback = {
      action: 'add_task',
      values: { title: 'Write tests', priority: 'high' },
      timestamp: 1000,
    };
    const result = encode(feedback);
    expect(result).toContain('User submitted "add_task"');
    expect(result).toContain('title="Write tests"');
    expect(result).toContain('priority="high"');
  });

  it('encodes history as newline-separated entries', () => {
    const history: ActionFeedback[] = [
      { action: 'click_a', timestamp: 1000 },
      { action: 'click_b', timestamp: 2000 },
    ];
    const result = encodeHistory(history);
    expect(result).toBe('User clicked "click_a"\nUser clicked "click_b"');
  });

  it('returns empty string for empty history', () => {
    expect(encodeHistory([])).toBe('');
  });
});
