/**
 * ../../core — ContextMemoryManager
 *
 * Single responsibility: track active UI state, per-element history,
 * and interaction trail. Persists to `memory.md` + a JSON snapshot.
 */

import type {
  ActiveContext,
  ElementHistory,
  ReasoningTrace,
  UIInteractionRecord,
  ViewSpec,
  ViewNode,
} from '../types';
import type { FileStorage } from '../storage/interface';
import { InMemoryStorage } from '../storage/memory';
import {
  CURRENT_MEMORY_SNAPSHOT_VERSION,
  parseMemorySnapshot,
  serializeMemorySnapshot,
  type MemorySnapshot,
} from './snapshot';
import { getLogger } from '../logging';

const SNAPSHOT_PATH = 'memory.snapshot.json';

export class ContextMemoryManager {
  private context: ActiveContext = { userIntent: '' };
  private interactions: UIInteractionRecord[] = [];
  private elementHistories = new Map<string, ElementHistory>();
  private reasoningTraces: ReasoningTrace[] = [];
  private currentSpec: ViewSpec | null = null;
  private maxInteractions: number;
  private maxReasoningTraces: number;
  private storage: FileStorage;
  private persistQueue: Promise<void> = Promise.resolve();
  private onPersistError?: (error: unknown) => void;

  constructor(opts?: {
    maxInteractions?: number;
    maxReasoningTraces?: number;
    storage?: FileStorage;
    onPersistError?: (error: unknown) => void;
  }) {
    this.maxInteractions = opts?.maxInteractions ?? 100;
    this.maxReasoningTraces = opts?.maxReasoningTraces ?? 120;
    this.storage = opts?.storage ?? new InMemoryStorage();
    this.onPersistError = opts?.onPersistError;
  }

  // ── Context ──

  setContext(ctx: Partial<ActiveContext>): void {
    this.context = {
      ...this.context,
      ...ctx,
    };
    this.schedulePersist();
  }

  /**
   * Starts a new task scope inside the current session.
   * Clears on-demand UI/session traces so the next prompt does not inherit stale tree context.
   * Persistent profile (anya.md) is intentionally kept outside this scope.
   */
  beginTaskScope(nextIntent: string, opts?: { preserveReasoningTraces?: boolean }): void {
    this.context = {
      userIntent: nextIntent,
    };
    this.interactions = [];
    this.elementHistories.clear();
    this.currentSpec = null;
    if (!opts?.preserveReasoningTraces) {
      this.reasoningTraces = [];
    }
    this.schedulePersist();
  }

  getContext(): Readonly<ActiveContext> {
    return this.context;
  }

  // ── Current UI State ──

  saveCurrentSpec(spec: ViewSpec): void {
    this.currentSpec = spec;
    this.trackElements(spec.nodes);
    if (spec.ux_rationale || spec.profile_observation || spec.skill) {
      this.recordReasoningTrace({
        intent: this.context.userIntent,
        workflowContext: spec.skill ?? this.context.workflowContext,
        uxRationale: spec.ux_rationale,
        profileObservation: spec.profile_observation,
        summary: [
          spec.skill ? `skill=${spec.skill}` : undefined,
          spec.ux_rationale ? `ux=${spec.ux_rationale}` : undefined,
          spec.profile_observation ? `profile=${spec.profile_observation}` : undefined,
        ]
          .filter((part): part is string => Boolean(part))
          .join(' | ') || 'Spec saved without explicit rationale text.',
      });
      return;
    }
    this.schedulePersist();
  }

  getCurrentSpec(): ViewSpec | null {
    return this.currentSpec;
  }

  private trackElements(nodes: ViewNode[]): void {
    for (const comp of nodes) {
      if (!this.elementHistories.has(comp.id!)) {
        this.elementHistories.set(comp.id!, {
          id: comp.id!,
          type: comp.type,
          createdAt: Date.now(),
          actions: [{ timestamp: Date.now(), action: 'expand', description: 'Created' }],
        });
      }
      if (comp.children) {
        this.trackElements(comp.children);
      }
    }
  }

  // ── Interactions ──

  recordInteraction(record: UIInteractionRecord): void {
    this.interactions.push(record);

    const hist = this.elementHistories.get(record.nodeId);
    if (hist) {
      hist.actions.push({
        timestamp: record.timestamp,
        action: record.action,
        description: record.semanticDescription
          ?? `${record.action}: ${record.propName ?? ''} → ${JSON.stringify(record.newValue)}`,
      });
    }

    if (this.interactions.length > this.maxInteractions) {
      this.interactions = this.interactions.slice(-this.maxInteractions);
    }

    this.schedulePersist();
  }

  getRecentInteractions(count = 10): readonly UIInteractionRecord[] {
    return this.interactions.slice(-count);
  }

  getInteractions(): readonly UIInteractionRecord[] {
    return this.interactions;
  }

  getElementHistories(): readonly ElementHistory[] {
    return [...this.elementHistories.values()];
  }

  // ── On-demand Reasoning Memory ──

  recordReasoningTrace(trace: Omit<ReasoningTrace, 'timestamp'> & { timestamp?: number }): void {
    this.reasoningTraces.push({
      timestamp: trace.timestamp ?? Date.now(),
      intent: trace.intent,
      workflowContext: trace.workflowContext,
      uxRationale: trace.uxRationale,
      profileObservation: trace.profileObservation,
      summary: trace.summary,
    });

    if (this.reasoningTraces.length > this.maxReasoningTraces) {
      this.reasoningTraces = this.reasoningTraces.slice(-this.maxReasoningTraces);
    }

    this.schedulePersist();
  }

  getRecentReasoningTraces(count = 8): readonly ReasoningTrace[] {
    return this.reasoningTraces.slice(-count);
  }

  // ── LLM Context (Markdown) ──

  toLLMContext(): string {
    const lines: string[] = [];
    lines.push('## On-Demand Session Memory');
    lines.push('Source: memory.snapshot.json');
    lines.push('');

    if (this.context.userIntent) {
      lines.push('## Active Context');
      lines.push(`intent: ${this.context.userIntent}`);
      const workflowContext = this.context.workflowContext;
      if (workflowContext) lines.push(`workflow_context: ${workflowContext}`);
      if (this.context.taskDescription) lines.push(`task: ${this.context.taskDescription}`);
      lines.push('');
    }

    if (this.currentSpec) {
      lines.push('## Currently Rendered UI');
      lines.push(this.specToMarkdown(this.currentSpec));
      lines.push('');
    }

    const recent = this.getRecentInteractions(8);
    if (recent.length > 0) {
      lines.push('## Recent User Actions');
      for (const r of recent) {
        const desc = r.semanticDescription
          ?? `${r.nodeType}.${r.action}(${r.propName ?? ''})`;
        lines.push(`- ${desc}`);
      }
      lines.push('');
    }

    const recentReasoning = this.getRecentReasoningTraces(6);
    if (recentReasoning.length > 0) {
      lines.push('## Recent Reasoning');
      for (const trace of recentReasoning) {
        lines.push(`- ${trace.summary}`);
      }
      lines.push('');
    }

    const activeElements = [...this.elementHistories.values()]
      .filter((h) => h.actions.length > 1);
    if (activeElements.length > 0) {
      lines.push('## Element History');
      for (const el of activeElements.slice(-5)) {
        lines.push(`### ${el.type}[${el.id}]`);
        for (const a of el.actions.slice(-3)) {
          lines.push(`- ${a.description}`);
        }
      }
    }

    return lines.join('\n');
  }

  private specToMarkdown(spec: ViewSpec, indent = ''): string {
    const lines: string[] = [];
    lines.push(`${indent}layout: ${spec.layout}`);
    if (spec.skill) lines.push(`${indent}skill: ${spec.skill}`);
    lines.push(`${indent}nodes:`);
    for (const c of spec.nodes) {
      lines.push(this.componentToMarkdown(c, indent + '  '));
    }
    return lines.join('\n');
  }

  private componentToMarkdown(comp: ViewNode, indent: string): string {
    const propSummary = Object.entries(comp.props)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(', ');
    const lines = [`${indent}- ${comp.type}(${propSummary}) [id=${comp.id}]`];
    if (comp.children) {
      for (const child of comp.children) {
        lines.push(this.componentToMarkdown(child, indent + '  '));
      }
    }
    return lines.join('\n');
  }


  // ── Persistence ──

  private toSnapshot(): MemorySnapshot {
    return {
      version: CURRENT_MEMORY_SNAPSHOT_VERSION,
      context: this.context,
      interactions: this.interactions,
      elementHistories: [...this.elementHistories.values()],
      reasoningTraces: this.reasoningTraces,
      currentSpec: this.currentSpec,
    };
  }

  private schedulePersist(): void {
    const snapshot = this.toSnapshot();
    const markdownContext = this.toLLMContext();

    this.persistQueue = this.persistQueue
      .catch(() => {
        // Keep the queue active even if a previous write failed.
      })
      .then(async () => {
        await this.storage.write('memory.md', markdownContext);
        await this.storage.write(SNAPSHOT_PATH, serializeMemorySnapshot(snapshot));
      })
      .catch((error) => {
        if (this.onPersistError) {
          this.onPersistError(error);
          return;
        }
        getLogger().warn('[ContextMemoryManager] Persistence failed:', error);
      });
  }

  async flushPersistence(): Promise<void> {
    await this.persistQueue.catch(() => {
      // Error is already handled via onPersistError / logger in schedulePersist.
    });
  }

  private hydrateFromSnapshot(snapshot: MemorySnapshot): void {
    this.context = snapshot.context;
    this.interactions = snapshot.interactions.slice(-this.maxInteractions);
    this.elementHistories = new Map(snapshot.elementHistories.map((h) => [h.id, h]));
    this.reasoningTraces = snapshot.reasoningTraces.slice(-this.maxReasoningTraces);
    this.currentSpec = snapshot.currentSpec;

    if (this.currentSpec && this.elementHistories.size === 0) {
      this.trackElements(this.currentSpec.nodes);
    }
  }

  async loadFromDisk(): Promise<void> {
    try {
      const snapshotRaw = await this.storage.read(SNAPSHOT_PATH);
      if (snapshotRaw) {
        const snapshot = parseMemorySnapshot(snapshotRaw);
        if (snapshot) {
          this.hydrateFromSnapshot(snapshot);
          return;
        }
      }
    } catch {
      // No previous session
    }
  }

  reset(): void {
    this.context = { userIntent: '' };
    this.interactions = [];
    this.elementHistories.clear();
    this.reasoningTraces = [];
    this.currentSpec = null;
    this.schedulePersist();
  }
}
