import type { MemoryStoreSnapshot } from '../store';
import type { TriggerManager, TriggerResult } from '../triggerManager';
import type { MemoryStore } from '../store';
import {
  buildExtractionWindow,
  type ExtractionWindowConfig,
} from '../extractionPayload';
import { getLogger } from '../../../logging';
import { BehaviorAnalyzerRegistry } from './analyzerRegistry';
import { BehaviorDirtyTracker } from './dirtyTracker';
import { BehaviorAnalysisScheduler, type BehaviorSchedulerPolicy, type BehaviorSchedulerState } from './scheduler';
import type { BehaviorAnalyzer } from './analyzers';
import type { BehaviorSignal } from './schemas';
import type { BehaviorStore, BehaviorStoreSnapshot } from './store';
import { InMemoryBehaviorStore } from './inMemoryStore';
import {
  DEFAULT_FINDING_INTERPRETER_POLICY,
  type FindingInterpreterPolicy,
} from './policy';
import { integrateBehaviorFindings, type IntegrateBehaviorFindingsResult } from './interpreter';
import {
  createBuiltinBehaviorAnalyzers,
} from './builtinAnalyzers';
import { projectBehaviorSignals } from './signalProjector';
import { reduceBehaviorSegments } from './segmentReducer';
import { projectBehaviorSessionSummaries } from './sessionSummaryProjector';
import { reduceBehaviorAggregates } from './aggregateReducer';

export interface UiBehaviorPipelineConfig {
  actorId: string;
  eventStore: MemoryStore;
  trigger: TriggerManager;
  behaviorStore?: BehaviorStore;
  analyzers?: BehaviorAnalyzer[];
  schedulerPolicy?: Partial<BehaviorSchedulerPolicy>;
  interpreterPolicy?: FindingInterpreterPolicy;
  windowConfig?: ExtractionWindowConfig;
  aggregateWindowMs?: number;
  syncTimeoutMs?: number;
  captureSnapshots?: boolean;
}

export interface BehaviorAnalysisRunCapture {
  actorId: string;
  runAt: number;
  scheduler: ReturnType<BehaviorAnalysisScheduler['run']> extends Promise<infer TResult> ? TResult : never;
  integration: IntegrateBehaviorFindingsResult;
  uiMemorySnapshot?: MemoryStoreSnapshot;
  behaviorSnapshot?: BehaviorStoreSnapshot;
}

export class UiBehaviorPipeline {
  private readonly config: UiBehaviorPipelineConfig;
  private readonly behaviorStore: BehaviorStore;
  private readonly scheduler: BehaviorAnalysisScheduler;
  private readonly dirtyTracker = new BehaviorDirtyTracker();
  private readonly interpreterPolicy: FindingInterpreterPolicy;
  private unsubscribeTrigger?: () => void;
  private running = false;
  private inFlightRun: Promise<void> | null = null;
  private pendingMode: 'sync' | 'async' | null = null;
  private schedulerState: BehaviorSchedulerState = { lastRunAtByAnalyzer: {} };
  private onCapture?: (capture: BehaviorAnalysisRunCapture) => void;

  constructor(config: UiBehaviorPipelineConfig) {
    this.config = config;
    this.behaviorStore = config.behaviorStore ?? new InMemoryBehaviorStore();
    const registry = createAnalyzerRegistry(config.analyzers);
    this.scheduler = new BehaviorAnalysisScheduler(registry, config.schedulerPolicy);
    this.interpreterPolicy = config.interpreterPolicy ?? DEFAULT_FINDING_INTERPRETER_POLICY;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.unsubscribeTrigger = this.config.trigger.onTrigger((result) => {
      void this.handleTrigger(result);
    });
  }

  stop(): void {
    if (!this.running) return;
    this.unsubscribeTrigger?.();
    this.unsubscribeTrigger = undefined;
    this.running = false;
  }

  async flush(mode: 'sync' | 'async' = 'async'): Promise<void> {
    await this.runAnalysis(mode);
  }

  getStore(): BehaviorStore {
    return this.behaviorStore;
  }

  setOnCapture(callback?: (capture: BehaviorAnalysisRunCapture) => void): void {
    this.onCapture = callback;
  }

  private async handleTrigger(result: TriggerResult): Promise<void> {
    if (!this.running || !result.run) return;
    this.scheduleRun(result.mode);
  }

  private async runSyncWithBudget(): Promise<void> {
    const syncTimeoutMs = this.config.syncTimeoutMs ?? 1500;
    const startedAt = Date.now();
    try {
      await this.runAnalysis('sync');
    } catch (error) {
      getLogger().warn('[UiBehaviorPipeline] Sync analysis failed.', error);
      this.scheduleRun('async');
      return;
    }
    const elapsed = Date.now() - startedAt;
    if (elapsed > syncTimeoutMs) {
      getLogger().warn(`[UiBehaviorPipeline] Sync analysis exceeded budget (${elapsed}ms > ${syncTimeoutMs}ms).`);
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
          await this.runAnalysis('async');
        }
      } catch (error) {
        getLogger().warn('[UiBehaviorPipeline] Analysis run failed.', error);
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

  private mergeModes(current: 'sync' | 'async' | null, next: 'sync' | 'async'): 'sync' | 'async' {
    if (!current) return next;
    if (current === 'sync' || next === 'sync') return 'sync';
    return 'async';
  }

  private async runAnalysis(_mode: 'sync' | 'async'): Promise<void> {
    const cursor = await this.config.eventStore.getCursor('ui_behavior');
    const windowEvents = await buildExtractionWindow(
      this.config.eventStore,
      cursor,
      this.config.windowConfig,
    );
    if (windowEvents.length === 0) return;

    const latest = windowEvents[windowEvents.length - 1];
    const signals = projectBehaviorSignals(windowEvents);
    if (signals.length === 0) {
      if (!windowEvents.some((event) => event.type === 'ui.presented')) {
        await this.updateCursor(latest.id, latest.ts);
      }
      this.config.trigger.reset();
      return;
    }

    const {
      allSignals,
      segments,
      summaries,
      aggregates,
    } = await this.rebuildProjectedState(signals);

    const schedulerResult = await this.scheduler.run({
      actorId: this.config.actorId,
      signals: allSignals,
      segments,
      sessionSummaries: summaries,
      aggregates,
      dirtyTracker: this.dirtyTracker,
      state: this.schedulerState,
    });
    this.schedulerState = schedulerResult.nextState;
    this.dirtyTracker.clearAll();

    const integration = await integrateBehaviorFindings({
      actorId: this.config.actorId,
      findings: schedulerResult.findings,
      policy: this.interpreterPolicy,
      memoryStore: this.config.eventStore,
      behaviorStore: this.behaviorStore,
    });

    await this.updateCursor(latest.id, latest.ts);
    await this.emitCapture(schedulerResult, integration);

    this.config.trigger.reset();
  }

  private async rebuildProjectedState(
    signals: BehaviorSignal[],
  ) {
    await this.behaviorStore.upsertSignals(signals);
    this.dirtyTracker.markDirty('signals');

    const allSignals = await this.behaviorStore.findSignals(this.config.actorId);
    const segments = reduceBehaviorSegments(allSignals);
    await this.behaviorStore.upsertSegments(segments);
    this.dirtyTracker.markDirty('segments');

    const summaries = projectBehaviorSessionSummaries(segments, allSignals);
    await this.behaviorStore.upsertSessionSummaries(summaries);
    this.dirtyTracker.markDirty('session_summaries');

    const aggregates = reduceBehaviorAggregates(summaries, {
      windowMs: this.config.aggregateWindowMs,
    });
    await this.behaviorStore.upsertAggregates(aggregates);
    this.dirtyTracker.markDirty('aggregates');

    return {
      allSignals,
      segments,
      summaries,
      aggregates,
    };
  }

  private async updateCursor(lastProcessedEventId: string, lastProcessedTs: number): Promise<void> {
    await this.config.eventStore.setCursor({
      namespace: 'ui_behavior',
      lastProcessedEventId,
      lastProcessedTs,
      updatedTs: Date.now(),
    });
  }

  private async emitCapture(
    schedulerResult: Awaited<ReturnType<BehaviorAnalysisScheduler['run']>>,
    integration: IntegrateBehaviorFindingsResult,
  ): Promise<void> {
    if (!this.onCapture) {
      return;
    }

    const capture: BehaviorAnalysisRunCapture = {
      actorId: this.config.actorId,
      runAt: Date.now(),
      scheduler: schedulerResult,
      integration,
    };

    if (this.config.captureSnapshots) {
      const [uiMemorySnapshot, behaviorSnapshot] = await Promise.all([
        this.config.eventStore.exportJson(),
        this.behaviorStore.exportJson(),
      ]);
      capture.uiMemorySnapshot = uiMemorySnapshot;
      capture.behaviorSnapshot = behaviorSnapshot;
    }

    try {
      this.onCapture(capture);
    } catch (error) {
      getLogger().warn('[UiBehaviorPipeline] Capture callback failed.', error);
    }
  }
}

function createAnalyzerRegistry(
  analyzers?: BehaviorAnalyzer[],
): BehaviorAnalyzerRegistry {
  const registry = new BehaviorAnalyzerRegistry();

  for (const analyzer of analyzers ?? createBuiltinBehaviorAnalyzers()) {
    registry.register(analyzer);
  }

  return registry;
}
