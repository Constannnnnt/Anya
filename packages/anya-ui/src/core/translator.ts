/**
 * ../core — Translator (Context-Aware Encoder / Decoder)
 *
 * Single responsibility: bidirectional translation between
 * LLM output (YAML) and UI render specs.
 *
 * Decoder: YAML → ViewSpec
 * Encoder: Interaction + Context → Semantic text for LLM
 */

import YAML from 'yaml';
import type { NodeCatalog } from './registry/catalog';
import type { ContextMemoryManager } from './memory/context';
import type { ViewSpec, ViewNode, UIInteractionRecord, UIInteractionDefinition, ThemeTokens } from './types';
import { getLogger } from './logging';
import { nextGeneratedId } from './id';

// ─── Decoder ─────────────────────────────────────────────────────────────

export interface StableSpecCandidate {
  raw: string;
  trimmedLineCount: number;
  retentionRatio: number;
}

function nextId(): string {
  return nextGeneratedId('ui');
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
      /^(spec_version:|skill:|layout:|ux_rationale:|profile_observation:|theme_update:|nodes:|  - type:|- type:)/.test(line.trim())
    );
    if (yamlStart >= 0) {
      text = lines.slice(yamlStart).join('\n').trim();
    }
  }

  return text;
}

function looksLikeYaml(text: string): boolean {
  const firstLine = text.split('\n')[0].trim();
  return /^(spec_version:|skill:|layout:|nodes:|---|\w+:)/.test(firstLine);
}

function buildYamlPrefixCandidates(rawYaml: string, maxTrims = 80): string[] {
  const lines = rawYaml.split('\n');
  const candidates: string[] = [];
  const seen = new Set<string>();
  const maxDrops = Math.min(Math.max(lines.length - 1, 0), maxTrims);

  for (let drop = 0; drop <= maxDrops; drop += 1) {
    const slice = lines.slice(0, lines.length - drop);
    while (slice.length > 0 && slice[slice.length - 1].trim() === '') {
      slice.pop();
    }
    const candidate = slice.join('\n').trim();
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    candidates.push(candidate);
  }

  return candidates;
}

function fixUnquotedSemicolons(text: string): string {
  return text.replace(
    /^([ \t]+)(allow|style|className|class):[ \t]+([^\r\n"#[{].*)$/gm,
    (match, indent, key, value) => {
      if (!value.includes(';')) {
        return match;
      }
      const escaped = value.replace(/"/g, '\\"');
      return `${indent}${key}: "${escaped}"`;
    }
  );
}

function parseYamlWithRepairs(rawYaml: string): unknown {
  try {
    return YAML.parse(rawYaml);
  } catch (rawError) {
    const repairedYaml = fixUnquotedSemicolons(rawYaml);
    if (repairedYaml !== rawYaml) {
      return YAML.parse(repairedYaml);
    }
    throw rawError;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function looksLikeSpecEnvelope(value: unknown): value is Record<string, unknown> {
  return isRecord(value)
    && 'layout' in value
    && 'nodes' in value;
}

function tryParseSpecEnvelope(rawYaml: string): boolean {
  try {
    const parsed = parseYamlWithRepairs(rawYaml);
    return looksLikeSpecEnvelope(parsed);
  } catch {
    return false;
  }
}

export function findStableSpecCandidate(
  raw: string,
  options?: {
    maxTrailingLineDrops?: number;
    minimumRetentionRatio?: number;
  }
): StableSpecCandidate | null {
  const cleaned = extractYaml(raw);
  const normalized = cleaned.trim();
  if (!normalized) return null;

  const candidates = buildYamlPrefixCandidates(
    normalized,
    options?.maxTrailingLineDrops ?? 80,
  );
  const minimumRetentionRatio = options?.minimumRetentionRatio ?? 0;
  const originalLineCount = normalized.split('\n').length;

  for (const candidate of candidates) {
    if (!tryParseSpecEnvelope(candidate)) continue;
    const retentionRatio = normalized.length > 0
      ? candidate.length / normalized.length
      : 1;
    if (retentionRatio < minimumRetentionRatio) continue;

    return {
      raw: candidate,
      trimmedLineCount: Math.max(0, originalLineCount - candidate.split('\n').length),
      retentionRatio,
    };
  }

  return null;
}

const VALID_LAYOUTS = new Set<ViewSpec['layout']>(['stack', 'row', 'grid', 'tabs', 'split']);
const LAYOUT_ALIASES: Record<string, ViewSpec['layout']> = {
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
  'onChange',
]);

function normalizeLayout(input: unknown): ViewSpec['layout'] {
  if (typeof input === 'string') {
    const normalized = input.trim().toLowerCase().replace(/_/g, '-');
    if (VALID_LAYOUTS.has(normalized as ViewSpec['layout'])) {
      return normalized as ViewSpec['layout'];
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

    // Normalize on/do shorthand aliases
    const trigger = entry.trigger ?? entry.on;
    const action = entry.action ?? entry.do;
    const description = typeof entry.description === 'string' ? entry.description : (typeof action === 'string' ? action : '');

    const toolBinding = normalizeToolCall(entry.tool_call);

    if (
      !VALID_TRIGGERS.has(trigger as UIInteractionDefinition['trigger'])
      || typeof action !== 'string'
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

function normalizeBindTargets(input: unknown): ViewNode['bindTo'] | undefined {
  if (!Array.isArray(input)) return undefined;

  const normalized: NonNullable<ViewNode['bindTo']> = [];

  for (const entry of input) {
    if (typeof entry === 'string') {
      const targetId = entry.trim();
      if (targetId) {
        normalized.push(targetId);
      }
      continue;
    }

    const targetId = isRecord(entry)
      ? (
        typeof entry.targetId === 'string'
          ? entry.targetId.trim()
          : typeof entry.id === 'string'
            ? entry.id.trim()
            : ''
      )
      : '';

    if (!targetId) {
      continue;
    }

    const rawTargetProp = isRecord(entry)
      ? (
        typeof entry.targetProp === 'string'
          ? entry.targetProp
          : typeof entry.prop === 'string'
            ? entry.prop
            : typeof entry.propName === 'string'
              ? entry.propName
              : typeof entry.path === 'string'
                ? entry.path
                : undefined
      )
      : undefined;

    normalized.push({
      targetId,
      targetProp: typeof rawTargetProp === 'string' && rawTargetProp.trim()
        ? rawTargetProp
        : undefined,
    });
  }

  return normalized.length > 0 ? normalized : undefined;
}

/**
 * Decode LLM output (YAML string) into a validated ViewSpec.
 * Robust to markdown fences, prose wrappers, and other LLM artifacts.
 */
export function decode(
  raw: string,
  catalog: NodeCatalog
): ViewSpec {
  const logger = getLogger();
  const cleaned = extractYaml(raw);

  if (!cleaned.trim()) {
    logger.warn('[Translator.decode] Empty YAML after extraction.');
    throw new Error('[Translator.decode] Empty YAML after extraction.');
  }

  // Gracefully handle partial/truncated YAML like just "layout: "
  if (/^layout:\s*$/.test(cleaned.trim())) {
    logger.warn('[Translator.decode] LLM returned truncated YAML (only layout key).');
    throw new Error('[Translator.decode] LLM returned truncated YAML (only layout key).');
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = parseYamlWithRepairs(cleaned) as Record<string, unknown>;
  } catch (err) {
    logger.warn('[Translator.decode] YAML parse failed.', err);
    throw new Error('[Translator.decode] Could not parse YAML from LLM output.');
  }

  if (!parsed || typeof parsed !== 'object') {
    logger.warn('[Translator.decode] YAML did not parse to object.');
    throw new Error('[Translator.decode] YAML did not parse to an object spec.');
  }

  const layout = normalizeLayout(parsed.layout);
  const rawComponents = normalizeRawComponents(parsed.nodes);

  if ('nodes' in parsed && !Array.isArray(parsed.nodes)) {
    logger.warn('[Translator.decode] "nodes" is not an array.');
    throw new Error('[Translator.decode] "nodes" must be an array.');
  }

  if (rawComponents.length === 0) {
    logger.warn('[Translator.decode] LLM returned YAML but no nodes.');
  }

  const nodes: ViewNode[] = rawComponents
    .map((raw) => decodeComponent(raw, catalog))
    .filter((c): c is ViewNode => c !== null);

  return {
    skill: normalizeOptionalString(parsed.skill),
    ux_rationale: normalizeOptionalString(parsed.ux_rationale),
    layout,
    nodes,
    profile_observation: normalizeOptionalString(parsed.profile_observation),
    theme_update: normalizeThemeUpdate(parsed.theme_update),
  };
}

function sanitizeRawProps(props: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (Array.isArray(v)) {
      result[k] = v.filter(item => item !== null && item !== undefined);
    } else {
      result[k] = v;
    }
  }
  return result;
}

function decodeComponent(
  raw: Record<string, unknown>,
  catalog: NodeCatalog
): ViewNode | null {
  const type = typeof raw.type === 'string' ? raw.type.trim() : '';
  if (!type) return null;

  const def = catalog.get(type);
  const rawProps = isRecord(raw.props) ? raw.props : {};
  let props = sanitizeRawProps(rawProps);

  if (def) {
    const parseResult = def.propsSchema.safeParse(props);
    if (parseResult.success) {
      props = parseResult.data;
    } else {
      getLogger().warn(`[Translator.decodeComponent] Validation failed for ${type}:`, parseResult.error.format());
    }
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
    .filter((c): c is ViewNode => c !== null);

  const rawInteractions = normalizeInteractionDefinitions(raw.interactions);
  const nodeId =
    typeof raw.id === 'string' && raw.id.trim().length > 0
      ? raw.id
      : nextId();
  const draggable = typeof raw.draggable === 'boolean'
    ? raw.draggable
    : undefined;

  return {
    id: nodeId,
    type,
    props,
    interactions: rawInteractions?.length ? rawInteractions : undefined,
    bindTo: normalizeBindTargets(raw.bindTo),
    draggable,
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
    case 'value_change':
      parts.push(
        `Changed ${interaction.nodeType}.${interaction.propName ?? 'value'} ` +
        `from ${JSON.stringify(interaction.previousValue)} ` +
        `to ${JSON.stringify(interaction.newValue)}`
      );
      break;
    case 'submit':
      parts.push(`Submitted ${interaction.nodeType}`);
      if (interaction.newValue !== undefined) {
        parts.push(`with value ${JSON.stringify(interaction.newValue)}`);
      }
      break;
    case 'expand':
      parts.push(`Expanded ${interaction.nodeType} to show more controls`);
      break;
    case 'collapse':
      parts.push(`Collapsed ${interaction.nodeType}`);
      break;
    case 'connect':
      parts.push(`Connected ${interaction.nodeType} to the workflow`);
      break;
    case 'disconnect':
      parts.push(`Disconnected ${interaction.nodeType} from the workflow`);
      break;
    case 'drag_extend':
      parts.push(`Dragged to extend ${interaction.nodeType}`);
      break;
    case 'drag_reorder':
      parts.push(`Reordered ${interaction.nodeType} via drag`);
      break;
    case 'inline_edit':
      parts.push(`Inline edited ${interaction.nodeType}.${interaction.propName ?? 'content'} to ${JSON.stringify(interaction.newValue)}`);
      break;
    case 'add_child':
      parts.push(`Added child to ${interaction.nodeType}`);
      break;
    case 'remove':
      parts.push(`Removed ${interaction.nodeType}`);
      break;
    case 'drop':
      parts.push(`Dropped ${interaction.nodeType} onto ${interaction.targetIds?.join(',') || 'target'}`);
      if (interaction.semanticDescription) {
        parts.push(`- ${interaction.semanticDescription}`);
      }
      break;
    default:
      parts.push(`${interaction.nodeType}(${interaction.nodeId}) performed action: '${interaction.action}'`);
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
  for (const c of spec.nodes) {
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
