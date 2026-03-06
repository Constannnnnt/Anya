/**
 * Fallback projection builders for data/tools -> UI spec/bindings.
 * Used when no agent candidate spec is provided.
 */
import type { UIComponentSpec, UIRenderSpec } from '../types';
import type {
  DataNode,
  FallbackComponentTypes,
  PresentationPlan,
  PresentationSkill,
  ToolManifest,
  UIBinding,
} from './types';

export const DEFAULT_FALLBACK_COMPONENT_TYPES: FallbackComponentTypes = {
  heading: 'Heading',
  card: 'Card',
  image: 'Image',
  list: 'List',
  listItem: 'ListItem',
  text: 'Text',
  section: 'Section',
  button: 'Button',
};

function resolveFallbackComponentTypes(
  overrides?: Partial<FallbackComponentTypes>
): FallbackComponentTypes {
  return {
    ...DEFAULT_FALLBACK_COMPONENT_TYPES,
    ...overrides,
  };
}

function toSafeText(input: unknown, max = 280): string {
  const raw =
    typeof input === 'string'
      ? input
      : JSON.stringify(input, null, 2);
  if (raw.length <= max) return raw;
  return `${raw.slice(0, max)}...`;
}

function buildDataNodeComponent(
  node: DataNode,
  fallbackComponents: FallbackComponentTypes,
): UIComponentSpec {
  const baseId = `data-node-${node.id}`;
  const header: UIComponentSpec = {
    id: `${baseId}-heading`,
    type: fallbackComponents.heading,
    props: {
      text: node.metadata?.label ?? node.id,
      level: 3,
    },
  };

  if (node.kind === 'image') {
    const payload = node.payload as { src?: string; alt?: string } | string;
    const src = typeof payload === 'string' ? payload : payload?.src;
    return {
      id: baseId,
      type: fallbackComponents.card,
      props: {
        title: node.metadata?.title ?? 'Image',
        dataNodeId: node.id,
      },
      children: [
        header,
        {
          id: `${baseId}-image`,
          type: fallbackComponents.image,
          props: {
            src: src ?? '',
            alt: typeof payload === 'object' ? payload?.alt : node.id,
            width: '100%',
          },
        },
      ],
    };
  }

  if (node.kind === 'array' && Array.isArray(node.payload)) {
    return {
      id: baseId,
      type: fallbackComponents.card,
      props: {
        title: node.metadata?.title ?? 'Array Data',
        dataNodeId: node.id,
      },
      children: [
        header,
        {
          id: `${baseId}-list`,
          type: fallbackComponents.list,
          props: {
            title: `${node.payload.length} items`,
          },
          children: node.payload.slice(0, 20).map((item, index) => ({
            id: `${baseId}-item-${index}`,
            type: fallbackComponents.listItem,
            props: {
              text: toSafeText(item, 140),
            },
          })),
        },
      ],
    };
  }

  if (node.kind === 'document') {
    const payload = node.payload as { content?: string; title?: string } | string;
    return {
      id: baseId,
      type: fallbackComponents.card,
      props: {
        title: typeof payload === 'object' ? payload?.title ?? 'Document' : 'Document',
        dataNodeId: node.id,
      },
      children: [
        header,
        {
          id: `${baseId}-text`,
          type: fallbackComponents.text,
          props: {
            content: toSafeText(
              typeof payload === 'string' ? payload : payload?.content ?? payload,
              900
            ),
          },
        },
      ],
    };
  }

  return {
    id: baseId,
    type: fallbackComponents.card,
    props: {
      title: node.metadata?.title ?? `Data Node (${node.kind})`,
      dataNodeId: node.id,
    },
    children: [
      header,
      {
        id: `${baseId}-text`,
        type: fallbackComponents.text,
        props: {
          content: toSafeText(node.payload, 900),
        },
      },
    ],
  };
}

function buildToolComponentsAndBindings(
  tools: ToolManifest[],
  fallbackComponents: FallbackComponentTypes,
): { components: UIComponentSpec[]; bindings: UIBinding[] } {
  if (tools.length === 0) {
    return { components: [], bindings: [] };
  }

  const components: UIComponentSpec[] = [
    {
      id: 'tools-section',
      type: fallbackComponents.section,
      props: {
        title: 'Available Actions',
        description: 'Agent-bound tools available for direct runtime execution.',
      },
      children: tools.map((tool) => ({
        id: `tool-btn-${tool.id}`,
        type: fallbackComponents.button,
        props: {
          label: tool.name,
        },
        interactions: [
          {
            trigger: 'onClick',
            action: `tool:${tool.id}`,
            description: `Invoke ${tool.name}`,
          },
        ],
      })),
    },
  ];

  const bindings: UIBinding[] = tools.map((tool) => ({
    id: `binding-tool-${tool.id}`,
    componentId: `tool-btn-${tool.id}`,
    trigger: 'onClick',
    actionMatch: `tool:${tool.id}`,
    description: `Execute tool ${tool.name} (${tool.id})`,
    action: {
      type: 'tool_call',
      toolId: tool.id,
      args: {
        context: { $event: 'semanticDescription' },
      },
    },
  }));

  return { components, bindings };
}

export interface PresentationProjection {
  spec: UIRenderSpec;
  bindings: UIBinding[];
}

export interface BuildUIFromDataOptions {
  workflowContext?: string;
  availableWorkflowContexts?: PresentationSkill[];
  newUserContext?: string;
  /** Override semantic fallback component slots for non-default renderers. */
  fallbackComponents?: Partial<FallbackComponentTypes>;
}

function resolveWorkflowContext(
  workflowContext: string | undefined,
  availableWorkflowContexts: PresentationSkill[] | undefined
): PresentationSkill | undefined {
  if (!workflowContext?.trim()) return undefined;
  return availableWorkflowContexts?.find((skill) => skill.name === workflowContext);
}

function resolveWorkflowInputs(options?: BuildUIFromDataOptions): {
  name: string | undefined;
  definitions: PresentationSkill[] | undefined;
} {
  return {
    name: options?.workflowContext,
    definitions: options?.availableWorkflowContexts,
  };
}

function chooseLayout(options?: BuildUIFromDataOptions): UIRenderSpec['layout'] {
  const workflow = resolveWorkflowInputs(options);
  const workflowDefinition = resolveWorkflowContext(workflow.name, workflow.definitions);
  if (workflowDefinition?.defaultLayout) return workflowDefinition.defaultLayout;

  return 'stack';
}

function buildSkillContextComponents(
  workflowContextName: string | undefined,
  availableWorkflowContexts: PresentationSkill[] | undefined,
  fallbackComponents: FallbackComponentTypes,
): UIComponentSpec[] {
  if (!workflowContextName?.trim()) return [];
  const workflowDefinition = resolveWorkflowContext(workflowContextName, availableWorkflowContexts);
  const title = workflowDefinition
    ? `Skill: ${workflowDefinition.name}`
    : `Skill: ${workflowContextName}`;
  const description = workflowDefinition?.description ?? 'Current active skill context.';
  const summaryParts: string[] = [];
  if (workflowDefinition?.components?.length) {
    summaryParts.push(`Components: ${workflowDefinition.components.join(', ')}`);
  }
  if (workflowDefinition?.sop?.objective) {
    summaryParts.push(`Objective: ${workflowDefinition.sop.objective}`);
  }
  const requiredChecklist = (workflowDefinition?.sop?.checklist ?? [])
    .filter((item) => item.required !== false)
    .map((item) => item.title);
  if (requiredChecklist.length > 0) {
    summaryParts.push(`Required checklist: ${requiredChecklist.join('; ')}`);
  }
  const summary = summaryParts.length > 0
    ? summaryParts.join(' | ')
    : 'No component or SOP hints available for this skill.';

  return [
    {
      id: 'skill-section',
      type: fallbackComponents.section,
      props: {
        title,
        description,
      },
      children: [
        {
          id: 'skill-section-summary',
          type: fallbackComponents.text,
          props: {
            content: summary,
            muted: true,
          },
        },
      ],
    },
  ];
}

/**
 * Builds a fallback UI specification and associated bindings from data + tools.
 * Agent-provided candidate specs should be preferred in reasoning-driven flows.
 */
export function buildUIFromData(
  dataNodes: DataNode[],
  tools: ToolManifest[],
  options?: BuildUIFromDataOptions
): PresentationProjection {
  const fallbackComponents = resolveFallbackComponentTypes(options?.fallbackComponents);
  const dataComponents = dataNodes.map((node) => buildDataNodeComponent(node, fallbackComponents));
  const toolProjection = buildToolComponentsAndBindings(tools, fallbackComponents);
  const workflow = resolveWorkflowInputs(options);
  const skillContextComponents = buildSkillContextComponents(
    workflow.name,
    workflow.definitions,
    fallbackComponents,
  );

  const allComponents: UIComponentSpec[] = [...skillContextComponents];
  if (dataComponents.length > 0) {
    allComponents.push({
      id: 'data-section',
      type: fallbackComponents.section,
      props: {
        title: 'Data Context',
        description: `${dataNodes.length} data node(s)`,
      },
      children: dataComponents,
    });
  }
  allComponents.push(...toolProjection.components);

  const spec: UIRenderSpec = {
    spec_version: 1,
    skill: workflow.name,
    layout: chooseLayout(options),
    components: allComponents,
  };

  return {
    spec,
    bindings: toolProjection.bindings,
  };
}

/**
 * Extracts embedded interactions from a UIRenderSpec into a PresentationPlan bindings payload.
 */
export function extractBindingsFromSpec(spec: UIRenderSpec): PresentationPlan {
  const bindings: UIBinding[] = [];

  const walk = (components: UIRenderSpec['components']) => {
    for (const component of components) {
      for (const [interactionIndex, interaction] of (component.interactions ?? []).entries()) {
        const action = interaction.tool_call
          ? {
              type: 'tool_call' as const,
              toolId: interaction.tool_call.name,
              args: interaction.tool_call.parameters,
            }
          : interaction.targetIds?.length
          ? {
              type: 'local_patch' as const,
              patches: interaction.targetIds.map((targetId) => ({
                targetId,
                propName: 'lastAction',
                value: interaction.targetAction ?? interaction.action,
                })),
              }
          : interaction.url || interaction.route
          ? {
              type: 'url_navigation' as const,
              url: interaction.url,
              route: interaction.route,
              description: interaction.description,
            }
          : {
              type: 'semantic_event' as const,
              semanticAction: interaction.action,
              description: interaction.description,
              payload: {
                targetAction: interaction.targetAction ?? interaction.action,
                targetIds: interaction.targetIds ?? [],
              },
            };

        bindings.push({
          id: `binding-${component.id}-${interaction.action}-${interaction.trigger}-${interactionIndex}`,
          componentId: component.id,
          trigger: interaction.trigger,
          actionMatch: interaction.action,
          description: interaction.description,
          action,
        });
      }

      if (component.children?.length) {
        walk(component.children);
      }
    }
  };

  walk(spec.components);

  return {
    plan_version: 0,
    mode: 'rebuild',
    confidence: 1,
    ui_spec: spec,
    bindings,
    rationale_short: 'Extracted bindings from UI component interactions.',
  };
}
