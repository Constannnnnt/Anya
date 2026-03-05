/**
 * Runtime-aware renderer wrapper.
 * Bridges renderer interactions into useAnyaUI.handleUserInteraction().
 */
import type { BindingExecutionRecord, UIInteractionRecord, UIRenderSpec } from '@anya-ui/core';
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

import { useCallback } from 'react';

export function AdaptiveRuntimeRenderer({
  spec,
  registry,
  fallback,
  onInteractionExecuted,
}: AdaptiveRuntimeRendererProps) {
  const {
    presentationState,
    handleUserInteraction,
  } = useAnyaUI();

  const resolvedSpec = spec ?? presentationState.currentSpec;

  const handleInteraction = useCallback((componentName: string, record: Omit<UIInteractionRecord, 'timestamp'>) => {
    const interaction: UIInteractionRecord = {
      ...record,
      timestamp: Date.now(),
    };
    const startedAt = Date.now();
    void handleUserInteraction(interaction)
      .then((records) => {
        onInteractionExecuted?.({
          interaction,
          componentName,
          records,
          durationMs: Date.now() - startedAt,
        });
      })
      .catch(() => {
        onInteractionExecuted?.({
          interaction,
          componentName,
          records: [],
          durationMs: Date.now() - startedAt,
        });
      });
  }, [handleUserInteraction, onInteractionExecuted]);

  return (
    <AdaptiveRenderer
      spec={resolvedSpec}
      registry={registry}
      fallback={fallback}
      onInteraction={handleInteraction}
    />
  );
}
