import type { AnyaInstance } from './index';
import type { ActionFeedback } from './spec';

export interface FrictionScore {
  kind: 'motor' | 'cognitive';
  score: number;
  severity: 'low' | 'medium' | 'high';
  detail: string;
}

export interface Signal {
  ts: number;
  action: string;
  kind: 'click' | 'submit';
  durationMs: number;
  choiceCount: number;
}

export interface MeasuredInstance {
  instance: AnyaInstance;
  scores(): FrictionScore[];
  signals(): Signal[];
  destroy(): void;
}

export function withMeasurement(instance: AnyaInstance, root: HTMLElement): MeasuredInstance {
  const collected: Signal[] = [];
  let lastActionTs = Date.now();

  const unsub = instance.on('action', (feedback) => {
    const now = Date.now();
    collected.push({
      ts: now,
      action: feedback.action,
      kind: feedback.values ? 'submit' : 'click',
      durationMs: now - lastActionTs,
      choiceCount: root.querySelectorAll('.anya-action').length,
    });
    lastActionTs = now;
  });

  return {
    instance,
    scores() {
      return computeScores(root);
    },
    signals() {
      return [...collected];
    },
    destroy() {
      unsub();
      instance.destroy();
    },
  };
}

function computeScores(root: HTMLElement): FrictionScore[] {
  const scores: FrictionScore[] = [];

  const cognitive = computeCognitive(root);
  if (cognitive) scores.push(cognitive);

  return scores;
}

function computeCognitive(root: HTMLElement): FrictionScore | null {
  const actions = root.querySelectorAll('.anya-action');
  const inputs = root.querySelectorAll('.anya-input');
  const choiceCount = actions.length + inputs.length;
  if (choiceCount < 2) return null;

  const bits = Math.log2(choiceCount + 1);
  const score = Math.min(bits / 4, 1);

  return {
    kind: 'cognitive',
    score,
    severity: bits >= 3.5 ? 'high' : bits >= 2.5 ? 'medium' : 'low',
    detail: `${choiceCount} interactive elements, Hick-Hyman bits=${bits.toFixed(2)}`,
  };
}
