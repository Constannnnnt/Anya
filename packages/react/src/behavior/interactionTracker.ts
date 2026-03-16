import type {
  InteractionModality,
  UIInteractionMeasurement,
  UIInteractionMeasurementHint,
  UIInteractionRecord,
} from '@anya-ui/core';

interface PointerPoint {
  x: number;
  y: number;
}

interface InteractionTrackerState {
  lastElementId?: string;
  lastModality?: InteractionModality;
  lastPointerPoint?: PointerPoint;
}

export interface InteractionMeasurementTracker {
  enrich: (
    interaction: UIInteractionRecord,
    measurement: UIInteractionMeasurement,
    measurementHint?: UIInteractionMeasurementHint,
  ) => UIInteractionMeasurement;
  reset: () => void;
}

export function createInteractionMeasurementTracker(): InteractionMeasurementTracker {
  let state: InteractionTrackerState = {};

  return {
    enrich(interaction, measurement, measurementHint) {
      const pointerPoint = getPointerPoint(measurementHint);
      const focusMovesSinceLast = resolveFocusMoveCount(state, interaction, measurement);
      const homingTransitionsSinceLast = resolveHomingTransitions(state, measurement);
      const travelPx = resolveTravelDistance(state.lastPointerPoint, measurement, pointerPoint);

      state = {
        lastElementId: interaction.elementId,
        lastModality: measurement.modality,
        lastPointerPoint: shouldTrackPointerPoint(measurement.modality, pointerPoint)
          ? pointerPoint
          : state.lastPointerPoint,
      };

      return {
        ...measurement,
        ...(travelPx !== undefined ? { travelPx } : {}),
        ...(focusMovesSinceLast !== undefined ? { focusMovesSinceLast } : {}),
        ...(homingTransitionsSinceLast !== undefined ? { homingTransitionsSinceLast } : {}),
      };
    },
    reset() {
      state = {};
    },
  };
}

function resolveFocusMoveCount(
  state: InteractionTrackerState,
  interaction: UIInteractionRecord,
  measurement: UIInteractionMeasurement,
): number | undefined {
  if (measurement.focusMovesSinceLast !== undefined) {
    return measurement.focusMovesSinceLast;
  }
  if (!state.lastElementId) {
    return 0;
  }
  return state.lastElementId === interaction.elementId ? 0 : 1;
}

function resolveHomingTransitions(
  state: InteractionTrackerState,
  measurement: UIInteractionMeasurement,
): number | undefined {
  if (measurement.homingTransitionsSinceLast !== undefined) {
    return measurement.homingTransitionsSinceLast;
  }
  if (!state.lastModality) {
    return 0;
  }
  return isHomingTransition(state.lastModality, measurement.modality) ? 1 : 0;
}

function resolveTravelDistance(
  previousPoint: PointerPoint | undefined,
  measurement: UIInteractionMeasurement,
  pointerPoint: PointerPoint | undefined,
): number | undefined {
  if (measurement.travelPx !== undefined) {
    return measurement.travelPx;
  }
  if (
    (measurement.modality !== 'pointer' && measurement.modality !== 'touch')
    || !previousPoint
    || !pointerPoint
  ) {
    return measurement.travelPx;
  }
  return roundMetric(distance(previousPoint, pointerPoint));
}

function shouldTrackPointerPoint(
  modality: InteractionModality,
  pointerPoint: PointerPoint | undefined,
): pointerPoint is PointerPoint {
  return Boolean(pointerPoint) && (modality === 'pointer' || modality === 'touch');
}

function getPointerPoint(
  measurementHint?: UIInteractionMeasurementHint,
): PointerPoint | undefined {
  const x = asFiniteNumber(measurementHint?.pointerX);
  const y = asFiniteNumber(measurementHint?.pointerY);
  if (x === undefined || y === undefined) {
    return undefined;
  }
  return { x, y };
}

function isHomingTransition(
  previous: InteractionModality,
  current: InteractionModality,
): boolean {
  const previousFamily = modalityFamily(previous);
  const currentFamily = modalityFamily(current);
  return previousFamily !== 'unknown'
    && currentFamily !== 'unknown'
    && previousFamily !== currentFamily
    && (previousFamily === 'keyboard' || currentFamily === 'keyboard');
}

function modalityFamily(
  modality: InteractionModality,
): 'keyboard' | 'pointing' | 'unknown' {
  switch (modality) {
    case 'keyboard':
      return 'keyboard';
    case 'pointer':
    case 'touch':
      return 'pointing';
    default:
      return 'unknown';
  }
}

function distance(left: PointerPoint, right: PointerPoint): number {
  const dx = right.x - left.x;
  const dy = right.y - left.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function roundMetric(value: number): number {
  return Math.round(value * 100) / 100;
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}
