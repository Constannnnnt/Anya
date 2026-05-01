import type { AnyaContextValue } from '../../Provider';
import {
  buildPresentedView,
  DEFAULT_BEHAVIOR_TELEMETRY_POLICY,
  deriveInteractionMeasurement,
  sanitizeInteractionRecordForTelemetry,
} from '../../behavior/telemetry';
import type { InteractionMeasurementTracker } from '../../behavior/interactionTracker';
import {
  extractActionBindings as coreExtractActionBindings,
  getViewBindings,
  getViewDescriptor,
  getViewSpec,
} from '../../../core';
import type {
  ActionBinding,
  ActionCommand,
  InteractionMeasurementHint,
  InteractionEvent,
  ViewSpec,
  ViewArtifact,
  ViewRecommendationQuery,
} from '../../../core';
import type { PublishViewOptions } from './types';

export interface PlannedToolCall {
  toolId: string;
  bindingId: string;
}

export interface SessionArtifactViewData {
  artifact: ViewArtifact;
  spec: ViewSpec;
  bindings: ActionBinding[];
  descriptor: NonNullable<ReturnType<typeof getViewDescriptor>>;
}

export function createToolCallKey(bindingId: string, toolId: string): string {
  return `${bindingId}::${toolId}`;
}

export function getCurrentSpec(ctx: AnyaContextValue): ViewSpec | null {
  return ctx.viewEngine.getState().currentSpec ?? ctx.sessionMemory.getCurrentSpec();
}

export function getCurrentPublishViewOptions(
  ctx: AnyaContextValue,
): PublishViewOptions | undefined {
  const currentView = ctx.viewEngine.getState().context.currentView;
  if (!currentView) return undefined;

  return {
    id: currentView.id,
    kind: currentView.kind,
    title: currentView.title,
    templateId: currentView.templateId,
    workflow: currentView.workflow,
  };
}

export function getCurrentViewMetadata(
  ctx: AnyaContextValue,
): ViewRecommendationQuery['view'] {
  const currentView = ctx.viewEngine.getState().context.currentView;
  if (!currentView) return undefined;

  return {
    id: currentView.id,
    kind: currentView.kind,
    title: currentView.title,
    templateId: currentView.templateId,
    workflow: currentView.workflow,
  };
}

export function normalizePublishViewOptions(
  input?: PublishViewOptions | 'agent' | 'system',
): Required<Pick<PublishViewOptions, 'source' | 'kind'>> &
  Omit<PublishViewOptions, 'source' | 'kind'> {
  if (input === 'agent' || input === 'system') {
    return {
      source: input,
      kind: 'generated',
    };
  }

  return {
    source: input?.source ?? 'agent',
    kind: input?.kind ?? 'generated',
    id: input?.id,
    title: input?.title,
    templateId: input?.templateId,
    workflow: input?.workflow,
    bindings: input?.bindings,
  };
}

export function getSessionArtifactViewData(
  artifact: ViewArtifact | undefined,
): SessionArtifactViewData | undefined {
  const spec = getViewSpec(artifact);
  const descriptor = getViewDescriptor(artifact);
  if (!artifact || !spec || !descriptor) return undefined;

  return {
    artifact,
    spec,
    descriptor,
    bindings: getViewBindings(artifact) ?? coreExtractActionBindings(spec).bindings,
  };
}

export function buildPublishOptionsFromSessionArtifact(
  data: SessionArtifactViewData,
  overrides?: Omit<PublishViewOptions, 'bindings'>,
): PublishViewOptions {
  return {
    source: overrides?.source ?? 'system',
    kind: overrides?.kind ?? 'generated',
    id: overrides?.id ?? data.descriptor.id,
    title: overrides?.title ?? data.descriptor.title ?? data.artifact.title,
    templateId: overrides?.templateId ?? data.descriptor.templateId,
    workflow: overrides?.workflow ?? data.descriptor.workflow ?? data.spec.skill,
    bindings: data.bindings,
  };
}

export function mergeSessionArtifactMetadata(
  artifact: ViewArtifact,
  metadata?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    sourceArtifactId: artifact.id,
    sourceSessionId: artifact.sessionId,
    ...(metadata ?? {}),
  };
}

export function prepareInteractionTelemetry(
  ctx: AnyaContextValue,
  interaction: InteractionEvent,
  tracker: InteractionMeasurementTracker,
  measurementHint?: InteractionMeasurementHint,
): {
  measurement: ReturnType<typeof deriveInteractionMeasurement>;
  persistedInteraction: InteractionEvent;
} {
  const baseMeasurement = deriveInteractionMeasurement(
    interaction,
    getCurrentSpec(ctx),
    measurementHint,
    DEFAULT_BEHAVIOR_TELEMETRY_POLICY,
  );
  const measurement = tracker.enrich(interaction, baseMeasurement, measurementHint);

  return {
    measurement,
    persistedInteraction: sanitizeInteractionRecordForTelemetry(
      interaction,
      measurement,
      DEFAULT_BEHAVIOR_TELEMETRY_POLICY,
    ),
  };
}

export function doesBindingMatchInteraction(
  binding: ActionBinding,
  interaction: InteractionEvent,
): boolean {
  if (binding.nodeId !== interaction.nodeId) return false;
  if (binding.trigger && interaction.trigger && binding.trigger !== interaction.trigger) {
    return false;
  }
  if (binding.actionMatch && binding.actionMatch !== interaction.action) return false;
  return true;
}

export function collectToolCallsFromAction(
  action: ActionCommand,
  bindingId: string,
  out: PlannedToolCall[],
): void {
  if (action.type === 'tool_call') {
    out.push({
      toolId: action.toolId,
      bindingId,
    });
    return;
  }
  if (action.type === 'composite') {
    for (const nested of action.actions) {
      collectToolCallsFromAction(nested, bindingId, out);
    }
  }
}

export function collectPlannedToolCalls(
  bindings: ActionBinding[],
  interaction: InteractionEvent,
): PlannedToolCall[] {
  const planned: PlannedToolCall[] = [];
  for (const binding of bindings) {
    if (!doesBindingMatchInteraction(binding, interaction)) continue;
    collectToolCallsFromAction(binding.action, binding.id, planned);
  }

  const seen = new Set<string>();
  const deduped: PlannedToolCall[] = [];
  for (const item of planned) {
    const key = createToolCallKey(item.bindingId, item.toolId);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

export { buildPresentedView };

