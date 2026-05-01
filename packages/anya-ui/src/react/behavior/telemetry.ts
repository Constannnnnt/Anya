import type {
  InteractionModality,
  ViewNode,
  InteractionMeasurement,
  InteractionMeasurementHint,
  InteractionEvent,
  PresentedView,
  ViewSpec,
  ViewOrigin,
} from '../../core';
import { stableSerialize } from '../utils/stableSerialize';

export interface BehaviorTelemetryPolicy {
  captureTargetGeometry: boolean;
  captureChoiceSetSize: boolean;
  captureValueLengths: boolean;
  captureRawValues: false;
}

export const DEFAULT_BEHAVIOR_TELEMETRY_POLICY: BehaviorTelemetryPolicy = Object.freeze({
  captureTargetGeometry: true,
  captureChoiceSetSize: true,
  captureValueLengths: true,
  captureRawValues: false,
});

interface ComponentLookup {
  component: ViewNode;
  parent?: ViewNode;
}

interface MeasurableElement extends EventTarget {
  getBoundingClientRect: () => {
    width: number;
    height: number;
  };
}

const POINTER_TRIGGERS = new Set([
  'onClick',
  'onDoubleClick',
  'onMouseEnter',
  'onMouseLeave',
]);

const TEXT_LIKE_COMPONENTS = new Set([
  'textinput',
  'searchinput',
  'textarea',
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

const MEDIA_COMPONENTS = new Set([
  'image',
  'video',
  'iframe',
  'avatar',
]);

const FEEDBACK_COMPONENTS = new Set([
  'alert',
  'badge',
  'progressbar',
  'spinner',
  'skeleton',
  'emptystate',
]);

const TEXT_COMPONENTS = new Set([
  'heading',
  'text',
  'quote',
  'label',
]);

const CONTENT_COMPONENTS = new Set([
  'list',
  'listitem',
  'table',
  'timeline',
  'timelineitem',
]);

const CHOICE_SET_COMPONENTS = new Set([
  'select',
  'radiobutton',
  'tabs',
]);

const ACTION_CLUSTER_COMPONENTS = new Set([
  'button',
  'link',
  'tabitem',
]);

export interface PresentedViewOptions {
  kind?: ViewOrigin;
  id?: string;
  title?: string;
  templateId?: string;
  workflow?: string;
}

export function buildPresentedView(
  spec: ViewSpec,
  options?: PresentedViewOptions,
): PresentedView {
  let componentCount = 0;
  let interactiveCount = 0;
  let actionableCount = 0;
  const componentFamilies = new Set<string>();
  const actionFamilies = new Set<string>();
  const workflow = options?.workflow ?? spec.skill;

  walkComponents(spec.nodes, (component) => {
    componentCount += 1;
    componentFamilies.add(inferComponentFamily(component.type));
    const interactions = component.interactions ?? [];
    if (interactions.length === 0) {
      return;
    }

    interactiveCount += 1;
    actionableCount += interactions.length;
    for (const interaction of interactions) {
      actionFamilies.add(inferActionFamily(interaction.action));
    }
  });

  const fingerprint = hashString(
    stableSerialize({
      skill: workflow,
      layout: spec.layout,
      nodes: spec.nodes.map(summarizeComponent),
    }),
  );
  const id = options?.id ?? `view-${fingerprint}`;

  return {
    id,
    kind: options?.kind ?? 'generated',
    layout: spec.layout,
    workflow,
    templateId: options?.templateId,
    title: options?.title,
    componentCount,
    interactiveCount,
    actionableCount,
    componentFamilies: [...componentFamilies].sort(),
    actionFamilies: [...actionFamilies].sort(),
    fingerprint,
  };
}

export function deriveInteractionMeasurement(
  interaction: InteractionEvent,
  spec?: ViewSpec | null,
  measurementHint?: InteractionMeasurementHint,
  policy: BehaviorTelemetryPolicy = DEFAULT_BEHAVIOR_TELEMETRY_POLICY,
): InteractionMeasurement {
  const componentLookup = spec
    ? findComponent(spec.nodes, interaction.nodeId)
    : undefined;
  const component = componentLookup?.component;
  const nodeType = component?.type ?? interaction.nodeType;
  const previousValueLength = policy.captureValueLengths
    ? measureValueLength(interaction.previousValue)
    : undefined;
  const nextValueLength = policy.captureValueLengths
    ? measureValueLength(interaction.newValue)
    : undefined;

  return {
    modality: measurementHint?.modality ?? inferInteractionModality(interaction),
    componentRole: inferComponentRole(nodeType),
    componentFamily: inferComponentFamily(nodeType),
    actionFamily: inferActionFamily(interaction.action),
    travelPx: normalizeDimension(measurementHint?.travelPx),
    pathLengthPx: normalizeDimension(measurementHint?.pathLengthPx),
    pathWidthPx: normalizeDimension(measurementHint?.pathWidthPx),
    dragDistancePx: normalizeDimension(measurementHint?.dragDistancePx),
    targetWidthPx: policy.captureTargetGeometry
      ? normalizeDimension(measurementHint?.targetWidthPx)
      : undefined,
    targetHeightPx: policy.captureTargetGeometry
      ? normalizeDimension(measurementHint?.targetHeightPx)
      : undefined,
    choiceSetSize: policy.captureChoiceSetSize
      ? resolveChoiceSetSize(componentLookup, measurementHint)
      : undefined,
    isPrimaryAction: component
      ? inferPrimaryAction(component)
      : undefined,
    focusMovesSinceLast: normalizeNonNegativeCount(measurementHint?.focusMovesSinceLast),
    homingTransitionsSinceLast: normalizeNonNegativeCount(measurementHint?.homingTransitionsSinceLast),
    valueLength: nextValueLength,
    deltaLength:
      previousValueLength !== undefined && nextValueLength !== undefined
        ? Math.abs(nextValueLength - previousValueLength)
        : undefined,
  };
}

export function sanitizeInteractionRecordForTelemetry(
  interaction: InteractionEvent,
  measurement: InteractionMeasurement,
  policy: BehaviorTelemetryPolicy = DEFAULT_BEHAVIOR_TELEMETRY_POLICY,
): InteractionEvent {
  if (policy.captureRawValues) {
    return cloneInteractionRecord(interaction);
  }

  if (!isTextLikeMeasurement(measurement, interaction)) {
    return cloneInteractionRecord(interaction);
  }

  return {
    ...cloneInteractionRecord(interaction),
    previousValue: undefined,
    newValue: undefined,
    semanticDescription: sanitizeTextLikeDescription(interaction),
  };
}

export function measureElementTarget(
  element: EventTarget | null,
  modality: InteractionModality = 'unknown',
  overrides?: Partial<InteractionMeasurementHint>,
): InteractionMeasurementHint {
  const base: InteractionMeasurementHint = { modality };
  if (!hasBoundingClientRect(element)) {
    return {
      ...base,
      ...sanitizeMeasurementHintOverrides(overrides),
    };
  }

  const rect = element.getBoundingClientRect();

  return {
    ...base,
    targetWidthPx: normalizeDimension(rect.width),
    targetHeightPx: normalizeDimension(rect.height),
    ...sanitizeMeasurementHintOverrides(overrides),
  };
}

export function measurePointerTarget(
  element: EventTarget | null,
  event: {
    clientX?: number;
    clientY?: number;
    detail?: number;
  } | null,
  overrides?: Partial<InteractionMeasurementHint>,
): InteractionMeasurementHint {
  const modality = event?.detail === 0 ? 'keyboard' : 'pointer';
  return measureElementTarget(element, modality, {
    pointerX: normalizeDimension(event?.clientX),
    pointerY: normalizeDimension(event?.clientY),
    ...overrides,
  });
}

function walkComponents(
  nodes: ViewNode[],
  visitor: (component: ViewNode) => void,
): void {
  for (const component of nodes) {
    visitor(component);
    if (component.children?.length) {
      walkComponents(component.children, visitor);
    }
  }
}

function summarizeComponent(component: ViewNode): Record<string, unknown> {
  return {
    id: component.id,
    type: component.type,
    interactive: Boolean(component.interactions?.length),
    children: component.children?.map(summarizeComponent),
  };
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function findComponent(
  nodes: ViewNode[],
  nodeId: string,
  parent?: ViewNode,
): ComponentLookup | undefined {
  for (const component of nodes) {
    if (component.id === nodeId) {
      return { component, parent };
    }
    if (component.children?.length) {
      const nested = findComponent(component.children, nodeId, component);
      if (nested) return nested;
    }
  }
  return undefined;
}

function normalizeDimension(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.round(value * 100) / 100
    : undefined;
}

function normalizeNonNegativeCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : undefined;
}

function cloneInteractionRecord(interaction: InteractionEvent): InteractionEvent {
  return {
    ...interaction,
    ...(interaction.targetIds ? { targetIds: [...interaction.targetIds] } : {}),
  };
}

function measureValueLength(value: unknown): number | undefined {
  if (typeof value === 'string') return value.length;
  if (Array.isArray(value)) return value.length;
  return undefined;
}

function resolveChoiceSetSize(
  componentLookup: ComponentLookup | undefined,
  measurementHint?: InteractionMeasurementHint,
): number | undefined {
  const explicit = normalizeNonNegativeCount(measurementHint?.choiceSetSize);
  if (explicit !== undefined) {
    return explicit;
  }
  if (!componentLookup) {
    return undefined;
  }

  const normalized = normalizeComponentName(componentLookup.component.type);
  if (CHOICE_SET_COMPONENTS.has(normalized)) {
    return countIntrinsicAlternatives(componentLookup.component);
  }

  const parent = componentLookup.parent;
  if (!parent) {
    return undefined;
  }

  const actionableSiblingCount = countActionClusterChildren(parent.children ?? []);
  if (ACTION_CLUSTER_COMPONENTS.has(normalized) && actionableSiblingCount >= 2) {
    return actionableSiblingCount;
  }

  return undefined;
}

function countIntrinsicAlternatives(component: ViewNode): number | undefined {
  const normalized = normalizeComponentName(component.type);
  if (normalized === 'tabs') {
    const count = component.children?.length ?? 0;
    return count >= 2 ? count : undefined;
  }

  const options = Array.isArray(component.props.options)
    ? component.props.options
    : undefined;
  if (options && options.length >= 2) {
    return options.length;
  }

  return undefined;
}

function countActionClusterChildren(children: ViewNode[]): number {
  return children.reduce((count, child) =>
    ACTION_CLUSTER_COMPONENTS.has(normalizeComponentName(child.type))
      ? count + 1
      : count
  , 0);
}

function sanitizeMeasurementHintOverrides(
  overrides?: Partial<InteractionMeasurementHint>,
): Partial<InteractionMeasurementHint> {
  if (!overrides) {
    return {};
  }

  const pointerX = normalizeDimension(overrides.pointerX);
  const pointerY = normalizeDimension(overrides.pointerY);
  const travelPx = normalizeDimension(overrides.travelPx);
  const pathLengthPx = normalizeDimension(overrides.pathLengthPx);
  const pathWidthPx = normalizeDimension(overrides.pathWidthPx);
  const dragDistancePx = normalizeDimension(overrides.dragDistancePx);
  const choiceSetSize = normalizeNonNegativeCount(overrides.choiceSetSize);
  const focusMovesSinceLast = normalizeNonNegativeCount(overrides.focusMovesSinceLast);
  const homingTransitionsSinceLast = normalizeNonNegativeCount(overrides.homingTransitionsSinceLast);

  return {
    ...(pointerX !== undefined ? { pointerX } : {}),
    ...(pointerY !== undefined ? { pointerY } : {}),
    ...(travelPx !== undefined ? { travelPx } : {}),
    ...(pathLengthPx !== undefined ? { pathLengthPx } : {}),
    ...(pathWidthPx !== undefined ? { pathWidthPx } : {}),
    ...(dragDistancePx !== undefined ? { dragDistancePx } : {}),
    ...(choiceSetSize !== undefined ? { choiceSetSize } : {}),
    ...(focusMovesSinceLast !== undefined ? { focusMovesSinceLast } : {}),
    ...(homingTransitionsSinceLast !== undefined ? { homingTransitionsSinceLast } : {}),
  };
}

function inferInteractionModality(
  interaction: InteractionEvent,
): InteractionModality {
  const normalizedComponent = normalizeComponentName(interaction.nodeType);
  if (TEXT_LIKE_COMPONENTS.has(normalizedComponent)) {
    return 'keyboard';
  }
  if (
    interaction.action === 'drop'
    || interaction.action === 'drag_extend'
    || interaction.action === 'drag_reorder'
  ) {
    return 'pointer';
  }
  if (interaction.trigger && POINTER_TRIGGERS.has(interaction.trigger)) {
    return 'pointer';
  }
  return 'unknown';
}

function isTextLikeMeasurement(
  measurement: InteractionMeasurement,
  interaction: InteractionEvent,
): boolean {
  if (measurement.componentRole === 'textbox') {
    return true;
  }
  return TEXT_LIKE_COMPONENTS.has(normalizeComponentName(interaction.nodeType));
}

function sanitizeTextLikeDescription(interaction: InteractionEvent): string {
  switch (interaction.nodeType) {
    case 'SearchInput':
      return 'User updated search query.';
    case 'Textarea':
      return 'User updated textarea content.';
    case 'TextInput':
    default:
      return 'User updated text input.';
  }
}

function inferComponentRole(nodeType: string): string | undefined {
  const normalized = normalizeComponentName(nodeType);
  switch (normalized) {
    case 'button':
      return 'button';
    case 'link':
      return 'link';
    case 'textinput':
    case 'searchinput':
    case 'textarea':
      return 'textbox';
    case 'select':
      return 'select';
    case 'checkbox':
    case 'radiobutton':
    case 'toggle':
      return 'selection_control';
    case 'slider':
      return 'slider';
    case 'tabs':
    case 'tabitem':
      return 'tab';
    default:
      return undefined;
  }
}

function inferComponentFamily(nodeType: string): string {
  const normalized = normalizeComponentName(nodeType);
  if (INPUT_COMPONENTS.has(normalized)) {
    return 'input';
  }
  if (ACTION_COMPONENTS.has(normalized)) {
    return 'action';
  }
  if (LAYOUT_COMPONENTS.has(normalized)) {
    return 'layout';
  }
  if (MEDIA_COMPONENTS.has(normalized)) {
    return 'media';
  }
  if (FEEDBACK_COMPONENTS.has(normalized)) {
    return 'feedback';
  }
  if (TEXT_COMPONENTS.has(normalized)) {
    return 'text';
  }
  if (CONTENT_COMPONENTS.has(normalized)) {
    return 'content';
  }
  return 'unknown';
}

function inferActionFamily(action: string): string {
  const normalized = action.toLowerCase();
  if (normalized.includes('drag') || normalized === 'drop') {
    return 'drag';
  }
  if (normalized.includes('change') || normalized.includes('edit') || normalized.includes('input')) {
    return 'input';
  }
  if (normalized.includes('tab') || normalized.includes('search') || normalized.includes('filter') || normalized.includes('navigate')) {
    return 'navigation';
  }
  if (normalized.includes('submit') || normalized.includes('click') || normalized.includes('press')) {
    return 'activate';
  }
  if (normalized.startsWith('tool:')) {
    return 'tool';
  }
  return 'custom';
}

function inferPrimaryAction(component: ViewNode): boolean | undefined {
  if (component.type !== 'Button') return undefined;
  const variant = typeof component.props.variant === 'string'
    ? component.props.variant.toLowerCase()
    : undefined;
  if (!variant) return undefined;
  return variant === 'primary';
}

function hasBoundingClientRect(value: EventTarget | null): value is MeasurableElement {
  return Boolean(
    value
    && typeof value === 'object'
    && 'getBoundingClientRect' in value
    && typeof (value as MeasurableElement).getBoundingClientRect === 'function',
  );
}

function normalizeComponentName(nodeType: string): string {
  return nodeType.toLowerCase();
}

