/**
 * ../../../core — Extraction Worker
 *
 * Runs LLM extraction prompts and validates outputs against zod schemas.
 * The LLM call itself is injected to keep this module LLM-agnostic.
 */

import {
  ExtractedPreferenceCandidateSchema,
  EpisodicTurnSummarySchema,
  ConsolidatedEpisodeSchema,
  ReflectionSynthesisSchema,
} from './schemas';
import type {
  ExtractedPreferenceCandidate,
  EpisodicTurnSummary,
  ConsolidatedEpisode,
  ReflectionSynthesis,
} from './schemas';
import type { ExtractionContext } from './extractionPayload';
import { z } from 'zod';

// ─── Types ───────────────────────────────────────────────────────────────

/** LLM prompt runner — injected by the host. */
export type PromptRunner = (prompt: string) => Promise<string>;

export interface ExtractionWorkerConfig {
  /** The LLM prompt runner. */
  runPrompt: PromptRunner;
}

export interface PreferenceExtractionResult {
  candidates: ExtractedPreferenceCandidate[];
  errors: string[];
}

export interface EpisodicExtractionResult {
  turns: EpisodicTurnSummary[];
  episode: ConsolidatedEpisode | null;
  reflections: ReflectionSynthesis[];
  errors: string[];
}

// ─── Prompt Templates ────────────────────────────────────────────────────

function buildPreferenceExtractionPrompt(ctx: ExtractionContext): string {
  return `# ROLE
You are a UI Preference Analyst. Your task is to analyze conversations and UI interaction events to extract durable user preferences about UI layout, interaction patterns, theming, and tooling.

# INPUT
You will analyze two sets of conversation data plus UI events:

<past_conversation>
${ctx.conversations.slice(0, -1).join('\n')}
</past_conversation>

<current_conversation>
${ctx.conversations.slice(-1).join('\n')}
</current_conversation>

<ui_events>
${ctx.uiEvents.join('\n')}
</ui_events>

<workflow_context>
${ctx.workflowContext ?? 'none'}
</workflow_context>

<tool_manifest>
${ctx.toolManifest.join('\n')}
</tool_manifest>

# PREFERENCE TYPES

## Explicit Preferences
Directly stated by the user. Extract only what the user has explicitly shared.
Example: User says "I prefer dark mode" → extract as explicit preference.
Example: User says "Always use a split layout for profiles" → extract as explicit preference.

## Implicit Preferences
Inferred from patterns, repeated behaviors, or strong contextual signals.
Only extract implicit preferences when there is STRONG repeated evidence (e.g., user repeatedly chooses the same layout, consistently uses the same tool).
Example: User has switched to the "Timeline" tab 5 times across sessions → implicit preference for timeline view.
Example: User always expands accordion items → implicit preference for expanded content.

# RULES
1. Extract preferences ONLY from <current_conversation>. Use <past_conversation> and <ui_events> only as supporting context.
2. Extract preferences ONLY from user messages and user-initiated UI events. Use assistant messages only as context.
3. Only extract preferences with HIGH confidence — do not speculate.
4. Ignore one-time requests, temporary states, and situational choices.
5. Do NOT extract Personally Identifiable Information (PII), secrets, account numbers, or harmful content.
6. Treat workflow context as background context — do not invent preferences without evidence.
7. Maintain the original language of the user's conversation.
8. Return ONLY a valid JSON array with no additional text, explanations, or formatting.

# CONFIDENCE SCORING
- 0.9-1.0: User explicitly stated the preference in clear terms.
- 0.7-0.8: Strong implicit signal — repeated behavior (3+ times) or consistent pattern.
- 0.5-0.6: Moderate signal — behavior observed 2 times or contextually suggested.
- Below 0.5: Do NOT extract. Signal is too weak.

# OUTPUT FORMAT
JSON array, each item:
{
  "context": "Background and reason why this preference was extracted. Reference specific evidence.",
  "preference": "Concise, durable preference statement",
  "categories": ["layout"|"interaction"|"theme"|"tooling"],
  "signal_type": "explicit"|"implicit",
  "confidence": 0.5-1.0
}

## Example Output:
[
  {
    "context": "User explicitly said 'I always want the split view for people profiles'.",
    "preference": "Prefers split layout for person/profile views",
    "categories": ["layout"],
    "signal_type": "explicit",
    "confidence": 0.95
  },
  {
    "context": "User switched to the Timeline tab in 4 out of 5 sessions, suggesting a preference for chronological views.",
    "preference": "Prefers timeline/chronological views over card grids",
    "categories": ["layout", "interaction"],
    "signal_type": "implicit",
    "confidence": 0.75
  }
]

Return [] if no durable preferences are found.`;
}

function buildEpisodicExtractionPrompt(ctx: ExtractionContext): string {
  return `# ROLE
You are an expert UI interaction analyst. Your task is to analyze conversation turns between a user and a UI composition agent, focusing on tool usage, component selection, layout decisions, and reasoning processes.

# INPUT
<conversation>
${ctx.conversations.join('\n')}
</conversation>

<tool_events>
${ctx.uiEvents.filter((e) => e.includes('tool_call')).join('\n')}
</tool_events>

<interaction_events>
${ctx.uiEvents.join('\n')}
</interaction_events>

<workflow_context>
${ctx.workflowContext ?? 'none'}
</workflow_context>

# ANALYSIS FRAMEWORK

## 1. Context Analysis
- Examine all conversation turns provided.
- Identify the circumstances and context the assistant is responding to.
- Try to identify the user's overall objective, which may go beyond the given turns.

## 2. Per-Turn Analysis
For EACH turn, analyze the assistant's approach by identifying:
- **Situation**: The circumstances the assistant is responding to and how it connects to the user's overall objective.
- **Intent**: The assistant's primary goal for this specific turn.
- **Action**: Which tools were used, what nodes were selected, and in what sequence. If no tools, describe the response.
- **Thought**: Why these tools/nodes were chosen, how arguments were determined, and what guided the decision-making.

## 3. Outcome Assessment (Per Turn)
For EACH turn, using the next turn's user message:
- **assessment_assistant**: Did the assistant successfully achieve its stated goal? (Yes/No)
- **assessment_user**: Has the user's current episode concluded? Use these signals:
  1. If this is the END of the conversation episode (user's inquiry concluded) → "Yes"
  2. If the user is shifting to a NEW task or topic → "Yes" (current episode is done)
  3. If the user is asking for clarification or more info for the CURRENT task → "No" (still in progress)
  4. If there is no next turn and no clear conclusion signal → "No"

# RULES
1. Focus on UI interactions, component choices, and tool execution order.
2. Keep each field to 1-2 concise sentences.
3. Output ONLY a JSON array — no explanations or markdown.
4. Preserve order-sensitive details (tool sequence, component nesting order).
5. Do NOT include PII or user-specific data.

# OUTPUT FORMAT
JSON array, one object per turn:
{
  "situation": "Brief context and circumstances",
  "intent": "Assistant's primary goal for this turn",
  "action": "Tools used, nodes selected, sequence of execution",
  "thought": "Why these were chosen, what guided decisions",
  "assessment_assistant": "Yes"|"No",
  "assessment_user": "Yes"|"No"
}

Return [] if no meaningful turns exist.`;
}

function buildEpisodeConsolidationPrompt(
  turns: EpisodicTurnSummary[],
): string {
  return `# ROLE
You are an expert conversation analyst specializing in UI composition workflows. Your task is to analyze and summarize a sequence of interaction turns into a single consolidated episode record.

# INPUT TURNS
${JSON.stringify(turns, null, 2)}

# ANALYSIS OBJECTIVES
- Provide a comprehensive summary covering all key aspects of the interaction.
- Understand the user's underlying needs and motivations.
- Evaluate the effectiveness of the conversation in meeting those needs.

# ANALYSIS DIMENSIONS

**Situation**: The context and circumstances that prompted this interaction — what was happening that led the user to seek assistance?

**Intent**: The user's primary goal, the problem they wanted to solve, or the concrete outcome they sought to achieve.

**Assessment**: A definitive evaluation of whether the user's goal was successfully achieved (Yes/No).

**Justification**: Clear reasoning supported by specific evidence from the turns that explains your assessment.

**Reflection**: Key insights from the sequence of turns, focusing on:
- Patterns in component selection, layout decisions, and tool usage that led to success or failure.
- Effective tool/component combinations that worked well.
- Reasoning or component choices that should be avoided in similar scenarios.
- Actionable recommendations for handling similar UI composition tasks.

# RULES
1. Keep lessons transferable — focus on patterns that generalize to other scenarios.
2. Explain how tool/interaction ordering impacted the outcome.
3. Output ONLY a single JSON object — no explanations or markdown.
4. Do NOT include PII.

# OUTPUT FORMAT
{
  "situation": "Context that prompted this interaction",
  "intent": "User's primary goal or desired outcome",
  "assessment": "Yes"|"No",
  "justification": "Evidence-based reasoning for your assessment",
  "reflection": "Key insights, patterns, recommendations for similar tasks"
}`;
}

function buildReflectionSynthesisPrompt(
  episode: ConsolidatedEpisode,
  existingReflections: ReflectionSynthesis[] = [],
): string {
  return `# ROLE
You are an expert at extracting actionable insights from UI composition episodes to build reusable knowledge for future tasks.

# TASK
Analyze the provided episode and existing reflections, then synthesize new reflection knowledge that can guide future UI composition scenarios.

# INPUT
<main_episode>
${JSON.stringify(episode)}
</main_episode>

<existing_reflections>
${JSON.stringify(existingReflections)}
</existing_reflections>

# REFLECTION PROCESS

## 1. Pattern Identification
- Review the main episode's intent, situation, actions, and reflection/findings.
- Review existing reflections to understand what has already been learned.
- Determine if patterns update existing knowledge or represent entirely new insights.

## 2. Knowledge Synthesis
For each identified pattern, create a reflection entry with:

### Operator
- **add**: A completely new insight not covered by existing reflections. Do NOT include a matching title.
- **update**: An enhanced version of an existing reflection. ONLY use when the new pattern shares the SAME core concept as an existing reflection. Use the same or similar title.
- Length constraint: If updating would make use_cases + hints exceed 200 words, create a NEW focused reflection with "add" instead.

### Title
Concise, descriptive name (e.g., "Split Layout for Profile Views", "Timeline Component Selection").
- When updating, keep the same or very similar title.
- When splitting due to length, use a more specific variant.

### Use Cases
Briefly describe when this insight applies (1-3 sentences):
- Types of goals or intents where this helps.
- Trigger conditions that signal when to use this knowledge.
When updating: merge original and new use cases into a comprehensive view.

### Hints
Actionable guidance (1-3 sentences):
- Component/layout selection patterns from successful episodes.
- What worked well and what to avoid.
- Specific reasoning about WHY these patterns work.
When updating: merge original and new hints. Do NOT lose existing valuable information.

### Confidence
Score from 0.1 to 1.0:
- 0.8-1.0: Clear actionable pattern that consistently led to success/failure.
- 0.4-0.7: Useful insight but context-dependent or limited evidence.
- 0.1-0.3: Tentative pattern that may not generalize.
When updating, adjust confidence based on additional evidence.

## 3. Synthesis Guidelines
- Focus on TRANSFERABLE knowledge, not task-specific details.
- Emphasize WHY certain approaches work, not just what was done.
- Include both positive patterns (what to do) and negative patterns (what to avoid).
- If existing reflections already cover the patterns well, generate fewer or no new reflections.
- Keep use_cases and hints focused: aim for 100-200 words total per reflection.

# RULES
1. Update when the core concept already exists in existing reflections.
2. Add when the concept is genuinely new.
3. Output ONLY a JSON array — no explanations or markdown.
4. Do NOT include PII.

# OUTPUT FORMAT
JSON array, each item:
{
  "operator": "add"|"update",
  "title": "Descriptive title for the insight",
  "use_cases": "When this applies — goals, triggers, contexts",
  "hints": "Actionable guidance — what works, what to avoid, why",
  "confidence": 0.1-1.0
}

Return [] if no reusable guidance can be extracted.`;
}

// ─── Extraction Worker ───────────────────────────────────────────────────

export class ExtractionWorker {
  private readonly runPrompt: PromptRunner;

  constructor(config: ExtractionWorkerConfig) {
    this.runPrompt = config.runPrompt;
  }

  /**
   * Run preference extraction on a context window.
   * Returns validated candidates + any parse/validation errors.
   */
  async runPreferenceExtraction(
    ctx: ExtractionContext,
  ): Promise<PreferenceExtractionResult> {
    const prompt = buildPreferenceExtractionPrompt(ctx);
    const raw = await this.runPrompt(prompt);
    return this.parsePreferences(raw);
  }

  /**
   * Run full episodic extraction pipeline:
   * 1. Extract turn summaries
   * 2. Consolidate into episode
   * 3. Synthesize reflections
   */
  async runEpisodicExtraction(
    ctx: ExtractionContext,
    existingReflections?: ReflectionSynthesis[],
  ): Promise<EpisodicExtractionResult> {
    const errors: string[] = [];

    // Step 1: Extract turns
    const turnsPrompt = buildEpisodicExtractionPrompt(ctx);
    const turnsRaw = await this.runPrompt(turnsPrompt);
    const turns = this.parseTurns(turnsRaw, errors);

    if (turns.length === 0) {
      return { turns: [], episode: null, reflections: [], errors };
    }

    // Step 2: Consolidate episode
    const episodePrompt = buildEpisodeConsolidationPrompt(turns);
    const episodeRaw = await this.runPrompt(episodePrompt);
    const episode = this.parseEpisode(episodeRaw, errors);

    if (!episode) {
      return { turns, episode: null, reflections: [], errors };
    }

    // Step 3: Synthesize reflections
    const reflPrompt = buildReflectionSynthesisPrompt(
      episode,
      existingReflections,
    );
    const reflRaw = await this.runPrompt(reflPrompt);
    const reflections = this.parseReflections(reflRaw, errors);

    return { turns, episode, reflections, errors };
  }

  // ── Parsers ─────────────────────────────────────────────────────────

  private parsePreferences(raw: string): PreferenceExtractionResult {
    const errors: string[] = [];
    const jsonArray = extractJsonArray(raw);

    if (!jsonArray) {
      return { candidates: [], errors: ['Failed to extract JSON array from preference response'] };
    }

    const candidates: ExtractedPreferenceCandidate[] = [];
    for (const item of jsonArray) {
      const parsed = ExtractedPreferenceCandidateSchema.safeParse(item);
      if (parsed.success) {
        candidates.push(parsed.data);
      } else {
        errors.push(`Invalid preference candidate: ${parsed.error.message}`);
      }
    }

    return { candidates, errors };
  }

  private parseTurns(raw: string, errors: string[]): EpisodicTurnSummary[] {
    const jsonArray = extractJsonArray(raw);
    if (!jsonArray) {
      errors.push('Failed to extract JSON array from episodic turn response');
      return [];
    }

    const turns: EpisodicTurnSummary[] = [];
    for (const item of jsonArray) {
      const parsed = EpisodicTurnSummarySchema.safeParse(item);
      if (parsed.success) {
        turns.push(parsed.data);
      } else {
        errors.push(`Invalid turn summary: ${parsed.error.message}`);
      }
    }

    return turns;
  }

  private parseEpisode(raw: string, errors: string[]): ConsolidatedEpisode | null {
    const json = extractJsonObject(raw);
    if (!json) {
      errors.push('Failed to extract JSON object from episode consolidation response');
      return null;
    }

    const parsed = ConsolidatedEpisodeSchema.safeParse(json);
    if (parsed.success) return parsed.data;

    errors.push(`Invalid episode: ${parsed.error.message}`);
    return null;
  }

  private parseReflections(raw: string, errors: string[]): ReflectionSynthesis[] {
    const jsonArray = extractJsonArray(raw);
    if (!jsonArray) {
      errors.push('Failed to extract JSON array from reflection response');
      return [];
    }

    const reflections: ReflectionSynthesis[] = [];
    for (const item of jsonArray) {
      const parsed = ReflectionSynthesisSchema.safeParse(item);
      if (parsed.success) {
        reflections.push(parsed.data);
      } else {
        errors.push(`Invalid reflection: ${parsed.error.message}`);
      }
    }

    return reflections;
  }
}

// ─── JSON Extraction Helpers ─────────────────────────────────────────────

/** Extract a JSON array from potentially wrapped LLM output. */
function extractJsonArray(raw: string): unknown[] | null {
  try {
    // Try direct parse first
    const parsed = JSON.parse(raw.trim());
    if (Array.isArray(parsed)) return parsed;
    return null;
  } catch {
    // Try to find JSON array in the response
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** Extract a JSON object from potentially wrapped LLM output. */
function extractJsonObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw.trim());
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed;
        }
      } catch {
        return null;
      }
    }
    return null;
  }
}
