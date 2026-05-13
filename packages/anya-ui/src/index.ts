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

  let lastInput: Spec | string = input;

  return {
    update(newInput) {
      if (newInput === lastInput) return;
      lastInput = newInput;
      spec = typeof newInput === 'string' ? parse(newInput) : newInput;
      const newTree = render(spec, { onAction });
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

export { parse } from './parse';
export { render } from './render';
export { encode, encodeHistory } from './encode';
export { buildSystemPrompt } from './prompt';
export type { RenderOptions } from './render';
export type { PromptOptions } from './prompt';
export type {
  Spec,
  SpecNode,
  ContentNode,
  ActionNode,
  InputNode,
  GroupNode,
  FieldDef,
  ActionFeedback,
} from './spec';
export { isAction, isInput, isGroup, isContent } from './spec';
