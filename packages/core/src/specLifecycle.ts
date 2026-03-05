import type { UIRenderSpec } from './types';
import type { ContextMemoryManager } from './memory/context';
import type { AdaptiveProfile } from './memory/profile';
import type { PresentationContext, UIBinding } from './presentation/types';
import type { PresentationEngine } from './presentation/uiEngine';
import type { RuntimeEventSource } from './runtime/events';
import { extractBindingsFromSpec } from './presentation/uiBuilder';

function normalizeObservation(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function resolveWorkflowContextPatch(
  spec: UIRenderSpec
): Partial<Pick<PresentationContext, 'workflowContext'>> {
  if (!spec.skill) return {};
  return {
    workflowContext: spec.skill,
  };
}

export interface ApplySpecOptions {
  source?: RuntimeEventSource;
  userIntent?: string;
}

export interface ApplySpecDependencies {
  memory: ContextMemoryManager;
  profile?: AdaptiveProfile;
  presentation?: Pick<PresentationEngine, 'setContext'>;
}

export interface ApplySpecResult {
  bindings: UIBinding[];
  presentationPatch: Partial<PresentationContext>;
  profileObservation?: string;
}

/**
 * Shared lifecycle for decoded specs.
 * Keeps memory/profile/presentation updates deterministic and centralized.
 */
export function applyDecodedSpec(
  spec: UIRenderSpec,
  deps: ApplySpecDependencies,
  options?: ApplySpecOptions
): ApplySpecResult {
  if (options?.userIntent) {
    deps.memory.setContext({ userIntent: options.userIntent });
  }

  if (spec.skill) {
    deps.memory.setContext({
      workflowContext: spec.skill,
    });
  }

  deps.memory.saveCurrentSpec(spec);

  const bindings = extractBindingsFromSpec(spec).bindings;
  const workflowPatch = resolveWorkflowContextPatch(spec);
  const source = options?.source ?? 'system';
  const presentationPatch: Partial<PresentationContext> =
    source === 'agent'
      ? {
          ...workflowPatch,
          candidateSpec: spec,
          candidateBindings: bindings,
          currentSpec: spec,
          currentBindings: bindings,
        }
      : {
          ...workflowPatch,
          candidateSpec: spec,
          currentSpec: spec,
        };

  if (deps.presentation) {
    deps.presentation.setContext(presentationPatch);
  }

  const profileObservation = normalizeObservation(spec.profile_observation);

  return {
    bindings,
    presentationPatch,
    profileObservation,
  };
}
