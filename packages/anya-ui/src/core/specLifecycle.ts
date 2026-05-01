import type { ViewSpec } from './types';
import type { ContextMemoryManager } from './memory/context';
import type { AdaptiveProfile } from './memory/profile';
import type { ActionBinding, ViewContext } from './views/types';
import type { ViewEngine } from './views/engine';
import type { RuntimeEventSource } from './runtime/events';
import { extractActionBindings } from './views/planner';
import type { ViewMetadata } from './types';

function normalizeObservation(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function resolveWorkflowContextPatch(
  spec: ViewSpec,
  view?: ViewMetadata,
): Partial<Pick<ViewContext, 'workflowContext'>> {
  const workflowContext = spec.skill ?? view?.workflow;
  if (!workflowContext) return {};
  return {
    workflowContext,
  };
}

export interface ApplySpecOptions {
  source?: RuntimeEventSource;
  userIntent?: string;
  view?: ViewMetadata;
  bindings?: ActionBinding[];
}

export interface ApplySpecDependencies {
  memory: ContextMemoryManager;
  profile?: AdaptiveProfile;
  viewEngine?: Pick<ViewEngine, 'setContext'>;
}

export interface ApplySpecResult {
  bindings: ActionBinding[];
  viewPatch: Partial<ViewContext>;
  profileObservation?: string;
}

/**
 * Shared lifecycle for decoded specs.
 * Keeps memory/profile/view updates deterministic and centralized.
 */
export function applyDecodedSpec(
  spec: ViewSpec,
  deps: ApplySpecDependencies,
  options?: ApplySpecOptions
): ApplySpecResult {
  if (options?.userIntent) {
    deps.memory.setContext({ userIntent: options.userIntent });
  }

  const workflowContext = spec.skill ?? options?.view?.workflow;

  if (workflowContext) {
    deps.memory.setContext({
      workflowContext,
    });
  }

  deps.memory.saveCurrentSpec(spec);

  const bindings = options?.bindings ?? extractActionBindings(spec).bindings;
  const workflowPatch = resolveWorkflowContextPatch(spec, options?.view);
  const currentView: ViewMetadata = {
    kind: options?.view?.kind ?? 'generated',
    ...(options?.view?.id ? { id: options.view.id } : {}),
    ...(options?.view?.title ? { title: options.view.title } : {}),
    ...(options?.view?.templateId ? { templateId: options.view.templateId } : {}),
    ...(workflowContext ? { workflow: workflowContext } : {}),
  };
  const source = options?.source ?? 'system';
  const viewPatch: Partial<ViewContext> =
    source === 'agent'
      ? {
          currentView,
          ...workflowPatch,
          candidateSpec: spec,
          candidateBindings: bindings,
          currentSpec: spec,
          currentBindings: bindings,
        }
      : {
          currentView,
          ...workflowPatch,
          candidateSpec: spec,
          candidateBindings: bindings,
          currentSpec: spec,
          currentBindings: bindings,
        };

  if (deps.viewEngine) {
    deps.viewEngine.setContext(viewPatch);
  }

  const profileObservation = normalizeObservation(spec.profile_observation);

  return {
    bindings,
    viewPatch,
    profileObservation,
  };
}
