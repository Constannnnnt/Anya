/**
 * @anya-ui/core — Extraction Payload Builder
 *
 * Builds unsummarized event slices for the extraction prompts.
 * Implements §7.3 of the UI Memory System plan.
 */

import type { MemoryStore } from './store';
import type { MemoryCursor, UiMemoryEvent } from './schemas';

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
  const conversations: string[] = [];
  const uiEvents: string[] = [];
  let workflowContext: string | null = null;

  for (const event of events) {
    switch (event.type) {
      case 'session.intent_updated': {
        const payload = safeParsePayload(event.payloadJson);
        if (payload?.userIntent) {
          conversations.push(
            `[${event.source}] intent: ${payload.userIntent}`,
          );
        }
        break;
      }
      case 'interaction.recorded': {
        const payload = safeParsePayload(event.payloadJson);
        if (payload?.record) {
          const r = payload.record;
          uiEvents.push(
            `[${event.ts}] ${r.componentName}#${r.elementId} → ${r.action}${r.semanticDescription ? ': ' + r.semanticDescription : ''}`,
          );
        }
        break;
      }
      case 'binding.executed': {
        const payload = safeParsePayload(event.payloadJson);
        const record = payload?.record;
        if (record && typeof record === 'object') {
          const toolId = typeof record.toolId === 'string' ? record.toolId : 'none';
          const status = typeof record.status === 'string' ? record.status : 'unknown';
          const bindingId = typeof record.bindingId === 'string' ? record.bindingId : 'unknown';
          uiEvents.push(
            `[${event.ts}] binding:${bindingId} status:${status} tool:${toolId}`,
          );
        }
        break;
      }
      case 'tool.started': {
        const payload = safeParsePayload(event.payloadJson);
        uiEvents.push(
          `[${event.ts}] tool.start ${String(payload?.toolId ?? 'unknown')} binding:${String(payload?.bindingId ?? 'n/a')}`,
        );
        break;
      }
      case 'tool.finished': {
        const payload = safeParsePayload(event.payloadJson);
        uiEvents.push(
          `[${event.ts}] tool.finish ${String(payload?.toolId ?? 'unknown')} duration:${String(payload?.durationMs ?? 'n/a')}`,
        );
        break;
      }
      case 'tool.failed': {
        const payload = safeParsePayload(event.payloadJson);
        uiEvents.push(
          `[${event.ts}] tool.fail ${String(payload?.toolId ?? 'unknown')} error:${truncate(String(payload?.error ?? 'unknown'), 120)}`,
        );
        break;
      }
      case 'qa.passed':
      case 'qa.failed': {
        uiEvents.push(`[${event.ts}] ${event.type}: ${truncate(event.payloadJson, 160)}`);
        break;
      }
      case 'session.context_compacted':
      case 'session.context_pressure': {
        uiEvents.push(`[${event.ts}] ${event.type}: ${truncate(event.payloadJson, 160)}`);
        break;
      }
      case 'spec.decoded': {
        const payload = safeParsePayload(event.payloadJson);
        if (payload?.spec?.skill) {
          workflowContext = payload.spec.skill;
        }
        break;
      }
      default: {
        // Include other events as generic entries
        uiEvents.push(`[${event.ts}] ${event.type}: ${truncate(event.payloadJson, 200)}`);
      }
    }
  }

  return {
    events,
    conversations,
    uiEvents,
    workflowContext,
    toolManifest: opts?.toolManifest ?? [],
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function safeParsePayload(json: string): Record<string, any> | null {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
}
