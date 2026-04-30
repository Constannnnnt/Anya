import { describe, it, expect, vi } from 'vitest';
import { decode } from '../src/translator';
import { ComponentCatalog } from '../src/registry/catalog';

function createRng(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(rng: () => number, max: number): number {
  return Math.floor(rng() * max);
}

function randomAscii(rng: () => number, minLength: number, maxLength: number): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:-_[]{}() \n\t';
  const length = minLength + randomInt(rng, maxLength - minLength + 1);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet[randomInt(rng, alphabet.length)];
  }
  return out;
}

function randomYamlLikePayload(rng: () => number): string {
  const variants = [
    `layout: stack\ncomponents: []\n`,
    `layout: grid\ncomponents:\n  - type: Heading\n    props:\n      text: "hello"\n`,
    `spec_version: 99\nlayout: stack\ncomponents: []\n`,
    `layout: invalid_layout\ncomponents:\n  - type: Card\n    props: "bad-shape"\n`,
    `components: "not-array"\nlayout: tabs\n`,
    `\`\`\`yaml\nlayout: stack\ncomponents:\n  - type: Unknown\n    props:\n      value: 1\n\`\`\`\n`,
  ];
  return variants[randomInt(rng, variants.length)];
}

describe('Translator decode contract fuzzing', () => {
  it('handles fuzzed parser inputs with controlled outcomes', () => {
    const catalog = new ComponentCatalog();
    const rng = createRng(20260224);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      for (let i = 0; i < 250; i++) {
        const raw =
          rng() > 0.45
            ? randomYamlLikePayload(rng)
            : randomAscii(rng, 0, 220);

        try {
          const spec = decode(raw, catalog);

          expect(['stack', 'row', 'grid', 'tabs', 'split']).toContain(spec.layout);
          expect(Array.isArray(spec.components)).toBe(true);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          expect(
            message.includes('[Translator.decode]') || message.includes('[Spec]')
          ).toBe(true);
        }
      }
    } finally {
      warnSpy.mockRestore();
    }
  });
});
