/**
 * View action execution runtime.
 * Resolves interaction values, validates tool contracts, and applies result patches.
 */
import type { UIInteractionRecord, ViewSpec } from '../types';
import { getLogger } from '../logging';
import type {
  ActionBinding,
  ActionCommand,
  ActionResult,
  LocalViewChange,
  StateNode,
  ToolContract,
  ToolContractResult,
  ToolDefinition,
  ToolMode,
  ValueExpression,
} from './types';
import { applyLocalViewChanges } from './updater';

type DataBindingSelector = {
  nodeId: string;
  path?: string;
  transform?: string;
};

function isDataBindingSelector(value: unknown): value is DataBindingSelector {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.nodeId !== 'string') return false;
  if ('path' in candidate && candidate.path !== undefined && typeof candidate.path !== 'string') {
    return false;
  }
  if ('transform' in candidate && candidate.transform !== undefined && typeof candidate.transform !== 'string') {
    return false;
  }
  return true;
}

export function getByPath(input: unknown, path: string): unknown {
  if (!path) return input;
  const segments = path.replace(/\[(\w+)\]/g, '.$1').split('.').filter(Boolean);
  let current: unknown = input;
  for (const segment of segments) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

export function setDeepValue(obj: any, path: string, value: any): void {
  if (!path) return;
  const segments = path.replace(/\[(\w+)\]/g, '.$1').split('.').filter(Boolean);
  let current = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    if (!(segment in current)) {
      current[segment] = {};
    }
    current = current[segment];
  }
  current[segments[segments.length - 1]] = value;
}

function findStateNode(dataNodes: StateNode[], id: string): StateNode | undefined {
  return dataNodes.find((node) => node.id === id);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export interface ActionExecutionContext {
  interaction: UIInteractionRecord;
  dataNodes: StateNode[];
  result?: unknown;
}

function applyDataTransform(value: unknown, transform: string): unknown {
  try {
    const evaluator = new Function('x', `"use strict"; return (${transform});`);
    return evaluator(value);
  } catch (error) {
    getLogger().warn(`[BindingResolver] Failed to evaluate $data transform "${transform}".`, error);
    return value;
  }
}

/** Resolves a binding expression against event/data/result context. */
export function resolveBindingValue(
  expression: ValueExpression | undefined,
  context: ActionExecutionContext
): unknown {
  if (!expression || typeof expression !== 'object') {
    return expression;
  }

  if (Array.isArray(expression)) {
    return expression.map((item) => resolveBindingValue(item as ValueExpression, context));
  }

  if ('$event' in expression && typeof expression.$event === 'string') {
    return context.interaction ? getByPath(context.interaction, expression.$event) : undefined;
  }

  if ('$result' in expression && typeof expression.$result === 'string') {
    return context.result ? getByPath(context.result, expression.$result) : undefined;
  }

  if (
    '$data' in expression
    && typeof (expression as any).$data === 'object'
    && (expression as any).$data !== null
    && isDataBindingSelector((expression as any).$data)
  ) {
    const selector = (expression as any).$data;
    const node = findStateNode(context.dataNodes, selector.nodeId);
    if (!node) return undefined;
    const extracted = selector.path
      ? getByPath(node.payload, selector.path)
      : node.payload;
    return typeof selector.transform === 'string'
      ? applyDataTransform(extracted, selector.transform)
      : extracted;
  }

  // Plain object: recurse into properties
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(expression)) {
    resolved[key] = resolveBindingValue(value as ValueExpression, context);
  }
  return resolved;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;

  return await new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Tool execution timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    void promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

export type ToolHandler = (input: {
  tool: ToolDefinition;
  args: Record<string, unknown>;
  interaction: UIInteractionRecord;
}) => Promise<unknown> | unknown;

type ToolSchemaValidationMode = 'off' | 'warn' | 'error';

function normalizeSchemaValidationResult(result: unknown): ToolContractResult {
  if (typeof result === 'boolean') {
    return result
      ? { success: true, value: undefined }
      : { success: false, error: 'Validation returned false.' };
  }

  if (isRecord(result) && 'success' in result && typeof result.success === 'boolean') {
    if (result.success) {
      return {
        success: true,
        value: 'value' in result ? result.value : undefined,
      };
    }
    return {
      success: false,
      error: typeof result.error === 'string'
        ? result.error
        : 'Validation failed.',
    };
  }

  return { success: true, value: result };
}

function validateWithContract(
  contract: ToolContract | undefined,
  value: unknown
): ToolContractResult {
  if (!contract) {
    return { success: true, value };
  }

  if (typeof contract === 'function') {
    try {
      return normalizeSchemaValidationResult(contract(value));
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  if (isRecord(contract) && typeof contract.safeParse === 'function') {
    try {
      const parsed = contract.safeParse(value);
      if (parsed.success) {
        return { success: true, value: parsed.data };
      }
      return {
        success: false,
        error: String(parsed.error ?? 'Validation failed.'),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  if (isRecord(contract) && typeof contract.parse === 'function') {
    try {
      return { success: true, value: contract.parse(value) };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // Unknown contract shapes are treated as advisory metadata for now.
  return { success: true, value };
}

/** Runtime registry + executor for tool manifests and handlers. */
export class ToolRuntime {
  private tools = new Map<string, ToolDefinition>();
  private handlers = new Map<string, ToolHandler>();
  private allowedToolIds: Set<string> | null;
  private defaultTimeoutMs: number;
  private allowedExecutionModes: Set<ToolMode>;
  private schemaValidationMode: ToolSchemaValidationMode;

  constructor(opts?: {
    allowedToolIds?: string[];
    defaultTimeoutMs?: number;
    allowedExecutionModes?: ToolMode[];
    schemaValidationMode?: ToolSchemaValidationMode;
  }) {
    this.allowedToolIds =
      opts?.allowedToolIds && opts.allowedToolIds.length > 0
        ? new Set(opts.allowedToolIds)
        : null;
    this.defaultTimeoutMs = opts?.defaultTimeoutMs ?? 8000;
    this.allowedExecutionModes = new Set(opts?.allowedExecutionModes ?? ['client', 'server', 'adapter']);
    this.schemaValidationMode = opts?.schemaValidationMode ?? 'error';
  }

  private ensureAllowed(toolId: string): void {
    if (this.allowedToolIds && !this.allowedToolIds.has(toolId)) {
      throw new Error(`[ToolRuntime] Tool '${toolId}' is not allowed by policy.`);
    }
  }

  private ensureValidManifest(tool: ToolDefinition): void {
    const mode = tool.execution?.mode ?? 'server';
    if (!this.allowedExecutionModes.has(mode)) {
      throw new Error(
        `[ToolRuntime] Tool '${tool.id}' uses execution mode '${mode}', which is not allowed by runtime policy.`
      );
    }

    if (mode === 'adapter' && !tool.execution?.adapterId?.trim()) {
      throw new Error(
        `[ToolRuntime] Tool '${tool.id}' uses adapter mode and must provide execution.adapterId.`
      );
    }

    if (mode !== 'adapter' && tool.execution?.adapterId) {
      throw new Error(
        `[ToolRuntime] Tool '${tool.id}' provides execution.adapterId but mode is '${mode}'.`
      );
    }
  }

  private applySchemaPolicy(
    stage: 'input' | 'output',
    tool: ToolDefinition,
    result: ToolContractResult
  ): { value: unknown } {
    if (result.success) {
      return {
        value: result.value,
      };
    }

    const message = `[ToolRuntime] Tool '${tool.id}' ${stage} contract validation failed: ${result.error}`;
    if (this.schemaValidationMode === 'off') {
      return { value: undefined };
    }
    if (this.schemaValidationMode === 'warn') {
      getLogger().warn(message);
      return { value: undefined };
    }
    throw new Error(message);
  }

  registerTool(tool: ToolDefinition): void {
    this.ensureAllowed(tool.id);
    this.ensureValidManifest(tool);
    this.tools.set(tool.id, tool);
  }

  registerTools(tools: ToolDefinition[]): void {
    for (const tool of tools) {
      this.registerTool(tool);
    }
  }

  setTools(tools: ToolDefinition[]): void {
    const nextTools = new Map<string, ToolDefinition>();
    for (const tool of tools) {
      this.ensureAllowed(tool.id);
      this.ensureValidManifest(tool);
      nextTools.set(tool.id, tool);
    }

    this.tools = nextTools;

    for (const handlerToolId of Array.from(this.handlers.keys())) {
      if (!nextTools.has(handlerToolId)) {
        this.handlers.delete(handlerToolId);
      }
    }
  }

  unregisterTool(toolId: string): void {
    this.unregisterToolIfCurrent(toolId);
  }

  listTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  registerHandler(toolId: string, handler: ToolHandler): () => void {
    this.handlers.set(toolId, handler);
    return () => {
      if (this.handlers.get(toolId) === handler) {
        this.handlers.delete(toolId);
      }
    };
  }

  clearHandler(toolId: string): void {
    this.handlers.delete(toolId);
  }

  getHandler(toolId: string): ToolHandler | undefined {
    return this.handlers.get(toolId);
  }

  unregisterToolIfCurrent(toolId: string, expectedTool?: ToolDefinition): void {
    const currentTool = this.tools.get(toolId);
    if (!currentTool) {
      return;
    }

    if (expectedTool && currentTool !== expectedTool) {
      return;
    }

    this.tools.delete(toolId);
    this.handlers.delete(toolId);
  }

  async executeToolCall(action: Extract<ActionCommand, { type: 'tool_call' }>, input: {
    interaction: UIInteractionRecord;
    dataNodes: StateNode[];
  }): Promise<{
    toolId: string;
    args: Record<string, unknown>;
    result: unknown;
    resultPatches: LocalViewChange[];
  }> {
    const tool = this.tools.get(action.toolId);
    if (!tool) {
      throw new Error(`[ToolRuntime] Unknown tool '${action.toolId}'.`);
    }

    const handler = this.handlers.get(action.toolId);
    if (!handler) {
      throw new Error(`[ToolRuntime] No handler registered for tool '${action.toolId}'.`);
    }

    const args: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(action.args ?? {})) {
      args[key] = resolveBindingValue(value, {
        interaction: input.interaction,
        dataNodes: input.dataNodes,
      });
    }

    const inputContract = tool.inputContract;
    const validatedInput = validateWithContract(inputContract, args);
    const inputPolicyResult = this.applySchemaPolicy('input', tool, validatedInput);
    const validatedArgs = validatedInput.success && isRecord(inputPolicyResult.value)
      ? inputPolicyResult.value
      : args;

    const result = await withTimeout(
      Promise.resolve(handler({
        tool,
        args: validatedArgs,
        interaction: input.interaction,
      })),
      action.timeoutMs ?? this.defaultTimeoutMs
    );

    const outputContract = tool.outputContract;
    const validatedOutput = validateWithContract(outputContract, result);
    const outputPolicyResult = this.applySchemaPolicy('output', tool, validatedOutput);
    const validatedResult = validatedOutput.success && outputPolicyResult.value !== undefined
      ? outputPolicyResult.value
      : result;

    return {
      toolId: action.toolId,
      args: validatedArgs,
      result: validatedResult,
      resultPatches: action.resultPatches ?? [],
    };
  }
}

export interface ActionExecutionOutcome {
  updatedSpec: ViewSpec;
  record: ActionResult;
}

export interface ActionCommandInput {
  action: ActionCommand;
  spec: ViewSpec;
  binding: ActionBinding;
  runtime: ToolRuntime;
  input: {
    interaction: UIInteractionRecord;
    dataNodes: StateNode[];
  };
}

export interface ActionCommandHandlerContext {
  execute: (action: ActionCommand, spec: ViewSpec) => Promise<ActionExecutionOutcome>;
}

export type ActionCommandHandler<TAction extends ActionCommand = ActionCommand> = (
  input: Omit<ActionCommandInput, 'action'> & { action: TAction },
  context: ActionCommandHandlerContext
) => Promise<ActionExecutionOutcome>;

type AnyActionCommandHandler = (
  input: Omit<ActionCommandInput, 'action'> & { action: ActionCommand },
  context: ActionCommandHandlerContext
) => Promise<ActionExecutionOutcome>;

function createBaseRecord(input: ActionCommandInput): {
  startedAt: number;
  baseRecord: Pick<ActionResult, 'bindingId' | 'interaction' | 'timestamp'>;
} {
  const startedAt = Date.now();
  return {
    startedAt,
    baseRecord: {
      bindingId: input.binding.id,
      interaction: input.input.interaction,
      timestamp: startedAt,
    },
  };
}

async function defaultLocalPatchHandler(
  input: Omit<ActionCommandInput, 'action'> & {
    action: Extract<ActionCommand, { type: 'local_patch' }>;
  }
): Promise<ActionExecutionOutcome> {
  const { startedAt, baseRecord } = createBaseRecord(input);
  const patched = applyLocalViewChanges(
    input.spec,
    input.action.patches,
    (value: ValueExpression | undefined) => resolveBindingValue(value, {
      interaction: input.input.interaction,
      dataNodes: input.input.dataNodes,
    })
  );

  return {
    updatedSpec: patched.updatedSpec,
    record: {
      ...baseRecord,
      durationMs: Date.now() - startedAt,
      status: patched.applied > 0 ? 'success' : 'skipped',
    },
  };
}

async function defaultSemanticEventHandler(
  input: Omit<ActionCommandInput, 'action'> & {
    action: Extract<ActionCommand, { type: 'semantic_event' }>;
  }
): Promise<ActionExecutionOutcome> {
  const { startedAt, baseRecord } = createBaseRecord(input);

  const resolvedPayload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input.action.payload ?? {})) {
    resolvedPayload[key] = resolveBindingValue(value, {
      interaction: input.input.interaction,
      dataNodes: input.input.dataNodes,
    });
  }

  return {
    updatedSpec: input.spec,
    record: {
      ...baseRecord,
      durationMs: Date.now() - startedAt,
      status: 'skipped',
      result: {
        semanticAction: input.action.semanticAction,
        description: input.action.description,
        payload: resolvedPayload,
      },
      error: `No semantic handler registered for '${input.action.semanticAction}'.`,
    },
  };
}

async function defaultToolCallHandler(
  input: Omit<ActionCommandInput, 'action'> & {
    action: Extract<ActionCommand, { type: 'tool_call' }>;
  }
): Promise<ActionExecutionOutcome> {
  const { startedAt, baseRecord } = createBaseRecord(input);

  try {
    const execution = await input.runtime.executeToolCall(input.action, input.input);

    let updatedSpec = input.spec;
    if (execution.resultPatches.length > 0) {
      const patched = applyLocalViewChanges(
        input.spec,
        execution.resultPatches,
        (value: ValueExpression | undefined) => resolveBindingValue(value, {
          interaction: input.input.interaction,
          dataNodes: input.input.dataNodes,
          result: execution.result,
        })
      );
      updatedSpec = patched.updatedSpec;
    }

    return {
      updatedSpec,
      record: {
        ...baseRecord,
        durationMs: Date.now() - startedAt,
        toolId: execution.toolId,
        status: 'success',
        result: execution.result,
      },
    };
  } catch (error) {
    return {
      updatedSpec: input.spec,
      record: {
        ...baseRecord,
        durationMs: Date.now() - startedAt,
        toolId: input.action.toolId,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function defaultCompositeHandler(
  input: Omit<ActionCommandInput, 'action'> & {
    action: Extract<ActionCommand, { type: 'composite' }>;
  },
  context: ActionCommandHandlerContext
): Promise<ActionExecutionOutcome> {
  const { startedAt, baseRecord } = createBaseRecord(input);
  let updatedSpec = input.spec;
  let lastRecord: ActionResult = {
    ...baseRecord,
    durationMs: 0,
    status: 'skipped',
  };

  for (const nested of input.action.actions) {
    const outcome = await context.execute(nested, updatedSpec);
    updatedSpec = outcome.updatedSpec;
    lastRecord = outcome.record;
  }

  return {
    updatedSpec,
    record: {
      ...lastRecord,
      durationMs: Date.now() - startedAt,
    },
  };
}


async function defaultCalculationHandler(
  input: Omit<ActionCommandInput, 'action'> & {
    action: Extract<ActionCommand, { type: 'tool_call' } & { toolId: 'register_calculation' }>;
  }
): Promise<ActionExecutionOutcome> {
  const { startedAt, baseRecord } = createBaseRecord(input);
  // This is a meta-tool handled directly by the engine usually, 
  // but we can implementation a placeholder or a direct registration if we have engine access.
  // For now, we'll return success and let the engine's registerTool handle the logic.
  return {
    updatedSpec: input.spec,
    record: {
      ...baseRecord,
      durationMs: Date.now() - startedAt,
      status: 'success',
    },
  };
}

async function defaultUrlNavigationHandler(
  input: Omit<ActionCommandInput, 'action'> & {
    action: Extract<ActionCommand, { type: 'url_navigation' }>;
  }
): Promise<ActionExecutionOutcome> {
  const { startedAt, baseRecord } = createBaseRecord(input);

  return {
    updatedSpec: input.spec,
    record: {
      ...baseRecord,
      durationMs: Date.now() - startedAt,
      status: 'success',
      result: {
        type: 'url_navigation',
        url: input.action.url,
        route: input.action.route,
        description: input.action.description,
      },
    },
  };
}
/** Dispatches one action command to a registered action strategy handler. */
export class ActionCommandRunner {
  private handlers = new Map<ActionCommand['type'], AnyActionCommandHandler>();

  constructor() {
    this.registerHandler('local_patch', (input) => defaultLocalPatchHandler(input));
    this.registerHandler('semantic_event', (input) => defaultSemanticEventHandler(input));
    this.registerHandler('tool_call', (input) => defaultToolCallHandler(input));
    this.registerHandler('composite', (input, context) => defaultCompositeHandler(input, context));
    this.registerHandler('url_navigation', (input) => defaultUrlNavigationHandler(input));
  }

  registerHandler<TType extends ActionCommand['type']>(
    type: TType,
    handler: ActionCommandHandler<Extract<ActionCommand, { type: TType }>>
  ): () => void {
    const wrappedHandler: AnyActionCommandHandler = async (input, context) => {
      if (input.action.type !== type) {
        throw new Error(
          `[ActionCommandRunner] Handler type mismatch. Expected '${type}', received '${input.action.type}'.`
        );
      }
      const typedInput = input as Omit<ActionCommandInput, 'action'> & {
        action: Extract<ActionCommand, { type: TType }>;
      };
      return handler(typedInput, context);
    };
    this.handlers.set(type, wrappedHandler);
    return () => {
      if (this.handlers.get(type) === wrappedHandler) {
        this.handlers.delete(type);
      }
    };
  }

  async execute(input: ActionCommandInput): Promise<ActionExecutionOutcome> {
    const handler = this.handlers.get(input.action.type);
    if (!handler) {
      throw new Error(`[ActionCommandRunner] No handler registered for action type '${input.action.type}'.`);
    }

    return handler(
      input as Omit<ActionCommandInput, 'action'> & {
        action: Extract<ActionCommand, { type: typeof input.action.type }>;
      },
      {
        execute: async (action, spec) => this.execute({
          ...input,
          action,
          spec,
        }),
      }
    );
  }
}

const DEFAULT_ACTION_COMMAND_RUNNER = new ActionCommandRunner();

export async function runActionCommand(
  action: ActionCommand,
  spec: ViewSpec,
  binding: ActionBinding,
  runtime: ToolRuntime,
  input: {
    interaction: UIInteractionRecord;
    dataNodes: StateNode[];
  }
): Promise<ActionExecutionOutcome> {
  return DEFAULT_ACTION_COMMAND_RUNNER.execute({
    action,
    spec,
    binding,
    runtime,
    input,
  });
}
