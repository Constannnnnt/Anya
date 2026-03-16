/**
 * Runtime-aware renderer wrapper.
 * Bridges renderer interactions into useAnyaUI.handleUserInteraction().
 */
import { useCallback } from 'react';
import type {
  BindingExecutionRecord,
  UIInteractionMeasurementHint,
  UIInteractionRecord,
  UIRenderSpec,
} from '@anya-ui/core';
import { AdaptiveRenderer, type AdaptiveRendererProps } from './AdaptiveRenderer';
import { useAnyaUI } from './hooks/useAnyaUI';

export interface AdaptiveRuntimeRendererProps extends Omit<AdaptiveRendererProps, 'spec' | 'onInteraction'> {
  /**
   * Optional explicit spec. If omitted, renderer uses the current
   * spec from the presentation engine state.
   */
  spec?: UIRenderSpec | null;
  /**
   * Optional interaction callback after native binding execution.
   */
  onInteractionExecuted?: (input: {
    interaction: UIInteractionRecord;
    componentName: string;
    records: BindingExecutionRecord[];
    durationMs: number;
  }) => void;
}

export function AdaptiveRuntimeRenderer({
  spec,
  registry,
  unknownComponent,
  onInteractionExecuted,
}: AdaptiveRuntimeRendererProps) {
  const {
    presentationState,
    handleUserInteraction,
  } = useAnyaUI();

  const resolvedSpec = spec ?? presentationState.currentSpec;

  const handleInteraction = useCallback((
    componentName: string,
    record: Omit<UIInteractionRecord, 'timestamp'>,
    measurementHint?: UIInteractionMeasurementHint,
  ) => {
    const interaction: UIInteractionRecord = {
      ...record,
      timestamp: Date.now(),
    };
    const startedAt = Date.now();
    const finish = (records: BindingExecutionRecord[]): void => {
      onInteractionExecuted?.({
        interaction,
        componentName,
        records,
        durationMs: Date.now() - startedAt,
      });
    };

    void handleUserInteraction(interaction, measurementHint)
      .then(finish)
      .catch(() => finish([]));
  }, [handleUserInteraction, onInteractionExecuted]);

  return (
    <AdaptiveRenderer
      spec={resolvedSpec}
      registry={registry}
      unknownComponent={unknownComponent}
      onInteraction={handleInteraction}
    />
  );
}
