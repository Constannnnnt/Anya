/**
 * Deterministic projection builders for data/tools -> UI spec/bindings.
 * Used when no agent candidate spec is provided.
 */
import type { UIComponentSpec, UIRenderSpec } from '../types';
import type {
  DataNode,
  ProjectionComponentTypes,
  PresentationPlan,
  PresentationSkill,
  ToolManifest,
  UIBinding,
  BindingAction,
} from './types';
import type { InteractionTrigger } from '../types';

export const DEFAULT_PROJECTION_COMPONENT_TYPES: ProjectionComponentTypes = {
  heading: 'Heading',
  card: 'Card',
  image: 'Image',
  list: 'List',
  listItem: 'ListItem',
  text: 'Text',
  section: 'Section',
  button: 'Button',
};

function resolveProjectionComponentTypes(
  overrides?: Partial<ProjectionComponentTypes>
): ProjectionComponentTypes {
  return {
    ...DEFAULT_PROJECTION_COMPONENT_TYPES,
    ...overrides,
  };
}

function toSafeText(input: unknown, max = 280): string {
  const raw =
    typeof input === 'string'
      ? input
      : safeStringify(input);
  if (raw.length <= max) return raw;
  return `${raw.slice(0, max)}...`;
}

function safeStringify(input: unknown): string {
  try {
    return JSON.stringify(input, createCircularReplacer(), 2);
  } catch {
    return '[unserializable data]';
  }
}

function createCircularReplacer(): (key: string, value: unknown) => unknown {
  const seen = new WeakSet<object>();

  return (_key: string, value: unknown) => {
    if (typeof value !== 'object' || value === null) {
      return value;
    }

    if (seen.has(value)) {
      return '[circular]';
    }

    seen.add(value);
    return value;
  };
}

function buildDataNodeComponent(
  node: DataNode,
  projectionComponents: ProjectionComponentTypes,
): UIComponentSpec {
  const baseId = `data-node-${node.id}`;
  const header: UIComponentSpec = {
    id: `${baseId}-heading`,
    type: projectionComponents.heading,
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
      type: projectionComponents.card,
      props: {
        title: node.metadata?.title ?? 'Image',
        dataNodeId: node.id,
      },
      children: [
        header,
        {
          id: `${baseId}-image`,
          type: projectionComponents.image,
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
      type: projectionComponents.card,
      props: {
        title: node.metadata?.title ?? 'Array Data',
        dataNodeId: node.id,
      },
      children: [
        header,
        {
          id: `${baseId}-list`,
          type: projectionComponents.list,
          props: {
            title: `${node.payload.length} items`,
          },
          children: node.payload.slice(0, 20).map((item, index) => ({
            id: `${baseId}-item-${index}`,
            type: projectionComponents.listItem,
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
      type: projectionComponents.card,
      props: {
        title: typeof payload === 'object' ? payload?.title ?? 'Document' : 'Document',
        dataNodeId: node.id,
      },
      children: [
        header,
        {
          id: `${baseId}-text`,
          type: projectionComponents.text,
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
    type: projectionComponents.card,
    props: {
      title: node.metadata?.title ?? `Data Node (${node.kind})`,
      dataNodeId: node.id,
    },
    children: [
      header,
      {
        id: `${baseId}-text`,
        type: projectionComponents.text,
        props: {
          content: toSafeText(node.payload, 900),
        },
      },
    ],
  };
}

function buildToolComponentsAndBindings(
  tools: ToolManifest[],
  projectionComponents: ProjectionComponentTypes,
): { components: UIComponentSpec[]; bindings: UIBinding[] } {
  if (tools.length === 0) {
    return { components: [], bindings: [] };
  }

  const components: UIComponentSpec[] = [
    {
      id: 'tools-section',
      type: projectionComponents.section,
      props: {
        title: 'Available Actions',
        description: 'Agent-bound tools available for direct runtime execution.',
      },
      children: tools.map((tool) => ({
        id: `tool-btn-${tool.id}`,
        type: projectionComponents.button,
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

export interface BuildProjectionFromContextOptions {
  workflowContext?: string;
  availableWorkflowContexts?: PresentationSkill[];
  newUserContext?: string;
  /** Override semantic projection component slots for non-default renderers. */
  projectionComponents?: Partial<ProjectionComponentTypes>;
}

function resolveWorkflowContext(
  workflowContext: string | undefined,
  availableWorkflowContexts: PresentationSkill[] | undefined
): PresentationSkill | undefined {
  if (!workflowContext?.trim()) return undefined;
  return availableWorkflowContexts?.find((skill) => skill.name === workflowContext);
}

function resolveWorkflowInputs(options?: BuildProjectionFromContextOptions): {
  name: string | undefined;
  definitions: PresentationSkill[] | undefined;
} {
  return {
    name: options?.workflowContext,
    definitions: options?.availableWorkflowContexts,
  };
}

function chooseLayout(options?: BuildProjectionFromContextOptions): UIRenderSpec['layout'] {
  const workflow = resolveWorkflowInputs(options);
  const workflowDefinition = resolveWorkflowContext(workflow.name, workflow.definitions);
  if (workflowDefinition?.defaultLayout) return workflowDefinition.defaultLayout;

  return 'stack';
}

function buildSkillContextComponents(
  workflowContextName: string | undefined,
  availableWorkflowContexts: PresentationSkill[] | undefined,
  projectionComponents: ProjectionComponentTypes,
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
      type: projectionComponents.section,
      props: {
        title,
        description,
      },
      children: [
        {
          id: 'skill-section-summary',
          type: projectionComponents.text,
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
 * Builds a deterministic UI projection and associated bindings from data + tools.
 * Agent-provided candidate specs should be preferred in reasoning-driven flows.
 */
export function buildProjectionFromContext(
  dataNodes: DataNode[],
  tools: ToolManifest[],
  options?: BuildProjectionFromContextOptions
): PresentationProjection {
  const projectionComponents = resolveProjectionComponentTypes(options?.projectionComponents);
  const dataComponents = dataNodes.map((node) => buildDataNodeComponent(node, projectionComponents));
  const toolProjection = buildToolComponentsAndBindings(tools, projectionComponents);
  const workflow = resolveWorkflowInputs(options);
  const skillContextComponents = buildSkillContextComponents(
    workflow.name,
    workflow.definitions,
    projectionComponents,
  );

  const allComponents: UIComponentSpec[] = [...skillContextComponents];
  if (dataComponents.length > 0) {
    allComponents.push({
      id: 'data-section',
      type: projectionComponents.section,
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

  const walk = (components: UIComponentSpec[]) => {
    for (const component of components) {
      // 1) Explicit interactions
      for (const [interactionIndex, interaction] of (component.interactions ?? []).entries()) {
        const action = buildBindingAction(interaction);

        bindings.push({
          id: `binding-${component.id}-${interaction.action}-${interaction.trigger}-${interactionIndex}`,
          componentId: component.id,
          trigger: interaction.trigger,
          actionMatch: interaction.action,
          description: interaction.description,
          action,
        });
      }

      // 2) Native bi-directional bindings (implicit or via bindTo)
      const boundNodes = new Set<string>(component.bindTo || []);

      // Discover implicit bindings from props
      if (component.props) {
        Object.values(component.props).forEach((propValue: any) => {
          if (propValue && typeof propValue === 'object' && propValue.$data) {
            const nodeId = propValue.$data.nodeId || propValue.$data;
            if (typeof nodeId === 'string') {
              boundNodes.add(nodeId);
            }
          }
        });
      }

      if (boundNodes.size > 0) {
        let bindIndex = 0;
        for (const bindId of boundNodes) {
          // Automatic binding for common input components
          // If a component has bindTo or $data props, it usually means "update this node on change"
          
          // Smart Path Inference: if 'value' prop is bound to this node, use its path
          let inferredPath: string | undefined = undefined;
          const valueProp = component.props?.value as any;
          if (valueProp && typeof valueProp === 'object' && valueProp.$data) {
            const nodeId = valueProp.$data.nodeId || valueProp.$data;
            if (nodeId === bindId) {
              inferredPath = valueProp.$data.path;
            }
          }

          bindings.push({
            id: `binding-auto-${component.id}-${bindId}-${bindIndex++}`,
            componentId: component.id,
            trigger: 'onChange' as InteractionTrigger, // Default trigger for native bind
            actionMatch: 'value_change', // Standard slider/input action
            action: {
              type: 'data_update',
              nodeId: bindId,
              path: inferredPath,
              value: { $event: 'newValue' },
            },
          });
        }
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

function buildBindingAction(
  interaction: NonNullable<UIComponentSpec['interactions']>[number],
): BindingAction {
  if (interaction.tool_call) {
    return {
      type: 'tool_call' as const,
      toolId: interaction.tool_call.name,
      args: interaction.tool_call.parameters,
    };
  }

  // Handle explicit data_update if provided in spec
  const rawAction = interaction.action as any;
  if (typeof rawAction === 'object' && rawAction !== null && rawAction.type === 'data_update') {
    return {
      type: 'data_update' as const,
      nodeId: rawAction.nodeId,
      path: rawAction.path,
      value: rawAction.value,
    };
  }

  if (interaction.targetIds?.length) {
    return {
      type: 'local_patch' as const,
      patches: interaction.targetIds.map((targetId) => ({
        targetId,
        propName: 'lastAction',
        value: interaction.targetAction ?? interaction.action,
      })),
    };
  }

  if (interaction.url || interaction.route) {
    return {
      type: 'url_navigation' as const,
      url: interaction.url,
      route: interaction.route,
      description: interaction.description,
    };
  }

  return {
    type: 'semantic_event' as const,
    semanticAction: interaction.action,
    description: interaction.description,
    payload: {
      targetAction: interaction.targetAction ?? interaction.action,
      targetIds: interaction.targetIds ?? [],
    },
  };
}
