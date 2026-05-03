/**
 * Severity scoring helpers shared by retrieval, composites, and ranking.
 *
 * Centralized here so behavior-side modules and the retrieval composer
 * can both depend on a single severity → score mapping without forming
 * a cycle through retrieval.
 */

import type { BehaviorFindingSeverity } from './schemas';

export function severityToScore(severity: BehaviorFindingSeverity | undefined): number {
  switch (severity) {
    case 'high':
      return 1;
    case 'medium':
      return 0.6;
    case 'low':
    default:
      return 0.25;
  }
}

export function severityFromScore(score: number): BehaviorFindingSeverity {
  if (score >= 0.7) return 'high';
  if (score >= 0.4) return 'medium';
  return 'low';
}
