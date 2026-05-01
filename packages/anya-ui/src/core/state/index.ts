import type { StateNode, StateNodeKind } from '../views/types';

export interface StateMutationOptions {
  kind?: StateNodeKind;
  metadata?: Record<string, unknown>;
}

/**
 * Public shared-state API for Anya runtimes and view engines.
 * Generated views, managed views, and tools should communicate through this graph.
 */
export interface StateGraph {
  getNodes(): StateNode[];
  getNode(nodeId: string): StateNode | undefined;
  setNodes(nodes: StateNode[]): void;
  upsertNode(node: StateNode): void;
  removeNode(nodeId: string): boolean;
  replaceNodeValue(
    nodeId: string,
    value: unknown,
    options?: StateMutationOptions,
  ): StateNode;
  setNodeValue(
    nodeId: string,
    path: string,
    value: unknown,
    options?: StateMutationOptions,
  ): StateNode;
  subscribe(listener: () => void): () => void;
}
