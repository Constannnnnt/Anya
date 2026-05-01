import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { z } from 'zod';
import {
  type AgentSessionTransport, } from '../../core';
import {
  createBehaviorFinding,
  InMemoryBehaviorStore, } from '../../core/experimental';
import { AnyaProvider, useAnyaUI } from '../index';
import type { AnyaNode } from '../defineComponent';

const nodes: AnyaNode[] = [
  {
    name: 'Heading',
    description: 'Heading component',
    propsSchema: z.object({ text: z.string() }),
    render: ({ props }) => <h1>{String((props as { text: string }).text) }</h1>, },
];

describe('useAnya view recommendations integration', () => {
  it('returns ranked view recommendations for the current view', async () => {
    const behaviorStore = new InMemoryBehaviorStore();
    await behaviorStore.upsertFindings([
      createBehaviorFinding({
        id: 'finding-checkout-form',
        actorId: 'actor-checkout',
        analyzerId: 'form_friction',
        kind: 'reflection_candidate',
        conceptKey: 'form-friction:checkout',
        scopeKey: 'context:checkout',
        confidence: 0.82,
        support: 4,
        severity: 'high',
        evidenceRefs: ['signal-1'],
        payload: {
          contextArchetype: 'checkout',
          avgRetryRate: 0.22, },
        createdTs: 100, }),
    ]);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AnyaProvider
        nodes={nodes }
        uiMemory={{
          enabled: true,
          actorId: 'actor-checkout',
          behavior: {
            enabled: true,
            store: behaviorStore, }, } }
      >
        {children }
      </AnyaProvider>
    );

    const { result } = renderHook(() => useAnyaUI(), { wrapper });

    await act(async () => {
      await Promise.resolve(); });

    await act(async () => {
      result.current.publishView(
        {
          skill: 'checkout',
          layout: 'stack',
          nodes: [
            { id: 'heading-1', type: 'Heading', props: { text: 'Checkout' } },
          ], },
        {
          id: 'checkout-view',
          workflow: 'checkout',
          title: 'Checkout', },
      ); });

    const recommendations = await result.current.listCurrentViewRecommendations();

    expect(recommendations).toHaveLength(1);
    expect(recommendations[0]).toEqual(
      expect.objectContaining({
        id: 'finding-checkout-form',
        analyzer: 'form_friction',
        target: expect.objectContaining({
          viewId: 'checkout-view',
          workflow: 'checkout',
          viewKind: 'generated', }), }),
    );
    expect(recommendations[0].recommendation).toContain('Shorten forms'); });

  it('builds a current-view update request from a recommendation', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AnyaProvider nodes={nodes }>
        {children }
      </AnyaProvider>
    );

    const { result } = renderHook(() => useAnyaUI(), { wrapper });

    await act(async () => {
      await Promise.resolve(); });

    await act(async () => {
      result.current.publishView(
        {
          skill: 'checkout',
          layout: 'stack',
          nodes: [
            { id: 'heading-1', type: 'Heading', props: { text: 'Checkout' } },
          ], },
        {
          id: 'checkout-view',
          workflow: 'checkout',
          title: 'Checkout', },
      ); });

    const request = result.current.buildViewRecommendationUpdateRequest({
      id: 'finding-checkout-form',
      analyzer: 'form_friction',
      priority: 1,
      score: 0.93,
      severity: 'high',
      confidence: 0.82,
      support: 4,
      summary: 'Repeated correction loops are showing up in checkout.',
      recommendation: 'Shorten forms, prefill where possible, and add inline validation.',
      evidence: [{ label: 'avgRetryRate', value: '22%' }],
      target: {
        workflow: 'checkout', }, });

    expect(request.currentViewId).toBe('checkout-view');
    expect(request.message.content).toContain('Shorten forms');
    expect(request.promptOptions.additionalInstructions).toContain('baseline'); });

  it('runs a recommendation-driven update session for the current view', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AnyaProvider nodes={nodes }>
        {children }
      </AnyaProvider>
    );

    const { result } = renderHook(() => useAnyaUI(), { wrapper });

    await act(async () => {
      await Promise.resolve(); });

    await act(async () => {
      result.current.publishView(
        {
          skill: 'checkout',
          layout: 'stack',
          nodes: [
            { id: 'heading-1', type: 'Heading', props: { text: 'Checkout' } },
          ], },
        {
          id: 'checkout-view',
          workflow: 'checkout',
          title: 'Checkout', },
      ); });

    let capturedInput:
      | Parameters<NonNullable<AgentSessionTransport['startSession']>>[0]
      | undefined;
    const transport: AgentSessionTransport = {
      async startSession(input) {
        capturedInput = input;
        const sessionId = input.sessionId ?? 'session-view-recommendation';
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
                title: 'Checkout Revised',
                payload: {
                  view: {
                    id: 'checkout-view-revised',
                    format: 'ui_spec' as const,
                    title: 'Checkout Revised',
                    workflow: 'checkout',
                    spec: {
                      spec_version: 1,
                      skill: 'checkout',
                      layout: 'stack' as const,
                      nodes: [
                        {
                          id: 'heading-updated',
                          type: 'Heading',
                          props: { text: 'Checkout Revised' }, },
                      ], },
                    bindings: [], }, }, }, };
            yield {
              type: 'session.completed' as const,
              sessionId,
              timestamp: 3, }; })(), }; }, };

    await act(async () => {
      await result.current.runViewRecommendationUpdate({
        id: 'finding-checkout-form',
        analyzer: 'form_friction',
        priority: 1,
        score: 0.93,
        severity: 'high',
        confidence: 0.82,
        support: 4,
        summary: 'Repeated correction loops are showing up in checkout.',
        recommendation: 'Shorten forms, prefill where possible, and add inline validation.',
        evidence: [{ label: 'avgRetryRate', value: '22%' }],
        target: {
          workflow: 'checkout', }, }, {
        transport, }); });

    expect(capturedInput?.currentViewId).toBe('checkout-view');
    expect(capturedInput?.userIntent).toContain('checkout');
    expect(capturedInput?.messages[0]?.content).toContain('Shorten forms');
    expect(result.current.viewState.currentSpec?.nodes[0].props.text).toBe('Checkout Revised'); });

  it('creates a previewable draft view change without mutating the current view', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AnyaProvider nodes={nodes }>
        {children }
      </AnyaProvider>
    );

    const { result } = renderHook(() => useAnyaUI(), { wrapper });

    await act(async () => {
      await Promise.resolve(); });

    await act(async () => {
      result.current.publishView(
        {
          skill: 'checkout',
          layout: 'stack',
          nodes: [
            { id: 'heading-1', type: 'Heading', props: { text: 'Checkout' } },
          ], },
        {
          id: 'checkout-view',
          workflow: 'checkout',
          title: 'Checkout', },
      ); });

    const transport: AgentSessionTransport = {
      async startSession(input) {
        const sessionId = input.sessionId ?? 'session-view-change-draft';
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
                id: 'artifact-view-change-draft',
                sessionId,
                kind: 'view' as const,
                version: 1,
                createdAt: 2,
                audience: 'user' as const,
                region: 'main' as const,
                title: 'Checkout Revised',
                payload: {
                  view: {
                    id: 'checkout-view-revised',
                    format: 'ui_spec' as const,
                    title: 'Checkout Revised',
                    workflow: 'checkout',
                    spec: {
                      spec_version: 1,
                      skill: 'checkout',
                      layout: 'stack' as const,
                      nodes: [
                        {
                          id: 'heading-updated',
                          type: 'Heading',
                          props: { text: 'Checkout Revised' }, },
                        {
                          id: 'hint-updated',
                          type: 'Heading',
                          props: { text: 'Faster checkout' }, },
                      ], },
                    bindings: [], }, }, }, };
            yield {
              type: 'session.completed' as const,
              sessionId,
              timestamp: 3, }; })(), }; }, };

    let drafted: Awaited<ReturnType<typeof result.current.createViewChangeDraft>> | undefined;
    await act(async () => {
      drafted = await result.current.createViewChangeDraft({
        id: 'finding-checkout-form',
        analyzer: 'form_friction',
        priority: 1,
        score: 0.93,
        severity: 'high',
        confidence: 0.82,
        support: 4,
        summary: 'Repeated correction loops are showing up in checkout.',
        recommendation: 'Shorten forms, prefill where possible, and add inline validation.',
        evidence: [{ label: 'avgRetryRate', value: '22%' }],
        target: {
          workflow: 'checkout',
          viewId: 'checkout-view',
          viewKind: 'app', }, }, {
        transport, }); });

    expect(drafted?.session.primaryViewArtifact?.id).toBe('artifact-view-change-draft');
    expect(drafted?.draft.plan.mode).toBe('rebuild');
    expect(drafted?.draft.proposal.view?.id).toBe('checkout-view');
    expect(drafted?.preview.spec.nodes[0].props.text).toBe('Checkout Revised');
    expect(result.current.viewState.currentSpec?.nodes[0].props.text).toBe('Checkout');

    const preview = result.current.getViewChangePreview(drafted!.draft);
    expect(preview.draftId).toBe(drafted?.draft.id);
    expect(preview.spec.nodes[1].props.text).toBe('Faster checkout'); });

  it('reviews an accepted draft and applies it to an app view with audit metadata', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AnyaProvider nodes={nodes }>
        {children }
      </AnyaProvider>
    );

    const { result } = renderHook(() => useAnyaUI(), { wrapper });

    await act(async () => {
      await Promise.resolve(); });

    await act(async () => {
      result.current.publishView(
        {
          skill: 'checkout',
          layout: 'stack',
          nodes: [
            { id: 'heading-1', type: 'Heading', props: { text: 'Checkout' } },
          ], },
        {
          id: 'checkout-view',
          workflow: 'checkout',
          title: 'Checkout', },
      ); });

    const transport: AgentSessionTransport = {
      async startSession(input) {
        const sessionId = input.sessionId ?? 'session-view-change-apply-app';
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
                id: 'artifact-view-change-apply-app',
                sessionId,
                kind: 'view' as const,
                version: 1,
                createdAt: 2,
                audience: 'user' as const,
                region: 'main' as const,
                title: 'Checkout Revised',
                payload: {
                  view: {
                    id: 'checkout-view-revised',
                    format: 'ui_spec' as const,
                    title: 'Checkout Revised',
                    workflow: 'checkout',
                    spec: {
                      spec_version: 1,
                      skill: 'checkout',
                      layout: 'stack' as const,
                      nodes: [
                        {
                          id: 'heading-updated',
                          type: 'Heading',
                          props: { text: 'Checkout Revised' }, },
                      ], },
                    bindings: [], }, }, }, };
            yield {
              type: 'session.completed' as const,
              sessionId,
              timestamp: 3, }; })(), }; }, };

    let drafted: Awaited<ReturnType<typeof result.current.createViewChangeDraft>> | undefined;
    await act(async () => {
      drafted = await result.current.createViewChangeDraft({
        id: 'finding-checkout-form',
        analyzer: 'form_friction',
        priority: 1,
        score: 0.93,
        severity: 'high',
        confidence: 0.82,
        support: 4,
        summary: 'Repeated correction loops are showing up in checkout.',
        recommendation: 'Shorten forms, prefill where possible, and add inline validation.',
        evidence: [{ label: 'avgRetryRate', value: '22%' }],
        target: {
          workflow: 'checkout',
          viewId: 'checkout-view',
          viewKind: 'app', }, }, {
        transport, }); });

    let applied: ReturnType<typeof result.current.applyViewChangeToApp> | undefined;
    await act(async () => {
      const reviewed = result.current.reviewViewChangeDraft(drafted!.draft, {
        decision: 'accepted',
        reviewer: 'design-review',
        notes: 'Approved for rollout.',
        reviewedAt: 88, });
      applied = result.current.applyViewChangeToApp(reviewed, {
        metadata: {
          release: 'stage-3', },
        openAfterApply: true, }); });

    expect(applied?.appView).toEqual(
      expect.objectContaining({
        id: 'checkout-view',
        title: 'Checkout Revised',
        metadata: expect.objectContaining({
          release: 'stage-3',
          viewChangeAudit: expect.objectContaining({
            draftId: drafted?.draft.id,
            reviewer: 'design-review',
            decision: 'accepted', }), }), }),
    );
    expect(applied?.openedView?.id).toBe('checkout-view');
    expect(result.current.listAppViews()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'checkout-view',
          title: 'Checkout Revised', }),
      ]),
    );
    expect(result.current.viewState.currentSpec?.nodes[0].props.text).toBe('Checkout Revised'); });

  it('applies an accepted draft to a template without mutating the live view by default', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AnyaProvider nodes={nodes }>
        {children }
      </AnyaProvider>
    );

    const { result } = renderHook(() => useAnyaUI(), { wrapper });

    await act(async () => {
      await Promise.resolve(); });

    await act(async () => {
      result.current.publishView(
        {
          skill: 'checkout',
          layout: 'stack',
          nodes: [
            { id: 'heading-1', type: 'Heading', props: { text: 'Checkout' } },
          ], },
        {
          id: 'checkout-view',
          workflow: 'checkout',
          title: 'Checkout', },
      ); });

    const transport: AgentSessionTransport = {
      async startSession(input) {
        const sessionId = input.sessionId ?? 'session-view-change-apply-template';
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
                id: 'artifact-view-change-apply-template',
                sessionId,
                kind: 'view' as const,
                version: 1,
                createdAt: 2,
                audience: 'user' as const,
                region: 'main' as const,
                title: 'Checkout Revised',
                payload: {
                  view: {
                    id: 'checkout-view-revised',
                    format: 'ui_spec' as const,
                    title: 'Checkout Revised',
                    workflow: 'checkout',
                    spec: {
                      spec_version: 1,
                      skill: 'checkout',
                      layout: 'stack' as const,
                      nodes: [
                        {
                          id: 'heading-updated',
                          type: 'Heading',
                          props: { text: 'Checkout Revised' }, },
                        {
                          id: 'hint-updated',
                          type: 'Heading',
                          props: { text: 'Faster checkout' }, },
                      ], },
                    bindings: [], }, }, }, };
            yield {
              type: 'session.completed' as const,
              sessionId,
              timestamp: 3, }; })(), }; }, };

    let drafted: Awaited<ReturnType<typeof result.current.createViewChangeDraft>> | undefined;
    await act(async () => {
      drafted = await result.current.createViewChangeDraft({
        id: 'finding-checkout-form',
        analyzer: 'form_friction',
        priority: 1,
        score: 0.93,
        severity: 'high',
        confidence: 0.82,
        support: 4,
        summary: 'Repeated correction loops are showing up in checkout.',
        recommendation: 'Shorten forms, prefill where possible, and add inline validation.',
        evidence: [{ label: 'avgRetryRate', value: '22%' }],
        target: {
          workflow: 'checkout',
          viewId: 'checkout-view',
          viewKind: 'app',
          templateId: 'checkout-template', }, }, {
        transport, }); });

    let applied: ReturnType<typeof result.current.applyViewChangeToTemplate> | undefined;
    await act(async () => {
      const reviewed = result.current.reviewViewChangeDraft(drafted!.draft, {
        decision: 'accepted',
        reviewer: 'design-review',
        reviewedAt: 99, });
      applied = result.current.applyViewChangeToTemplate(reviewed, {
        id: 'checkout-template-v2',
        title: 'Checkout Template V2',
        metadata: {
          release: 'stage-3', }, }); });

    expect(applied?.viewTemplate).toEqual(
      expect.objectContaining({
        id: 'checkout-template-v2',
        title: 'Checkout Template V2',
        metadata: expect.objectContaining({
          release: 'stage-3',
          viewChangeAudit: expect.objectContaining({
            draftId: drafted?.draft.id,
            reviewedAt: 99, }), }), }),
    );
    expect(result.current.listViewTemplates()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'checkout-template-v2', }),
      ]),
    );
    expect(result.current.viewState.currentSpec?.nodes[0].props.text).toBe('Checkout'); });

  it('does not allow rejected drafts to be applied', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AnyaProvider nodes={nodes }>
        {children }
      </AnyaProvider>
    );

    const { result } = renderHook(() => useAnyaUI(), { wrapper });

    await act(async () => {
      await Promise.resolve(); });

    await act(async () => {
      result.current.publishView(
        {
          skill: 'checkout',
          layout: 'stack',
          nodes: [
            { id: 'heading-1', type: 'Heading', props: { text: 'Checkout' } },
          ], },
        {
          id: 'checkout-view',
          workflow: 'checkout',
          title: 'Checkout', },
      ); });

    const transport: AgentSessionTransport = {
      async startSession(input) {
        const sessionId = input.sessionId ?? 'session-view-change-rejected';
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
                id: 'artifact-view-change-rejected',
                sessionId,
                kind: 'view' as const,
                version: 1,
                createdAt: 2,
                audience: 'user' as const,
                region: 'main' as const,
                title: 'Checkout Revised',
                payload: {
                  view: {
                    id: 'checkout-view-revised',
                    format: 'ui_spec' as const,
                    title: 'Checkout Revised',
                    workflow: 'checkout',
                    spec: {
                      spec_version: 1,
                      skill: 'checkout',
                      layout: 'stack' as const,
                      nodes: [
                        {
                          id: 'heading-updated',
                          type: 'Heading',
                          props: { text: 'Checkout Revised' }, },
                      ], },
                    bindings: [], }, }, }, };
            yield {
              type: 'session.completed' as const,
              sessionId,
              timestamp: 3, }; })(), }; }, };

    let drafted: Awaited<ReturnType<typeof result.current.createViewChangeDraft>> | undefined;
    await act(async () => {
      drafted = await result.current.createViewChangeDraft({
        id: 'finding-checkout-form',
        analyzer: 'form_friction',
        priority: 1,
        score: 0.93,
        severity: 'high',
        confidence: 0.82,
        support: 4,
        summary: 'Repeated correction loops are showing up in checkout.',
        recommendation: 'Shorten forms, prefill where possible, and add inline validation.',
        evidence: [{ label: 'avgRetryRate', value: '22%' }],
        target: {
          workflow: 'checkout',
          viewId: 'checkout-view',
          viewKind: 'app', }, }, {
        transport, }); });

    const reviewed = result.current.reviewViewChangeDraft(drafted!.draft, {
      decision: 'rejected',
      reviewer: 'design-review',
      reviewedAt: 111, });

    expect(() => result.current.applyViewChangeToApp(reviewed)).toThrow(
      'Only accepted view change drafts can be applied.',
    );
    expect(() => result.current.applyViewChangeToTemplate(reviewed)).toThrow(
      'Only accepted view change drafts can be applied.',
    ); }); });
