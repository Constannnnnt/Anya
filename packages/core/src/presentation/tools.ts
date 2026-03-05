/**
 * Binding action execution runtime.
 * Resolves interaction values, validates tool contracts, and applies result patches.
 */
import type { UIInteractionRecord, UIRenderSpec } from '../types';
import { getLogger } from '../logging';
import type {
  BindingAction,
  BindingExecutionRecord,
  BindingValueExpression,
  DataNode,
  LocalPatchOperation,
  ToolExecutionMode,
  ToolManifest,
  ToolSchemaContract,
  ToolSchemaValidationResult,
  UIBinding,
} from './types';
import { applyLocalUIUpdates } from './uiUpdater';

type DataBindingSelector = {
  nodeId: string;
  path?: string;
  fallback?: unknown;
};

function isDataBindingSelector(value: unknown): value is DataBindingSelector {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.nodeId !== 'string') return false;
  if ('path' in candidate && candidate.path !== undefined && typeof candidate.path !== 'string') {
    return false;
  }
  return true;
}

function getByPath(input: unknown, path: string): unknown {
  if (!path) return input;
  const segments = path.split('.').filter(Boolean);
  let current: unknown = input;
  for (const segment of segments) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function findDataNode(dataNodes: DataNode[], id: string): DataNode | undefined {
  return dataNodes.find((node) => node.id === id);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export interface BindingExecutionContext {
  interaction: UIInteractionRecord;
  dataNodes: DataNode[];
  result?: unknown;
}

/** Resolves a binding expression against event/data/result context. */
export function resolveBindingValue(
  expression: BindingValueExpression | undefined,
  context: BindingExecutionContext
): unknown {
  if (!expression || typeof expression !== 'object' || Array.isArray(expression)) {
    return expression;
  }

  if ('$event' in expression && typeof expression.$event === 'string') {
    return getByPath(context.interaction, expression.$event);
  }

  if ('$result' in expression && typeof expression.$result === 'string') {
    return getByPath(context.result, expression.$result);
  }

  if (
    '$data' in expression
    && typeof expression.$data === 'object'
    && expression.$data !== null
    && isDataBindingSelector(expression.$data)
  ) {
    const selector = expression.$data;
    const node = findDataNode(context.dataNodes, selector.nodeId);
    if (!node) return selector.fallback;
    const extracted = selector.path
      ? getByPath(node.payload, selector.path)
      : node.payload;
    return extracted === undefined ? selector.fallback : extracted;
  }

  return expression;
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
  tool: ToolManifest;
  args: Record<string, unknown>;
  interaction: UIInteractionRecord;
}) => Promise<unknown> | unknown;

type ToolSchemaValidationMode = 'off' | 'warn' | 'error';

function normalizeSchemaValidationResult(result: unknown): ToolSchemaValidationResult {
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
  contract: ToolSchemaContract | undefined,
  value: unknown
): ToolSchemaValidationResult {
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
  private tools = new Map<string, ToolManifest>();
  private handlers = new Map<string, ToolHandler>();
  private allowedToolIds: Set<string> | null;
  private defaultTimeoutMs: number;
  private allowedExecutionModes: Set<ToolExecutionMode>;
  private schemaValidationMode: ToolSchemaValidationMode;

  constructor(opts?: {
    allowedToolIds?: string[];
    defaultTimeoutMs?: number;
    allowedExecutionModes?: ToolExecutionMode[];
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

  private ensureValidManifest(tool: ToolManifest): void {
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
    tool: ToolManifest,
    result: ToolSchemaValidationResult
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

  registerTool(tool: ToolManifest): void {
    this.ensureAllowed(tool.id);
    this.ensureValidManifest(tool);
    this.tools.set(tool.id, tool);
  }

  registerTools(tools: ToolManifest[]): void {
    for (const tool of tools) {
      this.registerTool(tool);
    }
  }

  setTools(tools: ToolManifest[]): void {
    const nextTools = new Map<string, ToolManifest>();
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
    this.tools.delete(toolId);
    this.handlers.delete(toolId);
  }

  listTools(): ToolManifest[] {
    return Array.from(this.tools.values());
  }

  registerHandler(toolId: string, handler: ToolHandler): () => void {
    this.handlers.set(toolId, handler);
    return () => {
      this.handlers.delete(toolId);
    };
  }

  async executeToolCall(action: Extract<BindingAction, { type: 'tool_call' }>, input: {
    interaction: UIInteractionRecord;
    dataNodes: DataNode[];
  }): Promise<{
    toolId: string;
    args: Record<string, unknown>;
    result: unknown;
    resultPatches: LocalPatchOperation[];
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

export interface BindingExecutionOutcome {
  updatedSpec: UIRenderSpec;
  record: BindingExecutionRecord;
}

export interface BindingActionExecutionInput {
  action: BindingAction;
  spec: UIRenderSpec;
  binding: UIBinding;
  runtime: ToolRuntime;
  input: {
    interaction: UIInteractionRecord;
    dataNodes: DataNode[];
  };
}

export interface BindingActionHandlerContext {
  execute: (action: BindingAction, spec: UIRenderSpec) => Promise<BindingExecutionOutcome>;
}

export type BindingActionHandler<TAction extends BindingAction = BindingAction> = (
  input: Omit<BindingActionExecutionInput, 'action'> & { action: TAction },
  context: BindingActionHandlerContext
) => Promise<BindingExecutionOutcome>;

function createBaseRecord(input: BindingActionExecutionInput): {
  startedAt: number;
  baseRecord: Pick<BindingExecutionRecord, 'bindingId' | 'interaction' | 'timestamp'>;
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
  input: Omit<BindingActionExecutionInput, 'action'> & {
    action: Extract<BindingAction, { type: 'local_patch' }>;
  }
): Promise<BindingExecutionOutcome> {
  const { startedAt, baseRecord } = createBaseRecord(input);
  const patched = applyLocalUIUpdates(
    input.spec,
    input.action.patches,
    (value: BindingValueExpression | undefined) => resolveBindingValue(value, {
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
  input: Omit<BindingActionExecutionInput, 'action'> & {
    action: Extract<BindingAction, { type: 'semantic_event' }>;
  }
): Promise<BindingExecutionOutcome> {
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
  input: Omit<BindingActionExecutionInput, 'action'> & {
    action: Extract<BindingAction, { type: 'tool_call' }>;
  }
): Promise<BindingExecutionOutcome> {
  const { startedAt, baseRecord } = createBaseRecord(input);

  try {
    const execution = await input.runtime.executeToolCall(input.action, input.input);

    let updatedSpec = input.spec;
    if (execution.resultPatches.length > 0) {
      const patched = applyLocalUIUpdates(
        input.spec,
        execution.resultPatches,
        (value: BindingValueExpression | undefined) => resolveBindingValue(value, {
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
  input: Omit<BindingActionExecutionInput, 'action'> & {
    action: Extract<BindingAction, { type: 'composite' }>;
  },
  context: BindingActionHandlerContext
): Promise<BindingExecutionOutcome> {
  const { startedAt, baseRecord } = createBaseRecord(input);
  let updatedSpec = input.spec;
  let lastRecord: BindingExecutionRecord = {
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


async function defaultUrlNavigationHandler(
  input: Omit<BindingActionExecutionInput, 'action'> & {
    action: Extract<BindingAction, { type: 'url_navigation' }>;
  }
): Promise<BindingExecutionOutcome> {
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
/** Dispatches one binding action to a registered action strategy handler. */
export class BindingActionExecutor {
  private handlers = new Map<BindingAction['type'], BindingActionHandler<any>>();

  constructor() {
    this.registerHandler('local_patch', (input) => defaultLocalPatchHandler(input));
    this.registerHandler('semantic_event', (input) => defaultSemanticEventHandler(input));
    this.registerHandler('tool_call', (input) => defaultToolCallHandler(input));
    this.registerHandler('composite', (input, context) => defaultCompositeHandler(input, context));
    this.registerHandler('url_navigation', (input) => defaultUrlNavigationHandler(input));
  }

  registerHandler<TType extends BindingAction['type']>(
    type: TType,
    handler: BindingActionHandler<Extract<BindingAction, { type: TType }>>
  ): () => void {
    this.handlers.set(type, handler as BindingActionHandler<any>);
    return () => {
      this.handlers.delete(type);
    };
  }

  async execute(input: BindingActionExecutionInput): Promise<BindingExecutionOutcome> {
    const handler = this.handlers.get(input.action.type);
    if (!handler) {
      throw new Error(`[BindingActionExecutor] No handler registered for action type '${input.action.type}'.`);
    }

    return handler(
      input as Omit<BindingActionExecutionInput, 'action'> & {
        action: Extract<BindingAction, { type: typeof input.action.type }>;
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

const DEFAULT_BINDING_ACTION_EXECUTOR = new BindingActionExecutor();

export async function executeBindingAction(
  action: BindingAction,
  spec: UIRenderSpec,
  binding: UIBinding,
  runtime: ToolRuntime,
  input: {
    interaction: UIInteractionRecord;
    dataNodes: DataNode[];
  }
): Promise<BindingExecutionOutcome> {
  return DEFAULT_BINDING_ACTION_EXECUTOR.execute({
    action,
    spec,
    binding,
    runtime,
    input,
  });
}
