import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { NodeCatalog } from '../registry/catalog';
import { SkillRegistry } from '../registry/skills';
import { ContextMemoryManager } from '../memory/context';
import { createOrchestrator } from '../orchestrator';
import { collectAgentSessionEvents, createSessionArtifact } from '../session';
import type {
  AgentSessionStartInput,
  AgentSessionTransport, } from '../session';

describe('DynamicOrchestrator session transport integration', () => {
  function createBaseCatalog(): NodeCatalog {
    const catalog = new NodeCatalog();
    catalog.register({
      name: 'Heading',
      description: 'A heading node',
      propsSchema: z.object({ text: z.string() }), });
    return catalog; }

  function createSurfaceSessionTransport(
    onStart?: (input: AgentSessionStartInput) => void,
  ): AgentSessionTransport {
    return {
      async startSession(input) {
        onStart?.(input);
        const sessionId = input.sessionId ?? 'session-test';

        return {
          sessionId,
          controller: { cancel() { } },
          events: (async function* () {
            yield {
              type: 'session.started' as const,
              sessionId,
              timestamp: 1, };
            yield {
              type: 'session.status' as const,
              sessionId,
              timestamp: 2,
              status: 'running' as const, };
            yield {
              type: 'artifact.upserted' as const,
              sessionId,
              timestamp: 3,
              artifact: {
                id: 'artifact-view',
                sessionId,
                kind: 'view' as const,
                version: 1,
                createdAt: 3,
                audience: 'user' as const,
                region: 'main' as const,
                title: 'Profile Editor',
                payload: {
                  view: {
                    id: 'profile-main',
                    format: 'ui_spec' as const,
                    title: 'Profile Editor',
                    workflow: 'profile_edit',
                    spec: {
                      spec_version: 1,
                      layout: 'stack' as const,
                      skill: 'profile_edit',
                      nodes: [
                        {
                          id: 'h1',
                          type: 'Heading',
                          props: { text: 'Profile' }, },
                      ], },
                    bindings: [], }, }, }, };
            yield {
              type: 'session.completed' as const,
              sessionId,
              timestamp: 4, }; })(), }; }, }; }

  it('uses configured session transport to start an artifact session', async () => {
    let capturedInput: AgentSessionStartInput | undefined;
    const sessionTransport = createSurfaceSessionTransport((input) => {
      capturedInput = input; });

    const memory = new ContextMemoryManager();
    const orchestrator = createOrchestrator({
      catalog: createBaseCatalog(),
      skills: new SkillRegistry(),
      memory,
      sessionTransport, });

    const run = await orchestrator.startAgentSession({
      userIntent: 'Build a profile editor',
      messages: [
        {
          id: 'agent-1',
          role: 'agent',
          content: 'Previous response',
          timestamp: 123, },
      ],
      currentArtifacts: [
        createSessionArtifact({
          id: 'artifact-current',
          sessionId: 'session-current',
          kind: 'message',
          createdAt: 1,
          audience: 'user',
          payload: {
            role: 'assistant',
            text: 'Current artifact', }, }),
      ],
      currentViewId: 'profile-main', });
    const events = await collectAgentSessionEvents(run);

    expect(capturedInput?.userIntent).toBe('Build a profile editor');
    expect(capturedInput?.systemPrompt).toContain('# Your Tools');
    expect(capturedInput?.messages).toEqual([
      {
        id: 'agent-1',
        role: 'assistant',
        content: 'Previous response',
        timestamp: 123, },
    ]);
    expect(capturedInput?.currentArtifacts).toHaveLength(1);
    expect(capturedInput?.currentViewId).toBe('profile-main');
    expect(events[0]?.type).toBe('session.started');
    expect(
      events.some((event) => event.type === 'artifact.upserted' && event.artifact.kind === 'view'),
    ).toBe(true);
    expect(events.at(-1)?.type).toBe('session.completed'); });

  it('throws when session transport is missing', async () => {
    const orchestrator = createOrchestrator({
      catalog: createBaseCatalog(),
      skills: new SkillRegistry(),
      memory: new ContextMemoryManager(), });

    await expect(
      orchestrator.startAgentSession({
        userIntent: 'No transport path',
        messages: [], }),
    ).rejects.toThrow(/No session transport configured/); });

  it('returns response format prompt parts for the requested format', () => {
    const orchestrator = createOrchestrator({
      catalog: createBaseCatalog(),
      skills: new SkillRegistry(),
      memory: new ContextMemoryManager(), });

    const jsonParts = orchestrator.getPromptParts('json');
    const yamlParts = orchestrator.getPromptParts();

    expect(jsonParts.responseFormatBlock).toContain('Respond with a JSON object:');
    expect(jsonParts.responseFormatBlock).toContain('"spec_version": 1');
    expect(yamlParts.responseFormatBlock).toContain('Respond with YAML in this format:'); });

  it('allows call-level session transport overrides', async () => {
    const configuredStart = vi.fn();
    const overrideStart = vi.fn();
    const orchestrator = createOrchestrator({
      catalog: createBaseCatalog(),
      skills: new SkillRegistry(),
      memory: new ContextMemoryManager(),
      sessionTransport: createSurfaceSessionTransport(configuredStart), });

    await orchestrator.startAgentSession({
      userIntent: 'Use the override',
      messages: [],
      transport: createSurfaceSessionTransport(overrideStart), });

    expect(configuredStart).not.toHaveBeenCalled();
    expect(overrideStart).toHaveBeenCalledTimes(1); });

  it('reports whether a session transport is configured', () => {
    const orchestrator = createOrchestrator({
      catalog: createBaseCatalog(),
      skills: new SkillRegistry(),
      memory: new ContextMemoryManager(), });

    expect(orchestrator.hasSessionTransport()).toBe(false);

    orchestrator.setSessionTransport(createSurfaceSessionTransport());
    expect(orchestrator.hasSessionTransport()).toBe(true); }); });
