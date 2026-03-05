import { describe, expect, it } from 'vitest';
import { SkillRegistry } from '../src/registry/skills';

describe('SkillRegistry SOP serialization', () => {
  it('serializes SOP/checklist metadata into LLM-facing YAML', () => {
    const registry = new SkillRegistry();
    registry.register({
      name: 'research_synthesis',
      description: 'Synthesize multi-source context into actionable UI.',
      components: ['Card', 'List', 'Button'],
      contextInputs: ['data_nodes', 'tool_manifests', 'anya_profile'],
      outputExpectations: ['evidence traceability', 'tool affordances'],
      sop: {
        objective: 'Present context and tool actions with clear user affordances.',
        steps: [
          'Group incoming contexts by task relevance.',
          'Choose a layout that keeps evidence and actions connected.',
        ],
        checklist: [
          {
            id: 'ctx-visible',
            title: 'All high-priority contexts are visible',
            doneWhen: 'Top-level view exposes each high-priority context.',
            required: true,
          },
          {
            id: 'tools-bound',
            title: 'Tool affordances are directly bindable',
            doneWhen: 'At least one UI control maps to each required tool.',
            required: true,
          },
        ],
        guardrails: [
          'Do not hide critical context behind deep navigation by default.',
        ],
      },
      defaultLayout: 'grid',
    });

    const yaml = registry.toLLMSkills();
    expect(yaml).toContain('name: research_synthesis');
    expect(yaml).toContain('sop:');
    expect(yaml).toContain('objective:');
    expect(yaml).toContain('checklist:');
    expect(yaml).toContain('required: true');
    expect(yaml).toContain('context_inputs:');
  });
});

