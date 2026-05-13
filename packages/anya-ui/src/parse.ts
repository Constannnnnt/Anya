import YAML from 'yaml';
import type { Spec, SpecNode, ActionNode, InputNode, GroupNode, ContentNode } from './spec';

const FENCE_RE = /^```(\w*)\s*$/;

interface Segment {
  type: 'markdown' | 'fenced';
  content: string;
  lang?: string;
}

function splitFences(raw: string): Segment[] {
  const lines = raw.split('\n');
  const segments: Segment[] = [];
  let current: string[] = [];
  let inFence = false;
  let fenceLang = '';

  for (const line of lines) {
    const match = line.match(FENCE_RE);
    if (match && !inFence) {
      if (current.length > 0) {
        segments.push({ type: 'markdown', content: current.join('\n') });
        current = [];
      }
      inFence = true;
      fenceLang = match[1];
    } else if (match && inFence && match[1] === '') {
      segments.push({ type: 'fenced', content: current.join('\n'), lang: fenceLang });
      current = [];
      inFence = false;
      fenceLang = '';
    } else {
      current.push(line);
    }
  }

  if (current.length > 0) {
    if (inFence) {
      segments.push({ type: 'fenced', content: current.join('\n'), lang: fenceLang });
    } else {
      segments.push({ type: 'markdown', content: current.join('\n') });
    }
  }

  return segments;
}

function parseActionBlock(body: string): ActionNode | null {
  try {
    const parsed = YAML.parse(body) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return null;
    const node: ActionNode = {
      action: String(parsed.name ?? parsed.action ?? ''),
      label: String(parsed.label ?? parsed.name ?? ''),
    };
    if (parsed.params && typeof parsed.params === 'object') {
      node.params = parsed.params as Record<string, unknown>;
    }
    if (parsed.confirm) node.confirm = String(parsed.confirm);
    if (parsed.disabled) node.disabled = Boolean(parsed.disabled);
    return node;
  } catch {
    return null;
  }
}

function parseInputBlock(body: string): InputNode | null {
  try {
    const parsed = YAML.parse(body) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return null;
    const node: InputNode = {
      input: String(parsed.name ?? parsed.input ?? ''),
      fields: Array.isArray(parsed.fields) ? parsed.fields : [],
    };
    if (parsed.label) node.label = String(parsed.label);
    if (parsed.submit) node.submit = String(parsed.submit);
    return node;
  } catch {
    return null;
  }
}

function parseGroupBlock(body: string): { layout?: GroupNode['layout'] } {
  try {
    const parsed = YAML.parse(body) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return {};
    const result: { layout?: GroupNode['layout'] } = {};
    if (parsed.layout) result.layout = parsed.layout as GroupNode['layout'];
    return result;
  } catch {
    return {};
  }
}

function segmentToNode(seg: Segment): SpecNode | null {
  if (seg.type === 'markdown') {
    const trimmed = seg.content.trim();
    return trimmed ? { markdown: trimmed } as ContentNode : null;
  }
  if (seg.lang === 'action') return parseActionBlock(seg.content);
  if (seg.lang === 'input') return parseInputBlock(seg.content);
  const trimmed = seg.content.trim();
  if (trimmed) return { markdown: '```' + (seg.lang ?? '') + '\n' + trimmed + '\n```' } as ContentNode;
  return null;
}

export function parse(raw: string): Spec {
  const segments = splitFences(raw);
  const result = parseSegments(segments, 0);
  return { nodes: result.nodes };
}

function parseSegments(
  segments: Segment[],
  start: number
): { nodes: SpecNode[]; end: number } {
  const nodes: SpecNode[] = [];
  let i = start;

  while (i < segments.length) {
    const seg = segments[i];

    if (seg.type === 'fenced' && seg.lang === 'end') {
      return { nodes, end: i + 1 };
    }

    if (seg.type === 'fenced' && seg.lang === 'group') {
      const groupMeta = parseGroupBlock(seg.content);
      const inner = parseSegments(segments, i + 1);
      nodes.push({ layout: groupMeta.layout ?? 'stack', content: inner.nodes } as GroupNode);
      i = inner.end;
      continue;
    }

    const node = segmentToNode(seg);
    if (node) nodes.push(node);
    i++;
  }

  return { nodes, end: i };
}
