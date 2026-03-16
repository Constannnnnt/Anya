/**
 * @anya-ui/core — Interaction QA Validator
 *
 * Pre-publish contract check for interactive elements.
 * Validates that every interaction in a UIRenderSpec has an executable path.
 */

import type { UIRenderSpec, UIComponentSpec, UIInteractionDefinition } from '../types';

// ─── Types ───────────────────────────────────────────────────────────────

export type InteractionQAFailureCode =
  | 'button_missing_action_contract'
  | 'tool_call_unknown_tool'
  | 'target_reference_missing'
  | 'link_or_route_empty';

export interface InteractionQAFailure {
  componentId: string;
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
  spec: UIRenderSpec,
  options?: InteractionQAOptions,
): InteractionQAResult {
  const failures: InteractionQAFailure[] = [];

  // Collect all component IDs for target reference validation
  const knownIds =
    options?.knownComponentIds ?? collectComponentIds(spec.components);
  const knownTools = options?.knownTools;

  walkComponents(spec.components, (component) => {
    if (!component.interactions || component.interactions.length === 0) return;

    for (let i = 0; i < component.interactions.length; i++) {
      const interaction = component.interactions[i];
      const context = {
        componentId: component.id,
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
  context: { componentId: string; componentType: string; interactionIndex: number },
  knownIds: Set<string>,
  knownTools: Set<string> | undefined,
  failures: InteractionQAFailure[],
): void {
  const hasToolCall = Boolean(interaction.tool_call?.name);
  const hasTargetAction = Boolean(
    interaction.targetIds?.length && interaction.targetAction,
  );
  const hasNavigation = interaction.url !== undefined || interaction.route !== undefined;

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

function collectComponentIds(components: UIComponentSpec[]): Set<string> {
  const ids = new Set<string>();
  walkComponents(components, (c) => ids.add(c.id));
  return ids;
}

function walkComponents(
  components: UIComponentSpec[],
  visitor: (component: UIComponentSpec) => void,
): void {
  for (const component of components) {
    visitor(component);
    if (component.children) {
      walkComponents(component.children, visitor);
    }
  }
}
