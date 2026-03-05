import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { buildSystemPrompt } from '../src/prompt';
import { ComponentCatalog } from '../src/registry/catalog';
import { SkillRegistry } from '../src/registry/skills';
import { ContextMemoryManager } from '../src/memory/context';
import { AdaptiveProfile } from '../src/memory/profile';
import { InMemoryStorage } from '../src/storage/memory';

describe('buildSystemPrompt', () => {
  it('builds a comprehensive prompt with catalog, skills, and memory', async () => {
    const catalog = new ComponentCatalog();
    catalog.register({
      name: 'Button',
      description: 'A clickable button',
      propsSchema: z.object({ label: z.string() })
    });

    const skills = new SkillRegistry();
    skills.register({
      name: 'Editing',
      description: 'Image editing',
      components: ['Button']
    });

    const memory = new ContextMemoryManager();
    memory.setContext({ userIntent: 'Edit my photo' });

    const profile = new AdaptiveProfile(new InMemoryStorage());
    await profile.load(); // Load default
    
    const prompt = buildSystemPrompt(catalog, skills, memory, profile);

    // Assertions on the preamble structure
    expect(prompt).toContain('# ROLE');
    expect(prompt).toContain('DRAG-AND-DROP');
    expect(prompt).toContain('EVENT BROADCASTING');

    // Assertions on Catalog injection
    expect(prompt).toContain('# Your Tools');
    expect(prompt).toContain('name: Button');
    expect(prompt).toContain('description: A clickable button');

    // Assertions on Skills injection
    expect(prompt).toContain('# Available Skills');
    expect(prompt).toContain('name: Editing');

    // Assertions on Memory & Profile injection
    expect(prompt).toContain('# Current Context');
    expect(prompt).toContain('intent: Edit my photo');
    expect(prompt).toContain('Anya Adaptive Profile');
    
    // Assertions on Format
    expect(prompt).toContain('# Response Format');
    expect(prompt).toContain('Respond with YAML in this format:');
  });

  it('omits memory and profile if options dictate', () => {
    const catalog = new ComponentCatalog();
    const skills = new SkillRegistry();
    const memory = new ContextMemoryManager();
    memory.setContext({ userIntent: 'Secret Intent' });

    const prompt = buildSystemPrompt(catalog, skills, memory, undefined, { includeMemory: false });
    expect(prompt).not.toContain('Secret Intent');
    expect(prompt).not.toContain('# Current Context');
  });

  it('supports alternative json formatting', () => {
    const catalog = new ComponentCatalog();
    const skills = new SkillRegistry();
    const memory = new ContextMemoryManager();

    const prompt = buildSystemPrompt(catalog, skills, memory, undefined, { responseFormat: 'json' });
    expect(prompt).toContain('Respond with a JSON object:');
    expect(prompt).toContain('"layout": "stack"');
    expect(prompt).not.toContain('Respond with YAML in this format:');
  });
});
