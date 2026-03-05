import { describe, it, expect } from 'vitest';
import {
  normalizeMemorySnapshot,
  parseMemorySnapshot,
  serializeMemorySnapshot,
  type MemorySnapshot,
} from '../src/memory/snapshot';

describe('memory snapshot schema', () => {
  const validSnapshot: MemorySnapshot = {
    version: 0,
    context: { userIntent: 'Testing snapshots', workflowContext: 'snapshot_skill' },
    interactions: [
      {
        timestamp: 1,
        elementId: 'e-1',
        componentName: 'Button',
        action: 'custom',
        semanticDescription: 'Clicked',
      },
    ],
    elementHistories: [
      {
        id: 'e-1',
        type: 'Button',
        createdAt: 1,
        actions: [{ timestamp: 1, action: 'custom', description: 'Clicked' }],
      },
    ],
    reasoningTraces: [
      {
        timestamp: 1,
        intent: 'Testing snapshots',
        workflowContext: 'snapshot_skill',
        uxRationale: 'Keep compact layout',
        summary: 'workflow=snapshot_skill | ux=Keep compact layout',
      },
    ],
    currentSpec: {
      layout: 'stack',
      components: [{
        id: 'e-1',
        type: 'Button',
        props: { label: 'Save' },
        interactions: [{
          trigger: 'onClick',
          action: 'save',
          description: 'Persist draft',
          tool_call: {
            name: 'save-draft',
            parameters: { autosave: true, retries: 2 },
          },
        }],
      }],
    },
  };

  it('parses a valid v0 snapshot', () => {
    const raw = serializeMemorySnapshot(validSnapshot);
    const parsed = parseMemorySnapshot(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.version).toBe(0);
    expect(parsed?.context.userIntent).toBe('Testing snapshots');
    expect(parsed?.currentSpec?.components[0].interactions?.[0].tool_call?.name).toBe('save-draft');
  });

  it('rejects snapshots without an explicit version', () => {
    const invalid = {
      context: validSnapshot.context,
      interactions: validSnapshot.interactions,
      elementHistories: validSnapshot.elementHistories,
      reasoningTraces: validSnapshot.reasoningTraces,
      currentSpec: validSnapshot.currentSpec,
    };

    const parsed = normalizeMemorySnapshot(invalid);
    expect(parsed).toBeNull();
  });

  it('rejects future versions', () => {
    const future = { ...validSnapshot, version: 99 };
    const parsed = normalizeMemorySnapshot(future);
    expect(parsed).toBeNull();
  });

  it('rejects invalid schema payloads', () => {
    const invalid = {
      ...validSnapshot,
      interactions: [{ bad: 'shape' }],
    };
    const parsed = normalizeMemorySnapshot(invalid);
    expect(parsed).toBeNull();
  });
});
