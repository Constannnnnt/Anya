import type { UIRenderSpec, UIComponentSpec, UIInteractionRecord } from './types';

/**
 * Applies direct local interactions (like drag and drops or value changes)
 * to a UIRenderSpec immediately without waiting for the LLM inference loop.
 */
export function applyOptimisticUpdate(
  spec: UIRenderSpec,
  interaction: UIInteractionRecord
): UIRenderSpec {
  // Deep clone to avoid mutating the current active spec React state directly
  const newSpec = JSON.parse(JSON.stringify(spec)) as UIRenderSpec;

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
    const visited = new Set<string>([sourceId]);
    const queue: string[] = [sourceId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const currentNode = findNode(nodes, currentId);
      if (!currentNode || !currentNode.bindTo?.length) continue;

      for (const targetId of currentNode.bindTo) {
        if (visited.has(targetId)) continue;

        const targetNode = findNode(nodes, targetId);
        if (!targetNode) continue;

        targetNode.props[propName] = newValue;
        visited.add(targetId);
        queue.push(targetId);
      }
    }
  }

  // 1. Spatial Updates (Drag and Drop)
  if (interaction.action === 'drop' && interaction.sourceId && interaction.targetIds && interaction.targetIds.length > 0) {
    const sourceId = interaction.sourceId;
    const targetId = interaction.targetIds[0];
    const sourceNode = findNode(newSpec.components, sourceId);
    const targetNode = findNode(newSpec.components, targetId);

    if (
      sourceNode
      && targetNode
      && sourceId !== targetId
      && canAcceptChildren(targetNode)
      && !subtreeContains(sourceNode, targetId)
    ) {
      const node = findAndRemove(newSpec.components, sourceId);
      if (node) {
        const appended = findAndAppend(newSpec.components, targetId, node);
        if (!appended) {
          // Fallback: keep the element visible instead of dropping data on append failure.
          newSpec.components.push(node);
        }
      }
    }
  }

  // 2. Data Updates (Input Changes)
  if (interaction.action === 'change' && interaction.propName) {
    const changed = updateProp(newSpec.components, interaction.elementId, interaction.propName, interaction.newValue);
    if (changed) {
      applyBoundValue(newSpec.components, interaction.elementId, interaction.propName, interaction.newValue);
    }
  }

  return newSpec;
}
