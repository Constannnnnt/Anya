import type { UIRenderSpec, UIComponentSpec, UIInteractionRecord } from './types';
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
 * to a UIRenderSpec immediately without waiting for the LLM inference loop.
 */
export function applyOptimisticUpdate(
  spec: UIRenderSpec,
  interaction: UIInteractionRecord
): UIRenderSpec {
  const isDrop =
    interaction.action === 'drop'
    && typeof interaction.sourceId === 'string'
    && Array.isArray(interaction.targetIds)
    && interaction.targetIds.length > 0;
  const isChange = interaction.action === 'change' && typeof interaction.propName === 'string';

  // Avoid cloning for interaction types that do not mutate UI state optimistically.
  if (!isDrop && !isChange) {
    return spec;
  }

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  function canAcceptChildren(node: UIComponentSpec): boolean {
    if (Array.isArray(node.children)) return true;
    if (KNOWN_CONTAINER_TYPES.has(node.type)) return true;

    if (isRecord(node.props) && node.props.acceptsChildren === true) {
      return true;
    }

    return false;
  }

  function findNode(nodes: UIComponentSpec[], id: string): UIComponentSpec | null {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.children) {
        const found = findNode(node.children, id);
        if (found) return found;
      }
    }
    return null;
  }

  function subtreeContains(node: UIComponentSpec, id: string): boolean {
    if (node.id === id) return true;
    if (!node.children) return false;
    return node.children.some((child) => subtreeContains(child, id));
  }

  function findAndRemove(nodes: UIComponentSpec[], id: string): UIComponentSpec | null {
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

  function findAndAppend(nodes: UIComponentSpec[], id: string, nodeToAppend: UIComponentSpec): boolean {
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

  function updateProp(nodes: UIComponentSpec[], id: string, propName: string, newValue: unknown): boolean {
    for (const node of nodes) {
      if (node.id === id) {
        if (!node.props) node.props = {};
        node.props[propName] = newValue;
        return true;
      }
      if (node.children && updateProp(node.children, id, propName, newValue)) {
        return true;
      }
    }
    return false;
  }

  function applyBoundValue(nodes: UIComponentSpec[], sourceId: string, propName: string, newValue: unknown): void {
    const nodeIndex = new Map<string, UIComponentSpec>();
    const stack = [...nodes];
    while (stack.length > 0) {
      const next = stack.pop()!;
      nodeIndex.set(next.id, next);
      if (next.children?.length) {
        stack.push(...next.children);
      }
    }

    const visited = new Set<string>([sourceId]);
    const queue: string[] = [sourceId];

    for (let index = 0; index < queue.length; index += 1) {
      const currentId = queue[index];
      const currentNode = nodeIndex.get(currentId);
      if (!currentNode || !currentNode.bindTo?.length) continue;

      for (const targetId of currentNode.bindTo) {
        if (visited.has(targetId)) continue;

        const targetNode = nodeIndex.get(targetId);
        if (!targetNode) continue;

        targetNode.props[propName] = newValue;
        visited.add(targetId);
        queue.push(targetId);
      }
    }
  }

  // 1. Spatial Updates (Drag and Drop)
  if (isDrop) {
    const sourceId = interaction.sourceId!;
    const targetId = interaction.targetIds?.[0];
    if (!targetId || sourceId === targetId) return spec;

    const sourceNode = findNode(spec.components, sourceId);
    const targetNode = findNode(spec.components, targetId);
    if (!sourceNode || !targetNode || !canAcceptChildren(targetNode) || subtreeContains(sourceNode, targetId)) {
      return spec;
    }

    const newSpec = cloneRenderSpec(spec);
    const node = findAndRemove(newSpec.components, sourceId);
    if (!node) return spec;

    const appended = findAndAppend(newSpec.components, targetId, node);
    if (!appended) {
      // Preserve the element instead of silently dropping it when append fails.
      newSpec.components.push(node);
    }

    return newSpec;
  }

  // 2. Data Updates (Input Changes)
  if (isChange) {
    const propName = interaction.propName!;
    const sourceNode = findNode(spec.components, interaction.elementId);
    if (!sourceNode) return spec;

    const newSpec = cloneRenderSpec(spec);
    const changed = updateProp(newSpec.components, interaction.elementId, propName, interaction.newValue);
    if (changed) {
      applyBoundValue(newSpec.components, interaction.elementId, propName, interaction.newValue);
      return newSpec;
    }

    return spec;
  }

  return spec;
}
