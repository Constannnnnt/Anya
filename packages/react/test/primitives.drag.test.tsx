import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';
import { Card } from '../src/primitives';

describe('primitives drag behavior', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('requires hold-to-drag before setting drag data', () => {
    vi.useFakeTimers();
    const onInteraction = vi.fn();
    const CardComponent = Card.render;
    const { container } = render(
      <CardComponent
        id="card-1"
        props={{ title: 'Card', draggable: true }}
        onInteraction={onInteraction}
      />
    );

    const card = container.querySelector('#card-1') as HTMLElement;
    const setData = vi.fn();

    fireEvent.dragStart(card, {
      dataTransfer: { setData },
    });
    expect(setData).not.toHaveBeenCalled();

    fireEvent.pointerDown(card, { button: 0 });
    vi.advanceTimersByTime(250);

    fireEvent.dragStart(card, {
      dataTransfer: { setData },
    });
    expect(setData).toHaveBeenCalledWith('text/plain', 'card-1');
  });

  it('emits drop interaction with targetIds payload', () => {
    const onInteraction = vi.fn();
    const CardComponent = Card.render;
    const { container } = render(
      <CardComponent
        id="drop-target"
        props={{ title: 'Card', draggable: true }}
        onInteraction={onInteraction}
      />
    );

    const card = container.querySelector('#drop-target') as HTMLElement;

    fireEvent.drop(card, {
      dataTransfer: {
        getData: () => 'source-1',
      },
    });

    expect(onInteraction).toHaveBeenCalledWith('drop', expect.objectContaining({
      sourceId: 'source-1',
      targetIds: ['drop-target'],
    }));
  });
});
