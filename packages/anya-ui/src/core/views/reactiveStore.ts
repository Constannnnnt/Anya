import { proxy, subscribe } from 'valtio/vanilla';
import type { StateNode } from './types';

export interface ReactiveStateStore {
  dataNodes: StateNode[];
}

/**
 * Creates a reactive proxy for shared view state nodes.
 * The view engine mutates this store in place while renderers subscribe to it.
 */
export function createReactiveStateStore(initialNodes: StateNode[] = []) {
  const state = proxy<ReactiveStateStore>({
    dataNodes: [...initialNodes],
  });

  return {
    state,

    setNode(node: StateNode) {
      const index = state.dataNodes.findIndex((candidate) => candidate.id === node.id);
      if (index !== -1) {
        state.dataNodes[index] = node;
      } else {
        state.dataNodes.push(node);
      }
    },

    setNodes(nodes: StateNode[]) {
      state.dataNodes = [...nodes];
    },

    subscribe(callback: () => void) {
      return subscribe(state, callback);
    },
  };
}
