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

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:', 'data:', 'blob:']);

function normalizeUrlInput(url: string): string {
    return url.replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim();
}

function isSafeDataUrl(url: string): boolean {
    const match = /^data:([^;,]+)[;,]/i.exec(url);
    if (!match) return false;
    const mime = match[1].toLowerCase();
    return mime.startsWith('image/') || mime.startsWith('video/') || mime.startsWith('audio/');
}

function isSafeBlobUrl(url: string): boolean {
    const lower = url.toLowerCase();
    return lower.startsWith('blob:https://') || lower.startsWith('blob:http://');
}

export function isValidUrl(url: string | undefined): boolean {
    if (!url || typeof url !== 'string') return false;
    const sanitized = normalizeUrlInput(url);
    if (!sanitized) return false;

    try {
        // Use a dummy base to force parsing even for relative URLs.
        const parsed = new URL(sanitized, 'http://__dummy__');
        if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
            return false;
        }

        if (parsed.protocol === 'data:') {
            return isSafeDataUrl(sanitized);
        }

        if (parsed.protocol === 'blob:') {
            return isSafeBlobUrl(sanitized);
        }

        return true;
    } catch {
        return false;
    }
}

export function sanitizeUrl(url: string | undefined): string | undefined {
    if (!url || typeof url !== 'string') return url;
    const sanitized = normalizeUrlInput(url);
    if (!sanitized) return 'about:blank';
    return isValidUrl(sanitized) ? sanitized : 'about:blank';
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
