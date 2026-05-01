import { describe, it, expect } from 'vitest';
import { decode, encode, findStableSpecCandidate, normalizeStyleProp } from '../translator';
import { NodeCatalog } from '../registry/catalog';
import { ContextMemoryManager } from '../memory/context';

describe('Translator', () => {
  const catalog = new NodeCatalog();
  const memory = new ContextMemoryManager();

  describe('decode()', () => {
    it('decodes a valid complete UI spec', () => {
      const rawText = `
spec_version: 1
layout: stack
ux_rationale: "Testing the decoder"
nodes:
  - id: test-1
    type: Heading
    props:
      text: "Hello World"
`;
      const result = decode(rawText, catalog);
      expect(result).not.toBeNull();

      expect(result?.layout).toBe('stack');
      expect(result?.ux_rationale).toBe('Testing the decoder');
      expect(result?.nodes).toHaveLength(1);
      if (result?.nodes) {
        expect(result.nodes[0].type).toBe('Heading');
        expect(result.nodes[0].props.text).toBe('Hello World'); } });

    it('handles markdown code fences by stripping them out', () => {
      const rawText = "```yaml\nspec_version: 1\nlayout: stack\nnodes: []\n```";
      const result = decode(rawText, catalog);
      expect(result).not.toBeNull();
      expect(result?.layout).toBe('stack'); });

    it('keeps spec_version when YAML is preceded by prose', () => {
      const rawText = `
Here is your updated UI spec:
spec_version: 1
layout: grid
nodes: []
`;
      const result = decode(rawText, catalog);

      expect(result.layout).toBe('grid'); });

    it('preserves profile observations in decoded specs', () => {
      const rawText = `
spec_version: 1
layout: stack
profile_observation: "User prefers compact card layouts."
nodes: []
`;
      const result = decode(rawText, catalog);
      expect(result.profile_observation).toBe('User prefers compact card layouts.'); });

    it('throws for empty input', () => {
      expect(() => decode("", catalog)).toThrow(/Empty YAML after extraction/); });

    it('throws an error for unparseable YAML', () => {
      const rawText = `
layout: stack
nodes:
  - id: t1
  type: bad_indentation
`;
      expect(() => decode(rawText, catalog)).toThrow(); });



    it('rejects invalid layouts', () => {
      const rawText = `
spec_version: 1
layout: masonry
nodes:
  - type: Heading
    props:
      text: "Unsupported layout"
`;
      expect(() => decode(rawText, catalog)).toThrow(/Unsupported layout/); });

    it('accepts flex-row layout alias and normalizes to row', () => {
      const rawText = `
spec_version: 1
layout: flex-row
nodes: []
`;
      const result = decode(rawText, catalog);
      expect(result.layout).toBe('row'); });

    it('accepts flex_col layout alias and normalizes to stack', () => {
      const rawText = `
spec_version: 1
layout: flex_col
nodes: []
`;
      const result = decode(rawText, catalog);
      expect(result.layout).toBe('stack'); });

    it('accepts split-view layout alias and normalizes to split', () => {
      const rawText = `
spec_version: 1
layout: split-view
nodes: []
`;
      const result = decode(rawText, catalog);
      expect(result.layout).toBe('split'); });

    it('throws when nodes is not an array', () => {
      const rawText = `
spec_version: 1
layout: stack
nodes: "not-an-array"
`;
      expect(() => decode(rawText, catalog)).toThrow(/nodes.*array/i); });

    it('sanitizes malformed interactions and props safely', () => {
      const rawText = `
spec_version: 1
layout: stack
nodes:
  - id: c-1
    type: Card
    props: "invalid-props-shape"
    interactions:
      - trigger: onClick
        action: open
        description: "Open card"
      - trigger: badTrigger
        action: nope
        description: "bad"
`;
      const result = decode(rawText, catalog);
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].props).toEqual({ });
      expect(result.nodes[0].interactions).toHaveLength(1);
      expect(result.nodes[0].interactions?.[0].trigger).toBe('onClick'); });

    it('preserves onChange interactions for input nodes', () => {
      const rawText = `
spec_version: 1
layout: stack
nodes:
  - id: input-1
    type: TextInput
    props:
      value: ""
    interactions:
      - trigger: onChange
        action: filter_results
        description: "Filter results while typing"
`;
      const result = decode(rawText, catalog);
      expect(result.nodes[0].interactions).toEqual([
        {
          trigger: 'onChange',
          action: 'filter_results',
          description: 'Filter results while typing',
          tool_call: undefined,
          targetIds: undefined,
          targetAction: undefined,
          url: undefined,
          route: undefined, },
      ]); });

    it('normalizes mapped bindTo targets for component and data bindings', () => {
      const rawText = `
spec_version: 1
layout: stack
nodes:
  - id: slider-1
    type: Slider
    props:
      value: 10
    bindTo:
      - label-1
      - targetId: chart-1
        targetProp: datasets[0].data[0]
      - targetId: params
        path: hidden
`;
      const result = decode(rawText, catalog);
      expect(result.nodes[0].bindTo).toEqual([
        'label-1',
        {
          targetId: 'chart-1',
          targetProp: 'datasets[0].data[0]', },
        {
          targetId: 'params',
          targetProp: 'hidden', },
      ]); });

    it('drops nodes with non-string types and auto-generates ids for invalid ids', () => {
      const rawText = `
spec_version: 1
layout: stack
nodes:
  - id: bad-1
    type:
      nested: object
    props: { }
  - id: 123
    type: Text
    props:
      text: "Valid"
`;
      const result = decode(rawText, catalog);
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].type).toBe('Text');
      expect(typeof result.nodes[0].id).toBe('string');
      expect(result.nodes[0].id).not.toBe('123'); });

    it('decodes interaction tool_call and preserves parameter value types', () => {
      const rawText = `
spec_version: 1
layout: stack
nodes:
  - id: c-1
    type: Button
    props:
      text: "Rotate"
    interactions:
      - trigger: onClick
        action: rotate
        description: "Rotate image"
        tool_call:
          name: rotate-image
          parameters:
            angle: 90
            clockwise: true
`;
      const result = decode(rawText, catalog);
      const interaction = result.nodes[0].interactions?.[0];
      expect(interaction?.tool_call?.name).toBe('rotate-image');
      expect(interaction?.tool_call?.parameters).toEqual({
        angle: 90,
        clockwise: true, }); });

    it('normalizes a string style prop to a camelCased object', () => {
      const rawText = `
spec_version: 1
layout: stack
nodes:
  - id: styled-1
    type: Card
    props:
      title: "Styled Card"
      style: "color: red; font-size: 14px; margin-right: 2em"
`;
      const result = decode(rawText, catalog);
      expect(result.nodes[0].props.style).toEqual({
        color: 'red',
        fontSize: '14px',
        marginRight: '2em', }); });

    it('handles colons inside CSS values (e.g. URLs)', () => {
      const rawText = `
spec_version: 1
layout: stack
nodes:
  - id: bg-1
    type: Card
    props:
      style: "background: url(https://example.com/img.png)"
`;
      const result = decode(rawText, catalog);
      expect(result.nodes[0].props.style).toEqual({
        background: 'url(https://example.com/img.png)', }); });

    it('does not re-parse an already-object style prop', () => {
      const objInput = { color: 'blue', fontSize: '16px' };
      expect(normalizeStyleProp(objInput)).toBe(objInput); });

    it('preserves YAML flow mapping style props without corruption', () => {
      const rawText = `
spec_version: 1
layout: stack
nodes:
  - id: flow-1
    type: Card
    props:
      title: "Flow Style"
      style: {color: red, fontSize: 14px }
`;
      const result = decode(rawText, catalog);
      expect(result.nodes[0].props.style).toEqual({
        color: 'red',
        fontSize: '14px', }); });

    it('preserves nested style maps without corrupting recovery-style YAML', () => {
      const rawText = `
spec_version: 1
layout: split
nodes:
  - id: badge-1
    type: Badge
    props:
      text: "Total: ~124M"
      variant: "primary"
      style:
        fontSize: "var(--anya-text-lg)"
        padding: "var(--anya-space-3)"
`;
      const result = decode(rawText, catalog);
      expect(result.nodes[0].props.style).toEqual({
        fontSize: 'var(--anya-text-lg)',
        padding: 'var(--anya-space-3)', }); });

    it('finds a stable trailing-prefix candidate for truncated specs', () => {
      const rawText = `
spec_version: 1
layout: stack
nodes:
  - id: text-1
    type: Text
    props:
      content: "Hello"
  - id: card-1
    type: Card
    props:
      title: "Details"
    interactions:
      - trigger: onClick
        description: "Unclosed
`;
      const candidate = findStableSpecCandidate(rawText, { minimumRetentionRatio: 0.5 });
      expect(candidate).not.toBeNull();
      expect(candidate?.raw).toContain('title: "Details"');
      expect(candidate?.trimmedLineCount).toBeGreaterThan(0); });

    it('returns null when no valid spec envelope can be salvaged', () => {
      const rawText = `
layout:
  nested: invalid
bad_key:
  - type:
      broken: true
`;
      expect(findStableSpecCandidate(rawText)).toBeNull(); }); });

  describe('encode()', () => {
    it('encodes a simple click action', () => {
      const result = encode({
        timestamp: Date.now(),
        nodeId: 'btn-1',
        nodeType: 'Button',
        action: 'custom',
        semanticDescription: 'User clicked submit' }, memory);
      expect(result).toBe("Button(btn-1) performed action: 'custom' Details: - User clicked submit"); });

    it('encodes a targeted broadcast action', () => {
      const result = encode({
        timestamp: Date.now(),
        nodeId: 'btn-1',
        nodeType: 'Button',
        action: 'custom',
        semanticDescription: 'User clicked play',
        targetIds: ['vid-1', 'vid-2'],
        targetAction: 'play' }, memory);
      expect(result).toBe("Button(btn-1) performed action: 'custom' Details: - User clicked play (Targeted vid-1, vid-2 with action 'play')"); });

    it('encodes a drag-and-drop spatial relocation', () => {
      const result = encode({
        timestamp: Date.now(),
        nodeId: 'item-2',
        nodeType: 'Card',
        action: 'drop',
        targetIds: ['zone-1'],
        semanticDescription: 'User dropped Card onto zone-1' }, memory);
      expect(result).toBe("Dropped Card onto zone-1 - User dropped Card onto zone-1 (Targeted zone-1 with action 'default')"); }); }); });
