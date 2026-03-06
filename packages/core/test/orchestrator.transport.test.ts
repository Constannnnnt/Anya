import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { ComponentCatalog } from '../src/registry/catalog';
import { SkillRegistry } from '../src/registry/skills';
import { ContextMemoryManager } from '../src/memory/context';
import { AdaptiveProfile } from '../src/memory/profile';
import { InMemoryStorage } from '../src/storage/memory';
import { createOrchestrator } from '../src/orchestrator';
import type { ModelTransport } from '../src/transport';

describe('DynamicOrchestrator transport integration', () => {
  function createBaseCatalog(): ComponentCatalog {
    const catalog = new ComponentCatalog();
    catalog.register({
      name: 'Heading',
      description: 'A heading component',
      propsSchema: z.object({ text: z.string() }),
    });
    return catalog;
  }

  it('uses configured transport to generate and decode a UI spec', async () => {
    const complete = vi.fn().mockResolvedValue({
      content: [
        'spec_version: 1',
        'layout: stack',
        'skill: profile_edit',
        'components:',
        '  - id: h1',
        '    type: Heading',
        '    props:',
        '      text: "Profile"',
      ].join('\n'),
    });
    const transport: ModelTransport = { complete };
    const memory = new ContextMemoryManager();
    const orchestrator = createOrchestrator({
      catalog: createBaseCatalog(),
      skills: new SkillRegistry(),
      memory,
      transport,
    });

    const spec = await orchestrator.generateSpecWithTransport({
      userIntent: 'Build a profile editor',
      messages: [],
    });

    expect(spec.spec_version).toBe(1);
    expect(spec.components).toHaveLength(1);
    expect(spec.components[0].type).toBe('Heading');
    expect(memory.getContext().userIntent).toBe('Build a profile editor');
    expect(memory.getContext().workflowContext).toBe('profile_edit');

    expect(complete).toHaveBeenCalledTimes(1);
    const request = complete.mock.calls[0][0];
    expect(request.newUserMessage).toBe('Build a profile editor');
    expect(request.systemPrompt).toContain('# Your Tools');
  });

  it('throws when transport is missing', async () => {
    const orchestrator = createOrchestrator({
      catalog: createBaseCatalog(),
      skills: new SkillRegistry(),
      memory: new ContextMemoryManager(),
    });

    await expect(
      orchestrator.generateSpecWithTransport({
        userIntent: 'No transport path',
        messages: [],
      })
    ).rejects.toThrow(/No model transport configured/);
  });

  it('throws when transport returns empty content', async () => {
    const transport: ModelTransport = {
      complete: vi.fn().mockResolvedValue({ content: '   ' }),
    };
    const orchestrator = createOrchestrator({
      catalog: createBaseCatalog(),
      skills: new SkillRegistry(),
      memory: new ContextMemoryManager(),
      transport,
    });

    await expect(
      orchestrator.generateSpecWithTransport({
        userIntent: 'Empty response',
        messages: [],
      })
    ).rejects.toThrow(/Transport returned empty content/);
  });

  it('returns response format prompt parts for the requested format', () => {
    const orchestrator = createOrchestrator({
      catalog: createBaseCatalog(),
      skills: new SkillRegistry(),
      memory: new ContextMemoryManager(),
    });

    const jsonParts = orchestrator.getPromptParts('json');
    const yamlParts = orchestrator.getPromptParts();

    expect(jsonParts.responseFormatBlock).toContain('Respond with a JSON object:');
    expect(jsonParts.responseFormatBlock).toContain('"spec_version": 1');
    expect(yamlParts.responseFormatBlock).toContain('Respond with YAML in this format:');
  });

  it('keeps profile observations in decoded spec output for runtime memory pipeline', async () => {
    const complete = vi.fn().mockResolvedValue({
      content: [
        'spec_version: 1',
        'layout: stack',
        'profile_observation: "User prefers compact card layouts."',
        'components:',
        '  - id: h1',
        '    type: Heading',
        '    props:',
        '      text: "Profile"',
      ].join('\n'),
    });

    const transport: ModelTransport = { complete };
    const storage = new InMemoryStorage();
    const profile = new AdaptiveProfile(storage);
    await profile.load();

    const orchestrator = createOrchestrator({
      catalog: createBaseCatalog(),
      skills: new SkillRegistry(),
      memory: new ContextMemoryManager(),
      profile,
      transport,
    });

    const spec = await orchestrator.generateSpecWithTransport({
      userIntent: 'Show profile',
      messages: [],
    });

    expect(spec.profile_observation).toBe('User prefers compact card layouts.');
    expect(profile.getContent()).not.toContain('User prefers compact card layouts.');
  });
});
