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

function parseActionBlock(body: string): ActionNode {
  const parsed = YAML.parse(body) as Record<string, unknown>;
  const node: ActionNode = {
    action: String(parsed.name ?? parsed.action ?? ''),
    label: String(parsed.label ?? parsed.name ?? ''),
  };
  if (parsed.params) node.params = parsed.params as Record<string, unknown>;
  if (parsed.confirm) node.confirm = String(parsed.confirm);
  if (parsed.disabled) node.disabled = Boolean(parsed.disabled);
  return node;
}

function parseInputBlock(body: string): InputNode {
  const parsed = YAML.parse(body) as Record<string, unknown>;
  const node: InputNode = {
    input: String(parsed.name ?? parsed.input ?? ''),
    fields: Array.isArray(parsed.fields) ? parsed.fields : [],
  };
  if (parsed.label) node.label = String(parsed.label);
  if (parsed.submit) node.submit = String(parsed.submit);
  return node;
}

function parseGroupBlock(body: string): { layout?: GroupNode['layout'] } {
  const parsed = YAML.parse(body) as Record<string, unknown>;
  const result: { layout?: GroupNode['layout'] } = {};
  if (parsed.layout) result.layout = parsed.layout as GroupNode['layout'];
  return result;
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
  const nodes: SpecNode[] = [];
  let i = 0;

  while (i < segments.length) {
    const seg = segments[i];

    if (seg.type === 'fenced' && seg.lang === 'group') {
      const groupMeta = parseGroupBlock(seg.content);
      const groupContent: SpecNode[] = [];
      i++;
      while (i < segments.length) {
        const inner = segments[i];
        if (inner.type === 'fenced' && inner.lang === 'end') {
          i++;
          break;
        }
        const node = segmentToNode(inner);
        if (node) groupContent.push(node);
        i++;
      }
      nodes.push({ layout: groupMeta.layout ?? 'stack', content: groupContent } as GroupNode);
      continue;
    }

    const node = segmentToNode(seg);
    if (node) nodes.push(node);
    i++;
  }

  return { nodes };
}
