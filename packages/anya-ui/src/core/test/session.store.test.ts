import { describe, expect, it, vi } from 'vitest';
import { createAgentSessionStore } from '../session/store';

describe('createAgentSessionStore', () => {
  it('notifies subscribers and stores failure state', () => {
    const store = createAgentSessionStore({
      initialState: { sessionId: 'session-store' }, });
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.dispatch({
      type: 'session.started',
      sessionId: 'session-store',
      timestamp: 10, });
    store.dispatch({
      type: 'session.failed',
      sessionId: 'session-store',
      timestamp: 20,
      error: {
        code: 'boom',
        message: 'Something failed', }, });

    expect(listener).toHaveBeenCalledTimes(2);
    expect(store.getState().status).toBe('failed');
    expect(store.getState().lastError?.code).toBe('boom');

    unsubscribe(); }); });
