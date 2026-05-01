/**
 * Shared math utilities for HCI heuristic analyzers.
 */

export function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function safeRatio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

export function computeFittsId(amplitude: number, width: number): number {
  return Math.log2(amplitude / Math.max(width, 1) + 1);
}

export function severityFromThresholdPairs(
  thresholds: Array<{ value: number; high: number; medium: number }>,
): 'low' | 'medium' | 'high' {
  for (const threshold of thresholds) {
    if (threshold.value >= threshold.high) {
      return 'high';
    }
  }

  for (const threshold of thresholds) {
    if (threshold.value >= threshold.medium) {
      return 'medium';
    }
  }

  return 'low';
}

export function severityFromUpperBounds(
  thresholds: Array<{ value: number; high: number; medium: number }>,
): 'low' | 'medium' | 'high' {
  for (const threshold of thresholds) {
    if (threshold.value < threshold.high) {
      return 'high';
    }
  }

  for (const threshold of thresholds) {
    if (threshold.value < threshold.medium) {
      return 'medium';
    }
  }

  return 'low';
}

export function severityFromRequiredThresholds(
  thresholds: Array<{ value: number; high: number; medium: number }>,
): 'low' | 'medium' | 'high' {
  if (thresholds.every((threshold) => threshold.value >= threshold.high)) {
    return 'high';
  }

  if (thresholds.every((threshold) => threshold.value >= threshold.medium)) {
    return 'medium';
  }

  return 'low';
}

export function maxSeverity(
  ...levels: Array<'low' | 'medium' | 'high'>
): 'low' | 'medium' | 'high' {
  if (levels.includes('high')) {
    return 'high';
  }

  if (levels.includes('medium')) {
    return 'medium';
  }

  return 'low';
}

export function humanizeContext(contextArchetype: string): string {
  return contextArchetype
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
