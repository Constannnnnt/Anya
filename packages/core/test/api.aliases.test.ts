import { describe, expect, it } from 'vitest';
import * as api from '../src/index';
import {
  buildViewChangeAuditRecord,
  createAnyaRuntime,
  createAppViewFromDraft,
  createTemplateFromDraft,
  createViewChangeDraft,
  createViewEngine,
  getViewChangePreview,
  reviewViewChangeDraft,
} from '../src/index';
import { InMemoryBehaviorStore } from '../src/experimental';
import { createViewEngine as createViewEngineNamespace } from '../src/views';

describe('public API cleanup', () => {
  it('exports only the canonical runtime and view entrypoints from the main barrel', () => {
    expect(createAnyaRuntime).toBe(api.createAnyaRuntime);
    expect(createViewEngineNamespace).toBe(createViewEngine);
    expect('createAnyaKernel' in api).toBe(false);
    expect('createPresentationEngine' in api).toBe(false);
    expect('ContextMemoryManager' in api).toBe(false);
    expect('AdaptiveProfile' in api).toBe(false);
    expect('DynamicOrchestrator' in api).toBe(false);
    expect('createOrchestrator' in api).toBe(false);
    expect('InMemoryBehaviorStore' in api).toBe(false);
    expect('UIRenderSpec' in api).toBe(false);
    expect('UIComponentSpec' in api).toBe(false);
    expect('UIInteractionRecord' in api).toBe(false);
    expect('UIInteractionDefinition' in api).toBe(false);
    expect('UIPresentedView' in api).toBe(false);
    expect('UiRenderedEvent' in api).toBe(false);
    expect(createViewChangeDraft).toBe(api.createViewChangeDraft);
    expect(reviewViewChangeDraft).toBe(api.reviewViewChangeDraft);
    expect(createAppViewFromDraft).toBe(api.createAppViewFromDraft);
    expect(createTemplateFromDraft).toBe(api.createTemplateFromDraft);
    expect(buildViewChangeAuditRecord).toBe(api.buildViewChangeAuditRecord);
    expect(getViewChangePreview).toBe(api.getViewChangePreview);
  });

  it('returns only canonical properties on the runtime object', () => {
    const runtime = createAnyaRuntime();

    expect(runtime.catalog).toBeDefined();
    expect(runtime.workflowRegistry).toBeDefined();
    expect(runtime.viewRegistry.listAppViews()).toEqual([]);
    expect(runtime.sessionMemory).toBeDefined();
    expect(runtime.userProfile).toBeDefined();
    expect(runtime.agentBridge).toBeDefined();
    expect(runtime.runtime).toBeDefined();
    expect(runtime.viewEngine).toBeDefined();
    expect(runtime.stateGraph).toBeDefined();
    expect(runtime.applyView).toBeInstanceOf(Function);

    expect('componentCatalog' in runtime).toBe(false);
    expect('workflows' in runtime).toBe(false);
    expect('memory' in runtime).toBe(false);
    expect('profile' in runtime).toBe(false);
    expect('orchestrator' in runtime).toBe(false);
    expect('presentation' in runtime).toBe(false);
    expect('applySpec' in runtime).toBe(false);
  });

  it('exposes a shared state graph through the runtime', () => {
    const runtime = createAnyaRuntime();

    runtime.stateGraph.upsertNode({
      id: 'filters',
      kind: 'json',
      payload: { query: 'anya' },
    });
    runtime.stateGraph.setNodeValue('filters', 'sort.order', 'desc');

    expect(runtime.stateGraph.getNode('filters')).toEqual(
      expect.objectContaining({
        id: 'filters',
        kind: 'json',
        payload: {
          query: 'anya',
          sort: {
            order: 'desc',
          },
        },
      }),
    );

    expect(runtime.stateGraph.removeNode('filters')).toBe(true);
    expect(runtime.stateGraph.getNode('filters')).toBeUndefined();
  });

  it('attaches the viewRecommendations engine when behavior analysis is enabled', () => {
    const runtime = createAnyaRuntime({
      uiMemory: {
        enabled: true,
        actorId: 'actor-recommendations',
        behavior: {
          enabled: true,
          store: new InMemoryBehaviorStore(),
        },
      },
    });

    expect(runtime.viewRecommendations).toBeDefined();
  });
});

