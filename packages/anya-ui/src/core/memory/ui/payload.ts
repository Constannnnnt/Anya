/**
 * ../../../core — UI Memory Payload Helpers
 *
 * Shared JSON parsing and type guards for UI-memory event payloads.
 */

export type JsonObject = Record<string, unknown>;

export function asObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as JsonObject;
}

export function parseJsonObject(json: string): JsonObject | null {
  try {
    return asObject(JSON.parse(json));
  } catch {
    return null;
  }
}

export function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}
