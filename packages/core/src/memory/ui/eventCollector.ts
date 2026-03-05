/**
 * @anya-ui/core — UI Event Collector
 *
 * Normalizes runtime events into `UiMemoryEvent` records and appends
 * them to the memory store. Notifies the trigger manager on each append.
 */

import type { RuntimeEvent, RuntimeEventSource } from '../../runtime/events';
import type { MemoryStore } from './store';
import type { UiMemoryEvent } from './schemas';
import type { TriggerManager } from './triggerManager';

// ─── Configuration ───────────────────────────────────────────────────────

export interface EventCollectorConfig {
  actorId: string;
  sessionId: string;
  caseId?: string;
}

// ─── Collector ───────────────────────────────────────────────────────────

export class UiEventCollector {
  private readonly store: MemoryStore;
  private readonly trigger: TriggerManager;
  private readonly config: EventCollectorConfig;

  constructor(
    store: MemoryStore,
    trigger: TriggerManager,
    config: EventCollectorConfig,
  ) {
    this.store = store;
    this.trigger = trigger;
    this.config = config;
  }

  /**
   * Normalize a RuntimeEvent into a UiMemoryEvent and persist it.
   * Returns the normalized event for inspection/testing.
   */
  async collect(event: RuntimeEvent): Promise<UiMemoryEvent> {
    const normalized = this.normalize(event);
    await this.store.appendEvents([normalized]);
    this.trigger.observe(normalized);
    return normalized;
  }

  /**
   * Batch-collect multiple runtime events.
   */
  async collectAll(events: RuntimeEvent[]): Promise<UiMemoryEvent[]> {
    const normalized = events.map((e) => this.normalize(e));
    await this.store.appendEvents(normalized);
    for (const n of normalized) {
      this.trigger.observe(n);
    }
    return normalized;
  }

  // ── Internal ────────────────────────────────────────────────────────

  private normalize(event: RuntimeEvent): UiMemoryEvent {
    return {
      id: event.id,
      ts: event.timestamp,
      actorId: this.config.actorId,
      sessionId: this.config.sessionId,
      caseId: this.config.caseId,
      type: event.type,
      source: this.mapSource(event.source),
      correlationId: event.correlationId,
      causationId: event.causationId,
      payloadJson: JSON.stringify(event.payload),
      tokenEstimate: this.estimateTokens(event),
    };
  }

  private mapSource(source: RuntimeEventSource): UiMemoryEvent['source'] {
    return source;
  }

  private estimateTokens(event: RuntimeEvent): number {
    // Rough estimate: ~4 characters per token for JSON payload
    const json = JSON.stringify(event.payload);
    return Math.ceil(json.length / 4);
  }
}
