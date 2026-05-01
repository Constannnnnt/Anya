import { afterEach, describe, expect, it } from 'vitest';
import { NodeCatalog } from '../registry/catalog';
import { decode } from '../translator';
import { ConsolidationManager } from '../memory/ui/consolidator';
import { InMemoryMemoryStore } from '../memory/ui/inMemoryAdapter';
import type { ExtractedPreferenceCandidate } from '../memory/ui/schemas';
import { resetIdGenerator, setIdGenerator } from '../id';

afterEach(() => {
  resetIdGenerator(); });

describe('id generation', () => {
  it('supports deterministic IDs for translator-generated node IDs', () => {
    let sequence = 0;
    setIdGenerator((prefix) => `${prefix }-det-${++sequence }`);

    const catalog = new NodeCatalog();
    const result = decode(
      `
spec_version: 1
layout: stack
nodes:
  - type: Heading
    props:
      text: "Hello"
`,
      catalog,
    );

    expect(result.nodes[0].id).toBe('ui-det-1'); });

  it('supports deterministic IDs for memory consolidation records', async () => {
    let sequence = 0;
    setIdGenerator((prefix) => `${prefix }-det-${++sequence }`);

    const manager = new ConsolidationManager();
    const store = new InMemoryMemoryStore();
    const candidates: ExtractedPreferenceCandidate[] = [
      {
        context: 'User requested compact cards',
        preference: 'compact cards',
        categories: ['layout'],
        signal_type: 'explicit',
        confidence: 0.9, },
    ];

    await manager.consolidatePreferences(candidates, 'actor-1', store);

    const prefs = await store.findPreferences('actor-1', { category: 'layout' });
    expect(prefs[0].id).toBe('pref-det-1'); }); });
