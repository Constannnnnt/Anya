import { afterEach, describe, expect, it } from 'vitest';
import { ComponentCatalog } from '../src/registry/catalog';
import { decode } from '../src/translator';
import { ConsolidationManager } from '../src/memory/ui/consolidator';
import { InMemoryMemoryStore } from '../src/memory/ui/inMemoryAdapter';
import type { ExtractedPreferenceCandidate } from '../src/memory/ui/schemas';
import { resetIdGenerator, setIdGenerator } from '../src/id';

afterEach(() => {
  resetIdGenerator();
});

describe('id generation', () => {
  it('supports deterministic IDs for translator-generated component IDs', () => {
    let sequence = 0;
    setIdGenerator((prefix) => `${prefix}-det-${++sequence}`);

    const catalog = new ComponentCatalog();
    const result = decode(
      `
spec_version: 1
layout: stack
components:
  - type: Heading
    props:
      text: "Hello"
`,
      catalog,
    );

    expect(result.components[0].id).toBe('ui-det-1');
  });

  it('supports deterministic IDs for memory consolidation records', async () => {
    let sequence = 0;
    setIdGenerator((prefix) => `${prefix}-det-${++sequence}`);

    const manager = new ConsolidationManager();
    const store = new InMemoryMemoryStore();
    const candidates: ExtractedPreferenceCandidate[] = [
      {
        context: 'User requested compact cards',
        preference: 'compact cards',
        categories: ['layout'],
        signal_type: 'explicit',
        confidence: 0.9,
      },
    ];

    await manager.consolidatePreferences(candidates, 'actor-1', store);

    const prefs = await store.findPreferences('actor-1', { category: 'layout' });
    expect(prefs[0].id).toBe('pref-det-1');
  });
});
