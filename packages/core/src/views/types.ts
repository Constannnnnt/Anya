import type {
  InteractionAction,
  InteractionTrigger,
  UIComponentSpec,
  UIInteractionRecord,
  UIRenderSpec,
  ViewMetadata,
} from '../types';

export const CURRENT_VIEW_PLAN_VERSION = 0 as const;

export type StateNodeKind =
  | 'json'
  | 'array'
  | 'image'
  | 'document'
  | 'text'
  | (string & {});

export interface StateNode {
  id: string;
  kind: StateNodeKind;
  payload: unknown;
  schema?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  updatedAt?: number;
}

export interface ViewRecipe {
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

export type WorkflowDefinition = ViewRecipe;

export interface ViewComponentSlots {
  heading: string;
  card: string;
  image: string;
  list: string;
  listItem: string;
  text: string;
  section: string;
  button: string;
}

export type ToolMode = 'client' | 'server' | 'adapter';

export interface ToolContractSuccess {
  success: true;
  value: unknown;
}

export interface ToolContractFailure {
  success: false;
  error: string;
}

export type ToolContractResult = ToolContractSuccess | ToolContractFailure;

export type ToolContract =
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
  | ((value: unknown) => boolean | ToolContractResult | unknown)
  | unknown;

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  inputContract?: ToolContract;
  outputContract?: ToolContract;
  execution?: {
    mode: ToolMode;
    adapterId?: string;
  };
  capabilities?: string[];
}

export type ValueExpression =
  | unknown
  | { $event: string }
  | { $data: { nodeId: string; path?: string; transform?: string } }
  | { $result: string };

export interface LocalViewChange {
  targetId: string;
  propName?: string;
  value?: ValueExpression;
  remove?: boolean;
  merge?: boolean;
  props?: Record<string, ValueExpression>;
}

export type ToolLane = 'optimistic' | 'confirmed';
export type ToolRisk = 'safe' | 'risky';

export interface ToolPolicy {
  lane?: ToolLane;
  risk?: ToolRisk;
  rollbackMessage?: string;
}

export type ActionCommand =
  | {
      type: 'local_patch';
      patches: LocalViewChange[];
    }
  | {
      type: 'semantic_event';
      semanticAction: string;
      description?: string;
      payload?: Record<string, ValueExpression>;
    }
  | {
      type: 'tool_call';
      toolId: string;
      args?: Record<string, ValueExpression>;
      timeoutMs?: number;
      optimisticPatches?: LocalViewChange[];
      resultPatches?: LocalViewChange[];
      policy?: ToolPolicy;
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
      value: ValueExpression;
    }
  | {
      type: 'composite';
      actions: ActionCommand[];
    };

export interface ActionBinding {
  id: string;
  componentId: string;
  trigger?: InteractionTrigger;
  actionMatch?: InteractionAction;
  description?: string;
  action: ActionCommand;
}

export type ViewChange =
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
      binding: ActionBinding;
    }
  | {
      type: 'remove_binding';
      bindingId: string;
    };

export type ViewMode = 'patch' | 'rebuild';

export interface ViewInputs {
  data?: Record<string, unknown>;
  tools?: Record<string, unknown>;
  workflow?: Record<string, unknown>;
  memory?: Record<string, unknown>;
  constraints?: Record<string, unknown>;
}

export type StateContext = ViewInputs;

export interface ViewPolicy {
  patchComplexityBudget?: number;
  patchComplexityBaselineMin?: number;
  patchConfidenceBase?: number;
  rebuildConfidenceBase?: number;
}

export type ViewStrategyName =
  | 'deterministic'
  | 'always_rebuild'
  | 'always_patch';

export interface ViewContext {
  context_version?: 0;
  contextEnvelope?: ViewInputs;
  dataNodes: StateNode[];
  tools: ToolDefinition[];
  currentView?: ViewMetadata;
  workflowContext?: string;
  availableWorkflows?: WorkflowDefinition[];
  candidateSpec?: UIRenderSpec | null;
  candidateBindings?: ActionBinding[];
  currentSpec?: UIRenderSpec | null;
  currentBindings?: ActionBinding[];
  requestedMode?: ViewMode;
  plannerStrategy?: ViewStrategyName;
  planningPolicy?: ViewPolicy;
  newUserContext?: string;
  projectionComponents?: Partial<ViewComponentSlots>;
  sessionHistory?: UIInteractionRecord[];
  persistentProfile?: string;
}

export interface ViewPlan {
  plan_version?: 0;
  strategy?: ViewStrategyName;
  reasons?: string[];
  mode: ViewMode;
  confidence: number;
  ui_spec: UIRenderSpec;
  bindings: ActionBinding[];
  operations?: ViewChange[];
  rationale_short?: string;
  profile_observation?: string;
}

export interface ApplyViewPlanResult {
  spec: UIRenderSpec;
  bindings: ActionBinding[];
  modeApplied: ViewMode;
  rebuildEscalated: boolean;
  appliedOperations: number;
}

export interface ActionResult {
  bindingId: string;
  toolId?: string;
  status: 'success' | 'error' | 'skipped';
  timestamp: number;
  durationMs?: number;
  lane?: ToolLane;
  risk?: ToolRisk;
  rolledBack?: boolean;
  interaction: UIInteractionRecord;
  error?: string;
  result?: unknown;
}

export interface ViewState {
  context: ViewContext;
  currentSpec: UIRenderSpec | null;
  bindings: ActionBinding[];
  lastPlan: ViewPlan | null;
  executionHistory: ActionResult[];
}

export interface ViewPlanRequest {
  newUserContext?: string;
  workflowContext?: string;
  requestedMode?: ViewMode;
  plannerStrategy?: ViewStrategyName;
  planningPolicy?: ViewPolicy;
  candidateSpec?: UIRenderSpec | null;
  candidateBindings?: ActionBinding[];
  projectionComponents?: Partial<ViewComponentSlots>;
}
