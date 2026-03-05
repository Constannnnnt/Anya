/**
 * @anya-ui/core — UI Memory Retrieval Composer
 *
 * Retrieves and ranks consolidated memory for planner priors.
 * Implements §7.5 of the UI Memory System plan.
 */

import type { MemoryStore } from './store';
import type {
  PreferenceMemory,
  InteractionPattern,
  Reflection,
} from './schemas';

// ─── Types ───────────────────────────────────────────────────────────────

export interface PlanningMemoryContext {
  preferences: RankedPreference[];
  patterns: RankedPattern[];
  reflections: Reflection[];
}

export interface RankedPreference extends PreferenceMemory {
  rank: number;
}

export interface RankedPattern extends InteractionPattern {
  rank: number;
}

export interface RetrievalConfig {
  /** Max preferences to return. Default: 5 */
  maxPreferences?: number;
  /** Max interaction patterns to return. Default: 5 */
  maxPatterns?: number;
  /** Max reflections to return. Default: 3 */
  maxReflections?: number;
  /** Ranking weight for confidence. Default: 0.45 */
  confidenceWeight?: number;
  /** Ranking weight for recency. Default: 0.30 */
  recencyWeight?: number;
  /** Ranking weight for support count. Default: 0.25 */
  supportWeight?: number;
}

// ─── Retrieval Composer ──────────────────────────────────────────────────

export class RetrievalComposer {
  private readonly config: Required<RetrievalConfig>;

  constructor(config?: RetrievalConfig) {
    this.config = {
      maxPreferences: config?.maxPreferences ?? 5,
      maxPatterns: config?.maxPatterns ?? 5,
      maxReflections: config?.maxReflections ?? 3,
      confidenceWeight: config?.confidenceWeight ?? 0.45,
      recencyWeight: config?.recencyWeight ?? 0.30,
      supportWeight: config?.supportWeight ?? 0.25,
    };
  }

  /**
   * Retrieve ranked planning memory context for an actor.
   */
  async retrievePlanningContext(
    store: MemoryStore,
    actorId: string,
    taskContext?: { taskClass?: string; category?: string },
  ): Promise<PlanningMemoryContext> {
    const [preferences, patterns, reflections] = await Promise.all([
      this.retrievePreferences(store, actorId, taskContext?.category),
      this.retrievePatterns(store, actorId, taskContext?.taskClass),
      store.findReflections(actorId, {
        limit: this.config.maxReflections,
      }),
    ]);

    return { preferences, patterns, reflections };
  }

  /**
   * Format planning memory context into a prompt-ready string.
   */
  formatForPrompt(ctx: PlanningMemoryContext): string {
    if (
      ctx.preferences.length === 0 &&
      ctx.patterns.length === 0 &&
      ctx.reflections.length === 0
    ) {
      return '';
    }

    const sections: string[] = ['## UI Memory Priors'];

    if (ctx.preferences.length > 0) {
      sections.push('### Preferences');
      for (const p of ctx.preferences) {
        sections.push(
          `- [${p.category}] ${p.statement} (confidence: ${p.confidence.toFixed(2)}, ${p.signalType})`,
        );
      }
    }

    if (ctx.patterns.length > 0) {
      sections.push('### Interaction Patterns');
      for (const p of ctx.patterns) {
        sections.push(
          `- [${p.taskClass}] ${p.sequenceKey} → ${p.outcome} (confidence: ${p.confidence.toFixed(2)})`,
        );
      }
    }

    if (ctx.reflections.length > 0) {
      sections.push('### Reflections');
      for (const r of ctx.reflections) {
        sections.push(`- ${r.title}: ${r.hints}`);
      }
    }

    sections.push(
      '',
      '> Note: These are memory priors. Current explicit user instructions always take precedence.',
    );

    return sections.join('\n');
  }

  // ── Internal ────────────────────────────────────────────────────────

  private async retrievePreferences(
    store: MemoryStore,
    actorId: string,
    category?: string,
  ): Promise<RankedPreference[]> {
    const prefs = await store.findPreferences(actorId, {
      category,
      status: 'active',
    });

    return this.rankPreferences(prefs).slice(0, this.config.maxPreferences);
  }

  private async retrievePatterns(
    store: MemoryStore,
    actorId: string,
    taskClass?: string,
  ): Promise<RankedPattern[]> {
    const patterns = await store.findPatterns(actorId, {
      taskClass,
      outcome: 'success',
    });

    return this.rankPatterns(patterns).slice(0, this.config.maxPatterns);
  }

  private rankPreferences(prefs: PreferenceMemory[]): RankedPreference[] {
    if (prefs.length === 0) return [];

    const now = Date.now();
    const maxTs = Math.max(...prefs.map((p) => p.lastSeenTs));
    const minTs = Math.min(...prefs.map((p) => p.lastSeenTs));
    const tsRange = maxTs - minTs || 1;
    const maxSupport = Math.max(...prefs.map((p) => p.support));

    return prefs
      .map((p) => ({
        ...p,
        rank:
          this.config.confidenceWeight * p.confidence +
          this.config.recencyWeight *
            ((p.lastSeenTs - minTs) / tsRange) +
          this.config.supportWeight *
            (maxSupport > 0 ? p.support / maxSupport : 0),
      }))
      .sort((a, b) => b.rank - a.rank);
  }

  private rankPatterns(patterns: InteractionPattern[]): RankedPattern[] {
    if (patterns.length === 0) return [];

    const maxTs = Math.max(...patterns.map((p) => p.lastSeenTs));
    const minTs = Math.min(...patterns.map((p) => p.lastSeenTs));
    const tsRange = maxTs - minTs || 1;
    const maxSupport = Math.max(...patterns.map((p) => p.support));

    return patterns
      .map((p) => ({
        ...p,
        rank:
          this.config.confidenceWeight * p.confidence +
          this.config.recencyWeight *
            ((p.lastSeenTs - minTs) / tsRange) +
          this.config.supportWeight *
            (maxSupport > 0 ? p.support / maxSupport : 0),
      }))
      .sort((a, b) => b.rank - a.rank);
  }
}
