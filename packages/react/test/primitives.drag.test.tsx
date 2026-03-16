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
    vi.useFakeTimers();
    const onInteraction = vi.fn();
    const CardComponent = Card.render;
    const { container } = render(
      <>
        <CardComponent
          id="source-card"
          props={{ title: 'Source', draggable: true }}
          onInteraction={onInteraction}
        />
        <CardComponent
          id="drop-target"
          props={{ title: 'Target', draggable: true }}
          onInteraction={onInteraction}
        />
      </>
    );

    const source = container.querySelector('#source-card') as HTMLElement;
    const target = container.querySelector('#drop-target') as HTMLElement;
    source.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 160,
      height: 80,
      right: 160,
      bottom: 80,
      x: 0,
      y: 0,
      toJSON() { return {}; },
    } as DOMRect);
    target.getBoundingClientRect = () => ({
      left: 200,
      top: 0,
      width: 180,
      height: 100,
      right: 380,
      bottom: 100,
      x: 200,
      y: 0,
      toJSON() { return {}; },
    } as DOMRect);
    const dragData = new Map<string, string>();
    const dataTransfer = {
      effectAllowed: 'move',
      setData: (type: string, value: string) => {
        dragData.set(type, value);
      },
      getData: (type: string) => dragData.get(type) ?? '',
    };

    fireEvent.pointerDown(source, { button: 0 });
    vi.advanceTimersByTime(250);
    fireEvent.dragStart(source, {
      clientX: 20,
      clientY: 20,
      dataTransfer,
    });
    fireEvent.dragOver(target, {
      clientX: 120,
      clientY: 22,
      dataTransfer,
    });
    fireEvent.drop(target, {
      clientX: 180,
      clientY: 24,
      dataTransfer,
    });

    expect(onInteraction).toHaveBeenCalledWith('drop', expect.objectContaining({
      sourceId: 'source-card',
      targetIds: ['drop-target'],
      measurementHint: expect.objectContaining({
        dragDistancePx: expect.any(Number),
        pathLengthPx: expect.any(Number),
        pathWidthPx: expect.any(Number),
      }),
    }));
  });
});
