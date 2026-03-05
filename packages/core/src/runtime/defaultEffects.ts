/**
 * Runtime default effects bridge.
 *
 * Converts runtime events into side effects on memory/profile/presentation.
 * The runtime reducer remains pure; all persistence and projection happens here.
 */
import type { RuntimeEffect, RuntimeEffectContext } from './effects';
import { createRuntimeEvent, type RuntimeEvent, type RuntimeState } from './events';
import type { ContextMemoryManager } from '../memory/context';
import type { AdaptiveProfile } from '../memory/profile';
import type { PresentationEngine } from '../presentation/uiEngine';
import { applyDecodedSpec } from '../specLifecycle';
import { extractBindingsFromSpec } from '../presentation/uiBuilder';

export interface CreateDefaultRuntimeEffectsOptions {
  /** Session memory writer used by runtime events. */
  memory: ContextMemoryManager;
  /** Optional adaptive profile writer used when spec includes profile observations. */
  profile?: AdaptiveProfile;
  /** Presentation engine projection target. */
  presentation: PresentationEngine;
  /** Host callback for theme token updates. */
  onThemeUpdated?: (tokens: Record<string, string>) => void | Promise<void>;
  /** Optional host side-effect passthrough for observability/integration hooks. */
  onRuntimeEvent?: (event: RuntimeEvent, state: RuntimeState) => void | Promise<void>;
}

/**
 * Default event-to-side-effect bridge used by host integrations.
 * Keeps runtime reducer pure while memory/presentation/profile stay synchronized.
 */
export function createDefaultRuntimeEffects(
  options: CreateDefaultRuntimeEffectsOptions
): RuntimeEffect[] {
  const baseEffect: RuntimeEffect = (event, context) => {
    switch (event.type) {
      case 'session.intent_updated':
        if (event.payload.mode === 'replace') {
          options.memory.beginTaskScope(event.payload.userIntent);
          options.presentation.setContext({
            workflowContext: undefined,
            newUserContext: event.payload.userIntent,
            requestedMode: 'rebuild',
            candidateSpec: null,
            candidateBindings: [],
            currentSpec: null,
            currentBindings: [],
            sessionHistory: [],
          });
          return;
        }
        options.memory.setContext({ userIntent: event.payload.userIntent });
        options.presentation.setContext({
          newUserContext: event.payload.userIntent,
        });
        return;

      case 'spec.decoded':
      {
        const result = applyDecodedSpec(event.payload.spec, {
          memory: options.memory,
          profile: options.profile,
          presentation: options.presentation,
        }, {
          source: event.source,
        });
        if (result.profileObservation) {
          context.dispatch(
            createRuntimeEvent(
              'preference.explicit',
              {
                category: 'ui',
                key: 'profile_observation',
                value: result.profileObservation,
                statement: result.profileObservation,
              },
              {
                source: event.source,
                causationId: event.id,
                correlationId: event.correlationId,
              },
            ),
          );
        }
        return;
      }

      case 'interaction.recorded':
        options.memory.recordInteraction(event.payload.record);
        {
          const prev = options.presentation.getState().context.sessionHistory ?? [];
          options.presentation.setContext({
            sessionHistory: [...prev, event.payload.record].slice(-400),
          });
        }
        return;

      case 'memory.hydrated':
      {
        const hydratedWorkflowContext = event.payload.state.session?.workflowContext;
        const hydratedSpec = event.payload.state.ui?.spec ?? null;
        const hydratedInteractions = event.payload.state.memory?.interactions ?? [];
        const current = options.presentation.getState();

        // Hydration runs asynchronously on startup, so it must not clobber
        // state that the active session already updated.
        const workflowContext = hydratedWorkflowContext ?? current.context.workflowContext;
        const spec = hydratedSpec ?? current.currentSpec;
        const restoredBindings = spec
          ? extractBindingsFromSpec(spec).bindings
          : current.bindings;
        const sessionHistory = hydratedInteractions.length > 0
          ? hydratedInteractions
          : current.context.sessionHistory ?? [];

        options.presentation.setContext({
          workflowContext,
          candidateSpec: spec,
          candidateBindings: restoredBindings,
          currentSpec: spec,
          currentBindings: restoredBindings,
          sessionHistory,
        });
        return;
      }

      case 'theme.updated':
        if (options.onThemeUpdated) {
          return options.onThemeUpdated(event.payload.tokens as Record<string, string>);
        }
        return;

      default:
        return;
    }
  };

  if (!options.onRuntimeEvent) {
    return [baseEffect];
  }

  const passthroughEffect: RuntimeEffect = (
    event: RuntimeEvent,
    context: RuntimeEffectContext
  ) => options.onRuntimeEvent!(event, context.getState());

  return [baseEffect, passthroughEffect];
}
