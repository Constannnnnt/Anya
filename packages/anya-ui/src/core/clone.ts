import type {
  ViewNode,
  UIInteractionDefinition,
  ViewSpec,
} from './types';
import type {
  ActionBinding,
  ActionCommand,
  LocalViewChange,
  ValueExpression,
} from './views/types';

/**
 * Deep clone helper for serializable runtime state.
 * Optimized for the framework's plain-object JSON-like data model and only
 * falls back to structuredClone for non-plain object values.
 */
export function deepClone<T>(value: T): T {
  if (Array.isArray(value)) {
    const next = new Array<unknown>(value.length);
    for (let index = 0; index < value.length; index += 1) {
      next[index] = deepClone(value[index]);
    }
    return next as T;
  }

  if (value && typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    const isPlainObject = proto === Object.prototype || proto === null;

    if (!isPlainObject) {
      if (typeof globalThis.structuredClone === 'function') {
        return globalThis.structuredClone(value);
      }
      return JSON.parse(JSON.stringify(value)) as T;
    }

    const next: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>)) {
      next[key] = deepClone((value as Record<string, unknown>)[key]);
    }
    return next as T;
  }

  return value;
}

function cloneInteraction(interaction: UIInteractionDefinition): UIInteractionDefinition {
  return {
    ...interaction,
    ...(interaction.tool_call
      ? {
          tool_call: {
            ...interaction.tool_call,
            ...(interaction.tool_call.parameters
              ? {
                  parameters: deepClone(interaction.tool_call.parameters),
                }
              : {}),
          },
        }
      : {}),
    ...(interaction.targetIds ? { targetIds: [...interaction.targetIds] } : {}),
  };
}

function cloneComponent(component: ViewNode): ViewNode {
  return {
    ...component,
    props: deepClone(component.props),
    ...(component.interactions
      ? { interactions: component.interactions.map(cloneInteraction) }
      : {}),
    ...(component.bindTo ? { bindTo: deepClone(component.bindTo) } : {}),
    ...(component.children
      ? { children: component.children.map(cloneComponent) }
      : {}),
  };
}

function clonePatchOperation(patch: LocalViewChange): LocalViewChange {
  return {
    ...patch,
    ...(patch.props ? { props: deepClone(patch.props) } : {}),
    ...(patch.propName ? { propName: patch.propName } : {}),
    ...(patch.remove ? { remove: true } : {}),
    ...(patch.merge !== undefined ? { merge: patch.merge } : {}),
    ...(patch.value !== undefined ? { value: deepClone(patch.value) as ValueExpression } : {}),
  };
}

function cloneBindingAction(action: ActionCommand): ActionCommand {
  switch (action.type) {
    case 'local_patch':
      return {
        type: 'local_patch',
        patches: action.patches.map(clonePatchOperation),
      };
    case 'semantic_event':
      return {
        ...action,
        ...(action.payload ? { payload: deepClone(action.payload) } : {}),
      };
    case 'tool_call':
      return {
        ...action,
        ...(action.args ? { args: deepClone(action.args) } : {}),
        ...(action.optimisticPatches
          ? { optimisticPatches: action.optimisticPatches.map(clonePatchOperation) }
          : {}),
        ...(action.resultPatches
          ? { resultPatches: action.resultPatches.map(clonePatchOperation) }
          : {}),
        ...(action.policy ? { policy: { ...action.policy } } : {}),
      };
    case 'url_navigation':
      return { ...action };
    case 'composite':
      return {
        type: 'composite',
        actions: action.actions.map(cloneBindingAction),
      };
    default:
      return action;
  }
}

export function cloneRenderSpec(spec: ViewSpec): ViewSpec {
  return {
    ...spec,
    nodes: spec.nodes.map(cloneComponent),
    ...(spec.theme_update ? { theme_update: { ...spec.theme_update } } : {}),
  };
}

export function cloneBindings(bindings: ActionBinding[]): ActionBinding[] {
  return bindings.map((binding) => ({
    ...binding,
    action: cloneBindingAction(binding.action),
  }));
}
