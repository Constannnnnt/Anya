import { cloneBindings, cloneRenderSpec, deepClone } from '../clone';
import type { ViewMetadata, UIRenderSpec } from '../types';
import type { ActionBinding } from './types';

type ChangeListener = () => void;

export interface AppView {
  id: string;
  title: string;
  description?: string;
  workflow?: string;
  templateId?: string;
  spec: UIRenderSpec;
  bindings?: ActionBinding[];
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface ViewTemplate {
  id: string;
  title: string;
  description?: string;
  workflow?: string;
  sourceViewId?: string;
  spec: UIRenderSpec;
  bindings?: ActionBinding[];
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface ViewDraft {
  spec: UIRenderSpec;
  bindings?: ActionBinding[];
}

export interface ResolvedView extends ViewDraft {
  id?: string;
  kind: 'generated' | 'app';
  title?: string;
  templateId?: string;
  workflow?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateViewFromTemplateOptions {
  id?: string;
  kind?: 'generated' | 'app';
  title?: string;
  workflow?: string;
  metadata?: Record<string, unknown>;
}

export interface PromoteViewToTemplateInput extends ViewDraft {
  id: string;
  title: string;
  description?: string;
  workflow?: string;
  sourceViewId?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

function cloneStringArray(values?: string[]): string[] | undefined {
  return values ? [...values] : undefined;
}

function cloneMetadata(
  metadata?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  return metadata ? deepClone(metadata) : undefined;
}

function cloneAppView(view: AppView): AppView {
  return {
    ...view,
    spec: cloneRenderSpec(view.spec),
    bindings: view.bindings ? cloneBindings(view.bindings) : undefined,
    tags: cloneStringArray(view.tags),
    metadata: cloneMetadata(view.metadata),
  };
}

function cloneViewTemplate(template: ViewTemplate): ViewTemplate {
  return {
    ...template,
    spec: cloneRenderSpec(template.spec),
    bindings: template.bindings ? cloneBindings(template.bindings) : undefined,
    tags: cloneStringArray(template.tags),
    metadata: cloneMetadata(template.metadata),
  };
}

function cloneResolvedView(view: ResolvedView): ResolvedView {
  return {
    ...view,
    spec: cloneRenderSpec(view.spec),
    bindings: view.bindings ? cloneBindings(view.bindings) : undefined,
    metadata: cloneMetadata(view.metadata),
  };
}

export class ViewRegistry {
  private readonly appViews = new Map<string, AppView>();
  private readonly templates = new Map<string, ViewTemplate>();
  private readonly listeners = new Set<ChangeListener>();

  registerAppView(view: AppView): this {
    this.appViews.set(view.id, cloneAppView(view));
    this.notify();
    return this;
  }

  unregisterAppView(id: string): boolean {
    const deleted = this.appViews.delete(id);
    if (deleted) this.notify();
    return deleted;
  }

  getAppView(id: string): AppView | undefined {
    const view = this.appViews.get(id);
    return view ? cloneAppView(view) : undefined;
  }

  listAppViews(): AppView[] {
    return Array.from(this.appViews.values(), (view) => cloneAppView(view));
  }

  registerTemplate(template: ViewTemplate): this {
    this.templates.set(template.id, cloneViewTemplate(template));
    this.notify();
    return this;
  }

  unregisterTemplate(id: string): boolean {
    const deleted = this.templates.delete(id);
    if (deleted) this.notify();
    return deleted;
  }

  getTemplate(id: string): ViewTemplate | undefined {
    const template = this.templates.get(id);
    return template ? cloneViewTemplate(template) : undefined;
  }

  listTemplates(): ViewTemplate[] {
    return Array.from(this.templates.values(), (template) => cloneViewTemplate(template));
  }

  createViewFromTemplate(
    templateId: string,
    options?: CreateViewFromTemplateOptions,
  ): ResolvedView | undefined {
    const template = this.templates.get(templateId);
    if (!template) return undefined;

    return cloneResolvedView({
      id: options?.id,
      kind: options?.kind ?? 'generated',
      title: options?.title ?? template.title,
      templateId: template.id,
      workflow: options?.workflow ?? template.workflow,
      metadata: options?.metadata,
      spec: template.spec,
      bindings: template.bindings,
    });
  }

  promoteViewToTemplate(input: PromoteViewToTemplateInput): ViewTemplate {
    const template = cloneViewTemplate({
      id: input.id,
      title: input.title,
      description: input.description,
      workflow: input.workflow,
      sourceViewId: input.sourceViewId,
      spec: input.spec,
      bindings: input.bindings,
      tags: input.tags,
      metadata: input.metadata,
    });
    this.templates.set(template.id, template);
    this.notify();
    return cloneViewTemplate(template);
  }

  onChange(listener: ChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export function toViewMetadata(view: Pick<ResolvedView, 'id' | 'kind' | 'title' | 'templateId' | 'workflow'>): ViewMetadata {
  return {
    id: view.id,
    kind: view.kind,
    title: view.title,
    templateId: view.templateId,
    workflow: view.workflow,
  };
}
