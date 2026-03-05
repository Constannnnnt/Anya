/**
 * @anya-ui/react — Shared Primitive Utilities
 *
 * Common types, constants, and helpers used across all built-in primitives.
 */

import React from 'react';
import type { AnyaRenderProps } from '../defineComponent';

export const DRAG_HOLD_MS = 250;

export type InteractionTrigger = 'onClick' | 'onDoubleClick' | 'onMouseEnter' | 'onMouseLeave';
export type DynamicInteractions = Partial<Record<InteractionTrigger, (event: React.SyntheticEvent) => void>>;

export function sanitizeUrl(url: string | undefined): string | undefined {
    if (!url || typeof url !== 'string') return url;

    // Remove control characters to prevent bypasses
    const sanitized = url.replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim();

    try {
        // Use a dummy base to force parsing even for relative URLs
        const parsed = new URL(sanitized, 'http://__dummy__');
        const allowed = ['http:', 'https:', 'mailto:', 'tel:', 'data:', 'blob:'];
        if (!allowed.includes(parsed.protocol)) {
            return 'about:blank';
        }
    } catch {
        // Fallback if parsing fails for some reason
        return 'about:blank';
    }

    return sanitized;
}

export interface PrimitiveBehaviorProps {
    className?: string;
    style?: React.CSSProperties;
    draggable?: boolean;
    dynamicInteractions?: DynamicInteractions;
    acceptsChildren?: boolean;
}

export type PrimitiveRenderProps<T extends PrimitiveBehaviorProps> = AnyaRenderProps<T>;

export function bindDrag(
    id: string,
    props: PrimitiveBehaviorProps,
    onInteraction?: PrimitiveRenderProps<PrimitiveBehaviorProps>['onInteraction'],
): React.HTMLAttributes<HTMLElement> & { draggable?: boolean } {
    if (!props.draggable) return {};

    let holdTimer: ReturnType<typeof setTimeout> | null = null;
    let dragArmed = false;

    const updateDragArmedClass = (target: EventTarget | null, armed: boolean) => {
        const element = target as HTMLElement | null;
        if (!element || !('classList' in element)) return;
        if (armed) {
            element.classList.add('anya-drag-armed');
        } else {
            element.classList.remove('anya-drag-armed');
        }
    };

    const clearHoldTimer = () => {
        if (!holdTimer) return;
        clearTimeout(holdTimer);
        holdTimer = null;
    };

    const beginArming = (target: EventTarget | null) => {
        clearHoldTimer();
        dragArmed = false;
        updateDragArmedClass(target, false);
        holdTimer = setTimeout(() => {
            dragArmed = true;
            updateDragArmedClass(target, true);
            holdTimer = null;
        }, DRAG_HOLD_MS);
    };

    const resetArming = (target: EventTarget | null) => {
        clearHoldTimer();
        dragArmed = false;
        updateDragArmedClass(target, false);
    };

    return {
        draggable: true,
        onPointerDown: (e: React.PointerEvent) => {
            if (e.button !== 0) return;
            beginArming(e.currentTarget);
        },
        onPointerUp: (e: React.PointerEvent) => {
            if (!dragArmed) {
                resetArming(e.currentTarget);
            }
        },
        onPointerCancel: (e: React.PointerEvent) => {
            resetArming(e.currentTarget);
        },
        onPointerLeave: (e: React.PointerEvent) => {
            if (!dragArmed) {
                resetArming(e.currentTarget);
            }
        },
        onDragStart: (e: React.DragEvent) => {
            e.stopPropagation();
            if (!dragArmed) {
                e.preventDefault();
                resetArming(e.currentTarget);
                return;
            }
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', id);
        },
        onDragOver: (e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
        },
        onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            resetArming(e.currentTarget);
            const sourceId = e.dataTransfer.getData('text/plain');
            if (sourceId && sourceId !== id && onInteraction) {
                onInteraction('drop', {
                    sourceId,
                    targetIds: [id],
                    semanticDescription: `User dropped component ${sourceId} onto ${id}`,
                });
            }
        },
        onDragEnd: (e: React.DragEvent) => {
            resetArming(e.currentTarget);
        }
    };
}
