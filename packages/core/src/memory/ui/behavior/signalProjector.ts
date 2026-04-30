import { nextGeneratedId } from '../../../id';
import { asFiniteNumber, asObject, asString, parseJsonObject } from '../payload';
import type { UiMemoryEvent } from '../schemas';
import type { BehaviorSignal, InteractionModality } from './schemas';

interface ViewContext {
  viewId?: string;
  viewKind?: 'generated' | 'app';
  templateId?: string;
  workflow?: string;
  layout?: string;
}

const POINTER_TRIGGERS = new Set([
  'onClick',
  'onDoubleClick',
  'onMouseEnter',
  'onMouseLeave',
]);

const KEYBOARD_COMPONENTS = new Set([
  'textinput',
  'textarea',
  'searchinput',
]);

const INPUT_COMPONENTS = new Set([
  'textinput',
  'searchinput',
  'textarea',
  'select',
  'checkbox',
  'radiobutton',
  'toggle',
  'slider',
]);

const ACTION_COMPONENTS = new Set([
  'button',
  'buttongroup',
  'link',
  'tabs',
  'tabitem',
  'breadcrumbs',
]);

const LAYOUT_COMPONENTS = new Set([
  'card',
  'section',
  'container',
  'flexrow',
  'flexcol',
  'divider',
  'accordion',
  'accordionitem',
]);

const TEXT_COMPONENTS = new Set([
  'heading',
  'text',
  'quote',
  'label',
]);

export function projectBehaviorSignals(events: UiMemoryEvent[]): BehaviorSignal[] {
  const sorted = [...events].sort((left, right) => left.ts - right.ts);
  const viewBySession = new Map<string, ViewContext>();
  const signals: BehaviorSignal[] = [];

  for (const event of sorted) {
    if (event.type === 'ui.presented') {
      const payload = parseJsonObject(event.payloadJson);
      const view = asObject(payload?.view);
      viewBySession.set(event.sessionId, {
        viewId: asString(view?.id) ?? undefined,
        viewKind: asString(view?.kind) === 'app' ? 'app' : asString(view?.kind) === 'generated' ? 'generated' : undefined,
        templateId: asString(view?.templateId) ?? undefined,
        workflow: asString(view?.workflow) ?? undefined,
        layout: asString(view?.layout) ?? undefined,
      });
      continue;
    }

    const view = viewBySession.get(event.sessionId);
    const signal = projectSingleEvent(event, view);
    if (signal) {
      signals.push(signal);
    }
  }

  return signals;
}

function projectSingleEvent(
  event: UiMemoryEvent,
  view: ViewContext | undefined,
): BehaviorSignal | null {
  const payload = parseJsonObject(event.payloadJson);

  if (event.type === 'interaction.measured') {
    const measurement = asObject(payload?.measurement);
    const componentName = asString(payload?.componentName) ?? 'unknown';
    const action = asString(payload?.action) ?? 'custom';
    const componentFamily = asString(measurement?.componentFamily) ?? inferComponentFamily(componentName);
    const actionFamily = asString(measurement?.actionFamily) ?? inferActionFamily(action);
    return {
      ...createBaseSignal(event, view),
      contextArchetype: deriveContextArchetype(view, componentFamily, actionFamily, asFiniteNumber(measurement?.choiceSetSize)),
      componentRole: asString(measurement?.componentRole) ?? undefined,
      componentFamily,
      actionFamily,
      modality: normalizeModality(asString(measurement?.modality)),
      travelPx: asFiniteNumber(measurement?.travelPx) ?? undefined,
      pathLengthPx: asFiniteNumber(measurement?.pathLengthPx) ?? undefined,
      pathWidthPx: asFiniteNumber(measurement?.pathWidthPx) ?? undefined,
      dragDistancePx: asFiniteNumber(measurement?.dragDistancePx) ?? undefined,
      targetWidthPx: asFiniteNumber(measurement?.targetWidthPx) ?? undefined,
      targetHeightPx: asFiniteNumber(measurement?.targetHeightPx) ?? undefined,
      choiceSetSize: asFiniteNumber(measurement?.choiceSetSize) ?? undefined,
      isPrimaryAction: typeof measurement?.isPrimaryAction === 'boolean' ? measurement.isPrimaryAction : undefined,
      focusMovesSinceLast: asFiniteNumber(measurement?.focusMovesSinceLast) ?? undefined,
      homingTransitionsSinceLast: asFiniteNumber(measurement?.homingTransitionsSinceLast) ?? undefined,
      valueLength: asFiniteNumber(measurement?.valueLength) ?? undefined,
      deltaLength: asFiniteNumber(measurement?.deltaLength) ?? undefined,
    };
  }

  if (event.type === 'binding.executed') {
    const record = asObject(payload?.record);
    const interaction = asObject(record?.interaction);
    const componentName = asString(interaction?.componentName) ?? 'unknown';
    const action = asString(interaction?.action) ?? 'custom';
    return {
      ...createBaseSignal(event, view),
      contextArchetype: deriveContextArchetype(view, inferComponentFamily(componentName), inferActionFamily(action)),
      componentFamily: inferComponentFamily(componentName),
      actionFamily: inferActionFamily(action),
      modality: inferModalityFromInteraction(componentName, asString(interaction?.trigger)),
      success: asString(record?.status) === 'success',
      waitMs: asFiniteNumber(record?.durationMs) ?? undefined,
    };
  }

  if (event.type === 'tool.finished' || event.type === 'tool.failed') {
    const interaction = asObject(payload?.interaction);
    const componentName = asString(interaction?.componentName) ?? 'unknown';
    return {
      ...createBaseSignal(event, view),
      contextArchetype: deriveContextArchetype(view, inferComponentFamily(componentName), 'tool'),
      componentFamily: inferComponentFamily(componentName),
      actionFamily: 'tool',
      modality: inferModalityFromInteraction(componentName, asString(interaction?.trigger)),
      success: event.type === 'tool.finished',
      waitMs: asFiniteNumber(payload?.durationMs) ?? undefined,
    };
  }

  return null;
}

function normalizeModality(input: string | null): InteractionModality {
  if (input === 'pointer' || input === 'keyboard' || input === 'touch') {
    return input;
  }
  return 'unknown';
}

function inferModalityFromInteraction(
  componentName: string,
  trigger: string | null,
): InteractionModality {
  const normalized = normalizeComponentName(componentName);
  if (KEYBOARD_COMPONENTS.has(normalized)) {
    return 'keyboard';
  }
  if (trigger && POINTER_TRIGGERS.has(trigger)) {
    return 'pointer';
  }
  return 'unknown';
}

function deriveContextArchetype(
  view: ViewContext | undefined,
  componentFamily?: string,
  actionFamily?: string,
  choiceSetSize?: number | null,
): string {
  const workflow = normalizeWorkflow(view?.workflow);

  if (actionFamily === 'drag') return 'arrange_customize';
  if (containsAny(workflow, ['arrange', 'customize', 'personalize', 'configure', 'builder', 'layout'])) {
    return 'arrange_customize';
  }
  if (containsAny(workflow, ['review', 'confirm', 'approval', 'approve', 'checkout', 'summary'])) {
    return 'review_confirm';
  }
  if (containsAny(workflow, ['compare', 'diff', 'versus'])) {
    return 'compare';
  }
  if (containsAny(workflow, ['edit', 'compose', 'form', 'draft'])) {
    return 'edit_compose';
  }
  if (view?.layout === 'split') return 'compare';
  if (
    actionFamily === 'navigation'
    && ((choiceSetSize ?? 0) >= 4 || containsAny(workflow, ['search', 'filter', 'discover']))
  ) {
    return 'search_filter';
  }
  if (actionFamily === 'navigation') return 'navigate_drilldown';
  if (componentFamily === 'input') return 'edit_compose';
  if ((choiceSetSize ?? 0) >= 6) return 'search_filter';
  return 'browse_scan';
}

function inferComponentFamily(componentName: string): string {
  const normalized = normalizeComponentName(componentName);
  if (INPUT_COMPONENTS.has(normalized)) {
    return 'input';
  }
  if (ACTION_COMPONENTS.has(normalized)) {
    return 'action';
  }
  if (LAYOUT_COMPONENTS.has(normalized)) {
    return 'layout';
  }
  if (TEXT_COMPONENTS.has(normalized)) {
    return 'text';
  }
  return 'unknown';
}

function inferActionFamily(action: string): string {
  const normalized = action.toLowerCase();
  if (normalized.includes('drag') || normalized === 'drop') return 'drag';
  if (normalized.includes('change') || normalized.includes('edit') || normalized.includes('input')) return 'input';
  if (normalized.includes('tab') || normalized.includes('search') || normalized.includes('filter') || normalized.includes('navigate')) return 'navigation';
  if (normalized.includes('submit') || normalized.includes('click') || normalized.includes('press')) return 'activate';
  if (normalized.startsWith('tool:')) return 'tool';
  return 'custom';
}

function createBaseSignal(
  event: UiMemoryEvent,
  view: ViewContext | undefined,
) {
  return {
    id: nextGeneratedId('bsig'),
    actorId: event.actorId,
    sessionId: event.sessionId,
    viewId: view?.viewId,
    viewKind: view?.viewKind,
    templateId: view?.templateId,
    sourceEventId: event.id,
    sourceEventType: event.type,
    ts: event.ts,
    workflow: view?.workflow,
  };
}

function normalizeComponentName(componentName: string): string {
  return componentName.toLowerCase();
}

function normalizeWorkflow(workflow?: string): string {
  return workflow?.toLowerCase().trim() ?? '';
}

function containsAny(value: string, patterns: string[]): boolean {
  return patterns.some((pattern) => value.includes(pattern));
}
