/**
 * ../../core — Interaction QA Validator
 *
 * Pre-publish contract check for interactive elements.
 * Validates that every interaction in a ViewSpec has an executable path.
 */

import type { ViewSpec, ViewNode, UIInteractionDefinition } from '../types';

// ─── Types ───────────────────────────────────────────────────────────────

export type InteractionQAFailureCode =
  | 'button_missing_action_contract'
  | 'tool_call_unknown_tool'
  | 'target_action_ambiguous_mutation'
  | 'target_reference_missing'
  | 'link_or_route_empty';

export interface InteractionQAFailure {
  nodeId: string;
  componentType: string;
  interactionIndex: number;
  code: InteractionQAFailureCode;
  message: string;
}

export interface InteractionQAResult {
  valid: boolean;
  failures: InteractionQAFailure[];
}

export interface InteractionQAOptions {
  /** Set of known tool names. If provided, validates tool_call names. */
  knownTools?: Set<string>;
  /** Set of known component IDs in the current spec. Auto-computed if not provided. */
  knownComponentIds?: Set<string>;
}

// ─── Validator ───────────────────────────────────────────────────────────

/**
 * Validate that all interactive elements in a spec have resolvable actions.
 * Checks the resolution precedence: tool_call → targetIds+targetAction → url/route.
 */
export function validateInteractionResolvability(
  spec: ViewSpec,
  options?: InteractionQAOptions,
): InteractionQAResult {
  const failures: InteractionQAFailure[] = [];

  // Collect all component IDs for target reference validation
  const knownIds =
    options?.knownComponentIds ?? collectComponentIds(spec.nodes);
  const knownTools = options?.knownTools;

  walkComponents(spec.nodes, (component) => {
    if (!component.interactions || component.interactions.length === 0) return;

    for (let i = 0; i < component.interactions.length; i++) {
      const interaction = component.interactions[i];
      const context = {
        nodeId: component.id!,
        componentType: component.type,
        interactionIndex: i,
      };

      validateInteraction(interaction, context, knownIds, knownTools, failures);
    }
  });

  return {
    valid: failures.length === 0,
    failures,
  };
}

// ─── Internal ────────────────────────────────────────────────────────────

function validateInteraction(
  interaction: UIInteractionDefinition,
  context: { nodeId: string; componentType: string; interactionIndex: number },
  knownIds: Set<string>,
  knownTools: Set<string> | undefined,
  failures: InteractionQAFailure[],
): void {
  const hasToolCall = Boolean(interaction.tool_call?.name);
  const hasTargetAction = Boolean(
    interaction.targetIds?.length && interaction.targetAction,
  );
  const hasNavigation = interaction.url !== undefined || interaction.route !== undefined;

  if (hasTargetAction && isAmbiguousMutationTargetAction(interaction.targetAction!)) {
    failures.push({
      ...context,
      code: 'target_action_ambiguous_mutation',
      message: `Interaction [${interaction.trigger}:${interaction.action}] uses targetAction "${interaction.targetAction}" as a state mutation shorthand. Use explicit shared $data bindings or an explicit local patch contract instead.`,
    });
  }

  // Check main resolution: at least one path must exist
  if (!hasToolCall && !hasTargetAction && !hasNavigation) {
    failures.push({
      ...context,
      code: 'button_missing_action_contract',
      message: `Interaction [${interaction.trigger}:${interaction.action}] has no executable path (no tool_call, targetIds+targetAction, or url/route).`,
    });
    return;
  }

  // Validate tool_call if present
  if (hasToolCall && knownTools && !knownTools.has(interaction.tool_call!.name)) {
    failures.push({
      ...context,
      code: 'tool_call_unknown_tool',
      message: `tool_call references unknown tool: "${interaction.tool_call!.name}".`,
    });
  }

  // Validate navigation fields if present
  if (interaction.url !== undefined && !interaction.url.trim()) {
    failures.push({
      ...context,
      code: 'link_or_route_empty',
      message: 'Interaction declares url but it is empty.',
    });
  }
  if (interaction.route !== undefined && !interaction.route.trim()) {
    failures.push({
      ...context,
      code: 'link_or_route_empty',
      message: 'Interaction declares route but it is empty.',
    });
  }

  // Validate target references if present
  if (interaction.targetIds) {
    for (const targetId of interaction.targetIds) {
      if (!knownIds.has(targetId)) {
        failures.push({
          ...context,
          code: 'target_reference_missing',
          message: `targetId "${targetId}" does not reference a known component in the spec.`,
        });
      }
    }
  }
}

function isAmbiguousMutationTargetAction(targetAction: string): boolean {
  const normalized = targetAction.trim().toLowerCase();
  return normalized === 'set'
    || normalized.startsWith('setvalue')
    || normalized.startsWith('setchecked')
    || normalized.startsWith('setcontent')
    || normalized.startsWith('setprop')
    || normalized.startsWith('updatevalue')
    || normalized.startsWith('assign');
}

function collectComponentIds(nodes: ViewNode[]): Set<string> {
  const ids = new Set<string>();
  walkComponents(nodes, (c) => ids.add(c.id!));
  return ids;
}

function walkComponents(
  nodes: ViewNode[],
  visitor: (component: ViewNode) => void,
): void {
  for (const component of nodes) {
    visitor(component);
    if (component.children) {
      walkComponents(component.children, visitor);
    }
  }
}
