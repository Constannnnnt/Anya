import { describe, expect, it } from 'vitest';
import {
  createViewChangeDraft,
  getViewChangePreview, } from '../index';

describe('view change drafts', () => {
  it('builds a draft with baseline, proposal, and a future-applyable plan', () => {
    const draft = createViewChangeDraft({
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
      createdAt: 42, });

    expect(draft).toEqual(
      expect.objectContaining({
        createdAt: 42,
        status: 'draft',
        summary: 'Repeated correction loops are showing up in checkout.',
        rationale: 'Shorten forms, prefill where possible, and add inline validation.',
        source: expect.objectContaining({
          kind: 'recommendation_run',
          recommendationId: 'finding-checkout-form',
          analyzer: 'form_friction',
          sessionId: 'session-draft',
          artifactId: 'artifact-view-revised',
          proposedArtifactViewId: 'checkout-view-revised', }),
        target: expect.objectContaining({
          workflow: 'checkout',
          templateId: 'checkout-template', }),
        impact: {
          baselineComponentCount: 1,
          proposedComponentCount: 2,
          baselineBindingCount: 0,
          proposedBindingCount: 0, },
        plan: expect.objectContaining({
          mode: 'rebuild',
          confidence: 0.82,
          rationale_short: 'Repeated correction loops are showing up in checkout.',
          ui_spec: expect.objectContaining({
            nodes: [
              expect.objectContaining({ id: 'heading-2' }),
              expect.objectContaining({ id: 'hint-1' }),
            ], }), }), }),
    );

    expect(draft.proposal.view).toEqual(
      expect.objectContaining({
        id: 'checkout-view',
        kind: 'app',
        title: 'Checkout Revised',
        templateId: 'checkout-template',
        workflow: 'checkout', }),
    ); });

  it('returns a preview view that can be rendered without mutating the target view', () => {
    const draft = createViewChangeDraft({
      recommendation: {
        id: 'finding-dashboard-density',
        analyzer: 'information_scent',
        priority: 1,
        score: 0.88,
        severity: 'medium',
        confidence: 0.74,
        support: 3,
        summary: 'The dashboard is missing fast comparison cues.',
        recommendation: 'Introduce clearer labels and summary totals.',
        evidence: [],
        target: {
          workflow: 'analytics', }, },
      currentSpec: {
        layout: 'stack',
        nodes: [{ id: 'old', type: 'Heading', props: { text: 'Old' } }], },
      proposedSpec: {
        layout: 'stack',
        nodes: [{ id: 'new', type: 'Heading', props: { text: 'New' } }], },
      proposedBindings: [], });

    const preview = getViewChangePreview(draft);

    expect(preview).toEqual(
      expect.objectContaining({
        draftId: draft.id,
        recommendationId: 'finding-dashboard-density',
        summary: 'The dashboard is missing fast comparison cues.',
        rationale: 'Introduce clearer labels and summary totals.',
        spec: expect.objectContaining({
          nodes: [expect.objectContaining({ id: 'new' })], }), }),
    );
    expect(preview.metadata).toEqual(
      expect.objectContaining({
        draftId: draft.id,
        recommendationId: 'finding-dashboard-density', }),
    ); }); });
