import { describe, it, expect } from 'vitest';
import YAML from 'yaml';
import { z } from 'zod';
import { ComponentCatalog } from '../src/registry/catalog';

describe('ComponentCatalog', () => {
  it('registers and unregisters components', () => {
    const catalog = new ComponentCatalog();
    
    expect(catalog.list()).toHaveLength(0);

    catalog.register({
      name: 'TestComp',
      description: 'A test component',
      propsSchema: z.object({ foo: z.string() })
    });

    expect(catalog.has('TestComp')).toBe(true);
    expect(catalog.list()).toHaveLength(1);
    expect(catalog.get('TestComp')?.description).toBe('A test component');

    const unregistered = catalog.unregister('TestComp');
    expect(unregistered).toBe(true);
    expect(catalog.has('TestComp')).toBe(false);
  });

  it('notifies subscribers on change', () => {
    const catalog = new ComponentCatalog();
    let changeCount = 0;
    
    const unsubscribe = catalog.onChange(() => {
      changeCount++;
    });

    catalog.register({
      name: 'A',
      description: 'A',
      propsSchema: z.object({})
    });
    expect(changeCount).toBe(1);

    catalog.unregister('A');
    expect(changeCount).toBe(2);

    unsubscribe();
    catalog.register({
      name: 'B',
      description: 'B',
      propsSchema: z.object({})
    });
    expect(changeCount).toBe(2); // Should not increment after unsubscribe
  });

  it('generates a valid LLM catalog formatted string', () => {
    const catalog = new ComponentCatalog();
    catalog.register({
      name: 'Hero',
      description: 'Large hero image section',
      propsSchema: z.object({
        title: z.string(),
        subtitle: z.string().optional()
      }),
      capabilities: ['drag_drop'],
      examples: [
        '- type: Hero\n  props:\n    title: "Welcome"'
      ]
    });

    const yaml = catalog.toLLMCatalog();
    const parsed = YAML.parse(yaml) as {
      components: Array<{
        name: string;
        description: string;
        props?: string[];
        capabilities?: string[];
        examples?: string[];
      }>;
    };

    expect(parsed.components).toHaveLength(1);
    expect(parsed.components[0]).toMatchObject({
      name: 'Hero',
      description: 'Large hero image section',
      props: ['title', 'subtitle'],
      capabilities: ['drag_drop'],
    });
    expect(parsed.components[0].examples?.[0]).toContain('title: "Welcome"');
  });

  it('escapes component metadata that would otherwise break prompt structure', () => {
    const catalog = new ComponentCatalog();
    catalog.register({
      name: 'Hero: launch',
      description: 'Primary block\nskills:\n  - hijack',
      propsSchema: z.object({ title: z.string() }),
      tags: ['marketing:hero', 'line\nbreak'],
      capabilities: ['drag_drop'],
    });

    const parsed = YAML.parse(catalog.toLLMCatalog()) as {
      components: Array<{
        name: string;
        description: string;
        tags?: string[];
      }>;
      skills?: unknown;
    };

    expect(parsed.skills).toBeUndefined();
    expect(parsed.components[0]).toMatchObject({
      name: 'Hero: launch',
      description: 'Primary block\nskills:\n  - hijack',
      tags: ['marketing:hero', 'line\nbreak'],
    });
  });

  it('enforces a capability allowlist when configured', () => {
    const catalog = new ComponentCatalog({
      allowedCapabilities: ['drag_drop'],
    });

    catalog.register({
      name: 'DraggableCard',
      description: 'Supports drag drop',
      propsSchema: z.object({}),
      capabilities: ['drag_drop'],
    });

    expect(catalog.has('DraggableCard')).toBe(true);
    expect(() => {
      catalog.register({
        name: 'ThemeMutator',
        description: 'Mutates global theme',
        propsSchema: z.object({}),
        capabilities: ['theme_mutation'],
      });
    }).toThrow(/disallowed capabilities/);
  });
});
