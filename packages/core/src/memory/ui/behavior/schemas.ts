import { z } from 'zod';

export const InteractionModalitySchema = z.enum([
  'pointer',
  'keyboard',
  'touch',
  'unknown',
]);
export type InteractionModality = z.infer<typeof InteractionModalitySchema>;

export const BehaviorFindingKindSchema = z.enum([
  'preference_candidate',
  'pattern_candidate',
  'reflection_candidate',
  'diagnostic',
  'warning',
]);
export type BehaviorFindingKind = z.infer<typeof BehaviorFindingKindSchema>;

export const BehaviorFindingSeveritySchema = z.enum(['low', 'medium', 'high']);
export type BehaviorFindingSeverity = z.infer<typeof BehaviorFindingSeveritySchema>;

export const BehaviorSignalSchema = z.object({
  id: z.string(),
  actorId: z.string(),
  sessionId: z.string(),
  viewId: z.string().optional(),
  viewKind: z.enum(['generated', 'app']).optional(),
  templateId: z.string().optional(),
  sourceEventId: z.string(),
  sourceEventType: z.string(),
  ts: z.number(),
  workflow: z.string().optional(),
  contextArchetype: z.string(),
  componentRole: z.string().optional(),
  componentFamily: z.string().optional(),
  actionFamily: z.string().optional(),
  modality: InteractionModalitySchema,
  success: z.boolean().optional(),
  waitMs: z.number().optional(),
  travelPx: z.number().optional(),
  pathLengthPx: z.number().optional(),
  pathWidthPx: z.number().optional(),
  dragDistancePx: z.number().optional(),
  targetWidthPx: z.number().optional(),
  targetHeightPx: z.number().optional(),
  choiceSetSize: z.number().optional(),
  isPrimaryAction: z.boolean().optional(),
  focusMovesSinceLast: z.number().optional(),
  homingTransitionsSinceLast: z.number().optional(),
  valueLength: z.number().optional(),
  deltaLength: z.number().optional(),
});
export type BehaviorSignal = z.infer<typeof BehaviorSignalSchema>;

export const BehaviorSegmentSchema = z.object({
  id: z.string(),
  actorId: z.string(),
  sessionId: z.string(),
  contextArchetype: z.string(),
  startedTs: z.number(),
  endedTs: z.number(),
  signalIds: z.array(z.string()),
  interactionCount: z.number().int().min(0),
  modalityMix: z.array(InteractionModalitySchema),
  successCount: z.number().int().min(0),
  failureCount: z.number().int().min(0),
  retryCount: z.number().int().min(0),
});
export type BehaviorSegment = z.infer<typeof BehaviorSegmentSchema>;

export const BehaviorMetricRecordSchema = z.record(z.number());
export type BehaviorMetricRecord = z.infer<typeof BehaviorMetricRecordSchema>;

export const BehaviorSessionSummarySchema = z.object({
  id: z.string(),
  actorId: z.string(),
  sessionId: z.string(),
  contextArchetype: z.string(),
  signalCount: z.number().int().min(0),
  segmentCount: z.number().int().min(0),
  interactionCount: z.number().int().min(0),
  aggregateMetrics: BehaviorMetricRecordSchema,
  updatedTs: z.number(),
});
export type BehaviorSessionSummary = z.infer<typeof BehaviorSessionSummarySchema>;

export const BehaviorAggregateSchema = z.object({
  id: z.string(),
  actorId: z.string(),
  scopeKey: z.string(),
  contextArchetype: z.string().optional(),
  windowStartTs: z.number(),
  windowEndTs: z.number(),
  sessionCount: z.number().int().min(0),
  interactionCount: z.number().int().min(0),
  aggregateMetrics: BehaviorMetricRecordSchema,
  updatedTs: z.number(),
});
export type BehaviorAggregate = z.infer<typeof BehaviorAggregateSchema>;

export const BehaviorFindingSchema = z.object({
  id: z.string(),
  actorId: z.string(),
  analyzerId: z.string(),
  kind: BehaviorFindingKindSchema,
  conceptKey: z.string(),
  scopeKey: z.string().optional(),
  confidence: z.number().min(0).max(1),
  support: z.number().int().min(0),
  severity: BehaviorFindingSeveritySchema.optional(),
  evidenceRefs: z.array(z.string()),
  payload: z.record(z.unknown()),
  createdTs: z.number(),
});
export type BehaviorFinding = z.infer<typeof BehaviorFindingSchema>;
