import type { UIRenderSpec } from './types';

/**
 * Deep clone helper for serializable runtime state.
 * Uses structuredClone when available for better fidelity/perf than JSON round-trips.
 */
export function deepClone<T>(value: T): T {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

export function cloneRenderSpec(spec: UIRenderSpec): UIRenderSpec {
  return deepClone(spec);
}
