import { describe, expect, it } from 'vitest';
import { buildPatternCandidate } from '../memory/ui/patterns';
import type { UiMemoryEvent } from '../memory/ui/schemas';

function makeEvent(overrides: Partial<UiMemoryEvent>): UiMemoryEvent {
  return {
    id: `evt-${Math.random().toString(36).slice(2, 8) }`,
    ts: Date.now(),
    actorId: 'actor-1',
    sessionId: 'session-1',
    type: 'interaction.recorded',
    source: 'user',
    payloadJson: '{ }',
    ...overrides, }; }

describe('buildPatternCandidate', () => {
  it('builds sequence from interaction and binding events', () => {
    const events: UiMemoryEvent[] = [
      makeEvent({
        type: 'session.intent_updated',
        payloadJson: JSON.stringify({ userIntent: 'Compare two company profiles' }), }),
      makeEvent({
        type: 'interaction.recorded',
        payloadJson: JSON.stringify({
          record: { action: 'custom', nodeType: 'Button', nodeId: 'btn-1' }, }), }),
      makeEvent({
        type: 'binding.executed',
        payloadJson: JSON.stringify({
          record: { bindingId: 'b1', status: 'success', toolId: 'web-search' }, }), }),
    ];

    const candidate = buildPatternCandidate(events, null);
    expect(candidate).not.toBeNull();
    expect(candidate!.taskClass).toBe('compare_two_company_profiles');
    expect(candidate!.sequence).toEqual(['ui:custom', 'tool:web-search:success']);
    expect(candidate!.outcome).toBe('success'); });

  it('uses episode assessment for outcome and task class', () => {
    const events: UiMemoryEvent[] = [
      makeEvent({
        type: 'interaction.recorded',
        payloadJson: JSON.stringify({
          record: { action: 'submit', nodeType: 'Form', nodeId: 'f1' }, }), }),
      makeEvent({
        type: 'binding.executed',
        payloadJson: JSON.stringify({
          record: { bindingId: 'b2', status: 'error', toolId: 'save-profile' }, }), }),
    ];

    const candidate = buildPatternCandidate(events, {
      situation: 'Profile save flow',
      intent: 'Save profile settings',
      assessment: 'Yes',
      justification: 'Completed after retry',
      reflection: 'Prefer explicit save affordance', });

    expect(candidate).not.toBeNull();
    expect(candidate!.taskClass).toBe('save_profile_settings');
    expect(candidate!.outcome).toBe('success'); });

  it('returns null when sequence signal is too short', () => {
    const events: UiMemoryEvent[] = [
      makeEvent({
        type: 'interaction.recorded',
        payloadJson: JSON.stringify({
          record: { action: 'expand', nodeType: 'Card', nodeId: 'c1' }, }), }),
    ];

    expect(buildPatternCandidate(events, null)).toBeNull(); });

  it('dedupes consecutive repeated steps', () => {
    const events: UiMemoryEvent[] = [
      makeEvent({
        type: 'interaction.recorded',
        payloadJson: JSON.stringify({
          record: { action: 'custom', nodeType: 'Button', nodeId: 'b1' }, }), }),
      makeEvent({
        type: 'interaction.recorded',
        payloadJson: JSON.stringify({
          record: { action: 'custom', nodeType: 'Button', nodeId: 'b1' }, }), }),
      makeEvent({
        type: 'binding.executed',
        payloadJson: JSON.stringify({
          record: { bindingId: 'bind-1', status: 'success', toolId: 'open-link' }, }), }),
    ];

    const candidate = buildPatternCandidate(events, null);
    expect(candidate).not.toBeNull();
    expect(candidate!.sequence).toEqual(['ui:custom', 'tool:open-link:success']); }); });

