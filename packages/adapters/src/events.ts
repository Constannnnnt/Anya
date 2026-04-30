import type {
  AgentSessionStatus,
  ApprovalResultArtifactPayload,
  ArtifactUpsertedEvent,
  ErrorArtifactPayload,
  SessionArtifact,
  SessionCompletedEvent,
  SessionFailedEvent,
  SessionStartedEvent,
  SessionStatusEvent,
  TextDeltaEvent,
} from '@anya-ui/core';

export interface CreateSessionStartedEventInput {
  sessionId: string;
  timestamp: number;
}

export interface CreateSessionStatusEventInput {
  sessionId: string;
  timestamp: number;
  status: AgentSessionStatus;
}

export interface CreateArtifactUpsertedEventInput {
  sessionId: string;
  timestamp: number;
  artifact: SessionArtifact;
}

export interface CreateArtifactRemovedEventInput {
  sessionId: string;
  timestamp: number;
  artifactId: string;
}

export interface CreateTextDeltaEventInput {
  sessionId: string;
  timestamp: number;
  artifactId: string;
  delta: string;
}

export interface CreateSessionCompletedEventInput {
  sessionId: string;
  timestamp: number;
}

export interface CreateSessionFailedEventInput {
  sessionId: string;
  timestamp: number;
  error: ErrorArtifactPayload;
}

export function createSessionStartedEvent(
  input: CreateSessionStartedEventInput,
): SessionStartedEvent {
  return {
    type: 'session.started',
    sessionId: input.sessionId,
    timestamp: input.timestamp,
  };
}

export function createSessionStatusEvent(
  input: CreateSessionStatusEventInput,
): SessionStatusEvent {
  return {
    type: 'session.status',
    sessionId: input.sessionId,
    timestamp: input.timestamp,
    status: input.status,
  };
}

export function createArtifactUpsertedEvent(
  input: CreateArtifactUpsertedEventInput,
): ArtifactUpsertedEvent {
  return {
    type: 'artifact.upserted',
    sessionId: input.sessionId,
    timestamp: input.timestamp,
    artifact: input.artifact,
  };
}

export function createArtifactRemovedEvent(
  input: CreateArtifactRemovedEventInput,
): Extract<import('@anya-ui/core').AgentSessionEvent, { type: 'artifact.removed' }> {
  return {
    type: 'artifact.removed',
    sessionId: input.sessionId,
    timestamp: input.timestamp,
    artifactId: input.artifactId,
  };
}

export function createTextDeltaEvent(
  input: CreateTextDeltaEventInput,
): TextDeltaEvent {
  return {
    type: 'text.delta',
    sessionId: input.sessionId,
    timestamp: input.timestamp,
    artifactId: input.artifactId,
    delta: input.delta,
  };
}

export function createSessionCompletedEvent(
  input: CreateSessionCompletedEventInput,
): SessionCompletedEvent {
  return {
    type: 'session.completed',
    sessionId: input.sessionId,
    timestamp: input.timestamp,
  };
}

export function createSessionFailedEvent(
  input: CreateSessionFailedEventInput,
): SessionFailedEvent {
  return {
    type: 'session.failed',
    sessionId: input.sessionId,
    timestamp: input.timestamp,
    error: input.error,
  };
}

export function createApprovalOutcomeDetails(
  input: Pick<ApprovalResultArtifactPayload, 'requestArtifactId' | 'decision' | 'decidedBy' | 'note'>,
): ApprovalResultArtifactPayload {
  return {
    requestArtifactId: input.requestArtifactId,
    decision: input.decision,
    decidedBy: input.decidedBy,
    note: input.note,
  };
}
