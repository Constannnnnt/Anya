import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';
import type { InteractionMeasuredEvent, RuntimeEvent, UIRenderSpec } from '@anya-ui/core';
import { AdaptiveRuntimeRenderer } from '../src/AdaptiveRuntimeRenderer';
import { AnyaProvider } from '../src/Provider';
import { useAnyaUI } from '../src/hooks/useAnyaUI';
import { builtInPrimitives } from '../src/primitives';

function BehaviorHarness(props: {
  spec: UIRenderSpec;
  onMeasured: (event: InteractionMeasuredEvent) => void;
  onReady: () => void;
}) {
  const { publishSpec, subscribeRuntimeEvents } = useAnyaUI();
  const { spec, onMeasured, onReady } = props;

  React.useEffect(() => {
    publishSpec(spec);
    onReady();
  }, [onReady, publishSpec, spec]);

  React.useEffect(() => subscribeRuntimeEvents('interaction.measured', (event: RuntimeEvent) => {
    if (event.type === 'interaction.measured') {
      onMeasured(event);
    }
  }), [onMeasured, subscribeRuntimeEvents]);

  return <AdaptiveRuntimeRenderer spec={spec} />;
}

describe('behavior runtime measurement integration', () => {
  it('records actionable choice counts plus focus, homing, and travel from real interactions', async () => {
    const measured: InteractionMeasuredEvent[] = [];
    let ready = false;

    render(
      <AnyaProvider components={builtInPrimitives}>
        <BehaviorHarness
          spec={{
            layout: 'stack',
            components: [
              {
                id: 'name',
                type: 'TextInput',
                props: { label: 'Name' },
              },
              {
                id: 'actions',
                type: 'ButtonGroup',
                props: {},
                children: [
                  {
                    id: 'save',
                    type: 'Button',
                    props: { label: 'Save' },
                    interactions: [
                      {
                        trigger: 'onClick',
                        action: 'submit',
                        description: 'Save the current record',
                      },
                    ],
                  },
                  {
                    id: 'archive',
                    type: 'Button',
                    props: { label: 'Archive' },
                    interactions: [
                      {
                        trigger: 'onClick',
                        action: 'submit',
                        description: 'Archive the current record',
                      },
                    ],
                  },
                ],
              },
              {
                id: 'filter',
                type: 'Select',
                props: {
                  label: 'Filter',
                  options: [
                    { label: 'All', value: 'all' },
                    { label: 'Open', value: 'open' },
                    { label: 'Closed', value: 'closed' },
                  ],
                },
              },
            ],
          }}
          onMeasured={(event) => measured.push(event)}
          onReady={() => {
            ready = true;
          }}
        />
      </AnyaProvider>,
    );

    await waitFor(() => {
      expect(ready).toBe(true);
      expect(screen.getByLabelText('Name')).toBeTruthy();
      expect(screen.getByText('Save')).toBeTruthy();
      expect(screen.getByLabelText('Filter')).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Taylor' },
    });
    fireEvent.click(screen.getByText('Save'), {
      clientX: 20,
      clientY: 20,
      detail: 1,
    });
    fireEvent.click(screen.getByText('Archive'), {
      clientX: 220,
      clientY: 20,
      detail: 1,
    });
    fireEvent.change(screen.getByLabelText('Filter'), {
      target: { value: 'open' },
    });

    await waitFor(() => {
      expect(measured).toHaveLength(4);
    });

    const inputEvent = measured.find((event) => event.payload.elementId === 'name');
    const saveEvent = measured.find((event) => event.payload.elementId === 'save');
    const archiveEvent = measured.find((event) => event.payload.elementId === 'archive');
    const selectEvent = measured.find((event) => event.payload.elementId === 'filter');

    expect(inputEvent?.payload.measurement).toMatchObject({
      modality: 'keyboard',
      componentFamily: 'input',
      componentRole: 'textbox',
      focusMovesSinceLast: 0,
      homingTransitionsSinceLast: 0,
    });
    expect(saveEvent?.payload.measurement).toMatchObject({
      modality: 'pointer',
      choiceSetSize: 2,
      focusMovesSinceLast: 1,
      homingTransitionsSinceLast: 1,
    });
    expect(archiveEvent?.payload.measurement.choiceSetSize).toBe(2);
    expect(archiveEvent?.payload.measurement.focusMovesSinceLast).toBe(1);
    expect(archiveEvent?.payload.measurement.travelPx).toBeGreaterThan(150);
    expect(selectEvent?.payload.measurement.choiceSetSize).toBe(3);
  });
});
