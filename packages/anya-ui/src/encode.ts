import type { ActionFeedback } from './spec';

export function encode(feedback: ActionFeedback): string {
  if (feedback.values) {
    const fields = Object.entries(feedback.values)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(', ');
    return `User submitted "${feedback.action}" with ${fields}`;
  }
  if (feedback.params) {
    const params = Object.entries(feedback.params)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(', ');
    return `User clicked "${feedback.action}" (${params})`;
  }
  return `User clicked "${feedback.action}"`;
}

export function encodeHistory(history: ActionFeedback[]): string {
  if (history.length === 0) return '';
  return history.map(encode).join('\n');
}
