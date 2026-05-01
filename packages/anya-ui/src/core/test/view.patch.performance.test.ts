import { describe, expect, it } from 'vitest';
import type { ActionBinding, ViewPlan } from '../views/types';
import type { ViewSpec } from '../views/types';
import {
  applyLocalViewChanges,
  applyViewChanges,
  applyViewPlan, } from '../views/updater';

describe('view patch performance behavior', () => {
  it('avoids spec cloning for binding-only operations', () => {
    const spec: ViewSpec = {
      layout: 'stack',
      nodes: [
        {
          id: 'text-1',
          type: 'Text',
          props: { content: 'A' }, },
      ], };
    const bindings: ActionBinding[] = [];

    const result = applyViewChanges(spec, bindings, [
      {
        type: 'upsert_binding',
        binding: {
          id: 'binding-1',
          nodeId: 'text-1',
          actionMatch: 'custom',
          action: {
            type: 'local_patch',
            patches: [], }, }, },
    ]);

    expect(result.spec).toBe(spec);
    expect(result.bindings).not.toBe(bindings);
    expect(result.bindings).toHaveLength(1); });

  it('preserves untouched branch references for local patch updates', () => {
    const spec: ViewSpec = {
      layout: 'stack',
      nodes: [
        {
          id: 'left',
          type: 'Card',
          props: { title: 'Left' },
          children: [
            {
              id: 'left-child',
              type: 'Text',
              props: { content: 'old' }, },
          ], },
        {
          id: 'right',
          type: 'Card',
          props: { title: 'Right' }, },
      ], };

    const result = applyLocalViewChanges(
      spec,
      [
        {
          targetId: 'left-child',
          propName: 'content',
          value: 'new', },
      ],
      (value) => value
    );

    expect(result.applied).toBe(1);
    expect(result.updatedSpec).not.toBe(spec);
    expect(result.updatedSpec.nodes[1]).toBe(spec.nodes[1]);
    expect(result.updatedSpec.nodes[0]).not.toBe(spec.nodes[0]);
    expect(result.updatedSpec.nodes[0].children?.[0].props.content).toBe('new'); });

  it('escalates to rebuild when patch operation budget is exceeded', () => {
    const spec: ViewSpec = {
      layout: 'stack',
      nodes: [
        {
          id: 'text-1',
          type: 'Text',
          props: { content: 'A' }, },
      ], };

    const plan: ViewPlan = {
      plan_version: 0,
      mode: 'patch',
      confidence: 0.9,
      ui_spec: spec,
      bindings: [],
      operations: Array.from({ length: 120 }, (_, index) => ({
        type: 'upsert_binding' as const,
        binding: {
          id: `binding-${index }`,
          nodeId: 'text-1',
          actionMatch: 'custom',
          action: {
            type: 'local_patch' as const,
            patches: [], }, }, })), };

    const applied = applyViewPlan(spec, [], plan, {
      maxPatchOperations: 100,
      maxPatchOperationsPerNode: 200, });

    expect(applied.modeApplied).toBe('rebuild');
    expect(applied.rebuildEscalated).toBe(true);
    expect(applied.appliedOperations).toBe(0); }); });
