import { parse } from './parse';
import { render, type RenderOptions } from './render';
import type { Spec, ActionFeedback } from './spec';

export interface AnyaInstance {
  update(input: Spec | string): void;
  on(event: 'action', handler: (feedback: ActionFeedback) => void): () => void;
  destroy(): void;
  getSpec(): Spec | null;
}

export function mount(input: Spec | string, target: HTMLElement): AnyaInstance {
  let spec: Spec | null = typeof input === 'string' ? parse(input) : input;
  const listeners = new Set<(f: ActionFeedback) => void>();

  const onAction: RenderOptions['onAction'] = (name, payload) => {
    const feedback: ActionFeedback = { action: name, ...payload, timestamp: Date.now() };
    for (const fn of listeners) fn(feedback);
  };

  let tree = render(spec, { onAction });
  target.appendChild(tree);

  let lastSpec = spec;

  return {
    update(newInput) {
      const newSpec = typeof newInput === 'string' ? parse(newInput) : newInput;
      if (newSpec === lastSpec) return;
      spec = newSpec;
      lastSpec = newSpec;
      const newTree = render(newSpec, { onAction });
      target.replaceChild(newTree, tree);
      tree = newTree;
    },
    on(_event, handler) {
      listeners.add(handler);
      return () => { listeners.delete(handler); };
    },
    destroy() {
      tree.remove();
      listeners.clear();
      spec = null;
    },
    getSpec() {
      return spec;
    },
  };
}

export { render } from './render';
export type { RenderOptions } from './render';

// Re-export the full protocol layer
export { parse, encode, encodeHistory, buildSystemPrompt, isAction, isInput, isGroup, isContent } from './protocol';
export type {
  Spec,
  SpecNode,
  ContentNode,
  ActionNode,
  InputNode,
  GroupNode,
  FieldDef,
  ActionFeedback,
  PromptOptions,
} from './protocol';
