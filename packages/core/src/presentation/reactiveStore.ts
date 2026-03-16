import { proxy, subscribe } from 'valtio/vanilla';
import type { DataNode } from './types';

export interface ReactiveDataStore {
  dataNodes: DataNode[];
}

/**
 * Creates a reactive proxy for the data nodes.
 * This allows the presentation engine to mutate data in-place
 * while allowing the UI to reactively re-render.
 */
export function createReactiveDataStore(initialNodes: DataNode[] = []) {
  const state = proxy<ReactiveDataStore>({
    dataNodes: [...initialNodes],
  });

  return {
    state,
    
    /**
     * Updates or adds a data node by its id.
     */
    setNode(node: DataNode) {
      const index = state.dataNodes.findIndex((n) => n.id === node.id);
      if (index !== -1) {
        state.dataNodes[index] = node;
      } else {
        state.dataNodes.push(node);
      }
    },

    /**
     * Replaces the entire set of data nodes.
     */
    setNodes(nodes: DataNode[]) {
      state.dataNodes = [...nodes];
    },

    /**
     * Subscribes to changes in the data nodes.
     */
    subscribe(callback: () => void) {
      // Subscribe to the root proxy so deep property mutations
      // (e.g. node.payload.someField = x) always trigger notifications.
      return subscribe(state, callback);
    }
  };
}
