import {
  createSessionArtifact,
  type ApprovalRequestArtifact,
  type ApprovalRequestArtifactPayload,
  type ApprovalResultArtifact,
  type ApprovalResultArtifactPayload,
  type ArtifactAudience,
  type ArtifactRegion,
  type ErrorArtifact,
  type ErrorArtifactPayload,
  type MemoryPatchArtifact,
  type MemoryPatchArtifactPayload,
  type MessageArtifact,
  type MessageArtifactPayload,
  type PlanArtifact,
  type PlanArtifactPayload,
  type SessionArtifactBase,
  type SourceBundleArtifact,
  type SourceBundleArtifactPayload,
  type ToolCallArtifact,
  type ToolCallArtifactPayload,
  type ToolResultArtifact,
  type ToolResultArtifactPayload,
  type ViewArtifact,
  type ViewArtifactPayload,
  type ViewDescriptor,
} from '@anya-ui/core';

interface ArtifactInputBase {
  id: string;
  sessionId: string;
  createdAt: number;
  updatedAt?: number;
  audience?: ArtifactAudience;
  region?: ArtifactRegion;
  status?: SessionArtifactBase<any, any>['status'];
  correlationId?: string;
  causationId?: string;
  title?: string;
  version?: number;
}

export interface CreateMessageArtifactInput extends ArtifactInputBase, MessageArtifactPayload {}
export interface CreatePlanArtifactInput extends ArtifactInputBase, PlanArtifactPayload {}
export interface CreateToolCallArtifactInput extends ArtifactInputBase, ToolCallArtifactPayload {}
export interface CreateToolResultArtifactInput extends ArtifactInputBase, ToolResultArtifactPayload {}
export interface CreateSourceBundleArtifactInput extends ArtifactInputBase, SourceBundleArtifactPayload {}
export interface CreateApprovalRequestArtifactInput extends ArtifactInputBase, ApprovalRequestArtifactPayload {}
export interface CreateApprovalResultArtifactInput extends ArtifactInputBase, ApprovalResultArtifactPayload {}
export interface CreateMemoryPatchArtifactInput extends ArtifactInputBase, MemoryPatchArtifactPayload {}
export interface CreateErrorArtifactInput extends ArtifactInputBase, ErrorArtifactPayload {}
export interface CreateViewArtifactInput extends ArtifactInputBase {
  view: ViewDescriptor;
}

function withArtifactDefaults(input: ArtifactInputBase) {
  return {
    audience: input.audience ?? 'user',
    region: input.region,
    status: input.status,
    updatedAt: input.updatedAt,
    correlationId: input.correlationId,
    causationId: input.causationId,
    title: input.title,
    version: input.version,
  };
}

export function createMessageArtifact(input: CreateMessageArtifactInput): MessageArtifact {
  return createSessionArtifact({
    id: input.id,
    sessionId: input.sessionId,
    kind: 'message',
    createdAt: input.createdAt,
    ...withArtifactDefaults(input),
    payload: {
      role: input.role,
      text: input.text,
      format: input.format,
    },
  });
}

export function createPlanArtifact(input: CreatePlanArtifactInput): PlanArtifact {
  return createSessionArtifact({
    id: input.id,
    sessionId: input.sessionId,
    kind: 'plan',
    createdAt: input.createdAt,
    ...withArtifactDefaults(input),
    payload: {
      objective: input.objective,
      steps: input.steps,
    },
  });
}

export function createToolCallArtifact(input: CreateToolCallArtifactInput): ToolCallArtifact {
  return createSessionArtifact({
    id: input.id,
    sessionId: input.sessionId,
    kind: 'tool_call',
    createdAt: input.createdAt,
    ...withArtifactDefaults(input),
    payload: {
      toolId: input.toolId,
      displayName: input.displayName,
      args: input.args,
      executionMode: input.executionMode,
    },
  });
}

export function createToolResultArtifact(input: CreateToolResultArtifactInput): ToolResultArtifact {
  return createSessionArtifact({
    id: input.id,
    sessionId: input.sessionId,
    kind: 'tool_result',
    createdAt: input.createdAt,
    ...withArtifactDefaults(input),
    payload: {
      toolId: input.toolId,
      ok: input.ok,
      result: input.result,
      error: input.error,
      durationMs: input.durationMs,
    },
  });
}

export function createSourceBundleArtifact(input: CreateSourceBundleArtifactInput): SourceBundleArtifact {
  return createSessionArtifact({
    id: input.id,
    sessionId: input.sessionId,
    kind: 'source_bundle',
    createdAt: input.createdAt,
    ...withArtifactDefaults(input),
    payload: {
      items: input.items,
    },
  });
}

export function createApprovalRequestArtifact(
  input: CreateApprovalRequestArtifactInput,
): ApprovalRequestArtifact {
  return createSessionArtifact({
    id: input.id,
    sessionId: input.sessionId,
    kind: 'approval_request',
    createdAt: input.createdAt,
    ...withArtifactDefaults(input),
    payload: {
      action: input.action,
      reason: input.reason,
      risk: input.risk,
      details: input.details,
    },
  });
}

export function createApprovalResultArtifact(
  input: CreateApprovalResultArtifactInput,
): ApprovalResultArtifact {
  return createSessionArtifact({
    id: input.id,
    sessionId: input.sessionId,
    kind: 'approval_result',
    createdAt: input.createdAt,
    ...withArtifactDefaults(input),
    payload: {
      requestArtifactId: input.requestArtifactId,
      decision: input.decision,
      decidedBy: input.decidedBy,
      note: input.note,
    },
  });
}

export function createMemoryPatchArtifact(input: CreateMemoryPatchArtifactInput): MemoryPatchArtifact {
  return createSessionArtifact({
    id: input.id,
    sessionId: input.sessionId,
    kind: 'memory_patch',
    createdAt: input.createdAt,
    ...withArtifactDefaults(input),
    payload: {
      summary: input.summary,
      patch: input.patch,
    },
  });
}

export function createErrorArtifact(input: CreateErrorArtifactInput): ErrorArtifact {
  return createSessionArtifact({
    id: input.id,
    sessionId: input.sessionId,
    kind: 'error',
    createdAt: input.createdAt,
    ...withArtifactDefaults(input),
    payload: {
      code: input.code,
      message: input.message,
      retryable: input.retryable,
      details: input.details,
    },
  });
}

export function createViewArtifact(input: CreateViewArtifactInput): ViewArtifact {
  return createSessionArtifact({
    id: input.id,
    sessionId: input.sessionId,
    kind: 'view',
    createdAt: input.createdAt,
    ...withArtifactDefaults(input),
    payload: {
      view: input.view,
    } satisfies ViewArtifactPayload,
  });
}
