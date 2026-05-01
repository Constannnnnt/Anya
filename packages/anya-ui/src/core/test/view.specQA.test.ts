import { describe, expect, it } from 'vitest';
import {
  enforceButtonOnClickContract,
  validateSpecForPublish, } from '../views/specQA';
import type { ViewSpec } from '../views/types';

function makeBaseSpec(): ViewSpec {
  return {
    spec_version: 1,
    layout: 'stack',
    nodes: [
      {
        id: 'btn-1',
        type: 'Button',
        props: { label: 'Open' },
        interactions: [
          {
            trigger: 'onClick',
            action: 'open_link',
            description: 'Open https://example.com',
            tool_call: {
              name: 'open_url',
              parameters: { url: 'https://example.com' }, }, },
        ], },
    ], }; }

describe('validateSpecForPublish', () => {
  it('accepts canonical row and split root layouts', () => {
    const rowSpec: ViewSpec = {
      layout: 'row',
      nodes: [{ id: 'c-1', type: 'Text', props: { content: 'left-right flow' } }], };
    const splitSpec: ViewSpec = {
      layout: 'split',
      nodes: [{ id: 'c-2', type: 'Text', props: { content: 'two panes' } }], };

    expect(validateSpecForPublish(rowSpec).valid).toBe(true);
    expect(validateSpecForPublish(splitSpec).valid).toBe(true); });

  it('fails unknown tools even when explicit URL fields are present', () => {
    const spec = makeBaseSpec();
    spec.nodes[0].interactions![0].url = 'https://example.com';
    const result = validateSpecForPublish(spec, {
      knownTools: new Set(['rotateImage']), });
    expect(result.valid).toBe(false);
    expect(result.failures.some((failure) => failure.code === 'tool_call_unknown_tool')).toBe(true); });

  it('detects duplicate node ids', () => {
    const spec: ViewSpec = {
      layout: 'stack',
      nodes: [
        { id: 'x', type: 'Text', props: { } },
        { id: 'x', type: 'Text', props: { } },
      ], };
    const result = validateSpecForPublish(spec);
    expect(result.failures.some((failure) => failure.code === 'node_id_duplicate')).toBe(true); }); });

describe('enforceButtonOnClickContract', () => {
  it('adds a required onClick interaction to button missing click action', () => {
    const spec: ViewSpec = {
      layout: 'stack',
      nodes: [
        {
          id: 'btn-no-click',
          type: 'Button',
          props: { label: 'No click' }, },
      ], };

    const repaired = enforceButtonOnClickContract(spec);
    expect(repaired.repairedButtonIds).toEqual(['btn-no-click']);

    const validation = validateSpecForPublish(repaired.spec, {
      requireButtonOnClick: true, });
    expect(validation.failures.some((failure) => failure.code === 'button_missing_onclick')).toBe(false); }); });
