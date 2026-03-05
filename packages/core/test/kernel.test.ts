import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  createAnyaKernel,
  createDefaultRuntimeEffects,
  createRuntimeEvent,
  InMemoryStorage,
  type RuntimeEffect,
  type UIRenderSpec,
} from '../src/index';

async function waitForCondition(
  check: () => Promise<boolean> | boolean,
  timeoutMs = 1200,
): Promise<void> {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (await check()) return;
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timed out waiting for condition.');
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe('createAnyaKernel', () => {
  it('builds core services and applies decoded specs through one lifecycle path', () => {
    const kernel = createAnyaKernel({
      storage: new InMemoryStorage(),
      components: [
        {
          name: 'Text',
          description: 'Text component',
          propsSchema: z.object({ content: z.string().optional() }),
        },
      ],
      workflowContexts: [
        {
          name: 'analysis',
          description: 'Analyze content',
          components: ['Text'],
        },
      ],
    });

    const spec: UIRenderSpec = {
      spec_version: 1,
      skill: 'analysis',
      layout: 'stack',
      components: [
        {
          id: 'text-1',
          type: 'Text',
          props: { content: 'hello' },
        },
      ],
    };

    const result = kernel.applySpec(spec, { source: 'agent', userIntent: 'analyze this' });

    expect(result.bindings).toHaveLength(0);
    expect(kernel.memory.getContext().userIntent).toBe('analyze this');
    expect(kernel.memory.getContext().workflowContext).toBe('analysis');
    expect(kernel.presentation.getState().context.workflowContext).toBe('analysis');
    expect(kernel.presentation.getState().currentSpec?.skill).toBe('analysis');
  });

  it('supports default runtime effects wiring for intent/spec/interaction events', async () => {
    const kernel = createAnyaKernel({
      storage: new InMemoryStorage(),
      components: [
        {
          name: 'Text',
          description: 'Text component',
          propsSchema: z.object({ content: z.string().optional() }),
        },
      ],
    });

    const onThemeUpdated = vi.fn();
    const effects: RuntimeEffect[] = createDefaultRuntimeEffects({
      memory: kernel.memory,
      profile: kernel.profile,
      presentation: kernel.presentation,
      onThemeUpdated,
    });
    kernel.runtime.replaceEffects(effects);

    kernel.runtime.dispatch(createRuntimeEvent('session.intent_updated', {
      userIntent: 'investigate issue',
    }, { source: 'user' }));

    expect(kernel.memory.getContext().userIntent).toBe('investigate issue');
    expect(kernel.presentation.getState().context.newUserContext).toBe('investigate issue');

    kernel.runtime.dispatch(createRuntimeEvent('spec.decoded', {
      spec: {
        spec_version: 1,
        skill: 'triage',
        layout: 'stack',
        components: [],
      },
    }, { source: 'agent' }));

    expect(kernel.memory.getContext().workflowContext).toBe('triage');
    expect(kernel.presentation.getState().context.workflowContext).toBe('triage');

    kernel.runtime.dispatch(createRuntimeEvent('interaction.recorded', {
      record: {
        timestamp: Date.now(),
        elementId: 'btn-1',
        componentName: 'Button',
        action: 'custom',
      },
    }, { source: 'user' }));

    expect(kernel.memory.getInteractions()).toHaveLength(1);
    expect(kernel.presentation.getState().context.sessionHistory).toHaveLength(1);

    kernel.runtime.dispatch(createRuntimeEvent('theme.updated', {
      tokens: { 'bg-primary': '#111111' },
    }, { source: 'agent' }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onThemeUpdated).toHaveBeenCalledTimes(1);
  });

  it('emits preference.explicit runtime event when decoded spec includes profile observation', async () => {
    const kernel = createAnyaKernel({
      storage: new InMemoryStorage(),
      components: [
        {
          name: 'Text',
          description: 'Text component',
          propsSchema: z.object({ content: z.string().optional() }),
        },
      ],
    });

    const effects: RuntimeEffect[] = createDefaultRuntimeEffects({
      memory: kernel.memory,
      profile: kernel.profile,
      presentation: kernel.presentation,
    });
    kernel.runtime.replaceEffects(effects);

    const seenTypes: string[] = [];
    const unsubscribe = kernel.runtime.subscribeEvent('*', (event) => {
      seenTypes.push(event.type);
    });

    kernel.runtime.dispatch(createRuntimeEvent('spec.decoded', {
      spec: {
        spec_version: 1,
        layout: 'stack',
        profile_observation: 'User prefers concise summary cards',
        components: [],
      },
    }, { source: 'agent' }));

    await waitForCondition(() => seenTypes.includes('preference.explicit'));
    unsubscribe();
  });

  it('restores interaction bindings from persisted spec during hydrate', async () => {
    const storage = new InMemoryStorage();
    await storage.write('memory.snapshot.json', JSON.stringify({
      version: 0,
      context: {
        userIntent: 'restore ui',
      },
      interactions: [],
      elementHistories: [],
      reasoningTraces: [],
      currentSpec: {
        spec_version: 1,
        layout: 'stack',
        components: [
          {
            id: 'target',
            type: 'Text',
            props: { content: 'Idle' },
          },
          {
            id: 'btn',
            type: 'Button',
            props: { label: 'Run' },
            interactions: [
              {
                trigger: 'onClick',
                action: 'set_target',
                description: 'Set target action',
                targetIds: ['target'],
                targetAction: 'focus',
              },
            ],
          },
        ],
      },
    }));

    const kernel = createAnyaKernel({ storage });
    await kernel.hydrate();

    expect(kernel.presentation.getState().bindings).toHaveLength(1);

    const records = await kernel.presentation.executeInteraction({
      timestamp: Date.now(),
      elementId: 'btn',
      componentName: 'Button',
      action: 'set_target',
      trigger: 'onClick',
      semanticDescription: 'Set target action',
    });

    expect(records).toHaveLength(1);
    expect(records[0].status).toBe('success');

    const target = kernel.presentation
      .getState()
      .currentSpec
      ?.components.find((component) => component.id === 'target');
    expect(target?.props.lastAction).toBe('focus');
  });

  it('runs uiMemory extraction pipeline from runtime events when runPrompt is configured', async () => {
    const storage = new InMemoryStorage();
    const runPrompt = vi.fn(async (prompt: string) => {
        // Preference extraction
      if (prompt.includes('UI Preference Analyst')) {
          return JSON.stringify([
            {
              context: 'User explicit instruction',
              preference: 'Use left-right layout for comparison tasks',
              categories: ['layout'],
              signal_type: 'explicit',
              confidence: 0.9,
            },
          ]);
        }

        // Episodic extraction (turn summaries)
      if (prompt.includes('UI interaction analyst')) {
          return '[]';
        }

        // Episode/reflection prompts are not reached when turns are empty.
        return '[]';
      });

    const kernel = createAnyaKernel({
      storage,
      uiMemory: {
        enabled: true,
        actorId: 'actor-1',
        runPrompt,
        triggerConfig: {
          debounceMs: 0,
        },
      },
    });

    const eventId = 'evt-pref-1';
    kernel.runtime.dispatch(
      createRuntimeEvent(
        'preference.explicit',
        {
          category: 'layout',
          key: 'layout_mode',
          value: 'left_right',
          statement: 'Use left-right layout',
        },
        {
          id: eventId,
          source: 'user',
        },
      ),
    );

    await waitForCondition(async () => {
      const prefs = await kernel.uiMemoryStore?.findPreferences('actor-1');
      return Boolean(prefs && prefs.length > 0);
    });

    const prefs = await kernel.uiMemoryStore!.findPreferences('actor-1');
    expect(prefs).toHaveLength(1);
    expect(prefs[0].category).toBe('layout');
    expect(prefs[0].value).toContain('left-right layout');

    const cursor = await kernel.uiMemoryStore!.getCursor('ui_memory');
    expect(cursor?.lastProcessedEventId).toBe(eventId);
    expect(runPrompt).toHaveBeenCalled();
  });

  it('stores interaction patterns from interaction/binding traces', async () => {
    const storage = new InMemoryStorage();
    const runPrompt = vi.fn(async (prompt: string) => {
      if (prompt.includes('UI Preference Analyst')) {
        return '[]';
      }
      if (prompt.includes('UI interaction analyst')) {
        return JSON.stringify([
          {
            situation: 'User requested profile comparison',
            intent: 'Compare profiles',
            action: 'Clicked compare and ran web search',
            thought: 'Sequence is stable',
            assessment_assistant: 'Yes',
            assessment_user: 'Yes',
          },
        ]);
      }
      if (prompt.includes('UI composition workflows')) {
        return JSON.stringify({
          situation: 'Profile comparison flow',
          intent: 'Compare profiles',
          assessment: 'Yes',
          justification: 'Rendered comparison view',
          reflection: 'Search-first flow performs well',
        });
      }
      if (prompt.includes('actionable insights from UI composition')) {
        return '[]';
      }
      return '[]';
    });

    const kernel = createAnyaKernel({
      storage,
      uiMemory: {
        enabled: true,
        actorId: 'actor-1',
        runPrompt,
        triggerConfig: {
          debounceMs: 0,
        },
      },
    });

    kernel.runtime.dispatch(
      createRuntimeEvent(
        'interaction.recorded',
        {
          record: {
            timestamp: Date.now(),
            elementId: 'btn-compare',
            componentName: 'Button',
            action: 'custom',
          },
        },
        { source: 'user' },
      ),
    );
    kernel.runtime.dispatch(
      createRuntimeEvent(
        'binding.executed',
        {
          record: {
            bindingId: 'binding-1',
            toolId: 'web-search',
            status: 'success',
            timestamp: Date.now(),
            interaction: {
              timestamp: Date.now(),
              elementId: 'btn-compare',
              componentName: 'Button',
              action: 'custom',
            },
          },
        },
        { source: 'system' },
      ),
    );

    const flushEventId = 'evt-pattern-flush';
    kernel.runtime.dispatch(
      createRuntimeEvent(
        'preference.explicit',
        {
          category: 'interaction',
          key: 'flush',
          value: 'flush',
          statement: 'flush extraction',
        },
        {
          id: flushEventId,
          source: 'user',
        },
      ),
    );

    await waitForCondition(async () => {
      const patterns = await kernel.uiMemoryStore?.findPatterns('actor-1');
      return Boolean(patterns && patterns.length > 0);
    });

    const patterns = await kernel.uiMemoryStore!.findPatterns('actor-1');
    expect(patterns).toHaveLength(1);
    expect(patterns[0].taskClass).toBe('compare_profiles');
    expect(patterns[0].sequenceKey).toContain('tool:web-search:success');
    expect(patterns[0].outcome).toBe('success');
  });

  it('selects a uiMemory store from policy when store is not provided', async () => {
    const kernel = createAnyaKernel({
      storage: new InMemoryStorage(),
      uiMemory: {
        enabled: true,
        actorId: 'actor-policy',
        storePolicy: 'memory',
      },
    });

    expect(kernel.uiMemoryStore).toBeDefined();

    await kernel.uiMemoryStore!.appendEvents([
      {
        id: 'evt-policy-1',
        ts: Date.now(),
        actorId: 'actor-policy',
        sessionId: 'default',
        type: 'session.intent_updated',
        source: 'user',
        payloadJson: '{"userIntent":"test"}',
      },
    ]);

    expect(await kernel.uiMemoryStore!.getLatestEventId()).toBe('evt-policy-1');
  });
});
