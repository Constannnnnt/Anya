import { createRuntimeEvent } from '@anya-ui/core';
import type {
  ActionResult,
  InteractionMeasurementHint,
  InteractionEvent,
  RuntimeEvent,
  RuntimeState,
  ViewSpec,
} from '@anya-ui/core';
import type { AnyaContextValue } from '../../Provider';
import type { InteractionMeasurementTracker } from '../../behavior/interactionTracker';
import {
  collectPlannedToolCalls,
  createToolCallKey,
  getCurrentPublishViewOptions,
  prepareInteractionTelemetry,
} from './helpers';
import type { PublishViewOptions } from './types';

export function recordInteractionRun(
  ctx: AnyaContextValue,
  dispatchRuntimeEvent: (event: RuntimeEvent) => RuntimeState,
  tracker: InteractionMeasurementTracker,
  interaction: InteractionEvent,
  measurementHint?: InteractionMeasurementHint,
): void {
  const {
    measurement,
    persistedInteraction,
  } = prepareInteractionTelemetry(ctx, interaction, tracker, measurementHint);
  const interactionEvent = createRuntimeEvent(
    'interaction.recorded',
    {
      record: persistedInteraction,
    },
    { source: 'user' },
  );

  dispatchRuntimeEvent(interactionEvent);
  dispatchRuntimeEvent(
    createRuntimeEvent(
      'interaction.measured',
      {
        interactionEventId: interactionEvent.id,
        elementId: interaction.elementId,
        componentName: interaction.componentName,
        action: interaction.action,
        measurement,
      },
      {
        source: 'user',
        causationId: interactionEvent.id,
      },
    ),
  );
}

export async function handleUserInteractionRun(
  ctx: AnyaContextValue,
  dispatchRuntimeEvent: (event: RuntimeEvent) => RuntimeState,
  publishView: (spec: ViewSpec, input?: PublishViewOptions | 'agent' | 'system') => void,
  recordInteraction: (
    interaction: InteractionEvent,
    measurementHint?: InteractionMeasurementHint,
  ) => void,
  interaction: InteractionEvent,
  measurementHint?: InteractionMeasurementHint,
): Promise<ActionResult[]> {
  const plannedToolCalls = collectPlannedToolCalls(ctx.viewEngine.getState().bindings, interaction);
  const pendingToolCalls = new Map<string, (typeof plannedToolCalls)[number]>();

  for (const planned of plannedToolCalls) {
    pendingToolCalls.set(createToolCallKey(planned.bindingId, planned.toolId), planned);
  }

  const previousSpec = ctx.viewEngine.getState().currentSpec;
  recordInteraction(interaction, measurementHint);

  for (const planned of plannedToolCalls) {
    dispatchRuntimeEvent(
      createRuntimeEvent(
        'tool.started',
        {
          toolId: planned.toolId,
          bindingId: planned.bindingId,
          interaction,
        },
        { source: 'system' },
      ),
    );
  }

  const records = await ctx.viewEngine.executeInteraction(interaction);

  for (const record of records) {
    dispatchRuntimeEvent(
      createRuntimeEvent(
        'binding.executed',
        {
          record,
        },
        { source: 'system' },
      ),
    );
    if (!record.toolId) continue;

    pendingToolCalls.delete(createToolCallKey(record.bindingId, record.toolId));
    if (record.status === 'success') {
      dispatchRuntimeEvent(
        createRuntimeEvent(
          'tool.finished',
          {
            toolId: record.toolId,
            bindingId: record.bindingId,
            interaction: record.interaction,
            durationMs: record.durationMs,
            result: record.result,
          },
          { source: 'system' },
        ),
      );
      continue;
    }

    dispatchRuntimeEvent(
      createRuntimeEvent(
        'tool.failed',
        {
          toolId: record.toolId,
          bindingId: record.bindingId,
          interaction: record.interaction,
          durationMs: record.durationMs,
          error:
            record.error
            ?? (
              record.status === 'skipped'
                ? 'Tool execution skipped before completion.'
                : 'Unknown tool execution error'
            ),
        },
        { source: 'system' },
      ),
    );
  }

  for (const planned of pendingToolCalls.values()) {
    dispatchRuntimeEvent(
      createRuntimeEvent(
        'tool.failed',
        {
          toolId: planned.toolId,
          bindingId: planned.bindingId,
          interaction,
          error: 'Tool execution was planned but no execution record was produced.',
        },
        { source: 'system' },
      ),
    );
  }

  const nextSpec = ctx.viewEngine.getState().currentSpec;
  if (nextSpec && nextSpec !== previousSpec) {
    publishView(nextSpec, {
      ...getCurrentPublishViewOptions(ctx),
      source: 'system',
      bindings: ctx.viewEngine.getState().bindings,
    });
  }

  return records;
}

