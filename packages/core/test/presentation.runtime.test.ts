import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { UIInteractionRecord, UIRenderSpec } from '../src/types';
import type { ToolManifest, UIBinding } from '../src/presentation/types';
import { createPresentationEngine } from '../src/presentation/uiEngine';
import { planUIUpdate } from '../src/presentation/updatePlanner';
import { buildUIFromData } from '../src/presentation/uiBuilder';
import { ToolRuntime } from '../src/presentation/tools';

function createInteraction(patch?: Partial<UIInteractionRecord>): UIInteractionRecord {
  return {
    timestamp: 1,
    elementId: 'rotate-btn',
    componentName: 'Button',
    action: 'tool:rotate',
    semanticDescription: 'Rotate image',
    newValue: 90,
    ...patch,
  };
}

const rotateTool: ToolManifest = {
  id: 'rotate',
  name: 'Rotate Image',
  description: 'Rotate current image by degrees',
};

describe('presentation runtime (v0 scenarios)', () => {
  it('projects data context and tool affordances into UI + bindings', () => {
    const projection = buildUIFromData(
      [
        {
          id: 'doc-a',
          kind: 'document',
          payload: { title: 'Brief', content: 'Design notes' },
        },
        {
          id: 'img-a',
          kind: 'image',
          payload: { src: 'https://example.com/image.png', alt: 'Preview' },
        },
      ],
      [rotateTool]
    );

    const dataSection = projection.spec.components.find((component) => component.id === 'data-section');
    const toolSection = projection.spec.components.find((component) => component.id === 'tools-section');
    const rotateBinding = projection.bindings.find((binding) => binding.id === 'binding-tool-rotate');
    const rotateButton = toolSection?.children?.find((component) => component.id === 'tool-btn-rotate');

    expect(projection.spec.spec_version).toBe(1);
    expect(dataSection).toBeTruthy();
    expect(toolSection).toBeTruthy();
    expect(rotateBinding?.action).toMatchObject({
      type: 'tool_call',
      toolId: 'rotate',
    });
    expect(rotateButton?.interactions?.[0].action).toBe('tool:rotate');
  });

  it('executes a bound tool call natively and applies result patches', async () => {
    const initialSpec: UIRenderSpec = {
      layout: 'stack',
      components: [
        {
          id: 'angle-text',
          type: 'Text',
          props: { content: 'angle:0' },
        },
        {
          id: 'rotate-btn',
          type: 'Button',
          props: { label: 'Rotate' },
        },
      ],
    };

    const bindings: UIBinding[] = [
      {
        id: 'binding-rotate',
        componentId: 'rotate-btn',
        trigger: 'onClick',
        actionMatch: 'tool:rotate',
        action: {
          type: 'tool_call',
          toolId: 'rotate',
          args: {
            degrees: { $event: 'newValue' },
            sourceImage: { $data: { nodeId: 'img-1', path: 'payload.src', fallback: 'none' } },
          },
          resultPatches: [
            {
              targetId: 'angle-text',
              propName: 'content',
              value: { $result: 'summary' },
            },
          ],
        },
      },
    ];

    const engine = createPresentationEngine({
      initialContext: {
        currentSpec: initialSpec,
        currentBindings: bindings,
        dataNodes: [
          {
            id: 'img-1',
            kind: 'image',
            payload: {
              payload: {
                src: 'source-a.png',
              },
            },
          },
        ],
        tools: [rotateTool],
      },
    });

    engine.registerToolHandler('rotate', ({ args }) => ({
      summary: `angle:${args.degrees}-src:${args.sourceImage}`,
    }));

    const records = await engine.executeInteraction(createInteraction());
    const updated = engine.getState().currentSpec;
    const angleText = updated?.components.find((component) => component.id === 'angle-text');

    expect(records).toHaveLength(1);
    expect(records[0].status).toBe('success');
    expect(records[0].toolId).toBe('rotate');
    expect(angleText?.props.content).toBe('angle:90-src:source-a.png');
  });

  it('removes stale sections and tool bindings when context is emptied', () => {
    const initialProjection = buildUIFromData(
      [{ id: 'doc-1', kind: 'document', payload: { title: 'Doc', content: 'A' } }],
      [rotateTool]
    );

    const plan = planUIUpdate({
      context_version: 0,
      dataNodes: [],
      tools: [],
      currentSpec: initialProjection.spec,
      currentBindings: initialProjection.bindings,
      newUserContext: 'keep what is needed only',
    });

    expect(plan.mode).toBe('patch');
    expect(plan.operations?.some((operation) => operation.type === 'remove_binding')).toBe(true);

    const engine = createPresentationEngine({
      initialContext: {
        currentSpec: initialProjection.spec,
        currentBindings: initialProjection.bindings,
        dataNodes: [],
        tools: [],
      },
    });

    const applied = engine.applyPlan(plan);
    expect(applied.modeApplied).toBe('patch');
    expect(applied.spec.components).toHaveLength(0);
    expect(applied.bindings).toHaveLength(0);
  });

  it('synchronizes runtime tool registry when tool set is replaced', async () => {
    const runtime = new ToolRuntime();
    runtime.registerTool(rotateTool);
    runtime.registerHandler('rotate', () => ({ ok: true }));

    runtime.setTools([
      {
        id: 'resize',
        name: 'Resize Image',
        description: 'Resize current image',
      },
    ]);

    await expect(runtime.executeToolCall(
      {
        type: 'tool_call',
        toolId: 'rotate',
      },
      {
        interaction: createInteraction({ action: 'tool:rotate' }),
        dataNodes: [],
      }
    )).rejects.toThrow("Unknown tool 'rotate'");
  });

  it('rejects adapter-mode tools without adapterId', () => {
    const runtime = new ToolRuntime();
    expect(() => runtime.registerTool({
      id: 'adapter-tool',
      name: 'Adapter Tool',
      description: 'Needs adapter',
      execution: { mode: 'adapter' },
    })).toThrow('must provide execution.adapterId');
  });

  it('rejects adapterId when execution mode is not adapter', () => {
    const runtime = new ToolRuntime();
    expect(() => runtime.registerTool({
      id: 'bad-tool',
      name: 'Bad Tool',
      description: 'Mismatched execution metadata',
      execution: { mode: 'server', adapterId: 'bridge-1' },
    })).toThrow("mode is 'server'");
  });

  it('rejects tools whose execution mode is not allowed by policy', () => {
    const runtime = new ToolRuntime({
      allowedExecutionModes: ['client'],
    });
    expect(() => runtime.registerTool({
      id: 'server-tool',
      name: 'Server Tool',
      description: 'Server mode',
      execution: { mode: 'server' },
    })).toThrow('not allowed by runtime policy');
  });

  it('validates manifest rules when replacing tool set', () => {
    const runtime = new ToolRuntime();
    expect(() => runtime.setTools([
      {
        id: 'adapter-tool',
        name: 'Adapter Tool',
        description: 'Needs adapter metadata',
        execution: { mode: 'adapter' },
      },
    ])).toThrow('must provide execution.adapterId');

    expect(() => runtime.setTools([
      {
        id: 'bad-server-tool',
        name: 'Bad Server Tool',
        description: 'Invalid adapter metadata for server mode',
        execution: { mode: 'server', adapterId: 'bridge-1' },
      },
    ])).toThrow("mode is 'server'");
  });

  it('enforces execution mode allowlist when replacing tool set', () => {
    const runtime = new ToolRuntime({
      allowedExecutionModes: ['client'],
    });

    expect(() => runtime.setTools([
      {
        id: 'server-tool',
        name: 'Server Tool',
        description: 'Server mode should be blocked',
        execution: { mode: 'server' },
      },
    ])).toThrow('not allowed by runtime policy');
  });

  it('validates tool input contract before handler execution', async () => {
    const runtime = new ToolRuntime();
    runtime.registerTool({
      id: 'rotate',
      name: 'Rotate',
      description: 'Rotate image',
      inputContract: z.object({
        degrees: z.number(),
      }),
    });
    runtime.registerHandler('rotate', () => ({ ok: true }));

    await expect(runtime.executeToolCall(
      {
        type: 'tool_call',
        toolId: 'rotate',
        args: {
          degrees: 'not-a-number',
        },
      },
      {
        interaction: createInteraction(),
        dataNodes: [],
      }
    )).rejects.toThrow('input contract validation failed');
  });

  it('validates tool output contract after handler execution', async () => {
    const runtime = new ToolRuntime();
    runtime.registerTool({
      id: 'rotate',
      name: 'Rotate',
      description: 'Rotate image',
      outputContract: z.object({
        summary: z.string(),
      }),
    });
    runtime.registerHandler('rotate', () => ({ bad: true }));

    await expect(runtime.executeToolCall(
      {
        type: 'tool_call',
        toolId: 'rotate',
      },
      {
        interaction: createInteraction(),
        dataNodes: [],
      }
    )).rejects.toThrow('output contract validation failed');
  });

  it('supports warn mode for schema validation without blocking execution', async () => {
    const runtime = new ToolRuntime({
      schemaValidationMode: 'warn',
    });

    runtime.registerTool({
      id: 'rotate',
      name: 'Rotate',
      description: 'Rotate image',
      inputContract: () => ({ success: false, error: 'invalid' }),
      outputContract: () => ({ success: false, error: 'invalid output' }),
    });

    let capturedArgs: Record<string, unknown> | undefined;
    runtime.registerHandler('rotate', ({ args }) => {
      capturedArgs = args;
      return { ok: true };
    });

    const execution = await runtime.executeToolCall(
      {
        type: 'tool_call',
        toolId: 'rotate',
        args: { degrees: 30 },
      },
      {
        interaction: createInteraction(),
        dataNodes: [],
      }
    );

    expect(capturedArgs).toEqual({ degrees: 30 });
    expect(execution.result).toEqual({ ok: true });
  });

  it('unregisters tools from engine runtime when cleanup callback is invoked', async () => {
    const spec: UIRenderSpec = {
      layout: 'stack',
      components: [
        {
          id: 'rotate-btn',
          type: 'Button',
          props: { label: 'Rotate' },
        },
      ],
    };

    const bindings: UIBinding[] = [
      {
        id: 'binding-rotate',
        componentId: 'rotate-btn',
        actionMatch: 'tool:rotate',
        action: {
          type: 'tool_call',
          toolId: 'rotate',
        },
      },
    ];

    const engine = createPresentationEngine({
      initialContext: {
        currentSpec: spec,
        currentBindings: bindings,
      },
    });

    const unregister = engine.registerTool(rotateTool, () => ({ ok: true }));
    const first = await engine.executeInteraction(createInteraction());

    expect(first[0].status).toBe('success');
    expect(engine.getState().context.tools.map((tool) => tool.id)).toEqual(['rotate']);

    unregister();

    const second = await engine.executeInteraction(createInteraction());
    expect(second[0].status).toBe('error');
    expect(second[0].error).toContain("Unknown tool 'rotate'");
    expect(engine.getState().context.tools).toHaveLength(0);
  });

  it('respects binding trigger matching when interaction trigger is provided', async () => {
    const spec: UIRenderSpec = {
      layout: 'stack',
      components: [
        {
          id: 'rotate-btn',
          type: 'Button',
          props: { label: 'Rotate' },
        },
      ],
    };

    const engine = createPresentationEngine({
      initialContext: {
        currentSpec: spec,
        currentBindings: [
          {
            id: 'binding-hover',
            componentId: 'rotate-btn',
            trigger: 'onMouseEnter',
            actionMatch: 'tool:rotate',
            action: {
              type: 'local_patch',
              patches: [
                {
                  targetId: 'rotate-btn',
                  propName: 'label',
                  value: 'Hovered',
                },
              ],
            },
          },
        ],
      },
    });

    const clickRecords = await engine.executeInteraction(createInteraction({
      trigger: 'onClick',
    }));
    expect(clickRecords).toHaveLength(0);

    const hoverRecords = await engine.executeInteraction(createInteraction({
      trigger: 'onMouseEnter',
    }));
    expect(hoverRecords).toHaveLength(1);
    expect(hoverRecords[0].status).toBe('success');
  });

  it('serializes concurrent interaction executions in deterministic order', async () => {
    const spec: UIRenderSpec = {
      layout: 'stack',
      components: [
        {
          id: 'status-text',
          type: 'Text',
          props: { content: 'idle' },
        },
        {
          id: 'rotate-btn',
          type: 'Button',
          props: { label: 'Rotate' },
        },
      ],
    };

    const engine = createPresentationEngine({
      initialContext: {
        currentSpec: spec,
        currentBindings: [
          {
            id: 'binding-queue',
            componentId: 'rotate-btn',
            actionMatch: 'tool:rotate',
            action: {
              type: 'tool_call',
              toolId: 'rotate',
              args: {
                value: { $event: 'newValue' },
              },
              resultPatches: [
                {
                  targetId: 'status-text',
                  propName: 'content',
                  value: { $result: 'summary' },
                },
              ],
            },
          },
        ],
      },
    });

    engine.registerTool(rotateTool, async ({ args }) => {
      const value = String(args.value);
      const delay = value === 'first' ? 40 : 1;
      await new Promise((resolve) => setTimeout(resolve, delay));
      return { summary: value };
    });

    await Promise.all([
      engine.executeInteraction(createInteraction({ newValue: 'first' })),
      engine.executeInteraction(createInteraction({ newValue: 'second' })),
    ]);

    const updated = engine.getState().currentSpec;
    const statusText = updated?.components.find((component) => component.id === 'status-text');
    expect(statusText?.props.content).toBe('second');
  });

  it('skips stale interaction commit when state changes mid-flight', async () => {
    const spec: UIRenderSpec = {
      layout: 'stack',
      components: [
        {
          id: 'angle-text',
          type: 'Text',
          props: { content: 'angle:0' },
        },
        {
          id: 'rotate-btn',
          type: 'Button',
          props: { label: 'Rotate' },
        },
      ],
    };

    const engine = createPresentationEngine({
      initialContext: {
        currentSpec: spec,
        currentBindings: [
          {
            id: 'binding-rotate',
            componentId: 'rotate-btn',
            actionMatch: 'tool:rotate',
            action: {
              type: 'tool_call',
              toolId: 'rotate',
              resultPatches: [
                {
                  targetId: 'angle-text',
                  propName: 'content',
                  value: { $result: 'summary' },
                },
              ],
            },
          },
        ],
      },
    });

    let release: (() => void) | undefined;
    engine.registerTool(rotateTool, () => new Promise((resolve) => {
      release = () => resolve({ summary: 'from-interaction' });
    }));

    const pending = engine.executeInteraction(createInteraction());
    for (let attempt = 0; attempt < 20 && !release; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    expect(release).toBeTypeOf('function');

    engine.applyPlan({
      plan_version: 0,
      mode: 'rebuild',
      confidence: 1,
      ui_spec: {
        layout: 'stack',
        components: [
          {
            id: 'angle-text',
            type: 'Text',
            props: { content: 'manual-change' },
          },
          {
            id: 'rotate-btn',
            type: 'Button',
            props: { label: 'Rotate' },
          },
        ],
      },
      bindings: engine.getState().bindings,
      rationale_short: 'manual overwrite',
    });

    release!();
    const records = await pending;

    expect(records).toHaveLength(1);
    expect(records[0].status).toBe('skipped');
    expect(records[0].error).toContain('skipped stale interaction result');

    const current = engine.getState().currentSpec;
    const angleText = current?.components.find((component) => component.id === 'angle-text');
    expect(angleText?.props.content).toBe('manual-change');
  });

  it('applies optimistic patches immediately for safe tool calls', async () => {
    const spec: UIRenderSpec = {
      layout: 'stack',
      components: [
        {
          id: 'status-text',
          type: 'Text',
          props: { content: 'idle' },
        },
        {
          id: 'rotate-btn',
          type: 'Button',
          props: { label: 'Rotate' },
        },
      ],
    };

    const tool: ToolManifest = {
      ...rotateTool,
      execution: { mode: 'client' },
    };

    const engine = createPresentationEngine({
      initialContext: {
        currentSpec: spec,
        currentBindings: [
          {
            id: 'binding-optimistic',
            componentId: 'rotate-btn',
            actionMatch: 'tool:rotate',
            action: {
              type: 'tool_call',
              toolId: 'rotate',
              optimisticPatches: [
                {
                  targetId: 'status-text',
                  propName: 'content',
                  value: 'optimistic',
                },
              ],
              resultPatches: [
                {
                  targetId: 'status-text',
                  propName: 'content',
                  value: { $result: 'summary' },
                },
              ],
            },
          },
        ],
        tools: [tool],
      },
    });

    let release: (() => void) | undefined;
    engine.registerToolHandler('rotate', () => new Promise((resolve) => {
      release = () => resolve({ summary: 'done' });
    }));

    const pending = engine.executeInteraction(createInteraction());
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const current = engine.getState().currentSpec;
      const status = current?.components.find((component) => component.id === 'status-text')?.props.content;
      if (status === 'optimistic') break;
      await new Promise((resolve) => setTimeout(resolve, 1));
    }

    const midSpec = engine.getState().currentSpec;
    const midStatus = midSpec?.components.find((component) => component.id === 'status-text')?.props.content;
    expect(midStatus).toBe('optimistic');
    expect(release).toBeTypeOf('function');

    release!();
    const records = await pending;
    const finalSpec = engine.getState().currentSpec;
    const finalStatus = finalSpec?.components.find((component) => component.id === 'status-text')?.props.content;

    expect(records[0].status).toBe('success');
    expect(records[0].lane).toBe('optimistic');
    expect(records[0].risk).toBe('safe');
    expect(typeof records[0].durationMs).toBe('number');
    expect(finalStatus).toBe('done');
  });

  it('uses busy fallback for risky tool calls until completion', async () => {
    const spec: UIRenderSpec = {
      layout: 'stack',
      components: [
        {
          id: 'status-text',
          type: 'Text',
          props: { content: 'idle' },
        },
        {
          id: 'rotate-btn',
          type: 'Button',
          props: { label: 'Rotate' },
        },
      ],
    };

    const tool: ToolManifest = {
      ...rotateTool,
      execution: { mode: 'server' },
    };

    const engine = createPresentationEngine({
      initialContext: {
        currentSpec: spec,
        currentBindings: [
          {
            id: 'binding-risky',
            componentId: 'rotate-btn',
            actionMatch: 'tool:rotate',
            action: {
              type: 'tool_call',
              toolId: 'rotate',
              resultPatches: [
                {
                  targetId: 'status-text',
                  propName: 'content',
                  value: { $result: 'summary' },
                },
              ],
            },
          },
        ],
        tools: [tool],
      },
    });

    let release: (() => void) | undefined;
    engine.registerToolHandler('rotate', () => new Promise((resolve) => {
      release = () => resolve({ summary: 'server-done' });
    }));

    const pending = engine.executeInteraction(createInteraction());
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const busy = engine.getState().currentSpec
        ?.components.find((component) => component.id === 'rotate-btn')
        ?.props.busy;
      if (busy === true) break;
      await new Promise((resolve) => setTimeout(resolve, 1));
    }

    const busyMid = engine.getState().currentSpec
      ?.components.find((component) => component.id === 'rotate-btn')
      ?.props.busy;
    expect(busyMid).toBe(true);
    expect(release).toBeTypeOf('function');

    release!();
    const records = await pending;

    const buttonBusy = engine.getState().currentSpec
      ?.components.find((component) => component.id === 'rotate-btn')
      ?.props.busy;
    const finalStatus = engine.getState().currentSpec
      ?.components.find((component) => component.id === 'status-text')
      ?.props.content;

    expect(records[0].lane).toBe('confirmed');
    expect(records[0].risk).toBe('risky');
    expect(buttonBusy).toBe(false);
    expect(finalStatus).toBe('server-done');
  });

  it('rolls back optimistic updates when tool call fails', async () => {
    const spec: UIRenderSpec = {
      layout: 'stack',
      components: [
        {
          id: 'status-text',
          type: 'Text',
          props: { content: 'idle' },
        },
        {
          id: 'rotate-btn',
          type: 'Button',
          props: { label: 'Rotate' },
        },
      ],
    };

    const engine = createPresentationEngine({
      initialContext: {
        currentSpec: spec,
        currentBindings: [
          {
            id: 'binding-rollback',
            componentId: 'rotate-btn',
            actionMatch: 'tool:rotate',
            action: {
              type: 'tool_call',
              toolId: 'rotate',
              optimisticPatches: [
                {
                  targetId: 'status-text',
                  propName: 'content',
                  value: 'optimistic',
                },
              ],
              policy: {
                lane: 'optimistic',
                risk: 'safe',
                rollbackMessage: 'Could not complete action. UI reverted.',
              },
            },
          },
        ],
        tools: [{ ...rotateTool, execution: { mode: 'client' } }],
      },
    });

    engine.registerToolHandler('rotate', () => {
      throw new Error('tool failed');
    });

    const records = await engine.executeInteraction(createInteraction());
    const finalStatus = engine.getState().currentSpec
      ?.components.find((component) => component.id === 'status-text')
      ?.props.content;

    expect(records[0].status).toBe('error');
    expect(records[0].rolledBack).toBe(true);
    expect(records[0].error).toBe('Could not complete action. UI reverted.');
    expect(finalStatus).toBe('idle');
  });

  it('allows overriding binding action handler strategy', async () => {
    const spec: UIRenderSpec = {
      layout: 'stack',
      components: [
        {
          id: 'status-text',
          type: 'Text',
          props: { content: 'idle' },
        },
        {
          id: 'rotate-btn',
          type: 'Button',
          props: { label: 'Rotate' },
        },
      ],
    };

    const engine = createPresentationEngine({
      initialContext: {
        currentSpec: spec,
        currentBindings: [
          {
            id: 'binding-local',
            componentId: 'rotate-btn',
            actionMatch: 'tool:rotate',
            action: {
              type: 'local_patch',
              patches: [
                {
                  targetId: 'status-text',
                  propName: 'content',
                  value: 'patched',
                },
              ],
            },
          },
        ],
      },
    });

    engine.registerBindingActionHandler('local_patch', async ({ spec: currentSpec, binding, input }) => ({
      updatedSpec: currentSpec,
      record: {
        bindingId: binding.id,
        interaction: input.interaction,
        timestamp: Date.now(),
        durationMs: 0,
        status: 'success',
        result: { intercepted: true },
      },
    }));

    const records = await engine.executeInteraction(createInteraction());
    const finalStatus = engine.getState().currentSpec
      ?.components.find((component) => component.id === 'status-text')
      ?.props.content;

    expect(records[0].status).toBe('success');
    expect(records[0].result).toEqual({ intercepted: true });
    expect(finalStatus).toBe('idle');
  });

  it('emits semantic_event records as skipped by default', async () => {
    const spec: UIRenderSpec = {
      layout: 'stack',
      components: [
        {
          id: 'doc-btn',
          type: 'Button',
          props: { label: 'Open Ref' },
        },
      ],
    };

    const engine = createPresentationEngine({
      initialContext: {
        currentSpec: spec,
        currentBindings: [
          {
            id: 'binding-semantic',
            componentId: 'doc-btn',
            actionMatch: 'open_reference',
            action: {
              type: 'semantic_event',
              semanticAction: 'open_reference',
              description: 'Open linked reference',
              payload: {
                url: 'https://example.com/ref',
              },
            },
          },
        ],
      },
    });

    const records = await engine.executeInteraction(createInteraction({
      elementId: 'doc-btn',
      action: 'open_reference',
    }));

    expect(records).toHaveLength(1);
    expect(records[0].status).toBe('skipped');
    expect(records[0].result).toMatchObject({
      semanticAction: 'open_reference',
      description: 'Open linked reference',
      payload: {
        url: 'https://example.com/ref',
      },
    });
  });
});
