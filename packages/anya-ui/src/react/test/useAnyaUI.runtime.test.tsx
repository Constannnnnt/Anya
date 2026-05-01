import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { z } from 'zod';
import { AnyaProvider } from '../Provider';
import { useAnyaUI } from '../hooks/useAnyaUI';
import type { AnyaNode } from '../defineComponent';
import {
  collectAgentSessionEvents,
  collectArtifactsFromSessionEvents, } from '../../core';
import type {
  AgentSessionTransport,
  ViewPlan, } from '../../core';

import { InMemoryStorage } from '../../core';

const mockNodes: AnyaNode[] = [
  {
    name: 'Heading',
    description: 'A heading component',
    propsSchema: z.object({ text: z.string() }),
    render: ({ props }) => <h1>{props.text }</h1>, },
];

describe('useAnyaUI runtime integration', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear(); } });

  it('routes intent/spec/interaction updates through runtime effects', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AnyaProvider nodes={mockNodes }>
        {children }
      </AnyaProvider>
    );

    const { result } = renderHook(() => useAnyaUI(), { wrapper });

    await act(async () => {
      await Promise.resolve(); });

    await act(async () => {
      result.current.setUserIntent('Build a profile editor');
      result.current.publishView({
        skill: 'profile_edit',
        layout: 'stack',
        nodes: [{ id: 'h1', type: 'Heading', props: { text: 'Profile' } }], });
      result.current.recordInteraction({
        timestamp: 1,
        nodeId: 'h1',
        nodeType: 'Heading',
        action: 'custom',
        semanticDescription: 'Clicked profile title', }); });

    const memory = result.current.context.sessionMemory;
    expect(memory.getContext().userIntent).toBe('Build a profile editor');
    expect(memory.getContext().workflowContext).toBe('profile_edit');
    expect(memory.getCurrentSpec()?.nodes[0].id).toBe('h1');
    expect(memory.getRecentInteractions(1)[0].semanticDescription).toBe('Clicked profile title'); });

  it('supports replace intent mode to clear volatile UI session context', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AnyaProvider nodes={mockNodes }>
        {children }
      </AnyaProvider>
    );

    const { result } = renderHook(() => useAnyaUI(), { wrapper });

    await act(async () => {
      await Promise.resolve(); });

    await act(async () => {
      result.current.publishView({
        skill: 'profile_edit',
        layout: 'stack',
        nodes: [{ id: 'h1', type: 'Heading', props: { text: 'Profile A' } }], });
      result.current.recordInteraction({
        timestamp: 1,
        nodeId: 'h1',
        nodeType: 'Heading',
        action: 'custom',
        semanticDescription: 'Opened old profile', }); });

    await act(async () => {
      result.current.setUserIntent('Introduce Sara Hooker', 'replace'); });

    expect(result.current.context.sessionMemory.getCurrentSpec()).toBeNull();
    expect(result.current.context.sessionMemory.getInteractions()).toHaveLength(0);
    expect(result.current.viewState.currentSpec).toBeNull();
    expect(result.current.viewState.bindings).toHaveLength(0);
    expect(result.current.context.sessionMemory.getContext().userIntent).toBe('Introduce Sara Hooker'); });

  it('emits ui.presented and interaction.measured with safe derived telemetry', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AnyaProvider nodes={mockNodes }>
        {children }
      </AnyaProvider>
    );

    const { result } = renderHook(() => useAnyaUI(), { wrapper });

    await act(async () => {
      await Promise.resolve(); });

    const presentedEvents: Array<{
      id: string;
      kind: 'generated' | 'app';
      componentCount: number;
      interactiveCount: number;
      actionableCount: number;
      componentFamilies: string[];
      actionFamilies: string[]; }> = [];
    const measuredEvents: Array<{
      interactionEventId: string;
      nodeId: string;
      nodeType: string;
      action: string;
      measurement: any; }> = [];

    const unsubscribePresented = result.current.subscribeRuntimeEvents('ui.presented', (event) => {
      if (event.type === 'ui.presented') {
        presentedEvents.push(event.payload.view); } });
    const unsubscribeMeasured = result.current.subscribeRuntimeEvents('interaction.measured', (event) => {
      if (event.type === 'interaction.measured') {
        measuredEvents.push(event.payload); } });

    await act(async () => {
      result.current.publishView({
        layout: 'stack',
        nodes: [
          {
            id: 'cta',
            type: 'Heading',
            props: { text: 'Call to action' },
            interactions: [
              {
                trigger: 'onClick',
                action: 'submit',
                description: 'Submit the form', },
            ], },
        ], });
      result.current.recordInteraction({
        timestamp: 1,
        nodeId: 'input-1',
        nodeType: 'TextInput',
        action: 'change',
        propName: 'value',
        previousValue: 'old',
        newValue: 'new secret',
        semanticDescription: 'User updated text input', }, {
        modality: 'keyboard',
        targetWidthPx: 240,
        targetHeightPx: 44, }); });

    unsubscribePresented();
    unsubscribeMeasured();

    expect(presentedEvents).toHaveLength(1);
    expect(presentedEvents[0]).toMatchObject({
      kind: 'generated',
      componentCount: 1,
      interactiveCount: 1,
      actionableCount: 1,
      componentFamilies: ['text'],
      actionFamilies: ['activate'], });
    expect(presentedEvents[0].id).toMatch(/^view-/);

    expect(measuredEvents).toHaveLength(1);
    expect(measuredEvents[0]).toMatchObject({
      nodeId: 'input-1',
      nodeType: 'TextInput',
      action: 'change', });
    expect(measuredEvents[0].measurement).toMatchObject({
      modality: 'keyboard',
      componentFamily: 'input',
      componentRole: 'textbox',
      actionFamily: 'input',
      targetWidthPx: 240,
      targetHeightPx: 44,
      valueLength: 10,
      deltaLength: 7, });
    expect(measuredEvents[0].measurement).not.toHaveProperty('newValue');
    expect(measuredEvents[0].measurement).not.toHaveProperty('previousValue');

    const storedInteraction = result.current.context.sessionMemory.getRecentInteractions(1)[0];
    expect(storedInteraction).toMatchObject({
      nodeId: 'input-1',
      nodeType: 'TextInput',
      action: 'change',
      semanticDescription: 'User updated text input.', });
    expect(storedInteraction.previousValue).toBeUndefined();
    expect(storedInteraction.newValue).toBeUndefined(); });

  it('can publish an app view with explicit view metadata', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AnyaProvider nodes={mockNodes }>
        {children }
      </AnyaProvider>
    );

    const { result } = renderHook(() => useAnyaUI(), { wrapper });

    await act(async () => {
      await Promise.resolve(); });

    const renderedViews: Array<{
      id: string;
      kind: 'generated' | 'app';
      templateId?: string;
      title?: string; }> = [];

    const unsubscribe = result.current.subscribeRuntimeEvents('ui.presented', (event) => {
      if (event.type === 'ui.presented') {
        renderedViews.push(event.payload.view); } });

    await act(async () => {
      result.current.publishView({
        skill: 'profile_editor',
        layout: 'stack',
        nodes: [{ id: 'h1', type: 'Heading', props: { text: 'Profile' } }], }, {
        kind: 'app',
        id: 'profile-editor-main',
        title: 'Profile Editor',
        templateId: 'profile-editor-v1', }); });

    unsubscribe();

    expect(renderedViews).toEqual([
      expect.objectContaining({
        id: 'profile-editor-main',
        kind: 'app',
        title: 'Profile Editor',
        templateId: 'profile-editor-v1', }),
    ]); });

  it('loads registered app views and promotes the current view into a template', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AnyaProvider nodes={mockNodes }>
        {children }
      </AnyaProvider>
    );

    const { result } = renderHook(() => useAnyaUI(), { wrapper });

    await act(async () => {
      await Promise.resolve(); });

    await act(async () => {
      result.current.registerAppView({
        id: 'orders-main',
        title: 'Orders',
        workflow: 'orders',
        spec: {
          layout: 'stack',
          nodes: [{ id: 'orders-heading', type: 'Heading', props: { text: 'Orders' } }], }, }); });

    await act(async () => {
      result.current.openAppView('orders-main'); });

    expect(result.current.runtimeState.ui.spec?.nodes[0].id).toBe('orders-heading');
    expect(result.current.viewState.context.currentView).toEqual(
      expect.objectContaining({
        id: 'orders-main',
        kind: 'app',
        title: 'Orders',
        workflow: 'orders', }),
    );

    let templateId = '';
    await act(async () => {
      const template = result.current.saveCurrentViewAsTemplate({
        id: 'orders-template',
        title: 'Orders Template', });
      templateId = template.id; });

    expect(templateId).toBe('orders-template');
    expect(result.current.listViewTemplates()).toEqual([
      expect.objectContaining({
        id: 'orders-template',
        sourceViewId: 'orders-main', }),
    ]); });

  it('starts an agent session and applies the emitted view to runtime state', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AnyaProvider nodes={mockNodes }>
        {children }
      </AnyaProvider>
    );

    const transport: AgentSessionTransport = {
      async startSession(input) {
        const sessionId = input.sessionId ?? 'session-runtime';
        return {
          sessionId,
          controller: { cancel() { } },
          events: (async function* () {
            yield {
              type: 'session.started' as const,
              sessionId,
              timestamp: 1, };
            yield {
              type: 'artifact.upserted' as const,
              sessionId,
              timestamp: 2,
              artifact: {
                id: 'artifact-view',
                sessionId,
                kind: 'view' as const,
                version: 1,
                createdAt: 2,
                audience: 'user' as const,
                region: 'main' as const,
                title: 'Transport Heading',
                payload: {
                  view: {
                    id: 'transport-main',
                    format: 'ui_spec' as const,
                    title: 'Transport Heading',
                    spec: {
                      spec_version: 1,
                      layout: 'stack' as const,
                      nodes: [
                        {
                          id: 'h-transport',
                          type: 'Heading',
                          props: { text: 'Transport Heading' }, },
                      ], },
                    bindings: [], }, }, }, };
            yield {
              type: 'session.completed' as const,
              sessionId,
              timestamp: 3, }; })(), }; }, };

    const { result } = renderHook(() => useAnyaUI(), { wrapper });

    await act(async () => {
      const run = await result.current.startAgentSession({
        userIntent: 'Build heading',
        messages: [],
        transport, });
      const artifacts = collectArtifactsFromSessionEvents(await collectAgentSessionEvents(run));
      const view = artifacts.find(
        (artifact) => artifact.kind === 'view'
          && artifact.payload.view.spec,
      );

      if (!view || view.kind !== 'view' || !view.payload.view.spec) {
        throw new Error('Expected a primary view artifact with a ui spec.'); }

      result.current.publishView(view.payload.view.spec, {
        kind: view.payload.view.kind ?? 'generated',
        id: view.payload.view.id,
        title: view.payload.view.title,
        workflow: view.payload.view.workflow,
        bindings: view.payload.view.bindings, }); });

    expect(result.current.runtimeState.ui.spec?.nodes[0].id).toBe('h-transport');
    expect(result.current.runtimeState.ui.spec?.nodes[0].props.text).toBe('Transport Heading'); });

  it('can finish a session run and promote the primary view artifact into the registry', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AnyaProvider nodes={mockNodes }>
        {children }
      </AnyaProvider>
    );

    const transport: AgentSessionTransport = {
      async startSession(input) {
        const sessionId = input.sessionId ?? 'session-finish';
        return {
          sessionId,
          controller: { cancel() { } },
          events: (async function* () {
            yield {
              type: 'session.started' as const,
              sessionId,
              timestamp: 1, };
            yield {
              type: 'artifact.upserted' as const,
              sessionId,
              timestamp: 2,
              artifact: {
                id: 'artifact-view',
                sessionId,
                kind: 'view' as const,
                version: 1,
                createdAt: 2,
                audience: 'user' as const,
                region: 'main' as const,
                title: 'Artifact View',
                payload: {
                  view: {
                    id: 'artifact-view-main',
                    format: 'ui_spec' as const,
                    title: 'Artifact View',
                    workflow: 'artifact_flow',
                    spec: {
                      spec_version: 1,
                      skill: 'artifact_flow',
                      layout: 'stack' as const,
                      nodes: [
                        {
                          id: 'artifact-heading',
                          type: 'Heading',
                          props: { text: 'Artifact Heading' }, },
                      ], },
                    bindings: [], }, }, }, };
            yield {
              type: 'session.completed' as const,
              sessionId,
              timestamp: 3, }; })(), }; }, };

    const { result } = renderHook(() => useAnyaUI(), { wrapper });

    await act(async () => {
      const completed = await result.current.runAgentSession({
        userIntent: 'Open artifact view',
        messages: [],
        transport,
        savePrimaryViewAsApp: {
          id: 'artifact-app',
          title: 'Artifact App', },
        savePrimaryViewAsTemplate: {
          id: 'artifact-template',
          title: 'Artifact Template', }, });

      expect(completed.primaryViewArtifact?.id).toBe('artifact-view');
      expect(completed.appView?.id).toBe('artifact-app');
      expect(completed.viewTemplate?.id).toBe('artifact-template'); });

    expect(result.current.runtimeState.ui.spec?.nodes[0].id).toBe('artifact-heading');
    expect(result.current.listAppViews()).toEqual([
      expect.objectContaining({
        id: 'artifact-app',
        title: 'Artifact App', }),
    ]);
    expect(result.current.listViewTemplates()).toEqual([
      expect.objectContaining({
        id: 'artifact-template',
        title: 'Artifact Template', }),
    ]); });

  it('syncs runtime and memory after native view interaction updates', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AnyaProvider nodes={mockNodes }>
        {children }
      </AnyaProvider>
    );

    const { result } = renderHook(() => useAnyaUI(), { wrapper });

    await act(async () => {
      await Promise.resolve(); });

    const plan: ViewPlan = {
      mode: 'rebuild',
      confidence: 1,
      ui_spec: {
        layout: 'stack',
        nodes: [
          { id: 'status', type: 'Heading', props: { text: 'idle' } },
          { id: 'btn', type: 'Heading', props: { text: 'click' } },
        ], },
      bindings: [
        {
          id: 'binding-btn',
          nodeId: 'btn',
          actionMatch: 'custom',
          action: {
            type: 'local_patch',
            patches: [
              {
                targetId: 'status',
                propName: 'text',
                value: { $event: 'semanticDescription' }, },
            ], }, },
      ], };

    await act(async () => {
      result.current.applyViewPlan(plan); });

    await act(async () => {
      await result.current.handleUserInteraction({
        timestamp: 2,
        nodeId: 'btn',
        nodeType: 'Heading',
        action: 'custom',
        trigger: 'onClick',
        semanticDescription: 'patched', }); });

    expect(result.current.viewState.currentSpec?.nodes[0].props.text).toBe('patched');
    expect(result.current.runtimeState.ui.spec?.nodes[0].props.text).toBe('patched');
    expect(result.current.context.sessionMemory.getCurrentSpec()?.nodes[0].props.text).toBe('patched'); });

  it('emits a terminal tool event when a planned tool call becomes stale', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AnyaProvider nodes={mockNodes }>
        {children }
      </AnyaProvider>
    );

    const { result } = renderHook(() => useAnyaUI(), { wrapper });

    await act(async () => {
      await Promise.resolve(); });

    const toolEvents: string[] = [];
    const toolFailures: string[] = [];
    const unsubscribe = result.current.subscribeRuntimeEvents('tool.*', (event) => {
      toolEvents.push(event.type);
      if (event.type === 'tool.failed') {
        toolFailures.push(event.payload.error); } });

    let release: (() => void) | undefined;
    let unregisterTool: (() => void) | undefined;
    await act(async () => {
      unregisterTool = result.current.registerTool(
        {
          id: 'rotate',
          name: 'Rotate',
          description: 'Rotate image',
          execution: { mode: 'server' }, },
        () => new Promise((resolve) => {
          release = () => resolve({ ok: true }); }),
      ); });

    const plan: ViewPlan = {
      mode: 'rebuild',
      confidence: 1,
      ui_spec: {
        layout: 'stack',
        nodes: [
          { id: 'status', type: 'Heading', props: { text: 'idle' } },
          { id: 'btn', type: 'Heading', props: { text: 'click' } },
        ], },
      bindings: [
        {
          id: 'binding-tool',
          nodeId: 'btn',
          actionMatch: 'tool:rotate',
          action: {
            type: 'tool_call',
            toolId: 'rotate',
            resultPatches: [
              {
                targetId: 'status',
                propName: 'text',
                value: 'done', },
            ], }, },
      ], };

    await act(async () => {
      result.current.applyViewPlan(plan); });

    await act(async () => {
      const pendingInteraction = result.current.handleUserInteraction({
        timestamp: 3,
        nodeId: 'btn',
        nodeType: 'Heading',
        action: 'tool:rotate',
        trigger: 'onClick', });

      for (let attempt = 0; attempt < 30 && !release; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1)); }

      if (!release) {
        throw new Error('Expected tool handler release callback to be initialized.'); }

      result.current.publishView({
        layout: 'stack',
        nodes: [{ id: 'fresh', type: 'Heading', props: { text: 'fresh' } }], });

      release();
      await pendingInteraction!; });

    unsubscribe();
    await act(async () => {
      unregisterTool?.(); });

    expect(toolEvents.filter((type) => type === 'tool.started')).toHaveLength(1);
    expect(toolEvents.filter((type) => type === 'tool.failed')).toHaveLength(1);
    expect(toolEvents.filter((type) => type === 'tool.finished')).toHaveLength(0);
    expect(toolFailures[0]).toContain('stale interaction result'); });

  it('replaces stale view bindings when agent saves a new decoded spec', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AnyaProvider nodes={mockNodes }>
        {children }
      </AnyaProvider>
    );

    const { result } = renderHook(() => useAnyaUI(), { wrapper });

    await act(async () => {
      await Promise.resolve(); });

    const plan: ViewPlan = {
      mode: 'rebuild',
      confidence: 1,
      ui_spec: {
        layout: 'stack',
        nodes: [
          { id: 'status', type: 'Heading', props: { text: 'idle' } },
        ], },
      bindings: [
        {
          id: 'stale-binding',
          nodeId: 'status',
          actionMatch: 'custom',
          action: {
            type: 'local_patch',
            patches: [
              { targetId: 'status', propName: 'text', value: 'old' },
            ], }, },
      ], };

    await act(async () => {
      result.current.applyViewPlan(plan); });

    expect(result.current.getActionBindings().map((binding) => binding.id)).toContain('stale-binding');

    await act(async () => {
      result.current.publishView({
        layout: 'stack',
        nodes: [
          { id: 'fresh', type: 'Heading', props: { text: 'fresh' } },
        ], }); });

    expect(result.current.getActionBindings()).toEqual([]);
    expect(result.current.viewState.currentSpec?.nodes[0].id).toBe('fresh'); });

  it('supports workflowContext naming for view planning', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AnyaProvider nodes={mockNodes }>
        {children }
      </AnyaProvider>
    );

    const { result } = renderHook(() => useAnyaUI(), { wrapper });

    await act(async () => {
      await new Promise((resolve) => {
        const unsubscribe = result.current.subscribeRuntimeEvents('memory.hydrated', () => {
          unsubscribe();
          resolve(true); }); }); });

    await act(async () => {
      result.current.setWorkflowContext('analysis');
      result.current.setViewData([
        { id: 'doc-1', kind: 'document', payload: { title: 'Doc', content: 'Alpha' } },
      ]); });

    let plan: ReturnType<typeof result.current.planView>;
    await act(async () => {
      plan = result.current.planView(); });
    expect(plan!.ui_spec.skill).toBe('analysis');
    expect(result.current.viewState.context.workflowContext).toBe('analysis'); }); });
