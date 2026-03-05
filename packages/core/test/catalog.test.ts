import { describe, it, expect } from 'vitest';
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
    expect(yaml).toContain('components:');
    expect(yaml).toContain('- name: Hero');
    expect(yaml).toContain('description: Large hero image section');
    expect(yaml).toContain('props: [title, subtitle]');
    expect(yaml).toContain('capabilities: [drag_drop]');
    expect(yaml).toContain('examples:');
    expect(yaml).toContain('title: "Welcome"');
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
