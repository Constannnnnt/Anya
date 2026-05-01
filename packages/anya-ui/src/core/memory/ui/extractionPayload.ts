/**
 * ../../../core — Extraction Payload Builder
 *
 * Builds unsummarized event slices for the extraction prompts.
 * Implements §7.3 of the UI Memory System plan.
 */

import type { MemoryStore } from './store';
import type { MemoryCursor, UiMemoryEvent } from './schemas';
import { asObject, asString, parseJsonObject } from './payload';
import type { JsonObject } from './payload';

// ─── Configuration ───────────────────────────────────────────────────────

export interface ExtractionWindowConfig {
  /** Maximum events per extraction window. Default: 200 */
  maxEvents?: number;
  /** Maximum estimated tokens per extraction window. Default: 3500 */
  maxTokens?: number;
}

export interface ExtractionContext {
  events: UiMemoryEvent[];
  conversations: string[];
  uiEvents: string[];
  workflowContext: string | null;
  toolManifest: string[];
}

interface ExtractionContextAccumulator {
  conversations: string[];
  uiEvents: string[];
  workflowContext: string | null;
}

type EventContextStrategy = (
  event: UiMemoryEvent,
  context: ExtractionContextAccumulator,
  getPayload: () => JsonObject | null,
) => void;

// ─── Extraction Window Builder ───────────────────────────────────────────

/**
 * Build an extraction window from cursor position to latest event.
 * Returns the slice of events to be processed, respecting event/token budgets.
 */
export async function buildExtractionWindow(
  store: MemoryStore,
  cursor: MemoryCursor | null,
  config?: ExtractionWindowConfig,
): Promise<UiMemoryEvent[]> {
  const maxEvents = config?.maxEvents ?? 200;
  const maxTokens = config?.maxTokens ?? 3500;

  const events = await store.readEvents({
    afterId: cursor?.lastProcessedEventId,
    limit: maxEvents,
  });

  if (events.length === 0) return [];

  // Check token budget
  const totalTokens = events.reduce(
    (acc, e) => acc + (e.tokenEstimate ?? 0),
    0,
  );

  if (totalTokens <= maxTokens) return events;

  // Over budget: split by case boundary
  return splitByCaseBoundary(events, maxTokens);
}

/**
 * Split events at case boundaries, keeping the largest complete slice
 * that fits within the token budget.
 */
function splitByCaseBoundary(
  events: UiMemoryEvent[],
  maxTokens: number,
): UiMemoryEvent[] {
  const result: UiMemoryEvent[] = [];
  let tokenCount = 0;

  for (const event of events) {
    const eventTokens = event.tokenEstimate ?? 0;
    if (tokenCount + eventTokens > maxTokens && result.length > 0) {
      // Over budget — try to break at a case boundary
      const lastCaseId = result[result.length - 1].caseId;
      if (event.caseId !== lastCaseId) {
        break; // Clean boundary
      }
      // Same case, include it to keep case contiguous
      if (tokenCount + eventTokens > maxTokens * 1.2) {
        break; // Hard cutoff at 120% budget
      }
    }

    result.push(event);
    tokenCount += eventTokens;
  }

  return result;
}

// ─── Context Builder ─────────────────────────────────────────────────────

/**
 * Build a structured extraction context from a slice of events.
 * Groups events by type for prompt template variable injection.
 */
export function buildExtractionContext(
  events: UiMemoryEvent[],
  opts?: {
    toolManifest?: string[];
  },
): ExtractionContext {
  const context: ExtractionContextAccumulator = {
    conversations: [],
    uiEvents: [],
    workflowContext: null,
  };

  for (const event of events) {
    const strategy = EVENT_CONTEXT_STRATEGIES[event.type];
    if (!strategy) {
      // Include unknown events as generic entries.
      context.uiEvents.push(
        `[${event.ts}] ${event.type}: ${truncate(event.payloadJson, 200)}`,
      );
      continue;
    }

    let parsedPayload: JsonObject | null | undefined;
    strategy(event, context, () => {
      if (parsedPayload === undefined) {
        parsedPayload = parseJsonObject(event.payloadJson);
      }
      return parsedPayload;
    });
  }

  return {
    events,
    conversations: context.conversations,
    uiEvents: context.uiEvents,
    workflowContext: context.workflowContext,
    toolManifest: opts?.toolManifest ?? [],
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────

const EVENT_CONTEXT_STRATEGIES: Record<string, EventContextStrategy> = {
  'session.intent_updated': (event, context, getPayload) => {
    const payload = getPayload();
    const userIntent = asString(payload?.userIntent);
    if (userIntent) {
      context.conversations.push(`[${event.source}] intent: ${userIntent}`);
    }
  },
  'interaction.recorded': (event, context, getPayload) => {
    const payload = getPayload();
    const record = asObject(payload?.record);
    const action = asString(record?.action);
    if (!action) return;
    const nodeType = asString(record?.nodeType) ?? 'unknown';
    const nodeId = asString(record?.nodeId) ?? 'unknown';
    const semanticDescription = asString(record?.semanticDescription);
    context.uiEvents.push(
      `[${event.ts}] ${nodeType}#${nodeId} → ${action}${semanticDescription ? ': ' + semanticDescription : ''}`,
    );
  },
  'binding.executed': (event, context, getPayload) => {
    const payload = getPayload();
    const record = asObject(payload?.record);
    if (!record) return;
    const toolId = asString(record.toolId) ?? 'none';
    const status = asString(record.status) ?? 'unknown';
    const bindingId = asString(record.bindingId) ?? 'unknown';
    context.uiEvents.push(
      `[${event.ts}] binding:${bindingId} status:${status} tool:${toolId}`,
    );
  },
  'tool.started': (event, context, getPayload) => {
    const payload = getPayload();
    const toolId = asString(payload?.toolId) ?? 'unknown';
    const bindingId = asString(payload?.bindingId) ?? 'n/a';
    context.uiEvents.push(
      `[${event.ts}] tool.start ${toolId} binding:${bindingId}`,
    );
  },
  'tool.finished': (event, context, getPayload) => {
    const payload = getPayload();
    const toolId = asString(payload?.toolId) ?? 'unknown';
    const durationValue = payload && 'durationMs' in payload
      ? payload.durationMs
      : undefined;
    const duration = durationValue === undefined ? 'n/a' : String(durationValue);
    context.uiEvents.push(
      `[${event.ts}] tool.finish ${toolId} duration:${duration}`,
    );
  },
  'tool.failed': (event, context, getPayload) => {
    const payload = getPayload();
    const toolId = asString(payload?.toolId) ?? 'unknown';
    const error = truncate(String(payload?.error ?? 'unknown'), 120);
    context.uiEvents.push(
      `[${event.ts}] tool.fail ${toolId} error:${error}`,
    );
  },
  'qa.passed': (event, context) => {
    context.uiEvents.push(
      `[${event.ts}] ${event.type}: ${truncate(event.payloadJson, 160)}`,
    );
  },
  'qa.failed': (event, context) => {
    context.uiEvents.push(
      `[${event.ts}] ${event.type}: ${truncate(event.payloadJson, 160)}`,
    );
  },
  'session.context_compacted': (event, context) => {
    context.uiEvents.push(
      `[${event.ts}] ${event.type}: ${truncate(event.payloadJson, 160)}`,
    );
  },
  'session.context_pressure': (event, context) => {
    context.uiEvents.push(
      `[${event.ts}] ${event.type}: ${truncate(event.payloadJson, 160)}`,
    );
  },
  'spec.decoded': (event, context, getPayload) => {
    const payload = getPayload();
    const spec = asObject(payload?.spec);
    const skill = asString(spec?.skill);
    if (skill) {
      context.workflowContext = skill;
    }
  },
  'ui.presented': () => {
    // Behavior-intelligence telemetry should not flow into semantic extraction prompts by default.
  },
  'interaction.measured': () => {
    // Behavior-intelligence telemetry should not flow into semantic extraction prompts by default.
  },
};

function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
}
