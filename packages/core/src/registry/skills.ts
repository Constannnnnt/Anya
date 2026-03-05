/**
 * @anya-ui/core — SkillRegistry
 *
 * Single responsibility: declarative registry of high-level skills.
 * A skill groups components into a capability (e.g. "Photo Editing").
 */

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
  components: string[];
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

  private renderStringList(lines: string[], indent: string, key: string, values?: string[]): void {
    if (!values || values.length === 0) return;
    lines.push(`${indent}${key}:`);
    for (const value of values) {
      lines.push(`${indent}  - ${JSON.stringify(value)}`);
    }
  }

  /** Generate the LLM-facing skill listing in YAML format. */
  toLLMSkills(): string {
    const lines: string[] = ['skills:'];
    for (const skill of this.skills.values()) {
      lines.push(`  - name: ${skill.name}`);
      lines.push(`    description: ${skill.description}`);
      lines.push(`    components: [${skill.components.join(', ')}]`);
      lines.push(`    expandable: ${skill.expandable ?? false}`);
      lines.push(`    layout: ${skill.defaultLayout ?? 'stack'}`);
      this.renderStringList(lines, '    ', 'context_inputs', skill.contextInputs);
      this.renderStringList(lines, '    ', 'output_expectations', skill.outputExpectations);
      if (skill.sop) {
        lines.push('    sop:');
        lines.push(`      objective: ${JSON.stringify(skill.sop.objective)}`);
        this.renderStringList(lines, '      ', 'when_to_use', skill.sop.whenToUse);
        this.renderStringList(lines, '      ', 'steps', skill.sop.steps);
        this.renderStringList(lines, '      ', 'guardrails', skill.sop.guardrails);
        if (skill.sop.checklist && skill.sop.checklist.length > 0) {
          lines.push('      checklist:');
          for (const item of skill.sop.checklist) {
            lines.push(`        - id: ${item.id}`);
            lines.push(`          title: ${JSON.stringify(item.title)}`);
            lines.push(`          done_when: ${JSON.stringify(item.doneWhen)}`);
            lines.push(`          required: ${item.required !== false}`);
          }
        }
      }
    }
    return lines.join('\n');
  }
}
