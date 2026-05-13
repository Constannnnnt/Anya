import { describe, it, expect } from 'vitest';
import { parse } from '../parse';
import { isContent, isAction, isInput, isGroup } from '../spec';

describe('parse', () => {
  it('parses plain markdown as content nodes', () => {
    const spec = parse('# Hello\n\nSome text here.');
    expect(spec.nodes).toHaveLength(1);
    expect(isContent(spec.nodes[0])).toBe(true);
    if (isContent(spec.nodes[0])) {
      expect(spec.nodes[0].markdown).toContain('# Hello');
    }
  });

  it('parses action blocks', () => {
    const input = `Some text

\`\`\`action
name: do_thing
label: Do the Thing
params:
  id: 42
\`\`\`
`;
    const spec = parse(input);
    expect(spec.nodes).toHaveLength(2);
    expect(isContent(spec.nodes[0])).toBe(true);
    expect(isAction(spec.nodes[1])).toBe(true);
    if (isAction(spec.nodes[1])) {
      expect(spec.nodes[1].action).toBe('do_thing');
      expect(spec.nodes[1].label).toBe('Do the Thing');
      expect(spec.nodes[1].params).toEqual({ id: 42 });
    }
  });

  it('parses input blocks with fields', () => {
    const input = `\`\`\`input
name: add_task
label: New Task
submit: Add
fields:
  - name: title
    type: text
    placeholder: What needs doing?
  - name: priority
    type: select
    options: [high, medium, low]
\`\`\`
`;
    const spec = parse(input);
    expect(spec.nodes).toHaveLength(1);
    expect(isInput(spec.nodes[0])).toBe(true);
    if (isInput(spec.nodes[0])) {
      expect(spec.nodes[0].input).toBe('add_task');
      expect(spec.nodes[0].label).toBe('New Task');
      expect(spec.nodes[0].submit).toBe('Add');
      expect(spec.nodes[0].fields).toHaveLength(2);
      expect(spec.nodes[0].fields[0].name).toBe('title');
      expect(spec.nodes[0].fields[1].options).toEqual(['high', 'medium', 'low']);
    }
  });

  it('parses group blocks with nested content', () => {
    const input = `\`\`\`group
layout: row
\`\`\`

**Revenue**: $42k

**Users**: 1,204

\`\`\`end
\`\`\`
`;
    const spec = parse(input);
    expect(spec.nodes).toHaveLength(1);
    expect(isGroup(spec.nodes[0])).toBe(true);
    if (isGroup(spec.nodes[0])) {
      expect(spec.nodes[0].layout).toBe('row');
      expect(spec.nodes[0].content).toHaveLength(1);
      expect(isContent(spec.nodes[0].content[0])).toBe(true);
    }
  });

  it('handles mixed content and affordances', () => {
    const input = `# Tasks

Here are your tasks:

\`\`\`action
name: complete
label: Mark done
\`\`\`

\`\`\`action
name: skip
label: Skip
\`\`\`

More content after.
`;
    const spec = parse(input);
    expect(spec.nodes).toHaveLength(4);
    expect(isContent(spec.nodes[0])).toBe(true);
    expect(isAction(spec.nodes[1])).toBe(true);
    expect(isAction(spec.nodes[2])).toBe(true);
    expect(isContent(spec.nodes[3])).toBe(true);
  });

  it('preserves unknown fenced blocks as markdown code blocks', () => {
    const input = `\`\`\`python
print("hello")
\`\`\`
`;
    const spec = parse(input);
    expect(spec.nodes).toHaveLength(1);
    expect(isContent(spec.nodes[0])).toBe(true);
    if (isContent(spec.nodes[0])) {
      expect(spec.nodes[0].markdown).toContain('```python');
      expect(spec.nodes[0].markdown).toContain('print("hello")');
    }
  });

  it('handles nested groups', () => {
    const input = `\`\`\`group
layout: row
\`\`\`

\`\`\`group
layout: stack
\`\`\`

Inner content

\`\`\`end
\`\`\`

Outer content

\`\`\`end
\`\`\`
`;
    const spec = parse(input);
    expect(spec.nodes).toHaveLength(1);
    expect(isGroup(spec.nodes[0])).toBe(true);
    if (isGroup(spec.nodes[0])) {
      expect(spec.nodes[0].layout).toBe('row');
      expect(spec.nodes[0].content).toHaveLength(2);
      // First child is a nested group
      const inner = spec.nodes[0].content[0];
      expect(isGroup(inner)).toBe(true);
      if (isGroup(inner)) {
        expect(inner.layout).toBe('stack');
        expect(inner.content).toHaveLength(1);
      }
      // Second child is content
      expect(isContent(spec.nodes[0].content[1])).toBe(true);
    }
  });

  it('survives malformed YAML in action blocks', () => {
    const input = `\`\`\`action
name: [broken
  yaml: {unclosed
\`\`\`
`;
    const spec = parse(input);
    // Should not throw, malformed block becomes null (dropped)
    expect(spec.nodes).toHaveLength(0);
  });

  it('survives malformed YAML in input blocks', () => {
    const input = `Text before

\`\`\`input
fields: not_a_list
\`\`\`
`;
    const spec = parse(input);
    // Content node + the input with empty fields
    expect(spec.nodes.length).toBeGreaterThanOrEqual(1);
  });
});
