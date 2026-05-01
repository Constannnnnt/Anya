import type { ViewNode, ViewSpec } from '../types';
import { cloneBindings, cloneRenderSpec } from '../clone';
import type {
  ActionBinding,
  ApplyViewPlanResult,
  LocalViewChange,
  ValueExpression,
  ViewChange,
  ViewMode,
  ViewPlan,
} from './types';

const DEFAULT_MAX_PATCH_OPERATIONS = 300;
const DEFAULT_MAX_PATCH_OPERATIONS_PER_COMPONENT = 6;

function findComponentById(nodes: ViewNode[], id: string): ViewNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findComponentById(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

function removeComponentById(nodes: ViewNode[], id: string): boolean {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node.id === id) {
      nodes.splice(index, 1);
      return true;
    }
    if (node.children && removeComponentById(node.children, id)) {
      return true;
    }
  }
  return false;
}

function upsertComponentAtRoot(nodes: ViewNode[], component: ViewNode): void {
  removeComponentById(nodes, component.id!);
  nodes.push(component);
}

function upsertComponent(
  nodes: ViewNode[],
  component: ViewNode,
  parentId?: string,
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

  removeComponentById(parent.children, component.id!);
  parent.children.push(component);
  return true;
}

function upsertBinding(bindings: ActionBinding[], next: ActionBinding): void {
  const index = bindings.findIndex((binding) => binding.id === next.id);
  if (index >= 0) {
    bindings[index] = next;
    return;
  }
  bindings.push(next);
}

function countComponents(nodes: ViewNode[]): number {
  let count = 0;
  const stack = [...nodes];
  while (stack.length > 0) {
    const next = stack.pop()!;
    count += 1;
    if (next.children?.length) {
      stack.push(...next.children);
    }
  }
  return count;
}

export function applyViewChanges(
  baseSpec: ViewSpec,
  baseBindings: ActionBinding[],
  operations: ViewChange[],
): {
  spec: ViewSpec;
  bindings: ActionBinding[];
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
        spec.nodes = operation.nodes;
        appliedOperations += 1;
        break;

      case 'upsert_component':
        ensureSpecMutable();
        if (upsertComponent(spec.nodes, operation.component, operation.parentId)) {
          appliedOperations += 1;
        } else {
          failedOperations += 1;
        }
        break;

      case 'remove_component':
        ensureSpecMutable();
        if (removeComponentById(spec.nodes, operation.nodeId)) {
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

      case 'remove_binding': {
        const index = bindings.findIndex((binding) => binding.id === operation.bindingId);
        if (index >= 0) {
          ensureBindingsMutable();
          bindings.splice(index, 1);
          appliedOperations += 1;
        } else {
          failedOperations += 1;
        }
        break;
      }

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

export function applyViewPlan(
  currentSpec: ViewSpec | null,
  currentBindings: ActionBinding[],
  plan: ViewPlan,
  opts?: PatchPerformanceOptions,
): ApplyViewPlanResult {
  const modeApplied: ViewMode = plan.mode;
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
  const maxPatchOperationsPerComponent =
    opts?.maxPatchOperationsPerComponent ?? DEFAULT_MAX_PATCH_OPERATIONS_PER_COMPONENT;
  const componentCount = Math.max(1, countComponents(currentSpec.nodes));
  const operationCount = plan.operations.length;
  const exceedsAbsoluteBudget = operationCount > maxPatchOperations;
  const exceedsRelativeBudget = operationCount > componentCount * maxPatchOperationsPerComponent;

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

  const result = applyViewChanges(currentSpec, currentBindings, plan.operations);
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

export function setViewNodeProp(
  spec: ViewSpec,
  targetId: string,
  propName: string,
  value: unknown,
): ViewSpec {
  const target = findComponentById(spec.nodes, targetId);
  if (!target || target.props[propName] === value) return spec;

  return applyLocalViewChanges(
    spec,
    [{
      targetId,
      propName,
      value: value as ValueExpression,
    }],
    (nextValue) => nextValue,
  ).updatedSpec;
}

export function applyLocalViewChanges(
  spec: ViewSpec,
  patches: LocalViewChange[],
  resolveValue: (value: ValueExpression | undefined) => unknown,
): { updatedSpec: ViewSpec; applied: number } {
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

  const applyNodePatches = (node: ViewNode, nodePatches: ResolvedPatch[]): {
    node: ViewNode;
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

  const applyTreePatches = (nodes: ViewNode[]): {
    nodes: ViewNode[];
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

      const nodePatches = patchesByTargetId.get(node.id!);
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

  const treeResult = applyTreePatches(spec.nodes);
  if (!treeResult.changed) {
    return { updatedSpec: spec, applied: treeResult.applied };
  }

  return {
    updatedSpec: {
      ...spec,
      nodes: treeResult.nodes,
    },
    applied: treeResult.applied,
  };
}
