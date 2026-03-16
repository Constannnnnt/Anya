import type {
  InteractionAction,
  InteractionTrigger,
  UIComponentSpec,
  UIInteractionRecord,
  UIRenderSpec,
} from '../types';

export const CURRENT_PRESENTATION_PLAN_VERSION = 0 as const;

export type DataNodeKind =
  | 'json'
  | 'array'
  | 'image'
  | 'document'
  | 'text'
  | (string & {});

export interface DataNode {
  id: string;
  kind: DataNodeKind;
  payload: unknown;
  schema?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  updatedAt?: number;
}

export interface PresentationSkill {
  name: string;
  description: string;
  components: string[];
  contextInputs?: string[];
  outputExpectations?: string[];
  sop?: {
    objective: string;
    whenToUse?: string[];
    steps?: string[];
    checklist?: Array<{
      id: string;
      title: string;
      doneWhen: string;
      required?: boolean;
    }>;
    guardrails?: string[];
  };
  expandable?: boolean;
  defaultLayout?: UIRenderSpec['layout'];
}

export type WorkflowContextDefinition = PresentationSkill;

export interface ProjectionComponentTypes {
  heading: string;
  card: string;
  image: string;
  list: string;
  listItem: string;
  text: string;
  section: string;
  button: string;
}

export type ToolExecutionMode = 'client' | 'server' | 'adapter';

export interface ToolSchemaValidationSuccess {
  success: true;
  value: unknown;
}

export interface ToolSchemaValidationFailure {
  success: false;
  error: string;
}

export type ToolSchemaValidationResult = ToolSchemaValidationSuccess | ToolSchemaValidationFailure;

/**
 * Host apps can use:
 * - zod schemas (`safeParse` / `parse`)
 * - custom validator functions
 * - any future schema adapter object
 */
export type ToolSchemaContract =
  | {
      safeParse: (value: unknown) => {
        success: boolean;
        data?: unknown;
        error?: unknown;
      };
    }
  | {
      parse: (value: unknown) => unknown;
    }
  | ((value: unknown) => boolean | ToolSchemaValidationResult | unknown)
  | unknown;

export interface ToolManifest {
  id: string;
  name: string;
  description: string;
  /** Preferred name for tool input validation contract. */
  inputContract?: ToolSchemaContract;
  /** Preferred name for tool output validation contract. */
  outputContract?: ToolSchemaContract;
  execution?: {
    mode: ToolExecutionMode;
    adapterId?: string;
  };
  capabilities?: string[];
}

export type BindingValueExpression =
  | unknown
  | { $event: string }
  | { $data: { nodeId: string; path?: string } }
  | { $result: string };

export interface LocalPatchOperation {
  targetId: string;
  propName?: string;
  value?: BindingValueExpression;
  remove?: boolean;
  merge?: boolean;
  props?: Record<string, BindingValueExpression>;
}

export type ToolExecutionLane = 'optimistic' | 'confirmed';
export type ToolRiskLevel = 'safe' | 'risky';

export interface ToolCallPolicy {
  lane?: ToolExecutionLane;
  risk?: ToolRiskLevel;
  rollbackMessage?: string;
}

export type BindingAction =
  | {
      type: 'local_patch';
      patches: LocalPatchOperation[];
    }
  | {
      type: 'semantic_event';
      semanticAction: string;
      description?: string;
      payload?: Record<string, BindingValueExpression>;
    }
  | {
      type: 'tool_call';
      toolId: string;
      args?: Record<string, BindingValueExpression>;
      timeoutMs?: number;
      optimisticPatches?: LocalPatchOperation[];
      resultPatches?: LocalPatchOperation[];
      policy?: ToolCallPolicy;
    }
  | {
      type: 'url_navigation';
      url?: string;
      route?: string;
      description?: string;
    }
  | {
      type: 'data_update';
      nodeId: string;
      path?: string;
      value: BindingValueExpression;
    }
  | {
      type: 'composite';
      actions: BindingAction[];
    };

export interface UIBinding {
  id: string;
  componentId: string;
  trigger?: InteractionTrigger;
  actionMatch?: InteractionAction;
  description?: string;
  action: BindingAction;
}

export type PresentationOperation =
  | {
      type: 'upsert_component';
      component: UIComponentSpec;
      parentId?: string;
    }
  | {
      type: 'remove_component';
      componentId: string;
    }
  | {
      type: 'replace_components';
      components: UIComponentSpec[];
    }
  | {
      type: 'upsert_binding';
      binding: UIBinding;
    }
  | {
      type: 'remove_binding';
      bindingId: string;
    };

export type PresentationMode = 'patch' | 'rebuild';

export interface ContextEnvelope {
  data?: Record<string, unknown>;
  tools?: Record<string, unknown>;
  workflow?: Record<string, unknown>;
  memory?: Record<string, unknown>;
  constraints?: Record<string, unknown>;
}

export interface PresentationPlanningPolicy {
  patchComplexityBudget?: number;
  patchComplexityBaselineMin?: number;
  patchConfidenceBase?: number;
  rebuildConfidenceBase?: number;
}

export type PresentationPlannerStrategyName =
  | 'deterministic'
  | 'always_rebuild'
  | 'always_patch';

export interface PresentationContext {
  context_version?: 0;
  contextEnvelope?: ContextEnvelope;
  dataNodes: DataNode[];
  tools: ToolManifest[];
  workflowContext?: string;
  availableWorkflowContexts?: WorkflowContextDefinition[];
  candidateSpec?: UIRenderSpec | null;
  candidateBindings?: UIBinding[];
  currentSpec?: UIRenderSpec | null;
  currentBindings?: UIBinding[];
  requestedMode?: PresentationMode;
  plannerStrategy?: PresentationPlannerStrategyName;
  planningPolicy?: PresentationPlanningPolicy;
  newUserContext?: string;
  projectionComponents?: Partial<ProjectionComponentTypes>;
  sessionHistory?: UIInteractionRecord[];
  persistentProfile?: string;
}

export interface PresentationPlan {
  plan_version?: 0;
  strategy?: PresentationPlannerStrategyName;
  reasons?: string[];
  mode: PresentationMode;
  confidence: number;
  ui_spec: UIRenderSpec;
  bindings: UIBinding[];
  operations?: PresentationOperation[];
  rationale_short?: string;
  profile_observation?: string;
}

export interface PresentationPlanApplicationResult {
  spec: UIRenderSpec;
  bindings: UIBinding[];
  modeApplied: PresentationMode;
  rebuildEscalated: boolean;
  appliedOperations: number;
}

export interface BindingExecutionRecord {
  bindingId: string;
  toolId?: string;
  status: 'success' | 'error' | 'skipped';
  timestamp: number;
  durationMs?: number;
  lane?: ToolExecutionLane;
  risk?: ToolRiskLevel;
  rolledBack?: boolean;
  interaction: UIInteractionRecord;
  error?: string;
  result?: unknown;
}

export interface PresentationState {
  context: PresentationContext;
  currentSpec: UIRenderSpec | null;
  bindings: UIBinding[];
  lastPlan: PresentationPlan | null;
  executionHistory: BindingExecutionRecord[];
}

export interface PresentationPlanRequest {
  newUserContext?: string;
  workflowContext?: string;
  requestedMode?: PresentationMode;
  plannerStrategy?: PresentationPlannerStrategyName;
  planningPolicy?: PresentationPlanningPolicy;
  candidateSpec?: UIRenderSpec | null;
  candidateBindings?: UIBinding[];
  projectionComponents?: Partial<ProjectionComponentTypes>;
}
