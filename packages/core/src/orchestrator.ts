/**
 * @anya-ui/core — Orchestrator
 *
 * Single responsibility: bridge the registry (what's available) with
 * translator (what the LLM said) and prompt builder (what to ask).
 *
 * Thin coordinator — delegates to prompt.ts for prompt building
 * and translator.ts for decoding.
 */

import type { AgentMessage, PromptOptions, PromptParts, UIRenderSpec } from './types';
import { ComponentCatalog } from './registry/catalog';
import { SkillRegistry } from './registry/skills';
import { ContextMemoryManager } from './memory/context';
import { buildSystemPrompt, buildResponseFormatBlock, buildSelectionPrompt as buildSelectionPromptFn } from './prompt';
import { decode } from './translator';
import {
  type AgentSessionRun,
  type SessionArtifact,
  type AgentSessionTransport,
} from './session';
import type { MemoryStore } from './memory/ui/store';
import type { BehaviorStore, FindingInterpreterPolicy } from './memory/ui/behavior';
import type { RetrievalComposer } from './memory/ui/retrieval';

// ─── Types ───────────────────────────────────────────────────────────────

export interface OrchestratorConfig {
  catalog: ComponentCatalog;
  skills: SkillRegistry;
  memory: ContextMemoryManager;
  profile?: import('./memory/profile').AdaptiveProfile;
  sessionTransport?: AgentSessionTransport;
  /** Optional UI memory retrieval composer for planning priors. */
  uiMemoryStore?: MemoryStore;
  uiMemoryRetrieval?: RetrievalComposer;
  uiBehaviorStore?: BehaviorStore;
  uiBehaviorPolicy?: FindingInterpreterPolicy;
  /** Actor ID for UI memory retrieval. */
  actorId?: string;
}

// ─── Orchestrator ────────────────────────────────────────────────────────

export class DynamicOrchestrator {
  private catalog: ComponentCatalog;
  private skills: SkillRegistry;
  private memory: ContextMemoryManager;
  private profile?: import('./memory/profile').AdaptiveProfile;
  private sessionTransport?: AgentSessionTransport;
  private uiMemoryStore?: MemoryStore;
  private uiMemoryRetrieval?: RetrievalComposer;
  private uiBehaviorStore?: BehaviorStore;
  private uiBehaviorPolicy?: FindingInterpreterPolicy;
  private actorId?: string;

  constructor(config: OrchestratorConfig) {
    this.catalog = config.catalog;
    this.skills = config.skills;
    this.memory = config.memory;
    this.profile = config.profile;
    this.sessionTransport = config.sessionTransport;
    this.uiMemoryStore = config.uiMemoryStore;
    this.uiMemoryRetrieval = config.uiMemoryRetrieval;
    this.uiBehaviorStore = config.uiBehaviorStore;
    this.uiBehaviorPolicy = config.uiBehaviorPolicy;
    this.actorId = config.actorId;
  }

  /**
   * Level 3: Get raw prompt parts to build your own prompt.
   */
  getPromptParts(format: 'yaml' | 'json' = 'yaml'): PromptParts {
    return {
      catalogYaml: this.catalog.toLLMCatalog(),
      skillsYaml: this.skills.toLLMSkills(),
      memoryContext: this.memory.toLLMContext(),
      responseFormatBlock: buildResponseFormatBlock(format),
      summaryCatalogYaml: this.catalog.toLLMSummary(),
    };
  }

  /**
   * Level 1 & 2: Build the system prompt.
   * Delegates to the pure prompt builder function.
   */
  buildSystemPrompt(opts?: PromptOptions, uiMemoryPriors?: string): string {
    return buildSystemPrompt(this.catalog, this.skills, this.memory, this.profile, opts, uiMemoryPriors);
  }

  /**
   * Build the lightweight Round 1 selection prompt.
   * Returns a prompt string that asks the LLM to pick relevant components.
   */
  buildSelectionPrompt(userMessage: string): string {
    return buildSelectionPromptFn(this.catalog, userMessage);
  }

  /**
   * Retrieve UI memory priors for the current planning context.
   * Returns formatted string or undefined if not configured.
   */
  async getUiMemoryPriors(): Promise<string | undefined> {
    if (!this.uiMemoryRetrieval || !this.uiMemoryStore || !this.actorId) {
      return undefined;
    }
    const ctx = await this.uiMemoryRetrieval.retrievePlanningContext(
      this.uiMemoryStore,
      this.actorId,
      {
        taskClass: this.memory.getContext().workflowContext,
      },
      this.uiBehaviorStore && this.uiBehaviorPolicy
        ? {
          store: this.uiBehaviorStore,
          policy: this.uiBehaviorPolicy,
        }
        : undefined,
    );
    const formatted = this.uiMemoryRetrieval.formatForPrompt(ctx);
    return formatted || undefined;
  }

  setSessionTransport(transport?: AgentSessionTransport): void {
    this.sessionTransport = transport;
  }

  hasSessionTransport(): boolean {
    return Boolean(this.sessionTransport);
  }

  async startAgentSession(input: {
    sessionId?: string;
    userIntent: string;
    messages: AgentMessage[];
    promptOptions?: PromptOptions;
    transport?: AgentSessionTransport;
    currentArtifacts?: SessionArtifact[];
    currentViewId?: string;
  }): Promise<AgentSessionRun> {
    const uiMemoryPriors = await this.getUiMemoryPriors();
    const sessionTransport = input.transport ?? this.sessionTransport;

    if (!sessionTransport) {
      throw new Error('[DynamicOrchestrator] No session transport configured.');
    }

    return sessionTransport.startSession({
      sessionId: input.sessionId,
      systemPrompt: this.buildSystemPrompt(input.promptOptions, uiMemoryPriors),
      userIntent: input.userIntent,
      messages: input.messages.map((message) => ({
        id: message.id,
        role: message.role === 'agent' ? 'assistant' : message.role,
        content: message.content,
        timestamp: message.timestamp,
      })),
      memoryContext: this.memory.toLLMContext(),
      currentArtifacts: input.currentArtifacts,
      currentViewId: input.currentViewId,
    });
  }

  /**
   * Handle an expansion request — add more components to
   * the current skill's UI.
   */
  expandCurrentSkill(additionalYaml: string): UIRenderSpec | null {
    const current = this.memory.getCurrentSpec();
    if (!current) return null;

    const additional = decode(additionalYaml, this.catalog);
    const expanded: UIRenderSpec = {
      ...current,
      components: [...current.components, ...additional.components],
    };

    this.memory.saveCurrentSpec(expanded);
    return expanded;
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────

export function createOrchestrator(config: OrchestratorConfig): DynamicOrchestrator {
  return new DynamicOrchestrator(config);
}
