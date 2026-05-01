import { describe, it, expect } from 'vitest';
import { materializeToProfile } from '../memory/ui/materializer';
import { InMemoryMemoryStore } from '../memory/ui/inMemoryAdapter';
import { AdaptiveProfile } from '../internal/memory/profile';
import { InMemoryStorage } from '../storage/memory';
import type { PreferenceMemory, InteractionPattern, Reflection } from '../memory/ui/schemas';

function makePref(overrides: Partial<PreferenceMemory> = { }): PreferenceMemory {
  return {
    id: `pref-${Math.random().toString(36).slice(2, 8) }`,
    actorId: 'actor-1',
    category: 'layout',
    key: 'density',
    value: 'compact',
    statement: 'User prefers compact layout',
    signalType: 'explicit',
    confidence: 0.8,
    support: 2,
    firstSeenTs: 1000,
    lastSeenTs: 1000,
    status: 'active',
    ...overrides, }; }

function makePattern(overrides: Partial<InteractionPattern> = { }): InteractionPattern {
  return {
    id: `pat-${Math.random().toString(36).slice(2, 8) }`,
    actorId: 'actor-1',
    taskClass: 'dashboard',
    sequenceKey: 'expand->filter->submit',
    sequenceJson: '[]',
    outcome: 'success',
    confidence: 0.9,
    support: 3,
    lastSeenTs: 1000,
    ...overrides, }; }

function makeReflection(overrides: Partial<Reflection> = { }): Reflection {
  return {
    id: `ref-${Math.random().toString(36).slice(2, 8) }`,
    actorId: 'actor-1',
    title: 'Dashboard Patterns',
    useCases: 'Building dashboards',
    hints: 'Group metrics first',
    confidence: 0.85,
    updatedTs: 1000,
    ...overrides, }; }

describe('materializeToProfile', () => {
  async function setup() {
    const storage = new InMemoryStorage();
    const profile = new AdaptiveProfile(storage);
    await profile.load();
    const memoryStore = new InMemoryMemoryStore();
    return { storage, profile, memoryStore }; }

  it('writes preferences, patterns, and reflections to profile', async () => {
    const { profile, memoryStore } = await setup();
    await memoryStore.upsertPreference(makePref());
    await memoryStore.upsertPattern(makePattern());
    await memoryStore.upsertReflection(makeReflection());

    const result = await materializeToProfile(memoryStore, 'actor-1', profile);

    expect(result.preferencesWritten).toBe(1);
    expect(result.patternsWritten).toBe(1);
    expect(result.reflectionsWritten).toBe(1);

    const content = profile.getContent();
    expect(content).toContain('## Learned UI Patterns');
    expect(content).toContain('### Active Preferences');
    expect(content).toContain('compact layout');
    expect(content).toContain('### Successful Interaction Patterns');
    expect(content).toContain('expand->filter->submit');
    expect(content).toContain('### Reflections');
    expect(content).toContain('Dashboard Patterns'); });

  it('is idempotent  - ?re-running produces same output', async () => {
    const { profile, memoryStore } = await setup();
    await memoryStore.upsertPreference(makePref());

    await materializeToProfile(memoryStore, 'actor-1', profile);
    const first = profile.getContent();

    await materializeToProfile(memoryStore, 'actor-1', profile);
    const second = profile.getContent();

    expect(first).toBe(second); });

  it('handles empty memory gracefully', async () => {
    const { profile, memoryStore } = await setup();

    const result = await materializeToProfile(memoryStore, 'actor-1', profile);

    expect(result.preferencesWritten).toBe(0);
    expect(result.patternsWritten).toBe(0);
    expect(result.reflectionsWritten).toBe(0); });

  it('preserves existing profile content', async () => {
    const { profile, memoryStore } = await setup();
    await memoryStore.upsertPreference(makePref());

    const originalContent = profile.getContent();
    await materializeToProfile(memoryStore, 'actor-1', profile);

    const content = profile.getContent();
    expect(content).toContain('# Anya Adaptive Profile');
    expect(content).toContain('## Learned UI Patterns'); });

  it('replaces previous materialization on re-run', async () => {
    const { profile, memoryStore } = await setup();

    // First run with one preference
    await memoryStore.upsertPreference(makePref({ key: 'first', statement: 'First preference' }));
    await materializeToProfile(memoryStore, 'actor-1', profile);

    // Second run with a different preference added
    await memoryStore.upsertPreference(makePref({ key: 'second', statement: 'Second preference' }));
    await materializeToProfile(memoryStore, 'actor-1', profile);

    const content = profile.getContent();
    // Should contain both preferences
    expect(content).toContain('First preference');
    expect(content).toContain('Second preference');
    // Should only have one materialization section
    const headerCount = (content.match(/## Learned UI Patterns/g) || []).length;
    expect(headerCount).toBe(1); });

  it('skips materialized preferences that duplicate existing behavioral observations', async () => {
    const { profile, memoryStore } = await setup();

    // Add a behavioral observation first
    await profile.addObservation('User prefers compact layout');

    // Add a preference with semantically identical statement
    await memoryStore.upsertPreference(
      makePref({ statement: 'User prefers compact layout', key: 'compact_layout' }),
    );
    // Add a non-overlapping preference
    await memoryStore.upsertPreference(
      makePref({ statement: 'User likes dark theme for editing', key: 'dark_theme' }),
    );

    const result = await materializeToProfile(memoryStore, 'actor-1', profile);

    const content = profile.getContent();
    // The overlapping preference should be filtered out
    expect(content).toContain('## Behavioral Observations');
    expect(content).toContain('- User prefers compact layout');
    // The non-overlapping preference should still appear in Learned UI Patterns
    expect(content).toContain('User likes dark theme for editing');
    // preferencesWritten should only count the non-duplicate
    expect(result.preferencesWritten).toBe(1); });

  it('keeps all materialized items when no behavioral observations exist', async () => {
    const { profile, memoryStore } = await setup();

    await memoryStore.upsertPreference(makePref({ statement: 'Likes grids' }));
    await memoryStore.upsertPattern(makePattern());

    const result = await materializeToProfile(memoryStore, 'actor-1', profile);

    expect(result.preferencesWritten).toBe(1);
    expect(result.patternsWritten).toBe(1);
    expect(profile.getContent()).toContain('Likes grids'); }); });
