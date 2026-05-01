import { describe, it, expect, vi } from 'vitest';
import { ContextMemoryManager } from '../internal/memory/context';
import { AdaptiveProfile } from '../internal/memory/profile';
import { InMemoryStorage } from '../storage/memory';
import type { FileStorage } from '../storage/interface';

describe('ContextMemoryManager', () => {
  it('initializes with default context', () => {
    const memory = new ContextMemoryManager();
    expect(memory.getContext().userIntent).toBe(''); });

  it('updates context partially', () => {
    const memory = new ContextMemoryManager();
    memory.setContext({ userIntent: 'Testing the app' });
    expect(memory.getContext().userIntent).toBe('Testing the app');
    
    memory.setContext({ workflowContext: 'Unit Testing' });
    expect(memory.getContext().userIntent).toBe('Testing the app');
    expect(memory.getContext().workflowContext).toBe('Unit Testing'); });

  it('starts a new task scope by clearing volatile session UI context', () => {
    const memory = new ContextMemoryManager();
    memory.setContext({ userIntent: 'Introduce Peng Shi', workflowContext: 'profile' });
    memory.saveCurrentSpec({
      layout: 'stack',
      nodes: [{ id: 'person-card', type: 'Card', props: { title: 'Peng Shi' } }], });
    memory.recordInteraction({
      timestamp: 1,
      nodeId: 'person-card',
      nodeType: 'Card',
      action: 'custom',
      semanticDescription: 'Opened profile', });
    memory.recordReasoningTrace({
      summary: 'Built profile card for Peng Shi.',
      intent: 'Introduce Peng Shi', });

    memory.beginTaskScope('Introduce Sara Hooker');

    expect(memory.getContext().userIntent).toBe('Introduce Sara Hooker');
    expect(memory.getContext().workflowContext).toBeUndefined();
    expect(memory.getCurrentSpec()).toBeNull();
    expect(memory.getInteractions()).toHaveLength(0);
    expect(memory.getRecentReasoningTraces()).toHaveLength(0); });

  it('records interactions and respects max length', () => {
    const memory = new ContextMemoryManager({ maxInteractions: 2 });
    
    memory.recordInteraction({
      timestamp: 1,
      nodeId: 'e1',
      nodeType: 'Button',
      action: 'custom' });
    
    memory.recordInteraction({
      timestamp: 2,
      nodeId: 'e2',
      nodeType: 'Card',
      action: 'custom' });
    
    // This should push the first one out
    memory.recordInteraction({
      timestamp: 3,
      nodeId: 'e3',
      nodeType: 'Input',
      action: 'change' });

    const recent = memory.getRecentInteractions();
    expect(recent).toHaveLength(2);
    expect(recent[0].nodeId).toBe('e2');
    expect(recent[1].nodeId).toBe('e3'); });

  it('generates LLM context strings based on current state', () => {
    const memory = new ContextMemoryManager();
    memory.setContext({ userIntent: 'I want a dashboard' });
    memory.saveCurrentSpec({
      layout: 'grid',
      nodes: [
        { id: '1', type: 'Heading', props: { text: "Dashboard" } }
      ] });
    memory.recordInteraction({
      timestamp: Date.now(),
      nodeId: 'b-1',
      nodeType: 'Button',
      action: 'custom',
      semanticDescription: 'User clicked the test button' });
    memory.recordReasoningTrace({
      summary: 'Selected dashboard skill and grouped cards by priority.',
      intent: 'I want a dashboard',
      workflowContext: 'dashboard', });

    const llmContext = memory.toLLMContext();
    expect(llmContext).toContain('## On-Demand Session Memory');
    expect(llmContext).toContain('Source: memory.snapshot.json');
    expect(llmContext).toContain('## Active Context');
    expect(llmContext).toContain('intent: I want a dashboard');
    expect(llmContext).toContain('## Currently Rendered UI');
    expect(llmContext).toContain('Heading(text="Dashboard")');
    expect(llmContext).toContain('## Recent User Actions');
    expect(llmContext).toContain('User clicked the test button');
    expect(llmContext).toContain('## Recent Reasoning');
    expect(llmContext).toContain('Selected dashboard skill and grouped cards by priority.'); });

  it('hydrates context/spec/interactions from persisted snapshot', async () => {
    const storage = new InMemoryStorage();
    const memoryA = new ContextMemoryManager({ storage });
    memoryA.setContext({ userIntent: 'Restore me', workflowContext: 'restore_skill' });
    memoryA.saveCurrentSpec({
      layout: 'stack',
      nodes: [{ id: 'restored', type: 'Heading', props: { text: 'Restored' } }], });
    memoryA.recordInteraction({
      timestamp: 1000,
      nodeId: 'restored',
      nodeType: 'Heading',
      action: 'custom',
      semanticDescription: 'Clicked restored heading', });
    memoryA.recordReasoningTrace({
      timestamp: 1001,
      summary: 'Restored prior session skill context.',
      workflowContext: 'restore_skill', });

    // Ensure async persist flushes before creating a new manager.
    await new Promise((resolve) => setTimeout(resolve, 0));

    const memoryB = new ContextMemoryManager({ storage });
    await memoryB.loadFromDisk();

    expect(memoryB.getContext().userIntent).toBe('Restore me');
    expect(memoryB.getContext().workflowContext).toBe('restore_skill');
    expect(memoryB.getCurrentSpec()?.nodes[0].id).toBe('restored');
    expect(memoryB.getRecentInteractions(1)[0].semanticDescription).toBe('Clicked restored heading');
    expect(memoryB.getRecentReasoningTraces(1)[0].summary).toContain('Restored prior session'); });

  it('surfaces persistence failures via onPersistError callback', async () => {
    const failingStorage: FileStorage = {
      async read() {
        return null; },
      async write() {
        throw new Error('disk-unavailable'); }, };

    const onPersistError = vi.fn();
    const memory = new ContextMemoryManager({
      storage: failingStorage,
      onPersistError, });

    memory.setContext({ userIntent: 'trigger persist' });
    await memory.flushPersistence();

    expect(onPersistError).toHaveBeenCalledTimes(1); }); });

describe('AdaptiveProfile', () => {
  it('loads default profile if empty', async () => {
    const storage = new InMemoryStorage();
    const profile = new AdaptiveProfile(storage);
    await profile.load();
    expect(profile.getContent()).toContain('# Anya Adaptive Profile'); });

  it('updates the profile content completely', async () => {
    const storage = new InMemoryStorage();
    const profile = new AdaptiveProfile(storage);
    await profile.update('New Profile Base Content');
    expect(profile.getContent()).toBe('New Profile Base Content'); });

  it('appends behavioral observations intelligently', async () => {
    const storage = new InMemoryStorage();
    const profile = new AdaptiveProfile(storage);
    await profile.load(); // get defaults
    
    await profile.addObservation('User likes purple buttons');
    const content = profile.getContent();
    
    expect(content).toContain('## Behavioral Observations');
    expect(content).toContain('- User likes purple buttons');
    
    await profile.addObservation('User uses dark theme primarily');
    const updatedContent = profile.getContent();
    // Verify it didn't duplicate the header
    const occurrenceCount = (updatedContent.match(/## Behavioral Observations/g) || []).length;
    expect(occurrenceCount).toBe(1);
    expect(updatedContent).toContain('- User likes purple buttons');
    expect(updatedContent).toContain('- User uses dark theme primarily'); });

  it('deduplicates repeated observations instead of appending duplicates', async () => {
    const storage = new InMemoryStorage();
    const profile = new AdaptiveProfile(storage);
    await profile.load();

    await profile.addObservation('User prefers concise cards.');
    await profile.addObservation('user prefers concise cards');
    await profile.addObservation('User prefers concise cards');

    const content = profile.getContent();
    const bulletCount = (content.match(/- User prefers concise cards\.?/g) || []).length;
    expect(bulletCount).toBe(1); });

  it('merges similar observations by keeping the more specific statement', async () => {
    const storage = new InMemoryStorage();
    const profile = new AdaptiveProfile(storage);
    await profile.load();

    await profile.addObservation('User likes timeline view');
    await profile.addObservation('User likes timeline view with citations and source links');

    const content = profile.getContent();
    expect(content).toContain('- User likes timeline view with citations and source links');
    expect(content).not.toContain('- User likes timeline view\n'); });

  it('normalizes existing duplicate observations during load', async () => {
    const storage = new InMemoryStorage();
    await storage.write('anya.md', [
      '# Anya Adaptive Profile',
      '',
      '## Behavioral Observations',
      '- User is interested in academic/AI research profiles and conceptual synthesis.',
      '- User is interested in academic/AI research profiles and conceptual synthesis.',
    ].join('\n'));

    const profile = new AdaptiveProfile(storage);
    await profile.load();

    const content = profile.getContent();
    const duplicateCount = (content.match(/academic\/AI research profiles and conceptual synthesis/g) || []).length;
    expect(duplicateCount).toBe(1); });

  it('getObservations returns cleaned observation strings', async () => {
    const storage = new InMemoryStorage();
    const profile = new AdaptiveProfile(storage);
    await profile.load();

    await profile.addObservation('User prefers dark theme');
    await profile.addObservation('User likes compact cards');

    const observations = profile.getObservations();
    expect(observations).toHaveLength(2);
    expect(observations).toContain('User prefers dark theme');
    expect(observations).toContain('User likes compact cards'); });

  it('getObservations returns empty array for default profile', async () => {
    const storage = new InMemoryStorage();
    const profile = new AdaptiveProfile(storage);
    await profile.load();

    const observations = profile.getObservations();
    expect(observations).toHaveLength(0); }); });
