/**
 * ../../../core — UI Memory Trigger Manager
 *
 * Trigger model:
 * - Hard triggers: explicit preference and task-end transitions
 * - Soft triggers: context compaction and context pressure signals
 *
 * Turn/token/idle thresholds are intentionally removed.
 */

import type { UiMemoryEvent } from './schemas';
import { asFiniteNumber, asString, parseJsonObject } from './payload';
import type { JsonObject } from './payload';

export interface TriggerConfig {
  /** Debounce window in milliseconds for soft triggers. Default: 12000 */
  debounceMs?: number;
  /**
   * Override hard-trigger execution mode per trigger type.
   * Use async for expensive extraction backends.
   */
  hardTriggerModes?: Partial<Record<HardTriggerType, 'sync' | 'async'>>;
  /** Optional hard-trigger disable list (for host-specific trigger policy). */
  disabledHardTriggers?: HardTriggerType[];
  /** Mode for context-compaction soft trigger. Default: async */
  contextCompactionMode?: 'sync' | 'async';
  /** Mode for context-pressure soft trigger. Default: async */
  contextPressureMode?: 'sync' | 'async';
  /**
   * Fire context-pressure trigger when remaining ratio is <= threshold.
   * Value is 0..1. Default: 0.2 (20% remaining).
   */
  contextPressureRemainingRatioThreshold?: number;
  /**
   * Fire context-pressure trigger when remaining tokens are <= threshold.
   * Default: 4000.
   */
  contextPressureRemainingTokensThreshold?: number;
}

export interface TriggerResult {
  run: boolean;
  mode: 'sync' | 'async';
}

export type TriggerCallback = (result: TriggerResult) => void;

export type HardTriggerType =
  | 'task.ended'
  | 'preference.explicit'
  | 'preference.pre_render_blocking';

const HARD_TRIGGER_TYPES = new Set<HardTriggerType>([
  'task.ended',
  'preference.explicit',
  'preference.pre_render_blocking',
]);

const DEFAULT_HARD_TRIGGER_MODES: Record<HardTriggerType, 'sync' | 'async'> = {
  'task.ended': 'sync',
  'preference.explicit': 'sync',
  'preference.pre_render_blocking': 'sync',
};

/**
 * Detects task-end via session.status_set -> idle/waiting after a non-idle/waiting state.
 */
function isTaskEndTransition(
  payload: JsonObject | null,
  previousStatus: string | null,
): boolean {
  const status = asString(payload?.status);
  const isEndingState = status === 'idle' || status === 'waiting';
  const isFromActiveState =
    previousStatus !== null
    && previousStatus !== 'idle'
    && previousStatus !== 'waiting';
  return isEndingState && isFromActiveState;
}

function normalizeRatio(value: number): number {
  if (value > 1 && value <= 100) return value / 100;
  return value;
}

export class TriggerManager {
  private readonly config: {
    debounceMs: number;
    hardTriggerModes: Record<HardTriggerType, 'sync' | 'async'>;
    disabledHardTriggers: Set<HardTriggerType>;
    contextCompactionMode: 'sync' | 'async';
    contextPressureMode: 'sync' | 'async';
    contextPressureRemainingRatioThreshold: number;
    contextPressureRemainingTokensThreshold: number;
  };
  private callbacks: TriggerCallback[] = [];
  private lastFireTs = 0;
  private previousSessionStatus: string | null = null;

  constructor(config?: TriggerConfig) {
    this.config = {
      debounceMs: config?.debounceMs ?? 12_000,
      hardTriggerModes: {
        ...DEFAULT_HARD_TRIGGER_MODES,
        ...(config?.hardTriggerModes ?? {}),
      },
      disabledHardTriggers: new Set(config?.disabledHardTriggers ?? []),
      contextCompactionMode: config?.contextCompactionMode ?? 'async',
      contextPressureMode: config?.contextPressureMode ?? 'async',
      contextPressureRemainingRatioThreshold:
        config?.contextPressureRemainingRatioThreshold ?? 0.2,
      contextPressureRemainingTokensThreshold:
        config?.contextPressureRemainingTokensThreshold ?? 4000,
    };
  }

  /**
   * Register a callback to be called when a trigger fires.
   * Returns an unsubscribe function.
   */
  onTrigger(callback: TriggerCallback): () => void {
    this.callbacks.push(callback);
    return () => {
      this.callbacks = this.callbacks.filter((cb) => cb !== callback);
    };
  }

  /**
   * Observe a new event and evaluate hard/soft trigger conditions.
   */
  observe(event: UiMemoryEvent): TriggerResult {
    let parsedPayload: JsonObject | null | undefined;
    const getPayload = (): JsonObject | null => {
      if (parsedPayload === undefined) {
        parsedPayload = parseJsonObject(event.payloadJson);
      }
      return parsedPayload;
    };

    if (event.type === 'session.status_set') {
      const payload = getPayload();
      const isTaskEnd = isTaskEndTransition(payload, this.previousSessionStatus);
      this.previousSessionStatus =
        this.extractStatus(payload) ?? this.previousSessionStatus;
      if (isTaskEnd) {
        if (this.config.disabledHardTriggers.has('task.ended')) {
          return { run: false, mode: this.config.hardTriggerModes['task.ended'] };
        }
        const result: TriggerResult = {
          run: true,
          mode: this.config.hardTriggerModes['task.ended'],
        };
        this.fire(result);
        return result;
      }
    }

    if (HARD_TRIGGER_TYPES.has(event.type as HardTriggerType)) {
      const triggerType = event.type as HardTriggerType;
      if (this.config.disabledHardTriggers.has(triggerType)) {
        return { run: false, mode: this.config.hardTriggerModes[triggerType] };
      }
      const result: TriggerResult = {
        run: true,
        mode: this.config.hardTriggerModes[triggerType],
      };
      this.fire(result);
      return result;
    }

    if (event.type === 'session.context_compacted') {
      const result: TriggerResult = {
        run: this.softTriggerAllowed(event.ts),
        mode: this.config.contextCompactionMode,
      };
      if (result.run) this.fire(result);
      return result;
    }

    if (event.type === 'session.context_pressure') {
      const shouldRun = this.matchesContextPressureThreshold(getPayload());
      const result: TriggerResult = {
        run: shouldRun && this.softTriggerAllowed(event.ts),
        mode: this.config.contextPressureMode,
      };
      if (result.run) this.fire(result);
      return result;
    }

    return { run: false, mode: 'async' };
  }

  /**
   * Reset only debounce state after a successful extraction run.
   */
  reset(): void {
    this.lastFireTs = Date.now();
  }

  /**
   * Debug state for tests/observability.
   */
  getState(): {
    lastFireTs: number;
    previousSessionStatus: string | null;
  } {
    return {
      lastFireTs: this.lastFireTs,
      previousSessionStatus: this.previousSessionStatus,
    };
  }

  private softTriggerAllowed(now: number): boolean {
    if (this.lastFireTs > 0 && now - this.lastFireTs < this.config.debounceMs) {
      return false;
    }
    return true;
  }

  private extractStatus(payload: JsonObject | null): string | null {
    return asString(payload?.status);
  }

  private matchesContextPressureThreshold(payload: JsonObject | null): boolean {
    const rawRatio = asFiniteNumber(payload?.remainingRatio);
    const ratio = rawRatio === null ? null : normalizeRatio(rawRatio);
    const tokens = asFiniteNumber(payload?.remainingTokens);

    const ratioTriggered = ratio !== null
      && ratio >= 0
      && ratio <= this.config.contextPressureRemainingRatioThreshold;
    const tokensTriggered = tokens !== null
      && tokens >= 0
      && tokens <= this.config.contextPressureRemainingTokensThreshold;

    return ratioTriggered || tokensTriggered;
  }

  private fire(result: TriggerResult): void {
    this.lastFireTs = Date.now();
    for (const cb of this.callbacks) {
      try {
        cb(result);
      } catch {
        // Swallow callback errors.
      }
    }
  }
}
