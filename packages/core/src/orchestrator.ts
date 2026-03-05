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
import { buildSystemPrompt, buildResponseFormatBlock } from './prompt';
import { decode } from './translator';
import type { ModelTransport } from './transport';
import { applyDecodedSpec } from './specLifecycle';
import type { MemoryStore } from './memory/ui/store';
import type { RetrievalComposer } from './memory/ui/retrieval';

// ─── Types ───────────────────────────────────────────────────────────────

export interface OrchestratorConfig {
  catalog: ComponentCatalog;
  skills: SkillRegistry;
  memory: ContextMemoryManager;
  profile?: import('./memory/profile').AdaptiveProfile;
  transport?: ModelTransport;
  /** Optional UI memory retrieval composer for planning priors. */
  uiMemoryStore?: MemoryStore;
  uiMemoryRetrieval?: RetrievalComposer;
  /** Actor ID for UI memory retrieval. */
  actorId?: string;
}

interface TransportTurnInput {
  userIntent: string;
  messages: AgentMessage[];
  promptOptions?: PromptOptions;
  /**
   * Apply decoded spec lifecycle (memory/profile) inside orchestrator.
   * Keep true for standalone usage. Integrations with runtime effects can disable it.
   */
  applyLifecycle?: boolean;
}

// ─── Orchestrator ────────────────────────────────────────────────────────

export class DynamicOrchestrator {
  private catalog: ComponentCatalog;
  private skills: SkillRegistry;
  private memory: ContextMemoryManager;
  private profile?: import('./memory/profile').AdaptiveProfile;
  private transport?: ModelTransport;
  private uiMemoryStore?: MemoryStore;
  private uiMemoryRetrieval?: RetrievalComposer;
  private actorId?: string;

  constructor(config: OrchestratorConfig) {
    this.catalog = config.catalog;
    this.skills = config.skills;
    this.memory = config.memory;
    this.profile = config.profile;
    this.transport = config.transport;
    this.uiMemoryStore = config.uiMemoryStore;
    this.uiMemoryRetrieval = config.uiMemoryRetrieval;
    this.actorId = config.actorId;
  }

  /**
   * Level 3: Get raw prompt parts to build your own prompt.
   */
  getPromptParts(): PromptParts {
    return {
      catalogYaml: this.catalog.toLLMCatalog(),
      skillsYaml: this.skills.toLLMSkills(),
      memoryContext: this.memory.toLLMContext(),
      responseFormatBlock: buildResponseFormatBlock('yaml'),
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
    );
    const formatted = this.uiMemoryRetrieval.formatForPrompt(ctx);
    return formatted || undefined;
  }

  setTransport(transport?: ModelTransport): void {
    this.transport = transport;
  }

  hasTransport(): boolean {
    return Boolean(this.transport);
  }

  async generateSpecWithTransport(input: {
    userIntent: string;
    messages: AgentMessage[];
    promptOptions?: PromptOptions;
    applyLifecycle?: boolean;
  }): Promise<UIRenderSpec> {
    const result = await this.completeTurnWithTransport(input);
    return result.spec;
  }

  async completeTurnWithTransport(input: TransportTurnInput): Promise<{ spec: UIRenderSpec; raw: string }> {
    if (!this.transport) {
      throw new Error('[DynamicOrchestrator] No model transport configured.');
    }

    const uiMemoryPriors = await this.getUiMemoryPriors();

    const result = await this.transport.complete({
      systemPrompt: this.buildSystemPrompt(input.promptOptions, uiMemoryPriors),
      messages: input.messages,
      newUserMessage: input.userIntent,
    });

    if (!result.content.trim()) {
      throw new Error('[DynamicOrchestrator] Transport returned empty content.');
    }

    return {
      spec: this.processLLMResponse(result.content, input.userIntent, {
        applyLifecycle: input.applyLifecycle,
      }),
      raw: result.content,
    };
  }

  /**
   * Process raw LLM output (YAML) into a validated UIRenderSpec.
   * Updates the memory with the new context.
   */
  processLLMResponse(
    rawYaml: string,
    userIntent: string,
    options?: {
      applyLifecycle?: boolean;
    }
  ): UIRenderSpec {
    const spec = decode(rawYaml, this.catalog);
    if (options?.applyLifecycle !== false) {
      applyDecodedSpec(spec, {
        memory: this.memory,
        profile: this.profile,
      }, {
        source: 'agent',
        userIntent,
      });
    }

    return spec;
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
