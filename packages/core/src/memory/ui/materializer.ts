/**
 * @anya-ui/core — UI Memory Materializer
 *
 * Materializes active consolidated memory into anya.md via AdaptiveProfile.
 * Implements §13.6 of the UI Memory System plan.
 */

import type { MemoryStore } from './store';
import type { AdaptiveProfile } from '../profile';
import type { PreferenceMemory, InteractionPattern, Reflection } from './schemas';
import {
  toTokenSet,
  jaccardSimilarity,
  OBSERVATION_MERGE_THRESHOLD,
} from '../profile';

// ─── Types ───────────────────────────────────────────────────────────────

export interface MaterializationResult {
  preferencesWritten: number;
  patternsWritten: number;
  reflectionsWritten: number;
}

export interface MaterializationConfig {
  /** Max active preferences to materialize. Default: 10 */
  maxPreferences?: number;
  /** Max patterns to materialize. Default: 5 */
  maxPatterns?: number;
  /** Max reflections to materialize. Default: 5 */
  maxReflections?: number;
}

// ─── Materializer ────────────────────────────────────────────────────────

/**
 * Materialize active memory into the adaptive profile's anya.md.
 * Writes a deterministic "## Learned UI Patterns" section.
 */
export async function materializeToProfile(
  store: MemoryStore,
  actorId: string,
  profile: AdaptiveProfile,
  config?: MaterializationConfig,
): Promise<MaterializationResult> {
  const maxPreferences = config?.maxPreferences ?? 10;
  const maxPatterns = config?.maxPatterns ?? 5;
  const maxReflections = config?.maxReflections ?? 5;

  // Retrieve active memory
  const [preferences, patterns, reflections] = await Promise.all([
    store.findPreferences(actorId, { status: 'active', limit: maxPreferences }),
    store.findPatterns(actorId, { outcome: 'success', limit: maxPatterns }),
    store.findReflections(actorId, { limit: maxReflections }),
  ]);

  // Cross-section dedup: filter items that already exist as behavioral observations
  const existingObservations = profile.getObservations();
  const filteredPreferences = filterOverlapping(
    preferences, (p) => p.statement, existingObservations,
  );
  const filteredPatterns = filterOverlapping(
    patterns, (p) => p.sequenceKey, existingObservations,
  );
  const filteredReflections = filterOverlapping(
    reflections, (r) => `${r.title} ${r.hints}`, existingObservations,
  );

  // Build deterministic markdown section
  const section = buildMaterializationSection(filteredPreferences, filteredPatterns, filteredReflections);

  // Update profile
  const content = profile.getContent();
  const updated = replaceMaterializationSection(content, section);

  await profile.update(updated);

  return {
    preferencesWritten: filteredPreferences.length,
    patternsWritten: filteredPatterns.length,
    reflectionsWritten: filteredReflections.length,
  };
}

// ─── Cross-section Dedup ─────────────────────────────────────────────────

/**
 * Filter items whose textual representation overlaps with an existing
 * behavioral observation beyond the Jaccard threshold.
 */
function filterOverlapping<T>(
  items: T[],
  getText: (item: T) => string,
  existingObservations: string[],
): T[] {
  if (existingObservations.length === 0) return items;

  const observationTokenSets = existingObservations.map((obs) => toTokenSet(obs));

  return items.filter((item) => {
    const itemTokens = toTokenSet(getText(item));
    for (const obsTokens of observationTokenSets) {
      if (jaccardSimilarity(itemTokens, obsTokens) >= OBSERVATION_MERGE_THRESHOLD) {
        return false;
      }
    }
    return true;
  });
}

// ─── Section Builder ─────────────────────────────────────────────────────

const SECTION_HEADER = '## Learned UI Patterns';
const SECTION_FOOTER = '<!-- end:learned-ui-patterns -->';

function buildMaterializationSection(
  preferences: PreferenceMemory[],
  patterns: InteractionPattern[],
  reflections: Reflection[],
): string {
  if (
    preferences.length === 0 &&
    patterns.length === 0 &&
    reflections.length === 0
  ) {
    return '';
  }

  const lines: string[] = [SECTION_HEADER, ''];

  if (preferences.length > 0) {
    lines.push('### Active Preferences');
    for (const p of preferences) {
      lines.push(
        `- [${p.category}] ${p.statement} (confidence: ${p.confidence.toFixed(2)}, support: ${p.support})`,
      );
    }
    lines.push('');
  }

  if (patterns.length > 0) {
    lines.push('### Successful Interaction Patterns');
    for (const p of patterns) {
      lines.push(
        `- [${p.taskClass}] ${p.sequenceKey} (confidence: ${p.confidence.toFixed(2)}, support: ${p.support})`,
      );
    }
    lines.push('');
  }

  if (reflections.length > 0) {
    lines.push('### Reflections');
    for (const r of reflections) {
      lines.push(`- **${r.title}**: ${r.hints} (use cases: ${r.useCases})`);
    }
    lines.push('');
  }

  lines.push(SECTION_FOOTER);

  return lines.join('\n');
}

/**
 * Replace the materialization section in profile content, or append it.
 * Idempotent — re-running produces same output for same data.
 */
function replaceMaterializationSection(
  content: string,
  section: string,
): string {
  const headerIdx = content.indexOf(SECTION_HEADER);
  const footerIdx = content.indexOf(SECTION_FOOTER);

  if (headerIdx !== -1 && footerIdx !== -1) {
    // Replace existing section
    const before = content.slice(0, headerIdx).trimEnd();
    const after = content.slice(footerIdx + SECTION_FOOTER.length).trimStart();

    if (!section) {
      return [before, after].filter(Boolean).join('\n\n');
    }

    return [before, section, after].filter(Boolean).join('\n\n');
  }

  // Append new section
  if (!section) return content;
  return content.trimEnd() + '\n\n' + section;
}
