import { describe, it, expect, vi } from 'vitest';
import { createRuntimeStore } from '../runtime/store';
import { createRuntimeEvent } from '../runtime/events';

describe('createRuntimeStore', () => {
  it('dispatches events and updates state via reducer', () => {
    const store = createRuntimeStore();

    store.dispatch(createRuntimeEvent('session.intent_updated', { userIntent: 'Design profile page' }));
    store.dispatch(createRuntimeEvent('session.status_set', { status: 'thinking' }));

    const state = store.getState();
    expect(state.session.userIntent).toBe('Design profile page');
    expect(state.session.status).toBe('thinking'); });

  it('notifies subscribers on every dispatch', () => {
    const store = createRuntimeStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.dispatch(createRuntimeEvent('session.status_set', { status: 'thinking' }));
    store.dispatch(createRuntimeEvent('session.status_set', { status: 'idle' }));
    unsubscribe();
    store.dispatch(createRuntimeEvent('session.status_set', { status: 'error' }));

    expect(listener).toHaveBeenCalledTimes(2); });

  it('supports event bus subscriptions by namespace pattern', () => {
    const store = createRuntimeStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribeEvent('session.*', listener);

    const eventA = createRuntimeEvent('session.intent_updated', { userIntent: 'A' });
    const eventB = createRuntimeEvent('theme.updated', { tokens: { 'bg-primary': '#111' } });
    const eventC = createRuntimeEvent('session.status_set', { status: 'thinking' });

    store.dispatch(eventA);
    store.dispatch(eventB);
    store.dispatch(eventC);
    unsubscribe();

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenNthCalledWith(1, eventA, expect.any(Object));
    expect(listener).toHaveBeenNthCalledWith(2, eventC, expect.any(Object)); });

  it('supports reducer replacement', () => {
    const store = createRuntimeStore();
    store.replaceReducer((state) => ({
      ...state,
      session: {
        ...state.session,
        status: 'waiting', }, }));

    store.dispatch(createRuntimeEvent('session.status_set', { status: 'thinking' }));
    expect(store.getState().session.status).toBe('waiting'); });

  it('runs configured effects after dispatch', () => {
    const effect = vi.fn();
    const store = createRuntimeStore({ effects: [effect] });
    const event = createRuntimeEvent('session.intent_updated', { userIntent: 'effects-test' });

    store.dispatch(event);

    expect(effect).toHaveBeenCalledTimes(1);
    expect(effect).toHaveBeenCalledWith(event, expect.objectContaining({
      getState: expect.any(Function),
      dispatch: expect.any(Function), })); });

  it('processes nested dispatch in deterministic FIFO order', () => {
    const order: string[] = [];
    const store = createRuntimeStore({
      effects: [
        (event, context) => {
          if (event.type === 'session.status_set') {
            context.dispatch(createRuntimeEvent('session.intent_updated', {
              userIntent: 'child-intent', })); } },
      ], });

    store.subscribeEvent('*', (event) => {
      order.push(event.type); });

    const state = store.dispatch(createRuntimeEvent('session.status_set', { status: 'thinking' }));
    expect(order).toEqual(['session.status_set', 'session.intent_updated']);
    expect(state.session.userIntent).toBe('child-intent'); });

  it('captures effect errors via onEffectError', () => {
    const onEffectError = vi.fn();
    const store = createRuntimeStore({
      effects: [
        () => {
          throw new Error('effect-failure'); },
      ],
      onEffectError, });

    const event = createRuntimeEvent('session.intent_updated', { userIntent: 'error-test' });
    store.dispatch(event);
    expect(onEffectError).toHaveBeenCalledTimes(1); });

  it('captures subscriber errors without breaking dispatch', () => {
    const onEffectError = vi.fn();
    const store = createRuntimeStore({ onEffectError });
    store.subscribe(() => {
      throw new Error('listener exploded'); });

    store.dispatch(createRuntimeEvent('session.status_set', { status: 'thinking' }));

    expect(store.getState().session.status).toBe('thinking');
    expect(onEffectError).toHaveBeenCalledTimes(1);
    expect(String(onEffectError.mock.calls[0][0])).toContain('listener exploded'); });

  it('notifies a stable snapshot of subscribers for one dispatch cycle', () => {
    const store = createRuntimeStore();
    const order: string[] = [];
    let unsubscribeSecond = () => { };

    store.subscribe(() => {
      order.push('first');
      unsubscribeSecond(); });
    unsubscribeSecond = store.subscribe(() => {
      order.push('second'); });
    store.subscribe(() => {
      order.push('third'); });

    store.dispatch(createRuntimeEvent('session.status_set', { status: 'thinking' }));

    expect(order).toEqual(['first', 'second', 'third']); });

  it('replaces effects at runtime', () => {
    const first = vi.fn();
    const second = vi.fn();
    const store = createRuntimeStore({ effects: [first] });
    const eventA = createRuntimeEvent('session.status_set', { status: 'thinking' });
    const eventB = createRuntimeEvent('session.status_set', { status: 'idle' });

    store.dispatch(eventA);
    store.replaceEffects([second]);
    store.dispatch(eventB);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1); });

  it('blocks re-entrant dispatch for the same event id', () => {
    const onEffectError = vi.fn();
    const store = createRuntimeStore({
      onEffectError,
      effects: [
        (event, context) => {
          if (event.type === 'session.status_set') {
            context.dispatch(event); } },
      ], });

    const event = createRuntimeEvent('session.status_set', { status: 'thinking' });
    store.dispatch(event);

    expect(onEffectError).toHaveBeenCalledTimes(1);
    expect(String(onEffectError.mock.calls[0][0])).toContain('Re-entrant dispatch blocked'); });

  it('blocks deeply recursive dispatch chains', () => {
    const onEffectError = vi.fn();
    const store = createRuntimeStore({
      maxDispatchDepth: 3,
      onEffectError,
      effects: [
        (event, context) => {
          if (event.type === 'session.status_set') {
            context.dispatch(createRuntimeEvent('session.status_set', { status: 'thinking' })); } },
      ], });

    store.dispatch(createRuntimeEvent('session.status_set', { status: 'thinking' }));
    expect(onEffectError).toHaveBeenCalledTimes(1);
    expect(String(onEffectError.mock.calls[0][0])).toContain('Max dispatch depth'); }); });
