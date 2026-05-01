import { z } from 'zod';
import type {
  ActiveContext,
  ElementHistory,
  ReasoningTrace,
  ViewNode,
  UIInteractionRecord,
  ViewSpec,
} from '../types';
import { CURRENT_UI_SPEC_VERSION } from '../spec';

// v0 development policy: only one active snapshot schema is supported.
export const CURRENT_MEMORY_SNAPSHOT_VERSION = 0;

const InteractionTriggerSchema = z.enum([
  'onClick',
  'onDoubleClick',
  'onMouseEnter',
  'onMouseLeave',
  'onChange',
]);

const ToolCallSchema = z.object({
  name: z.string(),
  parameters: z.record(z.unknown()).optional(),
}).strict();

const UIInteractionDefinitionSchema = z.object({
  trigger: InteractionTriggerSchema,
  action: z.string(),
  description: z.string(),
  on: InteractionTriggerSchema.optional(),
  do: z.string().optional(),
  tool_call: ToolCallSchema.optional(),
  targetIds: z.array(z.string()).optional(),
  targetAction: z.string().optional(),
  url: z.string().optional(),
  route: z.string().optional(),
}).strict();

const UIBindTargetSchema = z.union([
  z.string(),
  z.object({
    targetId: z.string(),
    targetProp: z.string().optional(),
  }).strict(),
]);

const ViewNodeSchema: z.ZodType<ViewNode> = z.lazy(() => z.object({
  id: z.string().optional(),
  type: z.string(),
  props: z.record(z.unknown()),
  interactions: z.array(UIInteractionDefinitionSchema).optional(),
  bindTo: z.array(UIBindTargetSchema).optional(),
  draggable: z.boolean().optional(),
  children: z.array(ViewNodeSchema).optional(),
}).strict());

const ViewSpecSchema: z.ZodType<ViewSpec> = z.object({
  spec_version: z.number().int().min(1).optional(),
  skill: z.string().optional(),
  ux_rationale: z.string().optional(),
  layout: z.enum(['stack', 'row', 'grid', 'tabs', 'split']),
  nodes: z.array(ViewNodeSchema),
  profile_observation: z.string().optional(),
  theme_update: z.record(z.string()).optional(),
}).strict();

const UIInteractionRecordSchema: z.ZodType<UIInteractionRecord> = z.object({
  timestamp: z.number(),
  nodeId: z.string(),
  nodeType: z.string(),
  action: z.string(),
  trigger: InteractionTriggerSchema.optional(),
  propName: z.string().optional(),
  previousValue: z.unknown().optional(),
  newValue: z.unknown().optional(),
  semanticDescription: z.string().optional(),
  sourceId: z.string().optional(),
  targetIds: z.array(z.string()).optional(),
  targetAction: z.string().optional(),
}).strict();

const ElementHistorySchema: z.ZodType<ElementHistory> = z.object({
  id: z.string(),
  type: z.string(),
  createdAt: z.number(),
  actions: z.array(z.object({
    timestamp: z.number(),
    action: z.string(),
    description: z.string(),
  }).strict()),
}).strict();

const ActiveContextSchema: z.ZodType<ActiveContext> = z.object({
  userIntent: z.string(),
  workflowContext: z.string().optional(),
  taskDescription: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
}).strict();

const ReasoningTraceSchema: z.ZodType<ReasoningTrace> = z.object({
  timestamp: z.number(),
  intent: z.string().optional(),
  workflowContext: z.string().optional(),
  uxRationale: z.string().optional(),
  profileObservation: z.string().optional(),
  summary: z.string(),
}).strict();

export const MemorySnapshotSchema = z.object({
  version: z.literal(CURRENT_MEMORY_SNAPSHOT_VERSION),
  context: ActiveContextSchema,
  interactions: z.array(UIInteractionRecordSchema),
  elementHistories: z.array(ElementHistorySchema),
  reasoningTraces: z.array(ReasoningTraceSchema),
  currentSpec: ViewSpecSchema.nullable(),
}).strict();

export type MemorySnapshot = z.infer<typeof MemorySnapshotSchema>;

export function normalizeMemorySnapshot(input: unknown): MemorySnapshot | null {
  const parsed = MemorySnapshotSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

export function parseMemorySnapshot(raw: string): MemorySnapshot | null {
  try {
    const parsed = JSON.parse(raw);
    return normalizeMemorySnapshot(parsed);
  } catch {
    return null;
  }
}

export function serializeMemorySnapshot(snapshot: MemorySnapshot): string {
  const parsed = MemorySnapshotSchema.parse(snapshot);
  return JSON.stringify(parsed);
}
