/**
 * @anya-ui/core — Shared Types
 *
 * All framework-wide types in one place. No logic, no classes — just contracts.
 */

// ─── Interaction Types ───────────────────────────────────────────────────

export type KnownInteractionAction =
  | 'change'
  | 'value_change'
  | 'submit'
  | 'expand'
  | 'collapse'
  | 'connect'
  | 'disconnect'
  | 'drag_extend'
  | 'drag_reorder'
  | 'inline_edit'
  | 'add_child'
  | 'remove'
  | 'drop'
  | 'custom'; // Added for dynamic interactions

/**
 * Keep known literals for intellisense while still allowing tool-defined
 * dynamic action names from agent output.
 */
export type InteractionAction = KnownInteractionAction | (string & {});

export type InteractionTrigger = 
  | 'onClick' 
  | 'onDoubleClick' 
  | 'onMouseEnter' 
  | 'onMouseLeave'
  | 'onChange';

export type InteractionModality =
  | 'pointer'
  | 'keyboard'
  | 'touch'
  | 'unknown';

export interface UIInteractionDefinition {
  trigger: InteractionTrigger;
  action: InteractionAction;
  description: string;
  /** Shortened alias for `trigger` — saves tokens in LLM output. */
  on?: InteractionTrigger;
  /** Shortened alias for `action` — saves tokens in LLM output. */
  do?: InteractionAction;
  /** Canonical tool binding key for runtime execution. */
  tool_call?: {
    name: string;
    parameters?: Record<string, unknown>;
  };
  /** Component IDs this interaction targets (e.g. ['video1', 'video2']) */
  targetIds?: string[];
  /** Action to perform on the targets (e.g. 'play', 'pause') */
  targetAction?: string;
  /** Navigation URL for link-style interactions */
  url?: string;
  /** In-app route path for SPA navigation */
  route?: string;
}

export interface UIInteractionRecord {
  timestamp: number;
  elementId: string;
  componentName: string;
  action: InteractionAction;
  /** Source trigger that produced this interaction, when available */
  trigger?: InteractionTrigger;
  propName?: string;
  previousValue?: unknown;
  newValue?: unknown;
  semanticDescription?: string;
  sourceId?: string;
  /** The target IDs explicitly supplied by the agent, if any */
  targetIds?: string[];
  /** The action to perform on the targets, if any */
  targetAction?: string;
}

export interface UIInteractionMeasurementHint {
  modality?: InteractionModality;
  targetWidthPx?: number;
  targetHeightPx?: number;
  pointerX?: number;
  pointerY?: number;
  travelPx?: number;
  pathLengthPx?: number;
  pathWidthPx?: number;
  dragDistancePx?: number;
  choiceSetSize?: number;
  focusMovesSinceLast?: number;
  homingTransitionsSinceLast?: number;
}

export interface UIInteractionMeasurement {
  modality: InteractionModality;
  componentRole?: string;
  componentFamily?: string;
  actionFamily?: string;
  travelPx?: number;
  pathLengthPx?: number;
  pathWidthPx?: number;
  dragDistancePx?: number;
  targetWidthPx?: number;
  targetHeightPx?: number;
  choiceSetSize?: number;
  isPrimaryAction?: boolean;
  focusMovesSinceLast?: number;
  homingTransitionsSinceLast?: number;
  valueLength?: number;
  deltaLength?: number;
}

export type ViewOrigin = 'generated' | 'app';

export interface ViewMetadata {
  id?: string;
  kind?: ViewOrigin;
  title?: string;
  templateId?: string;
  workflow?: string;
}

export interface UIPresentedView {
  /** Stable identifier for this rendered view instance. */
  id: string;
  /** Whether this came from agent generation or an app-owned view. */
  kind: ViewOrigin;
  layout: UIRenderSpec['layout'];
  /** Optional workflow/task label associated with the view. */
  workflow?: string;
  /** Optional reusable template this view came from. */
  templateId?: string;
  /** Optional human-readable label. */
  title?: string;
  componentCount: number;
  interactiveCount: number;
  actionableCount: number;
  componentFamilies: string[];
  actionFamilies: string[];
  /** Stable structural fingerprint for analytics and promotion. */
  fingerprint: string;
}

// ─── Memory Types ────────────────────────────────────────────────────────

export interface ActiveContext {
  userIntent: string;
  workflowContext?: string;
  taskDescription?: string;
  metadata?: Record<string, unknown>;
}

export interface ElementHistory {
  id: string;
  type: string;
  createdAt: number;
  actions: Array<{
    timestamp: number;
    action: InteractionAction;
    description: string;
  }>;
}

export interface ReasoningTrace {
  timestamp: number;
  intent?: string;
  workflowContext?: string;
  uxRationale?: string;
  profileObservation?: string;
  summary: string;
}

// ─── Theme Types ─────────────────────────────────────────────────────────

export interface ThemeTokens {
  // Colors
  'bg-primary': string;
  'bg-secondary': string;
  'bg-tertiary': string;
  'text-primary': string;
  'text-secondary': string;
  'text-accent': string;
  'border-light': string;
  'border-focus': string;
  'status-success': string;
  'status-error': string;
  'status-warning': string;
  
  // Spacing
  'space-1': string;
  'space-2': string;
  'space-3': string;
  'space-4': string;
  'space-6': string;
  'space-8': string;

  // Typography
  'font-sans': string;
  'font-serif': string;
  'font-mono': string;
  'text-xs': string;
  'text-sm': string;
  'text-base': string;
  'text-lg': string;
  'text-xl': string;
  'text-2xl': string;

  // Borders/Shadows
  'radius-sm': string;
  'radius-md': string;
  'radius-lg': string;
  'radius-full': string;
  'shadow-sm': string;
  'shadow-md': string;
  'shadow-lg': string;
  'shadow-glow': string;
}

// ─── UI Spec Types ───────────────────────────────────────────────────────

export type UIRootLayout =
  | 'stack'
  | 'row'
  | 'grid'
  | 'tabs'
  | 'split';

export interface UIRenderSpec {
  /** Schema version of the UI spec contract. */
  spec_version?: number;
  /** The skill being activated */
  skill?: string;
  /** Chain-of-Thought reasoning for the structural layout chosen */
  ux_rationale?: string;
  /** Layout for the rendered components */
  layout: UIRootLayout;
  /** Components to render */
  components: UIComponentSpec[];
  /** Optional behavioral observation generated by the agent */
  profile_observation?: string;
  /** Sparse overriding of persistent theme values */
  theme_update?: Partial<Record<keyof ThemeTokens, string>>;
}

export interface UIBindTargetDefinition {
  /** Target component or data-node id. */
  targetId: string;
  /**
   * Target prop/path to update.
   * Defaults to the source prop name for legacy same-prop mirroring.
   */
  targetProp?: string;
}

/**
 * Legacy string entries remain supported for same-prop mirroring and
 * implicit data-node bindings. Object entries allow explicit prop/path
 * mapping for component or data-node targets.
 */
export type UIBindTarget = string | UIBindTargetDefinition;

export interface UIComponentSpec {
  /** Instance ID (auto-generated by the translator if omitted) */
  id?: string;
  /** Component type name (must exist in catalog) */
  type: string;
  /** Props to pass to the component */
  props: Record<string, unknown>;
  /** Dynamic interactability defined by the agent */
  interactions?: UIInteractionDefinition[];
  /** Components or data nodes this component's state natively binds to */
  bindTo?: UIBindTarget[];
  /** Whether the element can be spatially dragged */
  draggable?: boolean;
  /** Child component specs (for nesting) */
  children?: UIComponentSpec[];
}


// ─── Agent Types ─────────────────────────────────────────────────────────

export type AgentState = 'idle' | 'thinking' | 'rendering' | 'waiting' | 'error';

export interface AgentMessage {
  id: string;
  role: 'user' | 'agent' | 'system';
  content: string;
  timestamp: number;
  /** If the agent produced a UI spec, it's attached here */
  uiSpec?: UIRenderSpec;
}

// ─── Prompt Types ────────────────────────────────────────────────────────

/** Level 2: Customizable prompt options */
export interface PromptOptions {
  /** Custom preamble to replace the default system instruction */
  preamble?: string;
  /** Additional instructions appended to the prompt */
  additionalInstructions?: string;
  /** Whether to include tool-use examples in the prompt */
  includeExamples?: boolean;
  /** Whether to include the memory context block */
  includeMemory?: boolean;
  /** Response format */
  responseFormat?: 'yaml' | 'json';
  /** If set, only include these components in the catalog (progressive disclosure Round 2) */
  selectedComponents?: string[];
  /** If true, always include the full catalog (skip progressive disclosure) */
  fullCatalog?: boolean;
}

/** Level 3: Raw prompt parts for full-control builders */
export interface PromptParts {
  catalogYaml: string;
  skillsYaml: string;
  memoryContext: string;
  responseFormatBlock: string;
  /** Lightweight summary catalog for progressive disclosure Round 1 */
  summaryCatalogYaml: string;
}
