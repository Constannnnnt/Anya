/**
 * @anya-ui/core — UI Memory Pipeline Runner
 *
 * Orchestrates trigger -> extraction -> consolidation -> cursor advancement.
 * This runner is optional and only starts when hosts provide a prompt runner.
 */

import { getLogger } from '../../logging';
import type { AdaptiveProfile } from '../profile';
import {
  buildExtractionContext,
  buildExtractionWindow,
  type ExtractionWindowConfig,
} from './extractionPayload';
import { ExtractionWorker, type PromptRunner } from './extractionWorker';
import { ConsolidationManager } from './consolidator';
import { buildPatternCandidate } from './patterns';
import { materializeToProfile } from './materializer';
import type { MemoryStore } from './store';
import type { TriggerManager, TriggerResult } from './triggerManager';
import type { UiMemoryEvent } from './schemas';

export interface UiMemoryPipelineConfig {
  actorId: string;
  sessionId: string;
  store: MemoryStore;
  trigger: TriggerManager;
  runPrompt: PromptRunner;
  windowConfig?: ExtractionWindowConfig;
  syncTimeoutMs?: number;
  profile?: AdaptiveProfile;
  materializeProfile?: boolean;
  getToolManifest?: () => string[];
}

/**
 * Single-session pipeline runner.
 * Keeps at most one async extraction job queued at a time.
 */
export class UiMemoryPipeline {
  private readonly config: UiMemoryPipelineConfig;
  private readonly worker: ExtractionWorker;
  private readonly consolidator: ConsolidationManager;
  private unsubscribeTrigger?: () => void;
  private running = false;
  private inFlightRun: Promise<void> | null = null;
  private pendingMode: 'sync' | 'async' | null = null;

  constructor(config: UiMemoryPipelineConfig) {
    this.config = config;
    this.worker = new ExtractionWorker({
      runPrompt: config.runPrompt,
    });
    this.consolidator = new ConsolidationManager();
  }

  /**
   * Start listening to trigger callbacks.
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.unsubscribeTrigger = this.config.trigger.onTrigger((result) => {
      void this.handleTrigger(result);
    });
  }

  /**
   * Stop listening to trigger callbacks.
   */
  stop(): void {
    if (!this.running) return;
    this.unsubscribeTrigger?.();
    this.unsubscribeTrigger = undefined;
    this.running = false;
  }

  /**
   * Manual extraction entrypoint (useful for tests/diagnostics).
   */
  async flush(mode: 'sync' | 'async' = 'async'): Promise<void> {
    await this.runExtraction(mode);
  }

  private async handleTrigger(result: TriggerResult): Promise<void> {
    if (!this.running || !result.run) return;
    this.scheduleRun(result.mode);
  }

  private async runSyncWithBudget(): Promise<void> {
    const syncTimeoutMs = this.config.syncTimeoutMs ?? 2000;
    const startedAt = Date.now();
    try {
      await this.runExtraction('sync');
    } catch (error) {
      getLogger().warn('[UiMemoryPipeline] Sync extraction failed.', error);
      this.scheduleRun('async');
      return;
    }

    const elapsed = Date.now() - startedAt;
    if (elapsed > syncTimeoutMs) {
      getLogger().warn(
        `[UiMemoryPipeline] Sync extraction exceeded budget (${elapsed}ms > ${syncTimeoutMs}ms).`
      );
    }
  }

  private scheduleRun(mode: 'sync' | 'async'): void {
    if (this.inFlightRun) {
      this.pendingMode = this.mergeModes(this.pendingMode, mode);
      return;
    }

    this.inFlightRun = (async () => {
      try {
        if (mode === 'sync') {
          await this.runSyncWithBudget();
        } else {
          await this.runExtraction('async');
        }
      } catch (error) {
        getLogger().warn('[UiMemoryPipeline] Extraction run failed.', error);
      } finally {
        this.inFlightRun = null;
        const nextMode = this.pendingMode;
        this.pendingMode = null;
        if (nextMode) {
          this.scheduleRun(nextMode);
        }
      }
    })();
  }

  private mergeModes(
    current: 'sync' | 'async' | null,
    next: 'sync' | 'async',
  ): 'sync' | 'async' {
    if (!current) return next;
    if (current === 'sync' || next === 'sync') return 'sync';
    return 'async';
  }

  private async runExtraction(mode: 'sync' | 'async'): Promise<void> {
    const cursor = await this.config.store.getCursor('ui_memory');
    const windowEvents = await buildExtractionWindow(
      this.config.store,
      cursor,
      this.config.windowConfig,
    );
    if (windowEvents.length === 0) return;

    const latest = windowEvents[windowEvents.length - 1];
    const extractionContext = buildExtractionContext(windowEvents, {
      toolManifest: this.config.getToolManifest?.() ?? [],
    });

    const preferenceResult = await this.worker.runPreferenceExtraction(extractionContext);
    if (preferenceResult.errors.length > 0) {
      getLogger().warn(
        `[UiMemoryPipeline] Preference extraction had ${preferenceResult.errors.length} issue(s).`,
        preferenceResult.errors
      );
    }

    const episodicResult = await this.worker.runEpisodicExtraction(extractionContext);
    if (episodicResult.errors.length > 0) {
      getLogger().warn(
        `[UiMemoryPipeline] Episodic extraction had ${episodicResult.errors.length} issue(s).`,
        episodicResult.errors
      );
    }

    const sessionId = this.resolveSessionId(windowEvents, latest);
    const caseId = this.resolveCaseId(windowEvents, latest);
    const patternCandidate = buildPatternCandidate(
      windowEvents,
      episodicResult.episode,
    );
    const now = Date.now();

    const preferenceConsolidation = await this.config.store.transaction(async (tx) => {
      const consolidatedPreferences = await this.consolidator.consolidatePreferences(
        preferenceResult.candidates,
        this.config.actorId,
        tx,
      );

      if (episodicResult.episode) {
        await this.consolidator.consolidateEpisode(
          episodicResult.episode,
          this.config.actorId,
          sessionId,
          caseId,
          tx,
        );
      }

      if (episodicResult.reflections.length > 0) {
        await this.consolidator.consolidateReflections(
          episodicResult.reflections,
          this.config.actorId,
          tx,
        );
      }

      if (patternCandidate) {
        await this.consolidator.consolidatePattern(
          patternCandidate,
          this.config.actorId,
          tx,
        );
      }

      // Commit cursor only after all extraction artifacts are durably persisted.
      await tx.setCursor({
        namespace: 'ui_memory',
        lastProcessedEventId: latest.id,
        lastProcessedTs: latest.ts,
        updatedTs: now,
      });

      return consolidatedPreferences;
    });

    getLogger().info(
      `[UiMemoryPipeline] Extraction persisted: events=${windowEvents.length}, ` +
      `prefs(candidates=${preferenceResult.candidates.length}, added=${preferenceConsolidation.added}, ` +
      `updated=${preferenceConsolidation.updated}, skipped=${preferenceConsolidation.skipped}), ` +
      `episodic(turns=${episodicResult.turns.length}, episode=${episodicResult.episode ? 'yes' : 'no'}, ` +
      `reflections=${episodicResult.reflections.length}), pattern=${patternCandidate ? 'yes' : 'no'}.`
    );

    if (this.config.materializeProfile && this.config.profile) {
      try {
        const matResult = await materializeToProfile(
          this.config.store,
          this.config.actorId,
          this.config.profile,
        );
        getLogger().info(
          `[UiMemoryPipeline] Materialized to anya.md: prefs=${matResult.preferencesWritten}, ` +
          `patterns=${matResult.patternsWritten}, reflections=${matResult.reflectionsWritten}.`
        );
      } catch (err) {
        getLogger().warn('[UiMemoryPipeline] Materialization to anya.md failed:', err);
      }
    }

    this.config.trigger.reset();

    if (mode === 'sync') {
      getLogger().debug?.('[UiMemoryPipeline] Sync extraction completed.');
    }
  }

  private resolveSessionId(events: UiMemoryEvent[], latest: UiMemoryEvent): string {
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const candidate = events[i].sessionId;
      if (candidate?.trim()) return candidate;
    }
    if (latest.sessionId?.trim()) return latest.sessionId;
    return this.config.sessionId;
  }

  private resolveCaseId(events: UiMemoryEvent[], latest: UiMemoryEvent): string {
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const candidate = events[i].caseId;
      if (candidate?.trim()) return candidate;
    }
    if (latest.caseId?.trim()) return latest.caseId;
    return `case-${latest.sessionId}-${latest.id}`;
  }
}
