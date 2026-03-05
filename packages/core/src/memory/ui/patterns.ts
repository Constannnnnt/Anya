/**
 * @anya-ui/core — Interaction Pattern Mining
 *
 * Deterministic sequence extraction from event slices.
 * No heuristics by template; only observed interaction/binding traces.
 */

import type { ConsolidatedEpisode, UiMemoryEvent } from './schemas';

export interface PatternCandidate {
  taskClass: string;
  sequence: string[];
  sequenceKey: string;
  outcome: 'success' | 'failure';
  confidence: number;
}

/**
 * Build one interaction pattern candidate from an ordered event window.
 * Returns null when there is not enough sequence signal.
 */
export function buildPatternCandidate(
  events: UiMemoryEvent[],
  episode: ConsolidatedEpisode | null,
): PatternCandidate | null {
  const sequence = dedupeConsecutive(buildSequence(events));
  if (sequence.length < 2) return null;

  const taskClass = deriveTaskClass(events, episode);
  const outcome = deriveOutcome(events, episode);
  const confidence = deriveConfidence(sequence, episode);

  return {
    taskClass,
    sequence,
    sequenceKey: sequence.join(' -> '),
    outcome,
    confidence,
  };
}

function buildSequence(events: UiMemoryEvent[]): string[] {
  const sequence: string[] = [];

  for (const event of events) {
    if (event.type === 'interaction.recorded') {
      const payload = safeParsePayload(event.payloadJson);
      const record = payload?.record;
      const action = typeof record?.action === 'string' ? record.action : null;
      if (action) sequence.push(`ui:${action}`);
      continue;
    }

    if (event.type === 'binding.executed') {
      const payload = safeParsePayload(event.payloadJson);
      const record = payload?.record;
      if (!record || typeof record !== 'object') continue;

      const toolId = typeof record.toolId === 'string' ? record.toolId : null;
      const status = typeof record.status === 'string' ? record.status : 'unknown';
      const resultType =
        record.result && typeof record.result === 'object' && typeof (record.result as Record<string, unknown>).type === 'string'
          ? String((record.result as Record<string, unknown>).type)
          : null;

      if (toolId) {
        sequence.push(`tool:${toolId}:${status}`);
        continue;
      }

      if (resultType === 'url_navigation') {
        sequence.push('nav:url');
        continue;
      }

      sequence.push(`binding:${status}`);
      continue;
    }

    if (event.type === 'tool.finished') {
      const payload = safeParsePayload(event.payloadJson);
      const toolId = asString(payload?.toolId);
      if (toolId) {
        sequence.push(`tool:${toolId}:success`);
      }
      continue;
    }

    if (event.type === 'tool.failed') {
      const payload = safeParsePayload(event.payloadJson);
      const toolId = asString(payload?.toolId);
      if (toolId) {
        sequence.push(`tool:${toolId}:error`);
      }
      continue;
    }
  }

  return sequence;
}

function deriveTaskClass(
  events: UiMemoryEvent[],
  episode: ConsolidatedEpisode | null,
): string {
  const fromEpisode = normalizeTaskClass(episode?.intent);
  if (fromEpisode) return fromEpisode;

  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event.type === 'session.intent_updated') {
      const payload = safeParsePayload(event.payloadJson);
      const candidate = normalizeTaskClass(asString(payload?.userIntent));
      if (candidate) return candidate;
    }
    if (event.type === 'spec.decoded') {
      const payload = safeParsePayload(event.payloadJson);
      const candidate = normalizeTaskClass(asString(payload?.spec?.skill));
      if (candidate) return candidate;
    }
  }

  return 'general';
}

function deriveOutcome(
  events: UiMemoryEvent[],
  episode: ConsolidatedEpisode | null,
): 'success' | 'failure' {
  if (episode?.assessment) {
    return episode.assessment === 'Yes' ? 'success' : 'failure';
  }

  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event.type === 'binding.executed') {
      const payload = safeParsePayload(event.payloadJson);
      const status = asString(payload?.record?.status);
      if (status === 'error') return 'failure';
      continue;
    }
    if (event.type === 'tool.failed') {
      return 'failure';
    }
  }

  return 'success';
}

function deriveConfidence(sequence: string[], episode: ConsolidatedEpisode | null): number {
  let confidence = 0.6;
  if (episode) confidence += 0.15;
  if (sequence.some((step) => step.startsWith('tool:'))) confidence += 0.1;
  if (sequence.length >= 4) confidence += 0.1;
  return Math.min(0.95, confidence);
}

function dedupeConsecutive(sequence: string[]): string[] {
  const deduped: string[] = [];
  for (const step of sequence) {
    if (deduped[deduped.length - 1] === step) continue;
    deduped.push(step);
  }
  return deduped;
}

function normalizeTaskClass(value: string | undefined): string | null {
  if (!value) return null;
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1)
    .slice(0, 6)
    .join('_');
  return normalized || null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function safeParsePayload(json: string): Record<string, any> | null {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}
