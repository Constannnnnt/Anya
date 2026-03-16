/**
 * @anya-ui/core — UI Memory Schemas
 *
 * Zod schemas and TypeScript types for all persistent UI memory records.
 * These define the contract between storage adapters and the memory pipeline.
 */

import { z } from 'zod';

// ─── Event Source ────────────────────────────────────────────────────────

export const UiMemoryEventSourceSchema = z.enum(['user', 'agent', 'system']);
export type UiMemoryEventSource = z.infer<typeof UiMemoryEventSourceSchema>;

// ─── Canonical Event Record (§5.1) ───────────────────────────────────────

export const UiMemoryEventSchema = z.object({
  id: z.string(),
  ts: z.number(),
  actorId: z.string(),
  sessionId: z.string(),
  caseId: z.string().optional(),
  type: z.string(),
  source: UiMemoryEventSourceSchema,
  correlationId: z.string().optional(),
  causationId: z.string().optional(),
  payloadJson: z.string(),
  tokenEstimate: z.number().optional(),
});

export type UiMemoryEvent = z.infer<typeof UiMemoryEventSchema>;

// ─── Interaction Contract Payload (§5.1.1) ───────────────────────────────

export const InteractionPayloadSchema = z.object({
  trigger: z.string(),
  action: z.string(),
  description: z.string().optional(),
  tool_call: z
    .object({
      name: z.string(),
      parameters: z.record(z.unknown()).optional(),
    })
    .optional(),
  targetIds: z.array(z.string()).optional(),
  targetAction: z.string().optional(),
  url: z.string().optional(),
  route: z.string().optional(),
});

export type InteractionPayload = z.infer<typeof InteractionPayloadSchema>;

// ─── Memory Derivation Metadata ──────────────────────────────────────────

export const MemoryDerivationSourceSchema = z.enum([
  'semantic_inference',
  'behavior_analysis',
]);
export type MemoryDerivationSource = z.infer<typeof MemoryDerivationSourceSchema>;

export const MemoryDerivationSeveritySchema = z.enum(['low', 'medium', 'high']);
export type MemoryDerivationSeverity = z.infer<typeof MemoryDerivationSeveritySchema>;

export const MemoryDerivationSchema = z.object({
  source: MemoryDerivationSourceSchema,
  findingId: z.string().optional(),
  analyzerId: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  support: z.number().int().min(0).optional(),
  severity: MemoryDerivationSeveritySchema.optional(),
  scopeKey: z.string().optional(),
  evidenceRefs: z.array(z.string()).optional(),
});

export type MemoryDerivation = z.infer<typeof MemoryDerivationSchema>;

// ─── Preference Record (§5.2) ────────────────────────────────────────────

export const PreferenceStatusSchema = z.enum([
  'candidate',
  'active',
  'stale',
  'retired',
]);

export const PreferenceSignalTypeSchema = z.enum(['explicit', 'implicit']);

export const PreferenceMemorySchema = z.object({
  id: z.string(),
  actorId: z.string(),
  category: z.string(),
  key: z.string(),
  value: z.string(),
  statement: z.string(),
  signalType: PreferenceSignalTypeSchema,
  confidence: z.number().min(0).max(1),
  support: z.number().int().min(0),
  firstSeenTs: z.number(),
  lastSeenTs: z.number(),
  status: PreferenceStatusSchema,
  derivation: MemoryDerivationSchema.optional(),
});

export type PreferenceMemory = z.infer<typeof PreferenceMemorySchema>;

// ─── Interaction Pattern Record (§5.3) ───────────────────────────────────

export const PatternOutcomeSchema = z.enum(['success', 'failure']);

export const InteractionPatternSchema = z.object({
  id: z.string(),
  actorId: z.string(),
  taskClass: z.string(),
  sequenceKey: z.string(),
  sequenceJson: z.string(),
  outcome: PatternOutcomeSchema,
  confidence: z.number().min(0).max(1),
  support: z.number().int().min(0),
  lastSeenTs: z.number(),
  derivation: MemoryDerivationSchema.optional(),
});

export type InteractionPattern = z.infer<typeof InteractionPatternSchema>;

// ─── Episodic Record (§5.4) ─────────────────────────────────────────────

export const EpisodeAssessmentSchema = z.enum(['Yes', 'No']);

export const EpisodeSchema = z.object({
  id: z.string(),
  actorId: z.string(),
  sessionId: z.string(),
  caseId: z.string(),
  intent: z.string(),
  assessment: EpisodeAssessmentSchema,
  summary: z.string(),
  justification: z.string(),
  createdTs: z.number(),
});

export type Episode = z.infer<typeof EpisodeSchema>;

// ─── Reflection Record (§5.4) ───────────────────────────────────────────

export const ReflectionSchema = z.object({
  id: z.string(),
  actorId: z.string(),
  title: z.string(),
  useCases: z.string(),
  hints: z.string(),
  confidence: z.number().min(0).max(1),
  updatedTs: z.number(),
  derivation: MemoryDerivationSchema.optional(),
});

export type Reflection = z.infer<typeof ReflectionSchema>;

// ─── Processing Cursor (§5.5) ───────────────────────────────────────────

export const MemoryCursorNamespaceSchema = z.enum(['ui_memory', 'ui_behavior']);
export type MemoryCursorNamespace = z.infer<typeof MemoryCursorNamespaceSchema>;

export const MemoryCursorSchema = z.object({
  namespace: MemoryCursorNamespaceSchema,
  lastProcessedEventId: z.string(),
  lastProcessedTs: z.number(),
  updatedTs: z.number(),
});

export type MemoryCursor = z.infer<typeof MemoryCursorSchema>;

// ─── Extraction Prompt Output Schemas (§8) ──────────────────────────────

/** Single preference candidate from the extraction prompt (§8.1) */
export const ExtractedPreferenceCandidateSchema = z.object({
  context: z.string(),
  preference: z.string(),
  categories: z.array(z.string()).min(1),
  signal_type: PreferenceSignalTypeSchema,
  confidence: z.number().min(0).max(1),
});

export type ExtractedPreferenceCandidate = z.infer<
  typeof ExtractedPreferenceCandidateSchema
>;

/** Consolidation decision for a candidate preference (§8.2) */
export const ConsolidationOperationSchema = z.enum([
  'AddMemory',
  'UpdateMemory',
  'SkipMemory',
]);

export type ConsolidationOperation = z.infer<
  typeof ConsolidationOperationSchema
>;

export const ConsolidationDecisionSchema = z.object({
  memory: ExtractedPreferenceCandidateSchema,
  operation: ConsolidationOperationSchema,
  update_id: z.string().optional(),
  updated_memory: ExtractedPreferenceCandidateSchema.optional(),
});

export type ConsolidationDecision = z.infer<typeof ConsolidationDecisionSchema>;

/** Single episodic turn summary (§8.3) */
export const EpisodicTurnSummarySchema = z.object({
  situation: z.string(),
  intent: z.string(),
  action: z.string(),
  thought: z.string(),
  assessment_assistant: EpisodeAssessmentSchema,
  assessment_user: EpisodeAssessmentSchema,
});

export type EpisodicTurnSummary = z.infer<typeof EpisodicTurnSummarySchema>;

/** Consolidated episode record from turn summaries (§8.4) */
export const ConsolidatedEpisodeSchema = z.object({
  situation: z.string(),
  intent: z.string(),
  assessment: EpisodeAssessmentSchema,
  justification: z.string(),
  reflection: z.string(),
});

export type ConsolidatedEpisode = z.infer<typeof ConsolidatedEpisodeSchema>;

/** Reflection synthesis output (§8.5) */
export const ReflectionSynthesisSchema = z.object({
  operator: z.enum(['add', 'update']),
  title: z.string(),
  use_cases: z.string(),
  hints: z.string(),
  confidence: z.number().min(0).max(1),
});

export type ReflectionSynthesis = z.infer<typeof ReflectionSynthesisSchema>;
