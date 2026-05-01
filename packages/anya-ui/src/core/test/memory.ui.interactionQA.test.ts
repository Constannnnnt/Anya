import { describe, it, expect } from 'vitest';
import { validateInteractionResolvability } from '../views/interactionQA';
import type { ViewSpec } from '../views/types';

function makeSpec(nodes: ViewSpec['nodes']): ViewSpec {
  return { layout: 'stack', nodes }; }

describe('validateInteractionResolvability', () => {
  it('passes when all interactions have tool_call', () => {
    const spec = makeSpec([
      {
        id: 'btn-1',
        type: 'Button',
        props: { text: 'Click me' },
        interactions: [
          {
            trigger: 'onClick',
            action: 'submit',
            description: 'Submit form',
            tool_call: { name: 'submit-form', parameters: { id: '123' } }, },
        ], },
    ]);

    const result = validateInteractionResolvability(spec);
    expect(result.valid).toBe(true);
    expect(result.failures).toHaveLength(0); });

  it('passes when interactions use targetIds + targetAction', () => {
    const spec = makeSpec([
      {
        id: 'btn-play',
        type: 'Button',
        props: { text: 'Play All' },
        interactions: [
          {
            trigger: 'onClick',
            action: 'play_all',
            description: 'Play all videos',
            targetIds: ['video-1', 'video-2'],
            targetAction: 'play', },
        ], },
      { id: 'video-1', type: 'Video', props: { src: 'a.mp4' } },
      { id: 'video-2', type: 'Video', props: { src: 'b.mp4' } },
    ]);

    const result = validateInteractionResolvability(spec);
    expect(result.valid).toBe(true); });

  it('fails when interaction has no executable path', () => {
    const spec = makeSpec([
      {
        id: 'btn-broken',
        type: 'Button',
        props: { text: 'Broken' },
        interactions: [
          {
            trigger: 'onClick',
            action: 'do_nothing',
            description: 'This does nothing', },
        ], },
    ]);

    const result = validateInteractionResolvability(spec);
    expect(result.valid).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].code).toBe('button_missing_action_contract');
    expect(result.failures[0].nodeId).toBe('btn-broken'); });

  it('detects unknown tool_call names when knownTools provided', () => {
    const spec = makeSpec([
      {
        id: 'btn-1',
        type: 'Button',
        props: { },
        interactions: [
          {
            trigger: 'onClick',
            action: 'run',
            description: 'Run unknown tool',
            tool_call: { name: 'non-existent-tool' }, },
        ], },
    ]);

    const result = validateInteractionResolvability(spec, {
      knownTools: new Set(['submit-form', 'search']), });

    expect(result.valid).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].code).toBe('tool_call_unknown_tool'); });

  it('detects missing target references', () => {
    const spec = makeSpec([
      {
        id: 'btn-1',
        type: 'Button',
        props: { },
        interactions: [
          {
            trigger: 'onClick',
            action: 'play',
            description: 'Play video',
            targetIds: ['non-existent-video'],
            targetAction: 'play', },
        ], },
    ]);

    const result = validateInteractionResolvability(spec);
    expect(result.valid).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].code).toBe('target_reference_missing'); });

  it('fails ambiguous mutation-style targetAction shorthands', () => {
    const spec = makeSpec([
      {
        id: 'btn-reset',
        type: 'Button',
        props: { text: 'Reset to Zero' },
        interactions: [
          {
            trigger: 'onClick',
            action: 'reset_to_zero',
            description: 'Reset slider',
            targetIds: ['slider-1'],
            targetAction: 'setValue', },
        ], },
      { id: 'slider-1', type: 'Slider', props: { value: 0.9 } },
    ]);

    const result = validateInteractionResolvability(spec);
    expect(result.valid).toBe(false);
    expect(result.failures.some((failure) => failure.code === 'target_action_ambiguous_mutation')).toBe(true); });

  it('validates components with no interactions as valid', () => {
    const spec = makeSpec([
      { id: 'heading-1', type: 'Heading', props: { text: 'Title' } },
    ]);

    const result = validateInteractionResolvability(spec);
    expect(result.valid).toBe(true); });

  it('validates nested children', () => {
    const spec = makeSpec([
      {
        id: 'card-1',
        type: 'Card',
        props: { },
        children: [
          {
            id: 'btn-nested',
            type: 'Button',
            props: { },
            interactions: [
              {
                trigger: 'onClick',
                action: 'broken',
                description: 'Broken nested button', },
            ], },
        ], },
    ]);

    const result = validateInteractionResolvability(spec);
    expect(result.valid).toBe(false);
    expect(result.failures[0].nodeId).toBe('btn-nested'); });


  it('passes when interactions use url for navigation', () => {
    const spec = makeSpec([
      {
        id: 'link-1',
        type: 'Button',
        props: { text: 'Visit Site' },
        interactions: [
          {
            trigger: 'onClick',
            action: 'navigate',
            description: 'Navigate to external site',
            url: 'https://example.com', },
        ], },
    ]);

    const result = validateInteractionResolvability(spec);
    expect(result.valid).toBe(true); });

  it('passes when interactions use route for SPA navigation', () => {
    const spec = makeSpec([
      {
        id: 'nav-1',
        type: 'Button',
        props: { text: 'Go to Settings' },
        interactions: [
          {
            trigger: 'onClick',
            action: 'navigate',
            description: 'Navigate to settings page',
            route: '/settings', },
        ], },
    ]);

    const result = validateInteractionResolvability(spec);
    expect(result.valid).toBe(true); });

  it('fails with link_or_route_empty when url is whitespace-only', () => {
    const spec = makeSpec([
      {
        id: 'link-blank',
        type: 'Button',
        props: { text: 'Broken Link' },
        interactions: [
          {
            trigger: 'onClick',
            action: 'navigate',
            description: 'Broken URL field',
            url: '   ', },
        ], },
    ]);

    const result = validateInteractionResolvability(spec);
    expect(result.valid).toBe(false);
    expect(result.failures.some((failure) => failure.code === 'link_or_route_empty')).toBe(true); });

  it('fails with link_or_route_empty when route is empty string', () => {
    const spec = makeSpec([
      {
        id: 'route-empty',
        type: 'Button',
        props: { text: 'Broken Route' },
        interactions: [
          {
            trigger: 'onClick',
            action: 'navigate',
            description: 'Broken route field',
            route: '', },
        ], },
    ]);

    const result = validateInteractionResolvability(spec);
    expect(result.valid).toBe(false);
    expect(result.failures.some((failure) => failure.code === 'link_or_route_empty')).toBe(true); });

  it('reports multiple failures across components', () => {
    const spec = makeSpec([
      {
        id: 'btn-1',
        type: 'Button',
        props: { },
        interactions: [
          { trigger: 'onClick', action: 'a', description: 'no path' },
        ], },
      {
        id: 'btn-2',
        type: 'Button',
        props: { },
        interactions: [
          { trigger: 'onClick', action: 'b', description: 'also broken' },
        ], },
    ]);

    const result = validateInteractionResolvability(spec);
    expect(result.valid).toBe(false);
    expect(result.failures).toHaveLength(2); }); });
