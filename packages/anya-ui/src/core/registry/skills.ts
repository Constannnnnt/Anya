/**
 * ../../core — SkillRegistry
 *
 * Single responsibility: declarative registry of high-level skills.
 * A skill groups nodes into a capability (e.g. "Photo Editing").
 */

import YAML from 'yaml';

// ─── Skill Definition ────────────────────────────────────────────────────

export interface SkillChecklistItem {
  /** Stable checklist item id for tooling/tests. */
  id: string;
  /** Human-readable checklist item title. */
  title: string;
  /** Completion criteria the agent can verify. */
  doneWhen: string;
  /** Required by default unless explicitly false. */
  required?: boolean;
}

export interface SkillSOP {
  /** What this skill should accomplish when selected. */
  objective: string;
  /** Optional routing hints for when the skill should be selected. */
  whenToUse?: string[];
  /** Ordered execution steps (SOP). */
  steps?: string[];
  /** Deterministic checklist used for completion validation. */
  checklist?: SkillChecklistItem[];
  /** Hard constraints that must never be violated. */
  guardrails?: string[];
}

export interface SkillDefinition {
  /** Unique skill name, e.g. "photo_editing", "vintage_filter" */
  name: string;
  /** Human-readable description */
  description: string;
  /** Component names that this skill orchestrates */
  nodes: string[];
  /** Context inputs this skill expects to reason correctly. */
  contextInputs?: string[];
  /** Output expectations for the generated UI/interaction affordances. */
  outputExpectations?: string[];
  /** Operational procedure and completion checklist. */
  sop?: SkillSOP;
  /** Whether this skill can dynamically expand */
  expandable?: boolean;
  /** Suggested initial layout */
  defaultLayout?: 'stack' | 'row' | 'grid' | 'tabs' | 'split';
}

type ChangeListener = () => void;

function stringifyPromptYaml(value: unknown): string {
  return YAML.stringify(value, { lineWidth: 0 }).trimEnd();
}

// ─── Registry ────────────────────────────────────────────────────────────

export class SkillRegistry {
  private skills = new Map<string, SkillDefinition>();
  private listeners = new Set<ChangeListener>();

  register(def: SkillDefinition): this {
    this.skills.set(def.name, def);
    this.notify();
    return this;
  }

  unregister(name: string): boolean {
    const deleted = this.skills.delete(name);
    if (deleted) this.notify();
    return deleted;
  }

  get(name: string): SkillDefinition | undefined {
    return this.skills.get(name);
  }

  list(): SkillDefinition[] {
    return Array.from(this.skills.values());
  }

  /** Subscribe to registry changes. Returns unsubscribe fn. */
  onChange(fn: ChangeListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }

  /** Generate the LLM-facing skill listing in YAML format. */
  toLLMSkills(): string {
    const payload = {
      skills: Array.from(this.skills.values()).map((skill) => {
        const entry: Record<string, unknown> = {
          name: skill.name,
          description: skill.description,
          nodes: [...skill.nodes],
          expandable: skill.expandable ?? false,
          layout: skill.defaultLayout ?? 'stack',
        };

        if (skill.contextInputs?.length) {
          entry.context_inputs = [...skill.contextInputs];
        }
        if (skill.outputExpectations?.length) {
          entry.output_expectations = [...skill.outputExpectations];
        }
        if (skill.sop) {
          const sop: Record<string, unknown> = {
            objective: skill.sop.objective,
          };
          if (skill.sop.whenToUse?.length) {
            sop.when_to_use = [...skill.sop.whenToUse];
          }
          if (skill.sop.steps?.length) {
            sop.steps = [...skill.sop.steps];
          }
          if (skill.sop.guardrails?.length) {
            sop.guardrails = [...skill.sop.guardrails];
          }
          if (skill.sop.checklist?.length) {
            sop.checklist = skill.sop.checklist.map((item) => ({
              id: item.id,
              title: item.title,
              done_when: item.doneWhen,
              required: item.required !== false,
            }));
          }
          entry.sop = sop;
        }

        return entry;
      }),
    };

    return stringifyPromptYaml(payload);
  }
}
