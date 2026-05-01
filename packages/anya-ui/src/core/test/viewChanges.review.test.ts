import { describe, expect, it } from 'vitest';
import {
  buildViewChangeAuditRecord,
  createAppViewFromDraft,
  createTemplateFromDraft,
  createViewChangeDraft,
  getViewChangePreview,
  reviewViewChangeDraft, } from '../index';

function createCheckoutDraft() {
  return createViewChangeDraft({
    recommendation: {
      id: 'finding-checkout-form',
      analyzer: 'form_friction',
      priority: 1,
      score: 0.93,
      severity: 'high',
      confidence: 0.82,
      support: 4,
      summary: 'Repeated correction loops are showing up in checkout.',
      recommendation: 'Shorten forms, prefill where possible, and add inline validation.',
      evidence: [{ label: 'avgRetryRate', value: '22%' }],
      target: {
        viewId: 'checkout-view',
        viewKind: 'app',
        templateId: 'checkout-template',
        workflow: 'checkout', }, },
    currentView: {
      id: 'checkout-view',
      kind: 'app',
      title: 'Checkout',
      templateId: 'checkout-template',
      workflow: 'checkout', },
    currentSpec: {
      spec_version: 1,
      skill: 'checkout',
      layout: 'stack',
      nodes: [
        {
          id: 'heading-1',
          type: 'Heading',
          props: { text: 'Checkout' }, },
      ], },
    currentBindings: [],
    proposedView: {
      id: 'checkout-view-revised',
      kind: 'generated',
      title: 'Checkout Revised',
      workflow: 'checkout', },
    proposedSpec: {
      spec_version: 1,
      skill: 'checkout',
      layout: 'stack',
      nodes: [
        {
          id: 'heading-2',
          type: 'Heading',
          props: { text: 'Checkout Revised' }, },
        {
          id: 'hint-1',
          type: 'Heading',
          props: { text: 'Faster checkout' }, },
      ], },
    proposedBindings: [],
    sessionId: 'session-draft',
    artifactId: 'artifact-view-revised',
    createdAt: 42, }); }

describe('view change review and apply helpers', () => {
  it('reviews a draft and turns it into app-view and template inputs with audit metadata', () => {
    const reviewed = reviewViewChangeDraft(createCheckoutDraft(), {
      decision: 'accepted',
      reviewer: 'design-review',
      notes: 'Ship the simpler checkout flow.',
      reviewedAt: 88, });

    expect(reviewed).toEqual(
      expect.objectContaining({
        status: 'accepted',
        review: expect.objectContaining({
          decision: 'accepted',
          reviewer: 'design-review',
          notes: 'Ship the simpler checkout flow.',
          reviewedAt: 88, }), }),
    );

    const audit = buildViewChangeAuditRecord(reviewed);
    expect(audit).toEqual(
      expect.objectContaining({
        draftId: reviewed.id,
        recommendationId: 'finding-checkout-form',
        analyzer: 'form_friction',
        sessionId: 'session-draft',
        artifactId: 'artifact-view-revised',
        baselineViewId: 'checkout-view',
        proposedViewId: 'checkout-view',
        decision: 'accepted',
        reviewedAt: 88, }),
    );

    const appView = createAppViewFromDraft(reviewed, {
      description: 'Approved checkout revision',
      metadata: {
        release: 'stage-3', },
      tags: ['checkout', 'approved'], });

    expect(appView).toEqual(
      expect.objectContaining({
        id: 'checkout-view',
        title: 'Checkout Revised',
        description: 'Approved checkout revision',
        workflow: 'checkout',
        templateId: 'checkout-template',
        tags: ['checkout', 'approved'],
        metadata: expect.objectContaining({
          release: 'stage-3',
          viewChangeAudit: expect.objectContaining({
            draftId: reviewed.id,
            decision: 'accepted', }), }), }),
    );

    const template = createTemplateFromDraft(reviewed, {
      id: 'checkout-template-v2',
      title: 'Checkout Template v2',
      metadata: {
        release: 'stage-3', }, });

    expect(template).toEqual(
      expect.objectContaining({
        id: 'checkout-template-v2',
        title: 'Checkout Template v2',
        workflow: 'checkout',
        sourceViewId: 'checkout-view',
        metadata: expect.objectContaining({
          release: 'stage-3',
          viewChangeAudit: expect.objectContaining({
            draftId: reviewed.id,
            reviewer: 'design-review', }), }), }),
    );

    const preview = getViewChangePreview(reviewed);
    expect(preview.metadata).toEqual(
      expect.objectContaining({
        draftId: reviewed.id,
        reviewStatus: 'accepted',
        reviewedAt: 88, }),
    ); });

  it('rejects applying drafts that were not accepted', () => {
    const reviewed = reviewViewChangeDraft(createCheckoutDraft(), {
      decision: 'rejected',
      reviewedAt: 99,
      notes: 'Keep the current checkout for now.', });

    expect(() => createAppViewFromDraft(reviewed)).toThrow(
      'Only accepted view change drafts can be applied.',
    );
    expect(() => createTemplateFromDraft(reviewed)).toThrow(
      'Only accepted view change drafts can be applied.',
    ); }); });
