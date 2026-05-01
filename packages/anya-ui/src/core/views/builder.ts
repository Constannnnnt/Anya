/**
 * Deterministic builders for state/tools -> view spec and action bindings.
 * Used when no agent candidate spec is available.
 */
import type { InteractionTrigger, ViewNode, ViewSpec } from '../types';
import type {
  ActionBinding,
  ActionCommand,
  StateNode,
  ToolDefinition,
  ViewNodeSlots,
  ViewPlan,
  ViewRecipe,
} from './types';

export const DEFAULT_VIEW_COMPONENT_SLOTS: ViewNodeSlots = {
  heading: 'Heading',
  card: 'Card',
  image: 'Image',
  list: 'List',
  listItem: 'ListItem',
  text: 'Text',
  section: 'Section',
  button: 'Button',
};

export interface ViewProjection {
  spec: ViewSpec;
  bindings: ActionBinding[];
}

export interface BuildViewFromStateOptions {
  workflowContext?: string;
  availableWorkflows?: ViewRecipe[];
  newUserContext?: string;
  projectionNodes?: Partial<ViewNodeSlots>;
}

function resolveViewNodeSlots(
  overrides?: Partial<ViewNodeSlots>,
): ViewNodeSlots {
  return {
    ...DEFAULT_VIEW_COMPONENT_SLOTS,
    ...overrides,
  };
}

function toSafeText(input: unknown, max = 280): string {
  const raw = typeof input === 'string' ? input : safeStringify(input);
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

function buildStateNodeComponent(
  node: StateNode,
  componentSlots: ViewNodeSlots,
): ViewNode {
  const baseId = `data-node-${node.id}`;
  const header: ViewNode = {
    id: `${baseId}-heading`,
    type: componentSlots.heading,
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
      type: componentSlots.card,
      props: {
        title: node.metadata?.title ?? 'Image',
        dataNodeId: node.id,
      },
      children: [
        header,
        {
          id: `${baseId}-image`,
          type: componentSlots.image,
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
      type: componentSlots.card,
      props: {
        title: node.metadata?.title ?? 'Array Data',
        dataNodeId: node.id,
      },
      children: [
        header,
        {
          id: `${baseId}-list`,
          type: componentSlots.list,
          props: {
            title: `${node.payload.length} items`,
          },
          children: node.payload.slice(0, 20).map((item, index) => ({
            id: `${baseId}-item-${index}`,
            type: componentSlots.listItem,
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
      type: componentSlots.card,
      props: {
        title: typeof payload === 'object' ? payload?.title ?? 'Document' : 'Document',
        dataNodeId: node.id,
      },
      children: [
        header,
        {
          id: `${baseId}-text`,
          type: componentSlots.text,
          props: {
            content: toSafeText(
              typeof payload === 'string' ? payload : payload?.content ?? payload,
              900,
            ),
          },
        },
      ],
    };
  }

  return {
    id: baseId,
    type: componentSlots.card,
    props: {
      title: node.metadata?.title ?? `Data Node (${node.kind})`,
      dataNodeId: node.id,
    },
    children: [
      header,
      {
        id: `${baseId}-text`,
        type: componentSlots.text,
        props: {
          content: toSafeText(node.payload, 900),
        },
      },
    ],
  };
}

function buildToolComponentsAndBindings(
  tools: ToolDefinition[],
  componentSlots: ViewNodeSlots,
): { nodes: ViewNode[]; bindings: ActionBinding[] } {
  if (tools.length === 0) {
    return { nodes: [], bindings: [] };
  }

  const nodes: ViewNode[] = [
    {
      id: 'tools-section',
      type: componentSlots.section,
      props: {
        title: 'Available Actions',
        description: 'Runtime tools available for direct execution.',
      },
      children: tools.map((tool) => ({
        id: `tool-btn-${tool.id}`,
        type: componentSlots.button,
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

  const bindings: ActionBinding[] = tools.map((tool) => ({
    id: `binding-tool-${tool.id}`,
    nodeId: `tool-btn-${tool.id}`,
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

  return { nodes, bindings };
}

function resolveWorkflowContext(
  workflowContext: string | undefined,
  availableWorkflows: ViewRecipe[] | undefined,
): ViewRecipe | undefined {
  if (!workflowContext?.trim()) return undefined;
  return availableWorkflows?.find((workflow) => workflow.name === workflowContext);
}

function resolveWorkflowInputs(options?: BuildViewFromStateOptions): {
  name: string | undefined;
  definitions: ViewRecipe[] | undefined;
} {
  return {
    name: options?.workflowContext,
    definitions: options?.availableWorkflows,
  };
}

function chooseLayout(options?: BuildViewFromStateOptions): ViewSpec['layout'] {
  const workflow = resolveWorkflowInputs(options);
  const definition = resolveWorkflowContext(workflow.name, workflow.definitions);
  if (definition?.defaultLayout) return definition.defaultLayout;
  return 'stack';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractDataBindingSelector(value: unknown): { nodeId: string; path?: string } | undefined {
  if (!isRecord(value) || !('$data' in value)) {
    return undefined;
  }

  const dataBinding = value.$data;
  if (typeof dataBinding === 'string') {
    return { nodeId: dataBinding };
  }
  if (!isRecord(dataBinding) || typeof dataBinding.nodeId !== 'string') {
    return undefined;
  }

  return {
    nodeId: dataBinding.nodeId,
    path: typeof dataBinding.path === 'string' ? dataBinding.path : undefined,
  };
}

function collectComponentIds(nodes: ViewNode[]): Set<string> {
  const ids = new Set<string>();

  const walk = (nodes: ViewNode[]) => {
    for (const node of nodes) {
      ids.add(node.id!);
      if (node.children?.length) {
        walk(node.children);
      }
    }
  };

  walk(nodes);
  return ids;
}

function normalizeBindTarget(
  target: NonNullable<ViewNode['bindTo']>[number],
): { targetId: string; targetProp?: string } {
  if (typeof target === 'string') {
    return { targetId: target };
  }

  return {
    targetId: target.targetId,
    targetProp: target.targetProp,
  };
}

function inferBoundDataPath(component: ViewNode, nodeId: string): string | undefined {
  const preferredProps = ['value', 'checked', 'currentStep'];

  for (const propName of preferredProps) {
    const selector = extractDataBindingSelector(component.props?.[propName]);
    if (selector?.nodeId === nodeId) {
      return selector.path;
    }
  }

  for (const propValue of Object.values(component.props ?? {})) {
    const selector = extractDataBindingSelector(propValue);
    if (selector?.nodeId === nodeId) {
      return selector.path;
    }
  }

  return undefined;
}

function buildWorkflowContextComponents(
  workflowContextName: string | undefined,
  availableWorkflows: ViewRecipe[] | undefined,
  componentSlots: ViewNodeSlots,
): ViewNode[] {
  if (!workflowContextName?.trim()) return [];
  const definition = resolveWorkflowContext(workflowContextName, availableWorkflows);
  const title = definition
    ? `Workflow: ${definition.name}`
    : `Workflow: ${workflowContextName}`;
  const description = definition?.description ?? 'Current active workflow context.';
  const summaryParts: string[] = [];
  if (definition?.nodes?.length) {
    summaryParts.push(`Components: ${definition.nodes.join(', ')}`);
  }
  if (definition?.sop?.objective) {
    summaryParts.push(`Objective: ${definition.sop.objective}`);
  }
  const requiredChecklist = (definition?.sop?.checklist ?? [])
    .filter((item) => item.required !== false)
    .map((item) => item.title);
  if (requiredChecklist.length > 0) {
    summaryParts.push(`Required checklist: ${requiredChecklist.join('; ')}`);
  }
  const summary = summaryParts.length > 0
    ? summaryParts.join(' | ')
    : 'No workflow hints available for this view.';

  return [
    {
      id: 'workflow-section',
      type: componentSlots.section,
      props: {
        title,
        description,
      },
      children: [
        {
          id: 'workflow-section-summary',
          type: componentSlots.text,
          props: {
            content: summary,
            muted: true,
          },
        },
      ],
    },
  ];
}

export function buildViewFromState(
  dataNodes: StateNode[],
  tools: ToolDefinition[],
  options?: BuildViewFromStateOptions,
): ViewProjection {
  const componentSlots = resolveViewNodeSlots(options?.projectionNodes);
  const dataComponents = dataNodes.map((node) => buildStateNodeComponent(node, componentSlots));
  const toolProjection = buildToolComponentsAndBindings(tools, componentSlots);
  const workflow = resolveWorkflowInputs(options);
  const workflowComponents = buildWorkflowContextComponents(
    workflow.name,
    workflow.definitions,
    componentSlots,
  );

  const allComponents: ViewNode[] = [...workflowComponents];
  if (dataComponents.length > 0) {
    allComponents.push({
      id: 'data-section',
      type: componentSlots.section,
      props: {
        title: 'Data Context',
        description: `${dataNodes.length} data node(s)`,
      },
      children: dataComponents,
    });
  }
  allComponents.push(...toolProjection.nodes);

  const spec: ViewSpec = {
    spec_version: 1,
    skill: workflow.name,
    layout: chooseLayout(options),
    nodes: allComponents,
  };

  return {
    spec,
    bindings: toolProjection.bindings,
  };
}

export function extractActionBindings(spec: ViewSpec): ViewPlan {
  const bindings: ActionBinding[] = [];
  const nodeIds = collectComponentIds(spec.nodes);

  const walk = (nodes: ViewNode[]) => {
    for (const component of nodes) {
      for (const [interactionIndex, interaction] of (component.interactions ?? []).entries()) {
        const action = buildActionCommand(interaction);

        bindings.push({
          id: `binding-${component.id}-${interaction.action}-${interaction.trigger}-${interactionIndex}`,
          nodeId: component.id!,
          trigger: interaction.trigger,
          actionMatch: interaction.trigger === 'onChange'
            ? 'value_change'
            : interaction.action,
          description: interaction.description,
          action,
        });
      }

      const boundNodes = new Map<string, string | undefined>();
      for (const rawTarget of component.bindTo ?? []) {
        const target = normalizeBindTarget(rawTarget);
        if (nodeIds.has(target.targetId)) {
          continue;
        }
        if (!boundNodes.has(target.targetId)) {
          boundNodes.set(target.targetId, target.targetProp);
        }
      }

      if (component.props) {
        Object.values(component.props).forEach((propValue) => {
          const selector = extractDataBindingSelector(propValue);
          if (selector?.nodeId) {
            const existingPath = boundNodes.get(selector.nodeId);
            if (!boundNodes.has(selector.nodeId) || (existingPath === undefined && selector.path !== undefined)) {
              boundNodes.set(selector.nodeId, selector.path);
            }
          }
        });
      }

      if (boundNodes.size > 0) {
        let bindIndex = 0;
        for (const [bindId, explicitPath] of boundNodes) {
          bindings.push({
            id: `binding-auto-${component.id}-${bindId}-${bindIndex++}`,
            nodeId: component.id!,
            trigger: 'onChange' as InteractionTrigger,
            actionMatch: 'value_change',
            action: {
              type: 'data_update',
              nodeId: bindId,
              path: explicitPath ?? inferBoundDataPath(component, bindId),
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

  walk(spec.nodes);

  return {
    plan_version: 0,
    mode: 'rebuild',
    confidence: 1,
    ui_spec: spec,
    bindings,
    rationale_short: 'Extracted action bindings from the view component interactions.',
  };
}

function buildActionCommand(
  interaction: NonNullable<ViewNode['interactions']>[number],
): ActionCommand {
  if (interaction.tool_call) {
    return {
      type: 'tool_call',
      toolId: interaction.tool_call.name,
      args: interaction.tool_call.parameters,
    };
  }

  const rawAction = interaction.action as any;
  if (typeof rawAction === 'object' && rawAction !== null && rawAction.type === 'data_update') {
    return {
      type: 'data_update',
      nodeId: rawAction.nodeId,
      path: rawAction.path,
      value: rawAction.value,
    };
  }

  if (interaction.targetIds?.length) {
    return {
      type: 'local_patch',
      patches: interaction.targetIds.map((targetId) => ({
        targetId,
        propName: 'lastAction',
        value: interaction.targetAction ?? interaction.action,
      })),
    };
  }

  if (interaction.url || interaction.route) {
    return {
      type: 'url_navigation',
      url: interaction.url,
      route: interaction.route,
      description: interaction.description,
    };
  }

  return {
    type: 'semantic_event',
    semanticAction: interaction.action,
    description: interaction.description,
    payload: {
      targetAction: interaction.targetAction ?? interaction.action,
      targetIds: interaction.targetIds ?? [],
    },
  };
}
