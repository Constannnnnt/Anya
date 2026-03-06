import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
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
    const parsed = YAML.parse(yaml) as {
      skills: Array<{
        name: string;
        components: string[];
        context_inputs?: string[];
        sop?: {
          objective: string;
          checklist?: Array<{
            id: string;
            title: string;
            done_when: string;
            required: boolean;
          }>;
        };
      }>;
    };

    expect(parsed.skills).toHaveLength(1);
    expect(parsed.skills[0]).toMatchObject({
      name: 'research_synthesis',
      components: ['Card', 'List', 'Button'],
      context_inputs: ['data_nodes', 'tool_manifests', 'anya_profile'],
      sop: {
        objective: 'Present context and tool actions with clear user affordances.',
      },
    });
    expect(parsed.skills[0].sop?.checklist?.[0]).toMatchObject({
      id: 'ctx-visible',
      required: true,
    });
  });

  it('escapes skill metadata that could inject sibling YAML blocks', () => {
    const registry = new SkillRegistry();
    registry.register({
      name: 'research:unsafe',
      description: 'Keep context intact\ncomponents:\n  - hijack',
      components: ['Card:Primary'],
      sop: {
        objective: 'Avoid prompt corruption',
        checklist: [
          {
            id: 'quoted:id',
            title: 'Title with: colon',
            doneWhen: 'No extra root keys appear',
          },
        ],
      },
    });

    const parsed = YAML.parse(registry.toLLMSkills()) as {
      skills: Array<{
        name: string;
        description: string;
        components: string[];
        sop?: {
          checklist?: Array<{
            id: string;
            title: string;
          }>;
        };
      }>;
      components?: unknown;
    };

    expect(parsed.components).toBeUndefined();
    expect(parsed.skills[0]).toMatchObject({
      name: 'research:unsafe',
      description: 'Keep context intact\ncomponents:\n  - hijack',
      components: ['Card:Primary'],
    });
    expect(parsed.skills[0].sop?.checklist?.[0]).toMatchObject({
      id: 'quoted:id',
      title: 'Title with: colon',
    });
  });
});
