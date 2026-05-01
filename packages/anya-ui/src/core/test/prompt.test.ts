import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { buildResponseFormatBlock, buildSystemPrompt } from '../prompt';
import { NodeCatalog } from '../registry/catalog';
import { SkillRegistry } from '../registry/skills';
import { ContextMemoryManager } from '../internal/memory/context';
import { AdaptiveProfile } from '../internal/memory/profile';
import { InMemoryStorage } from '../storage/memory';

describe('buildSystemPrompt', () => {
  it('builds a comprehensive prompt with catalog, skills, and memory', async () => {
    const catalog = new NodeCatalog();
    catalog.register({
      name: 'Button',
      description: 'A clickable button',
      propsSchema: z.object({ label: z.string() }) });

    const skills = new SkillRegistry();
    skills.register({
      name: 'Editing',
      description: 'Image editing',
      nodes: ['Button'] });

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
    expect(prompt).toContain('Respond with YAML in this format:'); });

  it('omits memory and profile if options dictate', () => {
    const catalog = new NodeCatalog();
    const skills = new SkillRegistry();
    const memory = new ContextMemoryManager();
    memory.setContext({ userIntent: 'Secret Intent' });

    const prompt = buildSystemPrompt(catalog, skills, memory, undefined, { includeMemory: false });
    expect(prompt).not.toContain('Secret Intent');
    expect(prompt).not.toContain('# Current Context'); });

  it('supports alternative json formatting', () => {
    const catalog = new NodeCatalog();
    const skills = new SkillRegistry();
    const memory = new ContextMemoryManager();

    const prompt = buildSystemPrompt(catalog, skills, memory, undefined, { responseFormat: 'json' });
    expect(prompt).toContain('Respond with a JSON object:');
    expect(prompt).toContain('Respond ONLY with a raw JSON object. No explanations, no markdown fences.');
    expect(prompt).not.toContain('Respond ONLY with raw YAML.');

    expect(prompt).toContain('"layout": "stack"');
    expect(prompt).not.toContain('Respond with YAML in this format:'); });

  it('uses the runtime component schema in the YAML response example', () => {
    const yamlBlock = buildResponseFormatBlock('yaml');
    expect(yamlBlock).toContain('  - type: NodeName');
    expect(yamlBlock).not.toContain('    props:\n      id: "component-id"'); });

  it('keeps current context after response-format guidance', async () => {
    const catalog = new NodeCatalog();
    catalog.register({
      name: 'Button',
      description: 'A clickable button',
      propsSchema: z.object({ label: z.string() }) });

    const memory = new ContextMemoryManager();
    const profile = new AdaptiveProfile(new InMemoryStorage());
    await profile.load();

    const prompt = buildSystemPrompt(catalog, new SkillRegistry(), memory, profile);

    expect(prompt.indexOf('# Response Format')).toBeGreaterThan(-1);
    expect(prompt.indexOf('# Current Context')).toBeGreaterThan(prompt.indexOf('# Response Format')); }); });
