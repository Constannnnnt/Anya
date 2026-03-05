/**
 * @anya-ui/core — Memory Consolidation Manager
 *
 * Deterministic merge/update logic for extracted memory candidates.
 * Implements §7.4 of the UI Memory System plan.
 */

import type { MemoryStore } from './store';
import type {
  PreferenceMemory,
  InteractionPattern,
  MemoryCursor,
  Episode,
  Reflection,
  ExtractedPreferenceCandidate,
  ConsolidatedEpisode,
  ReflectionSynthesis,
} from './schemas';

// ─── Types ───────────────────────────────────────────────────────────────

export interface ConsolidationResult {
  added: number;
  updated: number;
  skipped: number;
}

// ─── Tooling Category Key Validation ─────────────────────────────────────

const VALID_TOOLING_KEYS = new Set([
  'preferred_tool_id',
  'preferred_tool_family',
  'tool_chain_preference',
]);

// ─── Consolidation Manager ───────────────────────────────────────────────

export class ConsolidationManager {
  /**
   * Consolidate preference candidates against existing store records.
   * For each candidate: find existing by (actor, category, key), decide
   * AddMemory / UpdateMemory / SkipMemory, then upsert + advance cursor.
   */
  async consolidatePreferences(
    candidates: ExtractedPreferenceCandidate[],
    actorId: string,
    store: MemoryStore,
    latestEventId: string,
    latestEventTs: number,
  ): Promise<ConsolidationResult> {
    const result: ConsolidationResult = { added: 0, updated: 0, skipped: 0 };
    const now = Date.now();

    await store.transaction(async (tx) => {
      for (const candidate of candidates) {
        // Skip low-confidence or empty candidates
        if (candidate.confidence < 0.3 || !candidate.preference.trim()) {
          result.skipped++;
          continue;
        }

        for (const category of candidate.categories) {
          const key = this.deriveKey(candidate.preference, category);

          // Enforce tooling key space
          if (category === 'tooling' && !VALID_TOOLING_KEYS.has(key)) {
            result.skipped++;
            continue;
          }

          // Find existing
          const existing = await tx.findPreferences(actorId, { category });
          const match = existing.find(
            (p) => p.key === key && p.value === candidate.preference,
          );

          if (match) {
            // UpdateMemory: bump support + confidence + timestamp
            const updated: PreferenceMemory = {
              ...match,
              confidence: Math.min(
                1.0,
                match.confidence * 0.7 + candidate.confidence * 0.3,
              ),
              support: match.support + 1,
              lastSeenTs: now,
              signalType: candidate.signal_type,
              status:
                match.status === 'candidate' && match.support + 1 >= 3
                  ? 'active'
                  : match.status,
            };
            await tx.upsertPreference(updated);
            result.updated++;
          } else {
            // Check for semantic overlap with existing keys
            const semanticMatch = existing.find((p) => p.key === key);

            if (semanticMatch) {
              // UpdateMemory: replace value with better detail
              if (candidate.confidence >= semanticMatch.confidence) {
                const updated: PreferenceMemory = {
                  ...semanticMatch,
                  value: candidate.preference,
                  statement: candidate.preference,
                  confidence: candidate.confidence,
                  support: semanticMatch.support + 1,
                  lastSeenTs: now,
                  signalType: candidate.signal_type,
                };
                await tx.upsertPreference(updated);
                result.updated++;
              } else {
                result.skipped++;
              }
            } else {
              // AddMemory: new preference
              const pref: PreferenceMemory = {
                id: `pref-${now}-${Math.random().toString(36).slice(2, 8)}`,
                actorId,
                category,
                key,
                value: candidate.preference,
                statement: candidate.preference,
                signalType: candidate.signal_type,
                confidence: candidate.confidence,
                support: 1,
                firstSeenTs: now,
                lastSeenTs: now,
                status: candidate.confidence >= 0.8 ? 'active' : 'candidate',
              };
              await tx.upsertPreference(pref);
              result.added++;
            }
          }
        }
      }

      // Advance cursor only on successful commit
      await tx.setCursor({
        namespace: 'ui_memory',
        lastProcessedEventId: latestEventId,
        lastProcessedTs: latestEventTs,
        updatedTs: now,
      });
    });

    return result;
  }

  /**
   * Consolidate an episode into the store.
   */
  async consolidateEpisode(
    episode: ConsolidatedEpisode,
    actorId: string,
    sessionId: string,
    caseId: string,
    store: MemoryStore,
  ): Promise<void> {
    const now = Date.now();
    const ep: Episode = {
      id: `ep-${now}-${Math.random().toString(36).slice(2, 8)}`,
      actorId,
      sessionId,
      caseId,
      intent: episode.intent,
      assessment: episode.assessment,
      summary: `${episode.situation}\n${episode.justification}`,
      justification: episode.reflection,
      createdTs: now,
    };

    await store.upsertEpisode(ep);
  }

  /**
   * Consolidate reflection syntheses into the store.
   * Handles add vs update operators.
   */
  async consolidateReflections(
    syntheses: ReflectionSynthesis[],
    actorId: string,
    store: MemoryStore,
  ): Promise<ConsolidationResult> {
    const result: ConsolidationResult = { added: 0, updated: 0, skipped: 0 };
    const now = Date.now();

    // Optimize N+1 query: Hoist store.findReflections above the loop.
    // Use a mutable array to track changes within the batch.
    const existing = await store.findReflections(actorId);

    for (const synthesis of syntheses) {
      const matchIndex = existing.findIndex(
        (r) => r.title.toLowerCase() === synthesis.title.toLowerCase(),
      );
      const match = matchIndex !== -1 ? existing[matchIndex] : undefined;

      if (synthesis.operator === 'update' && match) {
        const updated: Reflection = {
          ...match,
          useCases: synthesis.use_cases,
          hints: synthesis.hints,
          confidence: Math.max(match.confidence, synthesis.confidence),
          updatedTs: now,
        };
        await store.upsertReflection(updated);

        // Update local cache to reflect changes for subsequent items in the batch
        existing[matchIndex] = updated;
        result.updated++;
      } else if (synthesis.operator === 'add' || !match) {
        const ref: Reflection = {
          id: `ref-${now}-${Math.random().toString(36).slice(2, 8)}`,
          actorId,
          title: synthesis.title,
          useCases: synthesis.use_cases,
          hints: synthesis.hints,
          confidence: synthesis.confidence,
          updatedTs: now,
        };
        await store.upsertReflection(ref);

        // Add to local cache so if another synthesis in this batch refers to the same title, it's found
        existing.push(ref);
        result.added++;
      } else {
        result.skipped++;
      }
    }

    return result;
  }

  /**
   * Consolidate one interaction pattern candidate.
   * Dedupes by (actorId, taskClass, sequenceKey).
   */
  async consolidatePattern(
    pattern: {
      taskClass: string;
      sequenceKey: string;
      sequence: string[];
      outcome: 'success' | 'failure';
      confidence: number;
    },
    actorId: string,
    store: MemoryStore,
  ): Promise<ConsolidationResult> {
    const result: ConsolidationResult = { added: 0, updated: 0, skipped: 0 };
    const now = Date.now();

    const existing = await store.findPatterns(actorId, {
      taskClass: pattern.taskClass,
    });
    const match = existing.find((candidate) => candidate.sequenceKey === pattern.sequenceKey);

    if (!match) {
      const created: InteractionPattern = {
        id: `pat-${now}-${Math.random().toString(36).slice(2, 8)}`,
        actorId,
        taskClass: pattern.taskClass,
        sequenceKey: pattern.sequenceKey,
        sequenceJson: JSON.stringify(pattern.sequence),
        outcome: pattern.outcome,
        confidence: pattern.confidence,
        support: 1,
        lastSeenTs: now,
      };
      await store.upsertPattern(created);
      result.added = 1;
      return result;
    }

    const updated: InteractionPattern = {
      ...match,
      sequenceJson: JSON.stringify(pattern.sequence),
      lastSeenTs: now,
      support: match.support + 1,
      confidence: Math.min(
        1,
        match.confidence * 0.7 + pattern.confidence * 0.3,
      ),
      outcome:
        pattern.outcome === 'failure' && pattern.confidence < match.confidence
          ? match.outcome
          : pattern.outcome,
    };

    await store.upsertPattern(updated);
    result.updated = 1;
    return result;
  }

  // ── Internal ────────────────────────────────────────────────────────

  /**
   * Derive a stable key from a preference statement.
   * Uses the first few meaningful words to create a snake_case key.
   */
  private deriveKey(statement: string, category: string): string {
    // For tooling, try to extract tool name
    if (category === 'tooling') {
      const toolMatch = statement.match(
        /(?:prefer|use|like)\s+(?:the\s+)?(\w[\w\s]*?)(?:\s+tool|\s+for|\s+over|\s+instead|$)/i,
      );
      if (toolMatch) {
        return 'preferred_tool_id';
      }

      const chainMatch = statement.match(/(?:chain|sequence|pipeline|flow)/i);
      if (chainMatch) {
        return 'tool_chain_preference';
      }

      return 'preferred_tool_family';
    }

    // General key derivation: take first 4 meaningful words
    const words = statement
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
      .slice(0, 4);

    return words.join('_') || 'general';
  }
}

// ─── Stop Words ──────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'this',
  'that',
  'with',
  'from',
  'are',
  'was',
  'has',
  'have',
  'not',
  'but',
  'all',
  'can',
  'had',
  'her',
  'his',
  'one',
  'our',
  'out',
  'you',
  'its',
]);
