import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { z } from 'zod';
import {
  AdaptiveRenderer,
  AnyaProvider,
  useAnyaUI, } from '../index';
import type { AnyaNode } from '../defineComponent';

const nodes: AnyaNode[] = [
  {
    name: 'Heading',
    description: 'Heading component',
    propsSchema: z.object({ text: z.string() }),
    render: ({ props }) => <h1>{String((props as { text: string }).text) }</h1>, },
];

describe('react public API surface', () => {
  it('exports AdaptiveRenderer as the primary renderer', () => {
    expect(AdaptiveRenderer).toBeDefined();
    expect(typeof AdaptiveRenderer).toBe('function'); });

  it('exposes useAnyaUI with the view-first API surface', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AnyaProvider nodes={nodes }>
        {children }
      </AnyaProvider>
    );

    const { result } = renderHook(() => useAnyaUI(), { wrapper });

    await act(async () => {
      await Promise.resolve(); });

    expect(result.current.viewState).toBeDefined();
    expect(result.current.planView).toBeInstanceOf(Function);
    expect(result.current.applyViewPlan).toBeInstanceOf(Function);
    expect(result.current.publishView).toBeInstanceOf(Function);
    expect(result.current.createViewChangeDraft).toBeInstanceOf(Function);
    expect(result.current.reviewViewChangeDraft).toBeInstanceOf(Function);
    expect(result.current.applyViewChangeToApp).toBeInstanceOf(Function);
    expect(result.current.applyViewChangeToTemplate).toBeInstanceOf(Function);
    expect(result.current.getViewChangePreview).toBeInstanceOf(Function);
    expect('presentationState' in result.current).toBe(false);
    expect('planPresentation' in result.current).toBe(false);
    expect('commitPresentationPlan' in result.current).toBe(false);
    expect('publishSpec' in result.current).toBe(false); });

  it('lets useAnyaUI update shared state', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AnyaProvider nodes={nodes }>
        {children }
      </AnyaProvider>
    );

    const { result } = renderHook(() => useAnyaUI(), { wrapper });

    await act(async () => {
      await Promise.resolve(); });

    await act(async () => {
      result.current.context.stateGraph.upsertNode({ id: 'filters', kind: 'data', payload: { } });
      result.current.context.stateGraph.setNodeValue('filters', 'query.text', 'adaptive ui'); });

    expect(result.current.context.stateGraph.getNode('filters')).toEqual(
      expect.objectContaining({
        payload: {
          query: {
            text: 'adaptive ui', }, }, }),
    );
    expect(result.current.context.stateGraph.getNodes()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'filters' }),
      ]),
    ); }); });
