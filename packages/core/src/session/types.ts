import type { ActionBinding, ToolDefinition } from '../views/types';
import type { UIRenderSpec, ViewOrigin } from '../types';

export type ArtifactKind =
  | 'message'
  | 'plan'
  | 'tool_call'
  | 'tool_result'
  | 'view'
  | 'source_bundle'
  | 'approval_request'
  | 'approval_result'
  | 'memory_patch'
  | 'error';

export type ArtifactAudience =
  | 'user'
  | 'agent'
  | 'system';

export type ArtifactRegion =
  | 'main'
  | 'sidebar'
  | 'activity'
  | 'approval'
  | 'sources'
  | 'hidden';

export type SessionMessageRole =
  | 'user'
  | 'assistant'
  | 'system';

export interface SessionArtifactBase<TKind extends ArtifactKind, TPayload> {
  id: string;
  sessionId: string;
  kind: TKind;
  version: number;
  createdAt: number;
  updatedAt?: number;
  audience: ArtifactAudience;
  region?: ArtifactRegion;
  status?: 'streaming' | 'complete' | 'failed' | 'superseded';
  correlationId?: string;
  causationId?: string;
  title?: string;
  payload: TPayload;
}

export interface MessageArtifactPayload {
  role: SessionMessageRole;
  text: string;
  format?: 'plain' | 'markdown';
}

export interface PlanStep {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  description?: string;
}

export interface PlanArtifactPayload {
  objective: string;
  steps: PlanStep[];
}

export interface ToolCallArtifactPayload {
  toolId: string;
  displayName?: string;
  args: Record<string, unknown>;
  executionMode?: ToolDefinition['execution'];
}

export interface ToolResultArtifactPayload {
  toolId: string;
  ok: boolean;
  result?: unknown;
  error?: string;
  durationMs?: number;
}

export interface SourceRef {
  id: string;
  title: string;
  url: string;
  snippet?: string;
  publishedAt?: string;
}

export interface SourceBundleArtifactPayload {
  items: SourceRef[];
}

export interface ApprovalRequestArtifactPayload {
  action: string;
  reason: string;
  risk?: 'low' | 'medium' | 'high';
  details?: Record<string, unknown>;
}

export interface ApprovalResultArtifactPayload {
  requestArtifactId: string;
  decision: 'approved' | 'rejected' | 'cancelled';
  decidedBy: 'user' | 'policy' | 'system';
  note?: string;
}

export interface MemoryPatchArtifactPayload {
  summary: string;
  patch: Record<string, unknown>;
}

export interface ErrorArtifactPayload {
  code: string;
  message: string;
  retryable?: boolean;
  details?: Record<string, unknown>;
}

export type ViewFormat =
  | 'ui_spec'
  | 'diff'
  | 'table'
  | 'form'
  | 'log'
  | 'custom';

export interface ViewDescriptor {
  id: string;
  format: ViewFormat;
  kind?: ViewOrigin;
  title?: string;
  workflow?: string;
  templateId?: string;
  priority?: number;
  replace?: boolean;
  spec?: UIRenderSpec;
  bindings?: ActionBinding[];
  rendererId?: string;
  data?: Record<string, unknown>;
}

export interface ViewArtifactPayload {
  view: ViewDescriptor;
}

export type MessageArtifact = SessionArtifactBase<'message', MessageArtifactPayload>;
export type PlanArtifact = SessionArtifactBase<'plan', PlanArtifactPayload>;
export type ToolCallArtifact = SessionArtifactBase<'tool_call', ToolCallArtifactPayload>;
export type ToolResultArtifact = SessionArtifactBase<'tool_result', ToolResultArtifactPayload>;
export type SourceBundleArtifact = SessionArtifactBase<'source_bundle', SourceBundleArtifactPayload>;
export type ApprovalRequestArtifact = SessionArtifactBase<'approval_request', ApprovalRequestArtifactPayload>;
export type ApprovalResultArtifact = SessionArtifactBase<'approval_result', ApprovalResultArtifactPayload>;
export type MemoryPatchArtifact = SessionArtifactBase<'memory_patch', MemoryPatchArtifactPayload>;
export type ErrorArtifact = SessionArtifactBase<'error', ErrorArtifactPayload>;
export type CanonicalViewArtifact = SessionArtifactBase<'view', ViewArtifactPayload>;

export type SessionArtifact =
  | MessageArtifact
  | PlanArtifact
  | ToolCallArtifact
  | ToolResultArtifact
  | SourceBundleArtifact
  | ApprovalRequestArtifact
  | ApprovalResultArtifact
  | MemoryPatchArtifact
  | ErrorArtifact
  | CanonicalViewArtifact;

export type AgentSessionStatus =
  | 'idle'
  | 'running'
  | 'waiting_for_approval'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface AgentSessionMessage {
  id: string;
  role: SessionMessageRole;
  content: string;
  timestamp: number;
}

export interface AgentSessionStartInput {
  sessionId?: string;
  systemPrompt?: string;
  userIntent: string;
  messages: AgentSessionMessage[];
  memoryContext?: string;
  currentArtifacts?: SessionArtifact[];
  currentViewId?: string;
}

export type SessionStartedEvent = {
  type: 'session.started';
  sessionId: string;
  timestamp: number;
};

export type SessionStatusEvent = {
  type: 'session.status';
  sessionId: string;
  timestamp: number;
  status: AgentSessionStatus;
};

export type ArtifactUpsertedEvent = {
  type: 'artifact.upserted';
  sessionId: string;
  timestamp: number;
  artifact: SessionArtifact;
};

export type ArtifactRemovedEvent = {
  type: 'artifact.removed';
  sessionId: string;
  timestamp: number;
  artifactId: string;
};

export type TextDeltaEvent = {
  type: 'text.delta';
  sessionId: string;
  timestamp: number;
  artifactId: string;
  delta: string;
};

export type SessionCompletedEvent = {
  type: 'session.completed';
  sessionId: string;
  timestamp: number;
};

export type SessionFailedEvent = {
  type: 'session.failed';
  sessionId: string;
  timestamp: number;
  error: ErrorArtifactPayload;
};

export type AgentSessionEvent =
  | SessionStartedEvent
  | SessionStatusEvent
  | ArtifactUpsertedEvent
  | ArtifactRemovedEvent
  | TextDeltaEvent
  | SessionCompletedEvent
  | SessionFailedEvent;

export interface AgentSessionController {
  cancel(): void;
}

export interface AgentSessionRun {
  sessionId: string;
  controller: AgentSessionController;
  events: AsyncIterable<AgentSessionEvent>;
}

export interface AgentSessionTransport {
  startSession(input: AgentSessionStartInput): Promise<AgentSessionRun>;
}

export interface AgentSessionState {
  sessionId: string;
  status: AgentSessionStatus;
  artifacts: Record<string, SessionArtifact>;
  artifactOrder: string[];
  primaryViewArtifactId?: string;
  lastError?: ErrorArtifactPayload;
  startedAt?: number;
  completedAt?: number;
}
export type ViewArtifact = CanonicalViewArtifact;

export type CreateSessionArtifactInput<TKind extends ArtifactKind, TPayload> =
  Omit<SessionArtifactBase<TKind, TPayload>, 'version'> & {
    version?: number;
  };

export function createSessionArtifact<TKind extends ArtifactKind, TPayload>(
  input: CreateSessionArtifactInput<TKind, TPayload>
): SessionArtifactBase<TKind, TPayload> {
  return {
    ...input,
    version: input.version ?? 1,
  };
}

export function createInitialAgentSessionState(sessionId = 'session-0'): AgentSessionState {
  return {
    sessionId,
    status: 'idle',
    artifacts: {},
    artifactOrder: [],
  };
}
