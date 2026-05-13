// Minimal type stubs for the memory system.
// These were part of the old framework; kept here so memory/ compiles.

export type InteractionAction = string;
export type InteractionTrigger = 'onClick' | 'onDoubleClick' | 'onMouseEnter' | 'onMouseLeave' | 'onChange';
export type InteractionModality = 'pointer' | 'keyboard' | 'touch' | 'unknown';
export type UIRootLayout = 'stack' | 'row' | 'grid' | 'tabs' | 'split';

export interface UIInteractionDefinition {
  trigger: InteractionTrigger;
  action: InteractionAction;
  description: string;
  on?: InteractionTrigger;
  do?: InteractionAction;
  tool_call?: { name: string; parameters?: Record<string, unknown> };
  targetIds?: string[];
  targetAction?: string;
  url?: string;
  route?: string;
}

export interface UIInteractionRecord {
  timestamp: number;
  nodeId: string;
  nodeType: string;
  action: InteractionAction;
  trigger?: InteractionTrigger;
  propName?: string;
  previousValue?: unknown;
  newValue?: unknown;
  semanticDescription?: string;
  sourceId?: string;
  targetIds?: string[];
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

export interface ViewNode {
  id?: string;
  type: string;
  props: Record<string, unknown>;
  interactions?: UIInteractionDefinition[];
  bindTo?: unknown[];
  draggable?: boolean;
  children?: ViewNode[];
}

export interface ViewSpec {
  spec_version?: number;
  skill?: string;
  ux_rationale?: string;
  layout: UIRootLayout;
  nodes: ViewNode[];
  profile_observation?: string;
  theme_update?: Record<string, string>;
}

export interface ThemeTokens {
  [key: string]: string;
}

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
