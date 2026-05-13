import type { AnyaInstance } from './index';
import type { ActionFeedback } from './spec';

export interface Signal {
  ts: number;
  action: string;
  modality: 'pointer' | 'keyboard' | 'touch';
  travelPx?: number;
  targetWidthPx?: number;
  targetHeightPx?: number;
  pathLengthPx?: number;
  pathWidthPx?: number;
  choiceSetSize?: number;
  valueLength?: number;
  deltaLength?: number;
  waitMs?: number;
  success?: boolean;
  viewId?: string;
}

export type Severity = 'low' | 'medium' | 'high';

export interface FrictionScore {
  kind: 'motor' | 'cognitive' | 'wayfinding' | 'input';
  score: number;
  severity: Severity;
  detail: string;
}

export interface MeasuredInstance {
  instance: AnyaInstance;
  scores(): FrictionScore[];
  signals(): Signal[];
  reset(): void;
  destroy(): void;
}

export function withMeasurement(instance: AnyaInstance, root: HTMLElement): MeasuredInstance {
  const collected: Signal[] = [];
  let lastX = 0;
  let lastY = 0;

  const onPointerMove = (e: PointerEvent) => {
    lastX = e.clientX;
    lastY = e.clientY;
  };

  const onPointerDown = (e: PointerEvent) => {
    const target = e.target as HTMLElement;
    const interactive = target.closest('.anya-action, .anya-input');
    if (!interactive) return;

    const rect = interactive.getBoundingClientRect();
    collected.push({
      ts: Date.now(),
      action: 'click',
      modality: 'pointer',
      travelPx: Math.hypot(e.clientX - lastX, e.clientY - lastY),
      targetWidthPx: rect.width,
      targetHeightPx: rect.height,
    });
  };

  root.addEventListener('pointermove', onPointerMove, { passive: true });
  root.addEventListener('pointerdown', onPointerDown, { passive: true });

  const unsub = instance.on('action', (feedback) => {
    collected.push(feedbackToSignal(feedback, root));
  });

  const originalDestroy = instance.destroy.bind(instance);
  instance.destroy = () => {
    root.removeEventListener('pointermove', onPointerMove);
    root.removeEventListener('pointerdown', onPointerDown);
    unsub();
    originalDestroy();
  };

  return {
    instance,
    scores: () => computeScores(collected),
    signals: () => [...collected],
    reset: () => { collected.length = 0; },
    destroy: () => instance.destroy(),
  };
}

function feedbackToSignal(feedback: ActionFeedback, root: HTMLElement): Signal {
  const buttons = root.querySelectorAll('.anya-action');
  return {
    ts: feedback.timestamp,
    action: feedback.action,
    modality: feedback.values ? 'keyboard' : 'pointer',
    choiceSetSize: buttons.length,
    valueLength: feedback.values
      ? Object.values(feedback.values).reduce<number>((n, v) => n + String(v ?? '').length, 0)
      : undefined,
    deltaLength: feedback.values
      ? Object.values(feedback.values).filter(v => v !== '' && v != null).length
      : undefined,
  };
}

// ─── Heuristic Computations ─────────────────────────────────────────────

function computeScores(signals: Signal[]): FrictionScore[] {
  const scores: FrictionScore[] = [];
  const motor = computeMotorFriction(signals);
  if (motor) scores.push(motor);
  const cognitive = computeCognitiveLoad(signals);
  if (cognitive) scores.push(cognitive);
  const wayfinding = computeWayfinding(signals);
  if (wayfinding) scores.push(wayfinding);
  const input = computeInputFriction(signals);
  if (input) scores.push(input);
  return scores;
}

function computeMotorFriction(signals: Signal[]): FrictionScore | null {
  const pointer = signals.filter(s => s.modality === 'pointer' && s.travelPx != null && s.targetWidthPx != null);
  if (pointer.length < 3) return null;

  const fittsIds = pointer.map(s => Math.log2(s.travelPx! / Math.max(s.targetWidthPx!, 1) + 1));
  const avg = mean(fittsIds);
  const score = clamp(avg / 6, 0, 1);
  return {
    kind: 'motor',
    score,
    severity: threshold(avg, 4.5, 3.2),
    detail: `Fitts' ID avg=${avg.toFixed(2)} over ${pointer.length} interactions`,
  };
}

function computeCognitiveLoad(signals: Signal[]): FrictionScore | null {
  const withChoice = signals.filter(s => s.choiceSetSize != null && s.choiceSetSize! > 0);
  if (withChoice.length < 3) return null;

  const choiceBits = withChoice.map(s => Math.log2(s.choiceSetSize! + 1));
  const avgBits = mean(choiceBits);

  let modalitySwitches = 0;
  for (let i = 1; i < signals.length; i++) {
    if (signals[i].modality !== signals[i - 1].modality) modalitySwitches++;
  }
  const switchRate = modalitySwitches / Math.max(signals.length - 1, 1);

  const combined = avgBits * 0.7 + switchRate * 3 * 0.3;
  const score = clamp(combined / 4, 0, 1);
  return {
    kind: 'cognitive',
    score,
    severity: threshold(avgBits, 3.2, 2.5),
    detail: `Hick-Hyman bits=${avgBits.toFixed(2)}, modality switches=${modalitySwitches}`,
  };
}

function computeWayfinding(signals: Signal[]): FrictionScore | null {
  const nav = signals.filter(s => s.viewId != null);
  if (nav.length < 4) return null;

  const path = nav.map(s => s.viewId!);
  const seen = new Set<string>();
  let revisits = 0;
  for (const id of path) {
    if (seen.has(id)) revisits++;
    seen.add(id);
  }
  const revisitRate = revisits / path.length;

  let oscillations = 0;
  for (let i = 2; i < path.length; i++) {
    if (path[i] === path[i - 2] && path[i] !== path[i - 1]) oscillations++;
  }
  const oscRate = oscillations / (path.length - 2);

  const combined = revisitRate * 0.6 + oscRate * 0.4;
  const score = clamp(combined / 0.4, 0, 1);
  return {
    kind: 'wayfinding',
    score,
    severity: threshold(revisitRate, 0.35, 0.2),
    detail: `revisit=${(revisitRate * 100).toFixed(0)}%, oscillation=${(oscRate * 100).toFixed(0)}%`,
  };
}

function computeInputFriction(signals: Signal[]): FrictionScore | null {
  const inputs = signals.filter(s => s.modality === 'keyboard' && s.valueLength != null);
  if (inputs.length < 2) return null;

  const corrections = inputs.filter(s => (s.deltaLength ?? 0) > 0);
  const correctionRate = corrections.length / inputs.length;
  const avgDelta = mean(inputs.map(s => s.deltaLength ?? 0));
  const avgValue = mean(inputs.map(s => s.valueLength ?? 0));
  const pressure = avgValue > 0 ? avgDelta / avgValue : 0;

  const score = clamp(pressure + correctionRate * 0.3, 0, 1);
  return {
    kind: 'input',
    score,
    severity: threshold(pressure, 0.8, 0.5),
    detail: `correction pressure=${pressure.toFixed(2)}, rate=${(correctionRate * 100).toFixed(0)}%`,
  };
}

// ─── Utilities ──────────────────────────────────────────────────────────

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function threshold(value: number, high: number, medium: number): Severity {
  if (value >= high) return 'high';
  if (value >= medium) return 'medium';
  return 'low';
}
