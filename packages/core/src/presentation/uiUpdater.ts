import type { UIComponentSpec, UIRenderSpec } from '../types';
import { cloneBindings, cloneRenderSpec } from '../clone';
import type {
  BindingValueExpression,
  LocalPatchOperation,
  PresentationMode,
  PresentationOperation,
  PresentationPlan,
  PresentationPlanApplicationResult,
  UIBinding,
} from './types';

const DEFAULT_MAX_PATCH_OPERATIONS = 300;
const DEFAULT_MAX_PATCH_OPERATIONS_PER_COMPONENT = 6;

function findComponentById(nodes: UIComponentSpec[], id: string): UIComponentSpec | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findComponentById(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

function removeComponentById(nodes: UIComponentSpec[], id: string): boolean {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.id === id) {
      nodes.splice(i, 1);
      return true;
    }
    if (node.children && removeComponentById(node.children, id)) {
      return true;
    }
  }
  return false;
}

function upsertComponentAtRoot(nodes: UIComponentSpec[], component: UIComponentSpec): void {
  if (removeComponentById(nodes, component.id)) {
    // removed existing
  }
  nodes.push(component);
}

function upsertComponent(
  nodes: UIComponentSpec[],
  component: UIComponentSpec,
  parentId?: string
): boolean {
  if (!parentId) {
    upsertComponentAtRoot(nodes, component);
    return true;
  }

  const parent = findComponentById(nodes, parentId);
  if (!parent) return false;

  if (!parent.children) {
    parent.children = [];
  }

  removeComponentById(parent.children, component.id);
  parent.children.push(component);
  return true;
}

function upsertBinding(bindings: UIBinding[], next: UIBinding): void {
  const idx = bindings.findIndex((binding) => binding.id === next.id);
  if (idx >= 0) {
    bindings[idx] = next;
    return;
  }
  bindings.push(next);
}

function countComponents(components: UIComponentSpec[]): number {
  let count = 0;
  const stack = [...components];
  while (stack.length > 0) {
    const next = stack.pop()!;
    count += 1;
    if (next.children?.length) {
      stack.push(...next.children);
    }
  }
  return count;
}

/**
 * Modifies an existing UI specification by interpreting and applying a sequential list
 * of layout and schema operations, simulating a virtual DOM update without requiring a full rebuild.
 */
export function applyPresentationOperations(
  baseSpec: UIRenderSpec,
  baseBindings: UIBinding[],
  operations: PresentationOperation[]
): {
  spec: UIRenderSpec;
  bindings: UIBinding[];
  appliedOperations: number;
  failedOperations: number;
} {
  let spec = baseSpec;
  let bindings = baseBindings;
  let specMutable = false;
  let bindingsMutable = false;

  const ensureSpecMutable = () => {
    if (specMutable) return;
    spec = cloneRenderSpec(baseSpec);
    specMutable = true;
  };

  const ensureBindingsMutable = () => {
    if (bindingsMutable) return;
    bindings = cloneBindings(baseBindings);
    bindingsMutable = true;
  };

  let appliedOperations = 0;
  let failedOperations = 0;

  for (const operation of operations) {
    switch (operation.type) {
      case 'replace_components':
        ensureSpecMutable();
        spec.components = operation.components;
        appliedOperations += 1;
        break;

      case 'upsert_component':
        ensureSpecMutable();
        if (upsertComponent(spec.components, operation.component, operation.parentId)) {
          appliedOperations += 1;
        } else {
          failedOperations += 1;
        }
        break;

      case 'remove_component':
        ensureSpecMutable();
        if (removeComponentById(spec.components, operation.componentId)) {
          appliedOperations += 1;
        } else {
          failedOperations += 1;
        }
        break;

      case 'upsert_binding':
        ensureBindingsMutable();
        upsertBinding(bindings, operation.binding);
        appliedOperations += 1;
        break;

      case 'remove_binding':
        {
          const index = bindings.findIndex((binding) => binding.id === operation.bindingId);
          if (index >= 0) {
            ensureBindingsMutable();
            bindings.splice(index, 1);
            appliedOperations += 1;
          } else {
            failedOperations += 1;
          }
        }
        break;
      default:
        failedOperations += 1;
        break;
    }
  }

  return {
    spec,
    bindings,
    appliedOperations,
    failedOperations,
  };
}

export interface PatchPerformanceOptions {
  maxPatchOperations?: number;
  maxPatchOperationsPerComponent?: number;
}

/**
 * Acts on a computed PresentationPlan, attempting to apply its differential operations
 * or escalating to a full UI spec rebuild if the operations exceed established time complexity bounds.
 */
export function applyPresentationPlan(
  currentSpec: UIRenderSpec | null,
  currentBindings: UIBinding[],
  plan: PresentationPlan,
  opts?: PatchPerformanceOptions
): PresentationPlanApplicationResult {
  const modeApplied: PresentationMode = plan.mode;
  const clonePlanProjection = () => ({
    spec: cloneRenderSpec(plan.ui_spec),
    bindings: cloneBindings(plan.bindings),
  });

  if (plan.mode === 'rebuild' || !currentSpec) {
    const projection = clonePlanProjection();
    return {
      spec: projection.spec,
      bindings: projection.bindings,
      modeApplied,
      rebuildEscalated: false,
      appliedOperations: plan.operations?.length ?? 0,
    };
  }

  if (!plan.operations || plan.operations.length === 0) {
    const projection = clonePlanProjection();
    return {
      spec: projection.spec,
      bindings: projection.bindings,
      modeApplied,
      rebuildEscalated: true,
      appliedOperations: 0,
    };
  }

  const maxPatchOperations = opts?.maxPatchOperations ?? DEFAULT_MAX_PATCH_OPERATIONS;
  const maxPatchOpsPerComponent = opts?.maxPatchOperationsPerComponent ?? DEFAULT_MAX_PATCH_OPERATIONS_PER_COMPONENT;
  const componentCount = Math.max(1, countComponents(currentSpec.components));
  const operationCount = plan.operations.length;
  const exceedsAbsoluteBudget = operationCount > maxPatchOperations;
  const exceedsRelativeBudget = operationCount > componentCount * maxPatchOpsPerComponent;

  if (exceedsAbsoluteBudget || exceedsRelativeBudget) {
    const projection = clonePlanProjection();
    return {
      spec: projection.spec,
      bindings: projection.bindings,
      modeApplied: 'rebuild',
      rebuildEscalated: true,
      appliedOperations: 0,
    };
  }

  const result = applyPresentationOperations(currentSpec, currentBindings, plan.operations);
  const rebuildEscalated = result.failedOperations > 0;

  if (rebuildEscalated) {
    const projection = clonePlanProjection();
    return {
      spec: projection.spec,
      bindings: projection.bindings,
      modeApplied: 'rebuild',
      rebuildEscalated: true,
      appliedOperations: result.appliedOperations,
    };
  }

  return {
    spec: result.spec,
    bindings: result.bindings,
    modeApplied: 'patch',
    rebuildEscalated: false,
    appliedOperations: result.appliedOperations,
  };
}


export function setComponentProp(
  spec: UIRenderSpec,
  targetId: string,
  propName: string,
  value: unknown
): UIRenderSpec {
  const target = findComponentById(spec.components, targetId);
  if (!target || target.props[propName] === value) return spec;

  return applyLocalUIUpdates(spec, [{
    targetId,
    propName,
    value: value as BindingValueExpression,
  }], (v) => v).updatedSpec;
}

/**
 * Applies immediate optimistic property updates or visual modifications directly to specific UI components
 * responding to user interactions before remote effects are committed.
 */
export function applyLocalUIUpdates(
  spec: UIRenderSpec,
  patches: LocalPatchOperation[],
  resolveValue: (value: BindingValueExpression | undefined) => unknown
): { updatedSpec: UIRenderSpec; applied: number } {
  if (patches.length === 0) {
    return { updatedSpec: spec, applied: 0 };
  }

  type ResolvedPatch =
    | {
        kind: 'props';
        merge: boolean;
        props: Record<string, unknown>;
      }
    | {
        kind: 'prop';
        propName: string;
        remove: boolean;
        value: unknown;
      };

  const patchesByTargetId = new Map<string, ResolvedPatch[]>();
  for (const patch of patches) {
    let normalized: ResolvedPatch | null = null;

    if (patch.props) {
      const resolvedProps: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(patch.props)) {
        resolvedProps[key] = resolveValue(val);
      }
      normalized = {
        kind: 'props',
        merge: patch.merge !== false,
        props: resolvedProps,
      };
    } else if (patch.propName) {
      normalized = {
        kind: 'prop',
        propName: patch.propName,
        remove: patch.remove === true,
        value: resolveValue(patch.value),
      };
    }

    if (!normalized) continue;
    const existing = patchesByTargetId.get(patch.targetId);
    if (existing) {
      existing.push(normalized);
    } else {
      patchesByTargetId.set(patch.targetId, [normalized]);
    }
  }

  if (patchesByTargetId.size === 0) {
    return { updatedSpec: spec, applied: 0 };
  }

  const applyNodePatches = (node: UIComponentSpec, nodePatches: ResolvedPatch[]): {
    node: UIComponentSpec;
    applied: number;
  } => {
    let nextNode = node;
    let applied = 0;

    for (const patch of nodePatches) {
      if (nextNode === node) {
        nextNode = {
          ...nextNode,
          props: { ...nextNode.props },
        };
      }

      if (patch.kind === 'props') {
        if (patch.merge) {
          nextNode.props = {
            ...nextNode.props,
            ...patch.props,
          };
        } else {
          nextNode.props = patch.props;
        }
        applied += 1;
        continue;
      }

      if (patch.remove) {
        delete nextNode.props[patch.propName];
      } else {
        nextNode.props[patch.propName] = patch.value;
      }
      applied += 1;
    }

    return {
      node: nextNode,
      applied,
    };
  };

  const applyTreePatches = (nodes: UIComponentSpec[]): {
    nodes: UIComponentSpec[];
    changed: boolean;
    applied: number;
  } => {
    let changed = false;
    let applied = 0;

    const nextNodes = nodes.map((node) => {
      let nextNode = node;

      if (node.children?.length) {
        const childResult = applyTreePatches(node.children);
        applied += childResult.applied;
        if (childResult.changed) {
          nextNode = {
            ...nextNode,
            children: childResult.nodes,
          };
          changed = true;
        }
      }

      const nodePatches = patchesByTargetId.get(node.id);
      if (nodePatches && nodePatches.length > 0) {
        const nodeResult = applyNodePatches(nextNode, nodePatches);
        nextNode = nodeResult.node;
        applied += nodeResult.applied;
        if (nodeResult.node !== node) {
          changed = true;
        }
      }

      return nextNode;
    });

    return {
      nodes: changed ? nextNodes : nodes,
      changed,
      applied,
    };
  };

  const treeResult = applyTreePatches(spec.components);
  if (!treeResult.changed) {
    return { updatedSpec: spec, applied: treeResult.applied };
  }

  return {
    updatedSpec: {
      ...spec,
      components: treeResult.nodes,
    },
    applied: treeResult.applied,
  };
}
