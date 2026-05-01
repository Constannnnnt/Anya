import { createRuntimeEvent } from '../../../core';
import type {
  AppView,
  ApplyViewPlanResult,
  ActionBinding,
  ResolvedView,
  ViewSpec,
  ViewPlan,
  ViewTemplate,
} from '../../../core';
import type { AnyaContextValue } from '../../Provider';
import {
  buildPresentedView,
  getCurrentPublishViewOptions,
  normalizePublishViewOptions,
} from './helpers';
import type { PublishViewOptions } from './types';

export function publishViewRun(
  ctx: AnyaContextValue,
  dispatchRuntimeEvent: (event: import('../../../core').RuntimeEvent) => import('../../../core').RuntimeState,
  spec: ViewSpec,
  input?: PublishViewOptions | 'agent' | 'system',
): void {
  const options = normalizePublishViewOptions(input);
  const specEvent = createRuntimeEvent(
    'spec.decoded',
    {
      spec,
      view: {
        id: options.id,
        kind: options.kind,
        title: options.title,
        templateId: options.templateId,
        workflow: options.workflow,
      },
      bindings: options.bindings,
    },
    { source: options.source },
  );
  const view = buildPresentedView(spec, {
    kind: options.kind,
    id: options.id,
    title: options.title,
    templateId: options.templateId,
    workflow: options.workflow,
  });

  dispatchRuntimeEvent(specEvent);
  dispatchRuntimeEvent(
    createRuntimeEvent(
      'ui.presented',
      {
        view,
      },
      {
        source: options.source,
        causationId: specEvent.id,
      },
    ),
  );

  if (spec.theme_update && Object.keys(spec.theme_update).length > 0) {
    dispatchRuntimeEvent(
      createRuntimeEvent(
        'theme.updated',
        {
          tokens: spec.theme_update,
        },
        { source: options.source },
      ),
    );
  }
}

export function openAppViewRun(
  ctx: AnyaContextValue,
  publishView: (spec: ViewSpec, input?: PublishViewOptions | 'agent' | 'system') => void,
  viewId: string,
): AppView | undefined {
  const view = ctx.viewRegistry.getAppView(viewId);
  if (!view) return undefined;

  publishView(view.spec, {
    source: 'system',
    kind: 'app',
    id: view.id,
    title: view.title,
    templateId: view.templateId,
    workflow: view.workflow,
    bindings: view.bindings,
  });

  return view;
}

export function openViewTemplateRun(
  ctx: AnyaContextValue,
  publishView: (spec: ViewSpec, input?: PublishViewOptions | 'agent' | 'system') => void,
  templateId: string,
  input?: Omit<PublishViewOptions, 'bindings' | 'templateId'>,
): ResolvedView | undefined {
  const view = ctx.viewRegistry.createViewFromTemplate(templateId, {
    id: input?.id,
    kind: input?.kind,
    title: input?.title,
    workflow: input?.workflow,
  });
  if (!view) return undefined;

  publishView(view.spec, {
    source: input?.source ?? 'system',
    kind: view.kind,
    id: view.id,
    title: view.title,
    templateId: view.templateId,
    workflow: view.workflow,
    bindings: view.bindings,
  });

  return view;
}

export function saveCurrentViewAsTemplateRun(
  ctx: AnyaContextValue,
  input: {
    id: string;
    title: string;
    description?: string;
    workflow?: string;
    tags?: string[];
    metadata?: Record<string, unknown>;
  },
): ViewTemplate {
  const currentViewState = ctx.viewEngine.getState();
  if (!currentViewState.currentSpec) {
    throw new Error('Cannot save a template before a view is active.');
  }

  const currentView = currentViewState.context.currentView;
  return ctx.viewRegistry.promoteViewToTemplate({
    id: input.id,
    title: input.title,
    description: input.description,
    workflow: input.workflow ?? currentView?.workflow ?? currentViewState.context.workflowContext,
    sourceViewId: currentView?.id,
    tags: input.tags,
    metadata: input.metadata,
    spec: currentViewState.currentSpec,
    bindings: currentViewState.bindings,
  });
}

export function applyViewPlanRun(
  ctx: AnyaContextValue,
  publishView: (spec: ViewSpec, input?: PublishViewOptions | 'agent' | 'system') => void,
  plan: ViewPlan,
): ApplyViewPlanResult {
  const result = ctx.viewEngine.applyPlan(plan);
  publishView(result.spec, {
    ...getCurrentPublishViewOptions(ctx),
    source: 'system',
    bindings: result.bindings,
  });
  return result;
}

