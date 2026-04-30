/**
 * Spec-level QA contracts for publish-time validation and deterministic repair.
 *
 * This module composes structural checks (layout/components/ids/button onClick)
 * with interaction resolvability checks from interactionQA.
 */

import type { UIComponentSpec, UIRenderSpec } from '../types';
import {
  validateInteractionResolvability,
  type InteractionQAFailureCode,
  type InteractionQAOptions,
} from './interactionQA';

const VALID_LAYOUTS = new Set<UIRenderSpec['layout']>(['stack', 'row', 'grid', 'tabs', 'split']);

export type SpecQAFailureCode =
  | 'layout_invalid'
  | 'components_empty'
  | 'component_id_duplicate'
  | 'button_missing_onclick'
  | InteractionQAFailureCode;

export interface SpecQAFailure {
  code: SpecQAFailureCode;
  message: string;
  componentId?: string;
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
  spec: UIRenderSpec;
  repairedButtonIds: string[];
}

/**
 * Validate a candidate spec before publish.
 * Includes structure checks and interaction resolvability checks.
 */
export function validateSpecForPublish(
  spec: UIRenderSpec,
  options?: SpecQAOptions,
): SpecQAResult {
  const failures: SpecQAFailure[] = [];

  if (!VALID_LAYOUTS.has(spec.layout)) {
    failures.push({
      code: 'layout_invalid',
      message: `Invalid layout '${String(spec.layout)}'.`,
    });
  }

  if (!spec.components || spec.components.length === 0) {
    failures.push({
      code: 'components_empty',
      message: 'Spec has no components.',
    });
    return { valid: false, failures };
  }

  const idList: string[] = [];
  collectIds(spec.components, idList);
  const knownIds = new Set(idList);
  if (knownIds.size !== idList.length) {
    failures.push({
      code: 'component_id_duplicate',
      message: 'Spec contains duplicate component IDs.',
    });
  }

  if (options?.requireButtonOnClick !== false) {
    walkComponents(spec.components, (component) => {
      if (component.type !== 'Button') return;
      const interactions = component.interactions ?? [];
      const hasOnClick = interactions.some((entry) => entry.trigger === 'onClick');
      if (!hasOnClick) {
        failures.push({
          code: 'button_missing_onclick',
          message: `Button '${component.id}' has no onClick interaction.`,
          componentId: component.id,
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
      componentId: failure.componentId,
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
export function enforceButtonOnClickContract(spec: UIRenderSpec): ButtonContractRepairResult {
  const repairedButtonIds: string[] = [];
  const nextComponents = repairButtons(spec.components, repairedButtonIds);

  if (repairedButtonIds.length === 0) {
    return { spec, repairedButtonIds };
  }

  return {
    spec: {
      ...spec,
      components: nextComponents,
    },
    repairedButtonIds,
  };
}

function collectIds(components: UIComponentSpec[], ids: string[]): void {
  for (const component of components) {
    ids.push(component.id!);
    if (component.children?.length) {
      collectIds(component.children, ids);
    }
  }
}

function walkComponents(
  components: UIComponentSpec[],
  visitor: (component: UIComponentSpec) => void,
): void {
  for (const component of components) {
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

function readButtonLabel(component: UIComponentSpec): string | undefined {
  const props = component.props as Record<string, unknown>;
  const label = props.label;
  if (typeof label === 'string' && label.trim()) return label.trim();
  const text = props.text;
  if (typeof text === 'string' && text.trim()) return text.trim();
  return undefined;
}

function buildRequiredButtonInteraction(component: UIComponentSpec): NonNullable<UIComponentSpec['interactions']>[number] {
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
  components: UIComponentSpec[],
  repairedButtonIds: string[],
): UIComponentSpec[] {
  let changed = false;

  const next = components.map((component) => {
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

  return changed ? next : components;
}
