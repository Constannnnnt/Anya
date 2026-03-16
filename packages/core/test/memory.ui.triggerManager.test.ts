import { describe, it, expect, vi } from 'vitest';
import { TriggerManager } from '../src/memory/ui/triggerManager';
import type { UiMemoryEvent } from '../src/memory/ui/schemas';

function makeEvent(overrides: Partial<UiMemoryEvent> = {}): UiMemoryEvent {
  return {
    id: `evt-${Math.random().toString(36).slice(2, 8)}`,
    ts: Date.now(),
    actorId: 'actor-1',
    sessionId: 'session-1',
    type: 'interaction.recorded',
    source: 'user',
    payloadJson: '{}',
    tokenEstimate: 10,
    ...overrides,
  };
}

describe('TriggerManager', () => {
  describe('hard triggers', () => {
    it('fires sync on task end transition', () => {
      const trigger = new TriggerManager();
      trigger.observe(makeEvent({
        type: 'session.status_set',
        payloadJson: JSON.stringify({ status: 'thinking' }),
      }));

      const result = trigger.observe(makeEvent({
        type: 'session.status_set',
        payloadJson: JSON.stringify({ status: 'idle' }),
      }));

      expect(result).toEqual({ run: true, mode: 'sync' });
    });

    it('fires sync on preference.explicit', () => {
      const trigger = new TriggerManager();
      const result = trigger.observe(makeEvent({ type: 'preference.explicit' }));
      expect(result).toEqual({ run: true, mode: 'sync' });
    });

    it('fires sync on preference.pre_render_blocking', () => {
      const trigger = new TriggerManager();
      const result = trigger.observe(makeEvent({ type: 'preference.pre_render_blocking' }));
      expect(result).toEqual({ run: true, mode: 'sync' });
    });

    it('supports overriding hard trigger mode', () => {
      const trigger = new TriggerManager({
        hardTriggerModes: {
          'preference.explicit': 'async',
        },
      });
      const result = trigger.observe(makeEvent({ type: 'preference.explicit' }));
      expect(result).toEqual({ run: true, mode: 'async' });
    });
  });

  describe('soft triggers', () => {
    it('fires async on context compaction', () => {
      const trigger = new TriggerManager({ debounceMs: 0 });
      const result = trigger.observe(makeEvent({ type: 'session.context_compacted' }));
      expect(result).toEqual({ run: true, mode: 'async' });
    });

    it('fires async on context pressure when remaining ratio is below threshold', () => {
      const trigger = new TriggerManager({
        debounceMs: 0,
        contextPressureRemainingRatioThreshold: 0.2,
      });
      const result = trigger.observe(makeEvent({
        type: 'session.context_pressure',
        payloadJson: JSON.stringify({ remainingRatio: 0.15 }),
      }));
      expect(result).toEqual({ run: true, mode: 'async' });
    });

    it('fires async on context pressure when remaining tokens are below threshold', () => {
      const trigger = new TriggerManager({
        debounceMs: 0,
        contextPressureRemainingTokensThreshold: 2500,
      });
      const result = trigger.observe(makeEvent({
        type: 'session.context_pressure',
        payloadJson: JSON.stringify({ remainingTokens: 1800 }),
      }));
      expect(result).toEqual({ run: true, mode: 'async' });
    });

    it('accepts percentage-like string ratios for context pressure', () => {
      const trigger = new TriggerManager({
        debounceMs: 0,
        contextPressureRemainingRatioThreshold: 0.2,
      });
      const result = trigger.observe(makeEvent({
        type: 'session.context_pressure',
        payloadJson: JSON.stringify({ remainingRatio: '15' }),
      }));
      expect(result).toEqual({ run: true, mode: 'async' });
    });

    it('does not fire on context pressure above thresholds', () => {
      const trigger = new TriggerManager({
        debounceMs: 0,
        contextPressureRemainingRatioThreshold: 0.1,
        contextPressureRemainingTokensThreshold: 1000,
      });
      const result = trigger.observe(makeEvent({
        type: 'session.context_pressure',
        payloadJson: JSON.stringify({ remainingRatio: 0.45, remainingTokens: 9000 }),
      }));
      expect(result.run).toBe(false);
    });

    it('does not fire on malformed context pressure payloads', () => {
      const trigger = new TriggerManager({ debounceMs: 0 });
      const result = trigger.observe(makeEvent({
        type: 'session.context_pressure',
        payloadJson: '{not-json',
      }));
      expect(result).toEqual({ run: false, mode: 'async' });
    });

    it('supports overriding context soft-trigger mode', () => {
      const trigger = new TriggerManager({
        debounceMs: 0,
        contextCompactionMode: 'sync',
      });
      const result = trigger.observe(makeEvent({ type: 'session.context_compacted' }));
      expect(result).toEqual({ run: true, mode: 'sync' });
    });
  });

  describe('debounce', () => {
    it('suppresses repeated soft triggers inside debounce window', () => {
      const trigger = new TriggerManager({ debounceMs: 60_000 });
      const first = trigger.observe(makeEvent({
        type: 'session.context_pressure',
        payloadJson: JSON.stringify({ remainingRatio: 0.05 }),
      }));
      const second = trigger.observe(makeEvent({
        type: 'session.context_pressure',
        payloadJson: JSON.stringify({ remainingRatio: 0.05 }),
      }));
      expect(first.run).toBe(true);
      expect(second.run).toBe(false);
    });

    it('does not debounce hard triggers', () => {
      const trigger = new TriggerManager({ debounceMs: 60_000 });
      trigger.observe(makeEvent({ type: 'session.context_compacted' }));
      const hard = trigger.observe(makeEvent({ type: 'preference.explicit' }));
      expect(hard).toEqual({ run: true, mode: 'sync' });
    });
  });

  describe('callbacks', () => {
    it('calls registered callbacks on trigger fire', () => {
      const trigger = new TriggerManager({ debounceMs: 0 });
      const callback = vi.fn();
      trigger.onTrigger(callback);
      trigger.observe(makeEvent({ type: 'preference.explicit' }));
      expect(callback).toHaveBeenCalledWith({ run: true, mode: 'sync' });
    });

    it('unsubscribes callback', () => {
      const trigger = new TriggerManager({ debounceMs: 0 });
      const callback = vi.fn();
      const unsub = trigger.onTrigger(callback);
      unsub();
      trigger.observe(makeEvent({ type: 'preference.explicit' }));
      expect(callback).not.toHaveBeenCalled();
    });
  });

});
