import { describe, it, expect, vi } from 'vitest';
import {
  createRuntimeEvent,
  createRuntimeFailureBudgetEffect,
  createRuntimeStore,
  createRuntimeTelemetryEffect,
} from '../src';

describe('runtime telemetry + failure budget effects', () => {
  it('emits telemetry for dispatched runtime events', () => {
    const sink = vi.fn();
    const store = createRuntimeStore({
      effects: [
        createRuntimeTelemetryEffect({
          sink,
          includePayload: false,
        }),
      ],
    });

    const event = createRuntimeEvent('session.status_set', { status: 'thinking' }, { source: 'system' });
    store.dispatch(event);

    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'runtime.dispatch',
      runtimeEvent: expect.objectContaining({
        id: event.id,
        type: 'session.status_set',
        source: 'system',
      }),
      sessionStatus: 'thinking',
      payload: undefined,
    }));
  });

  it('emits failure budget exceeded and recovered signals', () => {
    const onSignal = vi.fn();
    const store = createRuntimeStore({
      effects: [
        createRuntimeFailureBudgetEffect({
          policy: {
            name: 'decode_slo',
            windowSize: 5,
            minSamples: 5,
            thresholdRatio: 0.4,
          },
          onSignal,
        }),
      ],
    });

    const success = () => createRuntimeEvent('spec.decoded', {
      spec: { layout: 'stack', components: [] },
    });
    const failure = () => createRuntimeEvent('spec.decode_failed', {
      error: 'decode failed',
    });

    // ratio = 3/5 = 0.6 -> exceeded
    store.dispatch(failure());
    store.dispatch(success());
    store.dispatch(failure());
    store.dispatch(success());
    store.dispatch(failure());

    expect(onSignal).toHaveBeenCalledTimes(1);
    expect(onSignal.mock.calls[0][0]).toEqual(expect.objectContaining({
      kind: 'runtime.failure_budget.exceeded',
      policyName: 'decode_slo',
      sampleCount: 5,
      failureCount: 3,
    }));

    // Still above threshold, should not re-alert while already alerting.
    store.dispatch(failure());
    expect(onSignal).toHaveBeenCalledTimes(1);

    // Drive ratio below threshold in rolling window -> recovered.
    store.dispatch(success());
    store.dispatch(success());
    store.dispatch(success());
    store.dispatch(success());

    expect(onSignal).toHaveBeenCalledTimes(2);
    expect(onSignal.mock.calls[1][0]).toEqual(expect.objectContaining({
      kind: 'runtime.failure_budget.recovered',
      policyName: 'decode_slo',
    }));
  });
});
