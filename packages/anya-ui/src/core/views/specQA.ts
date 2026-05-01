/**
 * Spec-level QA contracts for publish-time validation and deterministic repair.
 *
 * This module composes structural checks (layout/nodes/ids/button onClick)
 * with interaction resolvability checks from interactionQA.
 */

import type { ViewNode, ViewSpec } from '../types';
import {
  validateInteractionResolvability,
  type InteractionQAFailureCode,
  type InteractionQAOptions,
} from './interactionQA';

const VALID_LAYOUTS = new Set<ViewSpec['layout']>(['stack', 'row', 'grid', 'tabs', 'split']);

export type SpecQAFailureCode =
  | 'layout_invalid'
  | 'components_empty'
  | 'component_id_duplicate'
  | 'button_missing_onclick'
  | InteractionQAFailureCode;

export interface SpecQAFailure {
  code: SpecQAFailureCode;
  message: string;
  nodeId?: string;
  componentType?: string;
  interactionIndex?: number;
}

export interface SpecQAResult {
  valid: boolean;
  failures: SpecQAFailure[];
}

export interface SpecQAOptions extends InteractionQAOptions {
  /** Require every Button to provide at least one onClick interaction. Default: true */
  requireButtonOnClick?: boolean;
}

export interface ButtonContractRepairResult {
  spec: ViewSpec;
  repairedButtonIds: string[];
}

/**
 * Validate a candidate spec before publish.
 * Includes structure checks and interaction resolvability checks.
 */
export function validateSpecForPublish(
  spec: ViewSpec,
  options?: SpecQAOptions,
): SpecQAResult {
  const failures: SpecQAFailure[] = [];

  if (!VALID_LAYOUTS.has(spec.layout)) {
    failures.push({
      code: 'layout_invalid',
      message: `Invalid layout '${String(spec.layout)}'.`,
    });
  }

  if (!spec.nodes || spec.nodes.length === 0) {
    failures.push({
      code: 'components_empty',
      message: 'Spec has no nodes.',
    });
    return { valid: false, failures };
  }

  const idList: string[] = [];
  collectIds(spec.nodes, idList);
  const knownIds = new Set(idList);
  if (knownIds.size !== idList.length) {
    failures.push({
      code: 'component_id_duplicate',
      message: 'Spec contains duplicate component IDs.',
    });
  }

  if (options?.requireButtonOnClick !== false) {
    walkComponents(spec.nodes, (component) => {
      if (component.type !== 'Button') return;
      const interactions = component.interactions ?? [];
      const hasOnClick = interactions.some((entry) => entry.trigger === 'onClick');
      if (!hasOnClick) {
        failures.push({
          code: 'button_missing_onclick',
          message: `Button '${component.id}' has no onClick interaction.`,
          nodeId: component.id,
          componentType: component.type,
        });
      }
    });
  }

  const interaction = validateInteractionResolvability(spec, {
    knownTools: options?.knownTools,
    knownComponentIds: knownIds,
  });
  for (const failure of interaction.failures) {
    failures.push({
      code: failure.code,
      message: failure.message,
      nodeId: failure.nodeId,
      componentType: failure.componentType,
      interactionIndex: failure.interactionIndex,
    });
  }

  return {
    valid: failures.length === 0,
    failures,
  };
}

/**
 * Deterministic post-QA repair:
 * add a required onClick interaction for Buttons that do not define one.
 */
export function enforceButtonOnClickContract(spec: ViewSpec): ButtonContractRepairResult {
  const repairedButtonIds: string[] = [];
  const nextComponents = repairButtons(spec.nodes, repairedButtonIds);

  if (repairedButtonIds.length === 0) {
    return { spec, repairedButtonIds };
  }

  return {
    spec: {
      ...spec,
      nodes: nextComponents,
    },
    repairedButtonIds,
  };
}

function collectIds(nodes: ViewNode[], ids: string[]): void {
  for (const component of nodes) {
    ids.push(component.id!);
    if (component.children?.length) {
      collectIds(component.children, ids);
    }
  }
}

function walkComponents(
  nodes: ViewNode[],
  visitor: (component: ViewNode) => void,
): void {
  for (const component of nodes) {
    visitor(component);
    if (component.children?.length) {
      walkComponents(component.children, visitor);
    }
  }
}

function sanitizeActionToken(input: string): string {
  const normalized = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || 'button';
}

function readButtonLabel(component: ViewNode): string | undefined {
  const props = component.props as Record<string, unknown>;
  const label = props.label;
  if (typeof label === 'string' && label.trim()) return label.trim();
  const text = props.text;
  if (typeof text === 'string' && text.trim()) return text.trim();
  return undefined;
}

function buildRequiredButtonInteraction(component: ViewNode): NonNullable<ViewNode['interactions']>[number] {
  const buttonLabel = readButtonLabel(component);
  return {
    trigger: 'onClick',
    action: `button_click_${sanitizeActionToken(component.id!)}`,
    description: buttonLabel
      ? `User clicked button "${buttonLabel}".`
      : `User clicked button "${component.id!}".`,
  };
}

function repairButtons(
  nodes: ViewNode[],
  repairedButtonIds: string[],
): ViewNode[] {
  let changed = false;

  const next = nodes.map((component) => {
    let current = component;
    let componentChanged = false;

    if (component.type === 'Button') {
      const interactions = component.interactions ?? [];
      const hasOnClick = interactions.some((entry) => entry.trigger === 'onClick');
      if (!hasOnClick) {
        current = {
          ...current,
          interactions: [...interactions, buildRequiredButtonInteraction(component)],
        };
        repairedButtonIds.push(component.id!);
        componentChanged = true;
      }
    }

    if (component.children?.length) {
      const repairedChildren = repairButtons(component.children, repairedButtonIds);
      if (repairedChildren !== component.children) {
        current = {
          ...current,
          children: repairedChildren,
        };
        componentChanged = true;
      }
    }

    if (componentChanged) changed = true;
    return current;
  });

  return changed ? next : nodes;
}
