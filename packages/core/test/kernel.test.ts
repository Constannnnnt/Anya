import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  createAnyaRuntime,
  createDefaultRuntimeEffects,
  createRuntimeEvent,
  InMemoryStorage,
  type RuntimeEffect,
  type ViewSpec,
} from '../src/index';
import {
  createBehaviorFinding,
  InMemoryBehaviorStore,
  type BehaviorAnalysisRunCapture,
  type BehaviorAnalyzer,
} from '../src/experimental';

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

describe('createAnyaRuntime', () => {
  it('defaults to in-memory storage in non-browser runtimes', () => {
    const kernel = createAnyaRuntime();
    expect(kernel.storage).toBeInstanceOf(InMemoryStorage);
  });

  it('builds core services and applies decoded specs through one lifecycle path', () => {
    const kernel = createAnyaRuntime({
      storage: new InMemoryStorage(),
      components: [
        {
          name: 'Text',
          description: 'Text component',
          propsSchema: z.object({ content: z.string().optional() }),
        },
      ],
      workflows: [
        {
          name: 'analysis',
          description: 'Analyze content',
          components: ['Text'],
        },
      ],
    });

    const spec: ViewSpec = {
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

    const result = kernel.applyView(spec, { source: 'agent', userIntent: 'analyze this' });

    expect(result.bindings).toHaveLength(0);
    expect(kernel.sessionMemory.getContext().userIntent).toBe('analyze this');
    expect(kernel.sessionMemory.getContext().workflowContext).toBe('analysis');
    expect(kernel.viewEngine.getState().context.workflowContext).toBe('analysis');
    expect(kernel.viewEngine.getState().currentSpec?.skill).toBe('analysis');
  });

  it('supports default runtime effects wiring for intent/spec/interaction events', async () => {
    const kernel = createAnyaRuntime({
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
      memory: kernel.sessionMemory,
      profile: kernel.userProfile,
      viewEngine: kernel.viewEngine,
      onThemeUpdated,
    });
    kernel.runtime.replaceEffects(effects);

    kernel.runtime.dispatch(createRuntimeEvent('session.intent_updated', {
      userIntent: 'investigate issue',
    }, { source: 'user' }));

    expect(kernel.sessionMemory.getContext().userIntent).toBe('investigate issue');
    expect(kernel.viewEngine.getState().context.newUserContext).toBe('investigate issue');

    kernel.runtime.dispatch(createRuntimeEvent('spec.decoded', {
      spec: {
        spec_version: 1,
        skill: 'triage',
        layout: 'stack',
        components: [],
      },
    }, { source: 'agent' }));

    expect(kernel.sessionMemory.getContext().workflowContext).toBe('triage');
    expect(kernel.viewEngine.getState().context.workflowContext).toBe('triage');

    kernel.runtime.dispatch(createRuntimeEvent('interaction.recorded', {
      record: {
        timestamp: Date.now(),
        elementId: 'btn-1',
        componentName: 'Button',
        action: 'custom',
      },
    }, { source: 'user' }));

    expect(kernel.sessionMemory.getInteractions()).toHaveLength(1);
    expect(kernel.viewEngine.getState().context.sessionHistory).toHaveLength(1);

    kernel.runtime.dispatch(createRuntimeEvent('theme.updated', {
      tokens: { 'bg-primary': '#111111' },
    }, { source: 'agent' }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onThemeUpdated).toHaveBeenCalledTimes(1);
  });

  it('emits preference.explicit runtime event when decoded spec includes profile observation', async () => {
    const kernel = createAnyaRuntime({
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
      memory: kernel.sessionMemory,
      profile: kernel.userProfile,
      viewEngine: kernel.viewEngine,
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

    const kernel = createAnyaRuntime({ storage });
    await kernel.hydrate();

    expect(kernel.viewEngine.getState().bindings).toHaveLength(1);

    const records = await kernel.viewEngine.executeInteraction({
      timestamp: Date.now(),
      elementId: 'btn',
      componentName: 'Button',
      action: 'set_target',
      trigger: 'onClick',
      semanticDescription: 'Set target action',
    });

    expect(records).toHaveLength(1);
    expect(records[0].status).toBe('success');

    const target = kernel.viewEngine
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

    const kernel = createAnyaRuntime({
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

    const kernel = createAnyaRuntime({
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
    const kernel = createAnyaRuntime({
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

  it('runs automatic behavior analysis and capture through the kernel behavior pipeline', async () => {
    const captures: BehaviorAnalysisRunCapture[] = [];
    const behaviorAnalyzer: BehaviorAnalyzer = {
      id: 'test_behavior_reflection',
      dependencies: ['aggregates'],
      cadence: 'rollup',
      minInteractions: 1,
      run: async ({ actorId, aggregates, now }) => ({
        findings: [
          createBehaviorFinding({
            actorId,
            analyzerId: 'test_behavior_reflection',
            kind: 'reflection_candidate',
            conceptKey: 'test-reflection:compare',
            scopeKey: 'context:compare',
            confidence: 0.95,
            support: Math.max(1, aggregates[0]?.sessionCount ?? 1),
            evidenceRefs: ['agg-1'],
            payload: {
              title: 'Behavior Reflection',
              hints: 'Behavior analysis detected a repeated compare pattern.',
              useCases: 'Compare contexts.',
            },
            createdTs: now,
          }),
        ],
      }),
    };

    const kernel = createAnyaRuntime({
      storage: new InMemoryStorage(),
      uiMemory: {
        enabled: true,
        actorId: 'actor-behavior',
        triggerConfig: { debounceMs: 0 },
        behavior: {
          enabled: true,
          store: new InMemoryBehaviorStore(),
          analyzers: [behaviorAnalyzer],
          interpreterPolicy: {
            mode: 'calibration_required',
            allowResolvedMemoryPromotion: true,
            diagnosticConfidenceMin: 0.5,
            localAdaptationConfidenceMin: 0.75,
            localAdaptationSeverityMin: 'high',
            allowedKindsByAnalyzer: {
              test_behavior_reflection: ['reflection_candidate'],
            },
            promotionRules: {
              reflection_candidate: { confidenceMin: 0.7, supportMin: 1 },
            },
          },
          captureSnapshots: true,
          onCapture: (capture) => captures.push(capture),
        },
      },
    });

    kernel.runtime.dispatch(createRuntimeEvent('ui.presented', {
      view: {
        id: 'ui-kernel',
        kind: 'generated',
        layout: 'split',
        workflow: 'analysis',
        fingerprint: 'ui-kernel',
        componentCount: 2,
        interactiveCount: 1,
        actionableCount: 1,
        componentFamilies: ['input', 'layout'],
        actionFamilies: ['activate'],
      },
    }, { source: 'system' }));
    kernel.runtime.dispatch(createRuntimeEvent('interaction.measured', {
      interactionEventId: 'evt-measured-1',
      elementId: 'btn-1',
      componentName: 'Button',
      action: 'submit',
      measurement: {
        modality: 'pointer',
        componentFamily: 'action',
        actionFamily: 'activate',
        choiceSetSize: 6,
      },
    }, { source: 'user' }));

    kernel.runtime.dispatch(createRuntimeEvent('session.status_set', { status: 'thinking' }, { source: 'system' }));
    kernel.runtime.dispatch(createRuntimeEvent('session.status_set', { status: 'idle' }, { source: 'system' }));

    await waitForCondition(async () => {
      const reflections = await kernel.uiMemoryStore?.findReflections('actor-behavior');
      return Boolean(reflections && reflections.length > 0);
    });

    const reflections = await kernel.uiMemoryStore!.findReflections('actor-behavior');
    expect(reflections).toEqual([
      expect.objectContaining({ title: 'Behavior Reflection' }),
    ]);
    expect(kernel.uiBehaviorStore).toBeDefined();
    expect(await kernel.uiBehaviorStore!.findSignals('actor-behavior')).toHaveLength(1);
    expect(captures).toHaveLength(1);
    expect(captures[0].behaviorSnapshot?.signals).toHaveLength(1);
    expect(captures[0].integration.promotedReflections).toBe(1);
    const behaviorCursor = await kernel.uiMemoryStore!.getCursor('ui_behavior');
    expect(behaviorCursor?.lastProcessedEventId).toBeDefined();
  });

  it('surfaces retained measured interaction findings as planner priors without promoting them into generic memory', async () => {
    const behaviorAnalyzer: BehaviorAnalyzer = {
      id: 'test_local_adaptation',
      dependencies: ['aggregates'],
      cadence: 'rollup',
      minInteractions: 1,
      run: async ({ actorId, now }) => ({
        findings: [
          createBehaviorFinding({
            actorId,
            analyzerId: 'test_local_adaptation',
            kind: 'reflection_candidate',
            conceptKey: 'local-adaptation:compare',
            scopeKey: 'context:compare',
            confidence: 0.92,
            support: 3,
            severity: 'high',
            evidenceRefs: ['agg-1'],
            payload: {
              title: 'Repeated comparison friction',
              hints: 'Keep primary comparison actions closer together and reduce pane switching.',
              contextArchetype: 'compare',
            },
            createdTs: now,
          }),
        ],
      }),
    };

    const kernel = createAnyaRuntime({
      storage: new InMemoryStorage(),
      uiMemory: {
        enabled: true,
        actorId: 'actor-local-adaptation',
        triggerConfig: { debounceMs: 0 },
        behavior: {
          enabled: true,
          store: new InMemoryBehaviorStore(),
          analyzers: [behaviorAnalyzer],
          interpreterPolicy: {
            mode: 'calibration_required',
            allowResolvedMemoryPromotion: false,
            diagnosticConfidenceMin: 0.5,
            localAdaptationConfidenceMin: 0.8,
            localAdaptationSeverityMin: 'high',
            allowedKindsByAnalyzer: {
              test_local_adaptation: ['reflection_candidate'],
            },
            promotionRules: {},
          },
        },
      },
    });

    kernel.sessionMemory.setContext({ workflowContext: 'compare' });

    kernel.runtime.dispatch(createRuntimeEvent('ui.presented', {
      view: {
        id: 'ui-local-adaptation',
        kind: 'generated',
        layout: 'split',
        workflow: 'compare',
        fingerprint: 'ui-local-adaptation',
        componentCount: 2,
        interactiveCount: 1,
        actionableCount: 1,
        componentFamilies: ['action', 'layout'],
        actionFamilies: ['activate'],
      },
    }, { source: 'system' }));
    kernel.runtime.dispatch(createRuntimeEvent('interaction.measured', {
      interactionEventId: 'evt-local-adaptation',
      elementId: 'btn-compare',
      componentName: 'Button',
      action: 'submit',
      measurement: {
        modality: 'pointer',
        componentFamily: 'action',
        actionFamily: 'activate',
        choiceSetSize: 4,
      },
    }, { source: 'user' }));
    kernel.runtime.dispatch(createRuntimeEvent('session.status_set', { status: 'thinking' }, { source: 'system' }));
    kernel.runtime.dispatch(createRuntimeEvent('session.status_set', { status: 'idle' }, { source: 'system' }));

    await waitForCondition(async () => {
      const findings = await kernel.uiBehaviorStore?.findFindings('actor-local-adaptation');
      return Boolean(findings && findings.length > 0);
    });

    expect(await kernel.uiMemoryStore!.findReflections('actor-local-adaptation')).toHaveLength(0);

    const priors = await kernel.agentBridge.getUiMemoryPriors();
    expect(priors).toContain('### Measured Interaction Signals');
    expect(priors).toContain('Repeated comparison friction.');
    expect(priors).toContain('Keep primary comparison actions closer together and reduce pane switching.');
  });

  it('advances the behavior cursor for behavior-trigger windows that contain no projectable signals or view context', async () => {
    const captures: BehaviorAnalysisRunCapture[] = [];
    const kernel = createAnyaRuntime({
      storage: new InMemoryStorage(),
      uiMemory: {
        enabled: true,
        actorId: 'actor-behavior-skip',
        triggerConfig: { debounceMs: 0 },
        behavior: {
          enabled: true,
          store: new InMemoryBehaviorStore(),
          captureSnapshots: true,
          onCapture: (capture) => captures.push(capture),
        },
      },
    });

    const thinkingEventId = 'evt-thinking-only';
    const idleEventId = 'evt-idle-only';

    kernel.runtime.dispatch(createRuntimeEvent('session.status_set', { status: 'thinking' }, { id: thinkingEventId, source: 'system' }));
    kernel.runtime.dispatch(createRuntimeEvent('session.status_set', { status: 'idle' }, { id: idleEventId, source: 'system' }));

    await waitForCondition(async () => {
      const cursor = await kernel.uiMemoryStore?.getCursor('ui_behavior');
      return cursor?.lastProcessedEventId === idleEventId;
    });

    expect(await kernel.uiBehaviorStore!.findSignals('actor-behavior-skip')).toHaveLength(0);
    expect(await kernel.uiMemoryStore!.findReflections('actor-behavior-skip')).toHaveLength(0);
    expect(captures).toHaveLength(0);

    const behaviorCursor = await kernel.uiMemoryStore!.getCursor('ui_behavior');
    expect(behaviorCursor).toEqual(expect.objectContaining({
      namespace: 'ui_behavior',
      lastProcessedEventId: idleEventId,
    }));
  });

  it('retains ui.presented context until a later projectable behavior event arrives', async () => {
    const kernel = createAnyaRuntime({
      storage: new InMemoryStorage(),
      uiMemory: {
        enabled: true,
        actorId: 'actor-behavior-context',
        triggerConfig: { debounceMs: 0 },
        behavior: {
          enabled: true,
          store: new InMemoryBehaviorStore(),
        },
      },
    });

    const presentedEventId = 'evt-presented-context';
    kernel.runtime.dispatch(createRuntimeEvent('ui.presented', {
      view: {
        id: 'ui-context',
        kind: 'generated',
        layout: 'split',
        workflow: 'analysis',
        fingerprint: 'ui-context',
        componentCount: 2,
        interactiveCount: 1,
        actionableCount: 1,
        componentFamilies: ['input', 'layout'],
        actionFamilies: ['activate'],
      },
    }, { id: presentedEventId, source: 'system' }));
    kernel.runtime.dispatch(createRuntimeEvent('session.status_set', { status: 'thinking' }, { source: 'system' }));
    kernel.runtime.dispatch(createRuntimeEvent('session.status_set', { status: 'idle' }, { source: 'system' }));

    await waitForCondition(async () => {
      const cursor = await kernel.uiMemoryStore?.getCursor('ui_behavior');
      return cursor === null;
    });

    kernel.runtime.dispatch(createRuntimeEvent('interaction.measured', {
      interactionEventId: 'evt-measured-context',
      elementId: 'btn-1',
      componentName: 'Button',
      action: 'submit',
      measurement: {
        modality: 'pointer',
        componentFamily: 'action',
        actionFamily: 'activate',
        choiceSetSize: 4,
      },
    }, { source: 'user' }));
    kernel.runtime.dispatch(createRuntimeEvent('session.status_set', { status: 'thinking' }, { source: 'system' }));
    kernel.runtime.dispatch(createRuntimeEvent('session.status_set', { status: 'idle' }, { source: 'system' }));

    await waitForCondition(async () => {
      const signals = await kernel.uiBehaviorStore?.findSignals('actor-behavior-context');
      return Boolean(signals && signals.length > 0);
    });

    const [signal] = await kernel.uiBehaviorStore!.findSignals('actor-behavior-context');
    expect(signal).toEqual(expect.objectContaining({
      viewId: 'ui-context',
      workflow: 'analysis',
      contextArchetype: 'compare',
    }));

    const behaviorCursor = await kernel.uiMemoryStore!.getCursor('ui_behavior');
    expect(behaviorCursor?.lastProcessedEventId).toBeDefined();
    expect(behaviorCursor?.lastProcessedEventId).not.toBe(presentedEventId);
  });
});


