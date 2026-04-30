import { cloneBindings, cloneRenderSpec, deepClone } from '../clone';
import { nextGeneratedId } from '../id';
import type { UIRenderSpec, ViewMetadata } from '../types';
import type { ViewRecommendation } from '../viewRecommendations';
import {
  CURRENT_VIEW_PLAN_VERSION,
  type ActionBinding,
  type ViewPlan,
} from '../views/types';
import type {
  AppView,
  PromoteViewToTemplateInput,
  ResolvedView,
} from '../views/registry';

export interface ViewChangeSnapshot {
  view?: ViewMetadata;
  spec: UIRenderSpec;
  bindings: ActionBinding[];
}

export interface ViewChangeImpact {
  baselineComponentCount: number;
  proposedComponentCount: number;
  baselineBindingCount: number;
  proposedBindingCount: number;
}

export interface ViewChangeDraftSource {
  kind: 'recommendation_run';
  recommendationId: string;
  analyzer: string;
  sessionId?: string;
  artifactId?: string;
  proposedArtifactViewId?: string;
}

export interface ViewChangeDraft {
  id: string;
  createdAt: number;
  status: 'draft';
  summary: string;
  rationale: string;
  recommendation: ViewRecommendation;
  source: ViewChangeDraftSource;
  target: {
    currentView?: ViewMetadata;
    workflow?: string;
    templateId?: string;
  };
  baseline: ViewChangeSnapshot;
  proposal: ViewChangeSnapshot;
  impact: ViewChangeImpact;
  plan: ViewPlan;
}

export interface ViewChangeReview {
  decision: 'accepted' | 'rejected';
  reviewedAt: number;
  reviewer?: string;
  notes?: string;
}

export interface ReviewedViewChangeDraft extends Omit<ViewChangeDraft, 'status'> {
  status: ViewChangeReview['decision'];
  review: ViewChangeReview;
}

export type AnyViewChangeDraft = ViewChangeDraft | ReviewedViewChangeDraft;

export interface ViewChangePreview extends ResolvedView {
  draftId: string;
  recommendationId: string;
  summary: string;
  rationale: string;
  baselineView?: ViewMetadata;
}

export interface ReviewViewChangeDraftInput {
  decision: ViewChangeReview['decision'];
  reviewedAt?: number;
  reviewer?: string;
  notes?: string;
}

export interface ViewChangeAuditRecord {
  draftId: string;
  recommendationId: string;
  analyzer: string;
  sessionId?: string;
  artifactId?: string;
  baselineViewId?: string;
  proposedViewId?: string;
  decision: ViewChangeReview['decision'];
  reviewedAt: number;
  reviewer?: string;
  notes?: string;
}

export interface CreateAppViewFromDraftInput {
  id?: string;
  title?: string;
  description?: string;
  workflow?: string;
  templateId?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface CreateTemplateFromDraftInput {
  id?: string;
  title?: string;
  description?: string;
  workflow?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface CreateViewChangeDraftInput {
  id?: string;
  createdAt?: number;
  recommendation: ViewRecommendation;
  currentView?: ViewMetadata;
  currentSpec: UIRenderSpec;
  currentBindings?: ActionBinding[];
  proposedView?: ViewMetadata;
  proposedSpec: UIRenderSpec;
  proposedBindings?: ActionBinding[];
  sessionId?: string;
  artifactId?: string;
}

function normalizeSentence(value: string): string {
  const normalized = value.trim();
  if (!normalized) return '';
  return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function clampConfidence(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0.5;
  }
  return Math.max(0, Math.min(1, value));
}

function countComponents(components: UIRenderSpec['components']): number {
  let count = 0;
  const stack = [...components];
  while (stack.length > 0) {
    const next = stack.pop()!;
    count += 1;
    if (next.children?.length) {
      stack.push(...next.children);
    }
  }
  return count;
}

function cloneViewMetadata(view?: ViewMetadata): ViewMetadata | undefined {
  return view ? deepClone(view) : undefined;
}

function cloneStringArray(values?: string[]): string[] | undefined {
  return values ? [...values] : undefined;
}

function mergeMetadata(
  metadata?: Record<string, unknown>,
  audit?: ViewChangeAuditRecord,
): Record<string, unknown> | undefined {
  if (!metadata && !audit) return undefined;

  return {
    ...(metadata ? deepClone(metadata) : {}),
    ...(audit ? { viewChangeAudit: audit } : {}),
  };
}

function resolveWorkflow(input: CreateViewChangeDraftInput): string | undefined {
  return input.currentView?.workflow
    ?? input.proposedView?.workflow
    ?? input.recommendation.target.workflow
    ?? input.currentSpec.skill
    ?? input.proposedSpec.skill;
}

function resolveProposalView(input: CreateViewChangeDraftInput): ViewMetadata {
  const workflow = resolveWorkflow(input);
  return {
    id: input.currentView?.id ?? input.proposedView?.id ?? input.recommendation.target.viewId,
    kind: input.currentView?.kind
      ?? input.proposedView?.kind
      ?? input.recommendation.target.viewKind
      ?? 'generated',
    title: input.proposedView?.title ?? input.currentView?.title,
    templateId: input.currentView?.templateId
      ?? input.proposedView?.templateId
      ?? input.recommendation.target.templateId,
    workflow,
  };
}

export function createViewChangeDraft(input: CreateViewChangeDraftInput): ViewChangeDraft {
  const createdAt = input.createdAt ?? Date.now();
  const currentBindings = cloneBindings(input.currentBindings ?? []);
  const proposedBindings = cloneBindings(input.proposedBindings ?? []);
  const proposalView = resolveProposalView(input);
  const summary = normalizeSentence(input.recommendation.summary);
  const rationale = normalizeSentence(input.recommendation.recommendation);

  return {
    id: input.id ?? nextGeneratedId('view-change'),
    createdAt,
    status: 'draft',
    summary,
    rationale,
    recommendation: deepClone(input.recommendation),
    source: {
      kind: 'recommendation_run',
      recommendationId: input.recommendation.id,
      analyzer: input.recommendation.analyzer,
      sessionId: input.sessionId,
      artifactId: input.artifactId,
      proposedArtifactViewId: input.proposedView?.id,
    },
    target: {
      currentView: cloneViewMetadata(input.currentView),
      workflow: proposalView.workflow,
      templateId: proposalView.templateId,
    },
    baseline: {
      view: cloneViewMetadata(input.currentView),
      spec: cloneRenderSpec(input.currentSpec),
      bindings: currentBindings,
    },
    proposal: {
      view: cloneViewMetadata(proposalView),
      spec: cloneRenderSpec(input.proposedSpec),
      bindings: proposedBindings,
    },
    impact: {
      baselineComponentCount: countComponents(input.currentSpec.components),
      proposedComponentCount: countComponents(input.proposedSpec.components),
      baselineBindingCount: currentBindings.length,
      proposedBindingCount: proposedBindings.length,
    },
    plan: {
      plan_version: CURRENT_VIEW_PLAN_VERSION,
      mode: 'rebuild',
      confidence: clampConfidence(input.recommendation.confidence),
      ui_spec: cloneRenderSpec(input.proposedSpec),
      bindings: proposedBindings,
      reasons: [summary, rationale].filter(Boolean),
      rationale_short: summary,
    },
  };
}

export function reviewViewChangeDraft(
  draft: ViewChangeDraft,
  input: ReviewViewChangeDraftInput,
): ReviewedViewChangeDraft {
  const review: ViewChangeReview = {
    decision: input.decision,
    reviewedAt: input.reviewedAt ?? Date.now(),
    reviewer: normalizeOptionalString(input.reviewer),
    notes: normalizeOptionalString(input.notes),
  };

  return deepClone({
    ...draft,
    status: review.decision,
    review,
  });
}

export function buildViewChangeAuditRecord(
  draft: ReviewedViewChangeDraft,
): ViewChangeAuditRecord {
  return {
    draftId: draft.id,
    recommendationId: draft.recommendation.id,
    analyzer: draft.source.analyzer,
    sessionId: draft.source.sessionId,
    artifactId: draft.source.artifactId,
    baselineViewId: draft.baseline.view?.id,
    proposedViewId: draft.proposal.view?.id,
    decision: draft.review.decision,
    reviewedAt: draft.review.reviewedAt,
    reviewer: draft.review.reviewer,
    notes: draft.review.notes,
  };
}

function assertAcceptedDraft(
  draft: ReviewedViewChangeDraft,
): asserts draft is ReviewedViewChangeDraft & {
  status: 'accepted';
  review: ViewChangeReview & { decision: 'accepted' };
} {
  if (draft.status !== 'accepted' || draft.review.decision !== 'accepted') {
    throw new Error('Only accepted view change drafts can be applied.');
  }
}

export function createAppViewFromDraft(
  draft: ReviewedViewChangeDraft,
  input?: CreateAppViewFromDraftInput,
): AppView {
  assertAcceptedDraft(draft);

  const proposalView = draft.proposal.view;
  const baselineView = draft.baseline.view ?? draft.target.currentView;
  const audit = buildViewChangeAuditRecord(draft);

  return {
    id:
      input?.id
      ?? baselineView?.id
      ?? proposalView?.id
      ?? draft.recommendation.target.viewId
      ?? nextGeneratedId('app-view'),
    title:
      input?.title
      ?? proposalView?.title
      ?? baselineView?.title
      ?? 'Updated View',
    description: normalizeOptionalString(input?.description),
    workflow:
      input?.workflow
      ?? proposalView?.workflow
      ?? baselineView?.workflow
      ?? draft.target.workflow
      ?? draft.recommendation.target.workflow,
    templateId:
      input?.templateId
      ?? proposalView?.templateId
      ?? baselineView?.templateId
      ?? draft.target.templateId
      ?? draft.recommendation.target.templateId,
    spec: cloneRenderSpec(draft.proposal.spec),
    bindings: cloneBindings(draft.proposal.bindings),
    tags: cloneStringArray(input?.tags),
    metadata: mergeMetadata(input?.metadata, audit),
  };
}

export function createTemplateFromDraft(
  draft: ReviewedViewChangeDraft,
  input?: CreateTemplateFromDraftInput,
): PromoteViewToTemplateInput {
  assertAcceptedDraft(draft);

  const proposalView = draft.proposal.view;
  const baselineView = draft.baseline.view ?? draft.target.currentView;
  const audit = buildViewChangeAuditRecord(draft);

  return {
    id:
      input?.id
      ?? proposalView?.templateId
      ?? baselineView?.templateId
      ?? draft.target.templateId
      ?? draft.recommendation.target.templateId
      ?? nextGeneratedId('view-template'),
    title:
      input?.title
      ?? proposalView?.title
      ?? baselineView?.title
      ?? 'Updated View Template',
    description: normalizeOptionalString(input?.description),
    workflow:
      input?.workflow
      ?? proposalView?.workflow
      ?? baselineView?.workflow
      ?? draft.target.workflow
      ?? draft.recommendation.target.workflow,
    sourceViewId:
      baselineView?.id
      ?? proposalView?.id
      ?? draft.recommendation.target.viewId,
    tags: cloneStringArray(input?.tags),
    metadata: mergeMetadata(input?.metadata, audit),
    spec: cloneRenderSpec(draft.proposal.spec),
    bindings: cloneBindings(draft.proposal.bindings),
  };
}

export function getViewChangePreview(draft: AnyViewChangeDraft): ViewChangePreview {
  return {
    id: draft.proposal.view?.id,
    kind: draft.proposal.view?.kind ?? 'generated',
    title: draft.proposal.view?.title ?? draft.target.currentView?.title ?? 'Draft View Change',
    templateId: draft.proposal.view?.templateId,
    workflow: draft.proposal.view?.workflow ?? draft.target.workflow,
    metadata: {
      draftId: draft.id,
      recommendationId: draft.recommendation.id,
      sourceSessionId: draft.source.sessionId,
      sourceArtifactId: draft.source.artifactId,
      baselineViewId: draft.baseline.view?.id,
      reviewStatus: draft.status === 'draft' ? undefined : draft.status,
      reviewedAt: 'review' in draft ? draft.review.reviewedAt : undefined,
    },
    spec: cloneRenderSpec(draft.proposal.spec),
    bindings: cloneBindings(draft.proposal.bindings),
    draftId: draft.id,
    recommendationId: draft.recommendation.id,
    summary: draft.summary,
    rationale: draft.rationale,
    baselineView: cloneViewMetadata(draft.baseline.view),
  };
}
