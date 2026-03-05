/**
 * @anya-ui/core — Translator (Context-Aware Encoder / Decoder)
 *
 * Single responsibility: bidirectional translation between
 * LLM output (YAML) and UI render specs.
 *
 * Decoder: YAML → UIRenderSpec
 * Encoder: Interaction + Context → Semantic text for LLM
 */

import YAML from 'yaml';
import type { ComponentCatalog } from './registry/catalog';
import type { ContextMemoryManager } from './memory/context';
import type { UIRenderSpec, UIComponentSpec, UIInteractionRecord, UIInteractionDefinition, ThemeTokens } from './types';
import { normalizeUISpecEnvelope, withSpecVersion } from './spec';
import { getLogger } from './logging';

// ─── Decoder ─────────────────────────────────────────────────────────────

let _idCounter = 0;
function nextId(): string {
  return `ui-${Date.now()}-${++_idCounter}`;
}

/**
 * Extract YAML content from LLM output that may contain
 * markdown fences, prose explanations, or other wrapper text.
 */
function extractYaml(raw: string): string {
  let text = raw.trim();

  // 1. Try to extract from markdown code fences
  const fenceMatch = text.match(/```(?:ya?ml)?\s*\n([\s\S]*?)```/i);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  } else {
    text = text.replace(/^```(?:ya?ml)?\s*|\s*```$/gi, '').trim();
  }

  // 2. If it still starts with non-YAML prose, find first YAML line
  if (text && !looksLikeYaml(text)) {
    const lines = text.split('\n');
    const yamlStart = lines.findIndex((line) =>
      /^(spec_version:|skill:|layout:|ux_rationale:|profile_observation:|theme_update:|components:|  - type:|- type:)/.test(line.trim())
    );
    if (yamlStart >= 0) {
      text = lines.slice(yamlStart).join('\n').trim();
    }
  }

  return text;
}

function looksLikeYaml(text: string): boolean {
  const firstLine = text.split('\n')[0].trim();
  return /^(spec_version:|skill:|layout:|components:|---|\w+:)/.test(firstLine);
}

function fixUnquotedSemicolons(text: string): string {
  return text.replace(
    /^(\s+)(allow|style|className|class):\s+([^"\s#\[{].*)$/gm,
    (_, indent, key, value) => {
      const escaped = value.replace(/"/g, '\\"');
      return `${indent}${key}: "${escaped}"`;
    }
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const VALID_LAYOUTS = new Set<UIRenderSpec['layout']>(['stack', 'row', 'grid', 'tabs', 'split']);
const LAYOUT_ALIASES: Record<string, UIRenderSpec['layout']> = {
  'flex-row': 'row',
  'flexrow': 'row',
  'horizontal': 'row',
  'left-right': 'row',
  'leftright': 'row',
  'flex-col': 'stack',
  'flex-column': 'stack',
  'flexcol': 'stack',
  'column': 'stack',
  'vertical': 'stack',
  'two-pane': 'split',
  'twopane': 'split',
  'split-view': 'split',
  'splitview': 'split',
};
const VALID_TRIGGERS = new Set<UIInteractionDefinition['trigger']>([
  'onClick',
  'onDoubleClick',
  'onMouseEnter',
  'onMouseLeave',
]);

function normalizeLayout(input: unknown): UIRenderSpec['layout'] {
  if (typeof input === 'string') {
    const normalized = input.trim().toLowerCase().replace(/_/g, '-');
    if (VALID_LAYOUTS.has(normalized as UIRenderSpec['layout'])) {
      return normalized as UIRenderSpec['layout'];
    }
    const alias = LAYOUT_ALIASES[normalized];
    if (alias) {
      return alias;
    }
  }
  throw new Error(
    `[Translator.decode] Unsupported layout '${String(input)}'. ` +
    `Expected one of: ${Array.from(VALID_LAYOUTS).join('|')}.`
  );
}

function normalizeOptionalString(input: unknown): string | undefined {
  return typeof input === 'string' ? input : undefined;
}

/**
 * Coerce a CSS string (`"color: red; font-size: 14px"`) into a
 * camelCased property map (`{ color: 'red', fontSize: '14px' }`).
 * If the value is already an object or nullish, it is returned as-is.
 */
export function normalizeStyleProp(
  value: unknown,
): Record<string, string> | undefined {
  if (value == null) return undefined;
  if (typeof value === 'object') return value as Record<string, string>;
  if (typeof value !== 'string') return undefined;
  if (!value.trim()) return undefined;

  const result: Record<string, string> = {};
  for (const rule of value.split(';')) {
    const colonIdx = rule.indexOf(':');
    if (colonIdx === -1) continue;
    const property = rule.slice(0, colonIdx).trim();
    const val = rule.slice(colonIdx + 1).trim();
    if (!property || !val) continue;
    // kebab-case → camelCase
    const camel = property.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
    result[camel] = val;
  }
  return Object.keys(result).length ? result : undefined;
}

function normalizeRawComponents(input: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(input)) return [];
  return input.filter(isRecord);
}

function normalizeThemeUpdate(
  input: unknown
): Partial<Record<keyof ThemeTokens, string>> | undefined {
  if (!isRecord(input)) return undefined;

  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string') {
      normalized[key] = value;
    }
  }

  return Object.keys(normalized).length
    ? normalized as Partial<Record<keyof ThemeTokens, string>>
    : undefined;
}

function normalizeToolCall(input: unknown): UIInteractionDefinition['tool_call'] | undefined {
  if (!isRecord(input) || typeof input.name !== 'string') return undefined;

  return {
    name: input.name,
    parameters: isRecord(input.parameters) ? { ...input.parameters } : undefined,
  };
}

function normalizeInteractionDefinitions(input: unknown): UIInteractionDefinition[] | undefined {
  if (!Array.isArray(input)) return undefined;

  const normalized: UIInteractionDefinition[] = [];
  for (const entry of input) {
    if (!isRecord(entry)) continue;

    const trigger = entry.trigger;
    const action = entry.action;
    const description = entry.description;

    const toolBinding = normalizeToolCall(entry.tool_call);

    if (
      !VALID_TRIGGERS.has(trigger as UIInteractionDefinition['trigger'])
      || typeof action !== 'string'
      || typeof description !== 'string'
    ) {
      continue;
    }

    normalized.push({
      trigger: trigger as UIInteractionDefinition['trigger'],
      action,
      description,
      tool_call: toolBinding,
      targetIds: Array.isArray(entry.targetIds)
        ? entry.targetIds.filter((id): id is string => typeof id === 'string')
        : undefined,
      targetAction: normalizeOptionalString(entry.targetAction),
      url: normalizeOptionalString(entry.url),
      route: normalizeOptionalString(entry.route),
    });
  }

  return normalized.length ? normalized : undefined;
}

/**
 * Decode LLM output (YAML string) into a validated UIRenderSpec.
 * Robust to markdown fences, prose wrappers, and other LLM artifacts.
 */
export function decode(
  raw: string,
  catalog: ComponentCatalog
): UIRenderSpec {
  const logger = getLogger();
  const cleaned = extractYaml(raw);

  if (!cleaned.trim()) {
    logger.warn('[Translator.decode] Empty YAML after extraction. Raw LLM output:', raw.substring(0, 500));
    return withSpecVersion({ layout: 'stack', components: [] });
  }

  // Gracefully handle partial/truncated YAML like just "layout: "
  if (/^layout:\s*$/.test(cleaned.trim())) {
    logger.warn('[Translator.decode] LLM returned truncated YAML (only layout key). Raw:', raw.substring(0, 500));
    return withSpecVersion({ layout: 'stack', components: [] });
  }

let parsed: Record<string, unknown>;
  try {
    const fixedYaml = fixUnquotedSemicolons(cleaned);
    parsed = YAML.parse(fixedYaml);
  } catch (err) {
    logger.warn('[Translator.decode] YAML parse failed. Raw:', raw.substring(0, 500));
    throw new Error(
      `[Translator.decode] Could not parse YAML from LLM output.\n` +
      `Cleaned input:\n${cleaned}\n\n` +
      `Original input:\n${raw.substring(0, 500)}`
    );
  }

  if (!parsed || typeof parsed !== 'object') {
    logger.warn('[Translator.decode] YAML did not parse to object. Got:', parsed);
    return withSpecVersion({ layout: 'stack', components: [] });
  }

  const normalized = normalizeUISpecEnvelope(parsed);
  const layout = normalizeLayout(normalized.layout);
  const rawComponents = normalizeRawComponents(normalized.components);

  if ('components' in normalized && !Array.isArray(normalized.components)) {
    logger.warn('[Translator.decode] "components" is not an array. Falling back to empty components list.');
  }

  if (rawComponents.length === 0) {
    logger.warn('[Translator.decode] LLM returned YAML but no components. Parsed:', JSON.stringify(normalized).substring(0, 300));
  }

  const components: UIComponentSpec[] = rawComponents
    .map((raw) => decodeComponent(raw, catalog))
    .filter((c): c is UIComponentSpec => c !== null);

  return withSpecVersion({
    spec_version: normalized.spec_version as number | undefined,
    skill: normalizeOptionalString(normalized.skill),
    ux_rationale: normalizeOptionalString(normalized.ux_rationale),
    layout,
    components,
    profile_observation: normalizeOptionalString(normalized.profile_observation),
    theme_update: normalizeThemeUpdate(normalized.theme_update),
  });
}

function decodeComponent(
  raw: Record<string, unknown>,
  catalog: ComponentCatalog
): UIComponentSpec | null {
  const type = raw.type as string;
  if (!type) return null;

  const def = catalog.get(type);
  const rawProps = isRecord(raw.props) ? raw.props : {};
  let props = rawProps;

  if (def) {
    const parseResult = def.propsSchema.safeParse(rawProps);
    props = parseResult.success ? parseResult.data : rawProps;
  }

  // Coerce string style to object so React never receives a string
  if ('style' in props && typeof props.style === 'string') {
    props = { ...props, style: normalizeStyleProp(props.style) };
  }

  const rawChildren = Array.isArray(raw.children)
    ? raw.children.filter(isRecord)
    : undefined;
  const children = rawChildren
    ?.map((c) => decodeComponent(c, catalog))
    .filter((c): c is UIComponentSpec => c !== null);

  const rawInteractions = normalizeInteractionDefinitions(raw.interactions);

  return {
    id: (raw.id as string) ?? nextId(),
    type,
    props,
    interactions: rawInteractions?.length ? rawInteractions : undefined,
    bindTo: Array.isArray(raw.bindTo) ? raw.bindTo.filter(id => typeof id === 'string') : undefined,
    draggable: raw.draggable as boolean | undefined,
    children: children?.length ? children : undefined,
  };
}

// ─── Encoder ─────────────────────────────────────────────────────────────

/**
 * Encode a UI interaction into a semantic text description
 * for the LLM, taking context into account.
 */
export function encode(
  interaction: UIInteractionRecord,
  memory: ContextMemoryManager
): string {
  const ctx = memory.getContext();
  const parts: string[] = [];

  switch (interaction.action) {
    case 'change':
      parts.push(
        `Changed ${interaction.componentName}.${interaction.propName ?? 'value'} ` +
        `from ${JSON.stringify(interaction.previousValue)} ` +
        `to ${JSON.stringify(interaction.newValue)}`
      );
      break;
    case 'submit':
      parts.push(`Submitted ${interaction.componentName}`);
      if (interaction.newValue !== undefined) {
        parts.push(`with value ${JSON.stringify(interaction.newValue)}`);
      }
      break;
    case 'expand':
      parts.push(`Expanded ${interaction.componentName} to show more controls`);
      break;
    case 'collapse':
      parts.push(`Collapsed ${interaction.componentName}`);
      break;
    case 'connect':
      parts.push(`Connected ${interaction.componentName} to the workflow`);
      break;
    case 'disconnect':
      parts.push(`Disconnected ${interaction.componentName} from the workflow`);
      break;
    case 'drag_extend':
      parts.push(`Dragged to extend ${interaction.componentName}`);
      break;
    case 'drag_reorder':
      parts.push(`Reordered ${interaction.componentName} via drag`);
      break;
    case 'inline_edit':
      parts.push(`Inline edited ${interaction.componentName}.${interaction.propName ?? 'content'} to ${JSON.stringify(interaction.newValue)}`);
      break;
    case 'add_child':
      parts.push(`Added child to ${interaction.componentName}`);
      break;
    case 'remove':
      parts.push(`Removed ${interaction.componentName}`);
      break;
    case 'drop':
      parts.push(`Dropped ${interaction.componentName} onto ${interaction.targetIds?.join(',') || 'target'}`);
      if (interaction.semanticDescription) {
        parts.push(`- ${interaction.semanticDescription}`);
      }
      break;
    default:
      parts.push(`${interaction.componentName}(${interaction.elementId}) performed action: '${interaction.action}'`);
      if (interaction.semanticDescription) {
        parts.push(`Details: - ${interaction.semanticDescription}`);
      }
      break;
  }

  if (ctx.taskDescription) {
    parts.push(`[context: ${ctx.taskDescription}]`);
  }
  const workflowContext = ctx.workflowContext;
  if (workflowContext) {
    parts.push(`[workflow_context: ${workflowContext}]`);
  }
  if (interaction.targetIds && interaction.targetIds.length > 0) {
    parts.push(`(Targeted ${interaction.targetIds.join(', ')} with action '${interaction.targetAction || 'default'}')`);
  }

  return parts.join(' ');
}

/**
 * Encode the full current UI state + interactions as context
 * to feed back to the LLM as a tool result.
 */
export function encodeToolResult(
  memory: ContextMemoryManager
): string {
  const spec = memory.getCurrentSpec();
  if (!spec) return 'No UI is currently rendered.';

  const lines: string[] = ['## Tool Result: UI State'];
  for (const c of spec.components) {
    const propSummary = Object.entries(c.props)
      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
      .join(', ');
    lines.push(`- ${c.type} { ${propSummary} }`);
  }

  const recent = memory.getRecentInteractions(3);
  if (recent.length) {
    lines.push('');
    lines.push('## Recent Changes');
    for (const r of recent) {
      lines.push(`- ${r.semanticDescription ?? encode(r, memory)}`);
    }
  }

  return lines.join('\n');
}
