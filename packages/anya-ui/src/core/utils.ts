import type { ViewSpec, ViewNode, UIInteractionRecord } from './types';
import { cloneRenderSpec } from './clone';

const KNOWN_CONTAINER_TYPES = new Set([
  'Container',
  'FlexRow',
  'FlexCol',
  'Card',
  'Section',
  'Timeline',
  'TimelineItem',
  'List',
  'Accordion',
  'AccordionItem',
]);

/**
 * Applies direct local interactions (like drag and drops or value changes)
 * to a ViewSpec immediately without waiting for the LLM inference loop.
 */
export function applyOptimisticUpdate(
  spec: ViewSpec,
  interaction: UIInteractionRecord
): ViewSpec {
  const isDrop =
    interaction.action === 'drop'
    && typeof interaction.sourceId === 'string'
    && Array.isArray(interaction.targetIds)
    && interaction.targetIds.length > 0;
  const isChange =
    (interaction.action === 'change' || interaction.action === 'value_change')
    && typeof interaction.propName === 'string';

  // Avoid cloning for interaction types that do not mutate UI state optimistically.
  if (!isDrop && !isChange) {
    return spec;
  }

  function normalizePathSegments(path: string): string[] {
    return path.replace(/\[(\w+)\]/g, '.$1').split('.').filter(Boolean);
  }

  function getRootPropName(path: string): string {
    return normalizePathSegments(path)[0] ?? path;
  }

  function buildContainer(nextSegment: string | undefined): Record<string, unknown> | unknown[] {
    return nextSegment !== undefined && /^\d+$/.test(nextSegment) ? [] : {};
  }

  function setPropValue(
    props: Record<string, unknown>,
    propPath: string,
    newValue: unknown,
  ): void {
    const segments = normalizePathSegments(propPath);
    if (segments.length === 0) {
      return;
    }

    if (segments.length === 1) {
      props[segments[0]] = newValue;
      return;
    }

    const rootSegment = segments[0];
    let current = props[rootSegment];
    if (typeof current !== 'object' || current === null) {
      current = buildContainer(segments[1]);
      props[rootSegment] = current;
    }

    let cursor = current as Record<string, unknown> | unknown[];
    for (let index = 1; index < segments.length - 1; index += 1) {
      const segment = segments[index];
      const nextSegment = segments[index + 1];
      const record = cursor as Record<string, unknown>;
      const nextValue = record[segment];

      if (typeof nextValue !== 'object' || nextValue === null) {
        record[segment] = buildContainer(nextSegment);
      }

      cursor = record[segment] as Record<string, unknown> | unknown[];
    }

    (cursor as Record<string, unknown>)[segments[segments.length - 1]] = newValue;
  }

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  function isDataBindingExpression(value: unknown): boolean {
    if (!isRecord(value) || !('$data' in value)) {
      return false;
    }
    const dataSelector = value.$data;
    return typeof dataSelector === 'string'
      || (
        isRecord(dataSelector)
        && typeof dataSelector.nodeId === 'string'
      );
  }

  function canAcceptChildren(node: ViewNode): boolean {
    if (Array.isArray(node.children)) return true;
    if (KNOWN_CONTAINER_TYPES.has(node.type)) return true;

    if (isRecord(node.props) && node.props.acceptsChildren === true) {
      return true;
    }

    return false;
  }

  function findNode(nodes: ViewNode[], id: string): ViewNode | null {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.children) {
        const found = findNode(node.children, id);
        if (found) return found;
      }
    }
    return null;
  }

  function subtreeContains(node: ViewNode, id: string): boolean {
    if (node.id === id) return true;
    if (!node.children) return false;
    return node.children.some((child) => subtreeContains(child, id));
  }

  function findAndRemove(nodes: ViewNode[], id: string): ViewNode | null {
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].id === id) {
        return nodes.splice(i, 1)[0];
      }
      if (nodes[i].children) {
        const found = findAndRemove(nodes[i].children!, id);
        if (found) return found;
      }
    }
    return null;
  }

  function findAndAppend(nodes: ViewNode[], id: string, nodeToAppend: ViewNode): boolean {
    for (const node of nodes) {
      if (node.id === id) {
        if (!canAcceptChildren(node)) return false;
        if (!node.children) node.children = [];
        node.children.push(nodeToAppend);
        return true;
      }
      if (node.children && findAndAppend(node.children, id, nodeToAppend)) {
        return true;
      }
    }
    return false;
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

  function updateProp(nodes: ViewNode[], id: string, propName: string, newValue: unknown): boolean {
    for (const node of nodes) {
      if (node.id === id) {
        if (!node.props) node.props = {};
        const rootPropName = getRootPropName(propName);
        if (!isDataBindingExpression(node.props[rootPropName])) {
          setPropValue(node.props, propName, newValue);
        }
        return true;
      }
      if (node.children && updateProp(node.children, id, propName, newValue)) {
        return true;
      }
    }
    return false;
  }

  function applyBoundValue(nodes: ViewNode[], sourceId: string, propName: string, newValue: unknown): void {
    const nodeIndex = new Map<string, ViewNode>();
    const stack = [...nodes];
    while (stack.length > 0) {
      const next = stack.pop()!;
      nodeIndex.set(next.id!, next);
      if (next.children?.length) {
        stack.push(...next.children);
      }
    }

    const visited = new Set<string>([`${sourceId}:${propName}`]);
    const queue: Array<{ nodeId: string; propPath: string }> = [{ nodeId: sourceId, propPath: propName }];

    for (let index = 0; index < queue.length; index += 1) {
      const { nodeId: currentId, propPath } = queue[index];
      const currentNode = nodeIndex.get(currentId);
      if (!currentNode || !currentNode.bindTo?.length) continue;

      for (const rawTarget of currentNode.bindTo) {
        const target = normalizeBindTarget(rawTarget);
        const targetPropPath = target.targetProp ?? propPath;
        const targetKey = `${target.targetId}:${targetPropPath}`;
        if (visited.has(targetKey)) continue;

        const targetNode = nodeIndex.get(target.targetId);
        if (!targetNode) continue;

        if (!targetNode.props) {
          targetNode.props = {};
        }
        const rootPropName = getRootPropName(targetPropPath);
        if (!isDataBindingExpression(targetNode.props[rootPropName])) {
          setPropValue(targetNode.props, targetPropPath, newValue);
        }
        visited.add(targetKey);
        queue.push({ nodeId: target.targetId, propPath: targetPropPath });
      }
    }
  }

  // 1. Spatial Updates (Drag and Drop)
  if (isDrop) {
    const sourceId = interaction.sourceId!;
    const targetId = interaction.targetIds?.[0];
    if (!targetId || sourceId === targetId) return spec;

    const sourceNode = findNode(spec.nodes, sourceId);
    const targetNode = findNode(spec.nodes, targetId);
    if (!sourceNode || !targetNode || !canAcceptChildren(targetNode) || subtreeContains(sourceNode, targetId)) {
      return spec;
    }

    const newSpec = cloneRenderSpec(spec);
    const node = findAndRemove(newSpec.nodes, sourceId);
    if (!node) return spec;

    const appended = findAndAppend(newSpec.nodes, targetId, node);
    if (!appended) {
      // Preserve the element instead of silently dropping it when append fails.
      newSpec.nodes.push(node);
    }

    return newSpec;
  }

  // 2. Data Updates (Input Changes)
  if (isChange) {
    const propName = interaction.propName!;
    const sourceNode = findNode(spec.nodes, interaction.nodeId);
    if (!sourceNode) return spec;

    const newSpec = cloneRenderSpec(spec);
    const changed = updateProp(newSpec.nodes, interaction.nodeId, propName, interaction.newValue);
    if (changed) {
      applyBoundValue(newSpec.nodes, interaction.nodeId, propName, interaction.newValue);
      return newSpec;
    }

    return spec;
  }

  return spec;
}
