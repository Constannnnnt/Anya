/**
 * ../../react — Shared Primitive Utilities
 *
 * Common types, constants, and helpers used across all built-in primitives.
 */

import React from 'react';
import type { AnyaRenderProps } from '../defineComponent';
import { measureElementTarget, measurePointerTarget } from '../behavior/telemetry';

export const DRAG_HOLD_MS = 250;

export type InteractionTrigger = 'onClick' | 'onDoubleClick' | 'onMouseEnter' | 'onMouseLeave' | 'onChange';
export type DynamicInteractions = Partial<Record<InteractionTrigger, (event: React.SyntheticEvent) => void>>;

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:', 'data:', 'blob:']);
const ALLOWED_NAVIGATION_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);
const ALLOWED_MEDIA_PROTOCOLS = new Set(['http:', 'https:', 'data:', 'blob:']);
const ALLOWED_EMBED_PROTOCOLS = new Set(['http:', 'https:']);

export interface ResolvedEmbedSource {
    embedUrl: string;
    externalUrl?: string;
    provider?: 'youtube' | 'vimeo';
}

function normalizeUrlInput(url: string): string {
    return url.replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim();
}

function isSchemeRelativeUrl(url: string): boolean {
    return url.startsWith('//');
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

function isValidUrlWithProtocols(url: string | undefined, allowedProtocols: Set<string>): boolean {
    if (!url || typeof url !== 'string') return false;
    const sanitized = normalizeUrlInput(url);
    if (!sanitized) return false;
    if (isSchemeRelativeUrl(sanitized)) return false;

    try {
        // Use a dummy base to force parsing even for relative URLs.
        const parsed = new URL(sanitized, 'http://__dummy__');
        if (!allowedProtocols.has(parsed.protocol)) {
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

export function isValidUrl(url: string | undefined): boolean {
    return isValidUrlWithProtocols(url, ALLOWED_PROTOCOLS);
}

export function isValidNavigationUrl(url: string | undefined): boolean {
    return isValidUrlWithProtocols(url, ALLOWED_NAVIGATION_PROTOCOLS);
}

export function isValidMediaUrl(url: string | undefined): boolean {
    return isValidUrlWithProtocols(url, ALLOWED_MEDIA_PROTOCOLS);
}

export function isValidEmbedUrl(url: string | undefined): boolean {
    return isValidUrlWithProtocols(url, ALLOWED_EMBED_PROTOCOLS);
}

export function sanitizeUrl(url: string | undefined): string | undefined {
    if (!url || typeof url !== 'string') return url;
    const sanitized = normalizeUrlInput(url);
    if (!sanitized) return 'about:blank';
    return isValidUrl(sanitized) ? sanitized : 'about:blank';
}

export function sanitizeNavigationUrl(url: string | undefined): string | undefined {
    if (!url || typeof url !== 'string') return url;
    const sanitized = normalizeUrlInput(url);
    if (!sanitized) return 'about:blank';
    return isValidNavigationUrl(sanitized) ? sanitized : 'about:blank';
}

export function sanitizeMediaUrl(url: string | undefined): string | undefined {
    if (!url || typeof url !== 'string') return url;
    const sanitized = normalizeUrlInput(url);
    if (!sanitized) return 'about:blank';
    return isValidMediaUrl(sanitized) ? sanitized : 'about:blank';
}

export function sanitizeEmbedUrl(url: string | undefined): string | undefined {
    if (!url || typeof url !== 'string') return url;
    const sanitized = normalizeUrlInput(url);
    if (!sanitized) return 'about:blank';
    return isValidEmbedUrl(sanitized) ? sanitized : 'about:blank';
}

export function resolveRenderableMediaUrl(url: string | undefined): string | undefined {
    const sanitized = sanitizeMediaUrl(url);
    if (!sanitized || sanitized === 'about:blank') return sanitized;
    if (!/^https?:\/\//i.test(sanitized)) return sanitized;
    return `/__anya_media?url=${encodeURIComponent(sanitized)}`;
}

export function resolveEmbedSource(url: string | undefined): ResolvedEmbedSource {
    const sanitized = sanitizeEmbedUrl(url) ?? 'about:blank';
    const youtubeMatch = sanitized.match(
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube-nocookie\.com\/embed\/)([^&?/]+)/i
    );
    if (youtubeMatch?.[1]) {
        const videoId = youtubeMatch[1];
        return {
            embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?rel=0`,
            externalUrl: `https://www.youtube.com/watch?v=${videoId}`,
            provider: 'youtube',
        };
    }

    const vimeoMatch = sanitized.match(/(?:vimeo\.com\/(?:video\/)?|player\.vimeo\.com\/video\/)(\d+)/i);
    if (vimeoMatch?.[1]) {
        const videoId = vimeoMatch[1];
        return {
            embedUrl: `https://player.vimeo.com/video/${videoId}`,
            externalUrl: `https://vimeo.com/${videoId}`,
            provider: 'vimeo',
        };
    }

    return {
        embedUrl: sanitized,
    };
}

export interface PrimitiveBehaviorProps {
    className?: string;
    style?: React.CSSProperties;
    draggable?: boolean;
    dynamicInteractions?: DynamicInteractions;
    acceptsChildren?: boolean;
}

export type PrimitiveRenderProps<T extends PrimitiveBehaviorProps> = AnyaRenderProps<T>;
export type FlexAlign = 'start' | 'center' | 'end' | 'stretch';
export type FlexJustify = 'start' | 'center' | 'end' | 'between' | 'around';

interface Point {
    x: number;
    y: number;
}

interface RectSnapshot {
    left: number;
    top: number;
    width: number;
    height: number;
}

interface DragTelemetrySession {
    sourceRect: RectSnapshot;
    startPoint: Point;
    lastPoint: Point;
    pathLengthPx: number;
}

const activeDragSessions = new Map<string, DragTelemetrySession>();
const armedElements = new WeakMap<HTMLElement, boolean>();
const holdTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

function updateDragArmedClass(target: EventTarget | null, armed: boolean) {
    const element = target as HTMLElement | null;
    if (!element || !('classList' in element)) return;
    if (armed) {
        element.classList.add('anya-drag-armed');
    } else {
        element.classList.remove('anya-drag-armed');
    }
}

export function useSyncedState<T>(
    externalValue: T | undefined,
    defaultValue: T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
    const resolvedValue = externalValue ?? defaultValue;
    const [value, setValue] = React.useState<T>(resolvedValue);

    React.useEffect(() => {
        setValue(resolvedValue);
    }, [resolvedValue]);

  return [value, setValue];
}

export function splitDynamicInteractions(
    dynamicInteractions?: DynamicInteractions,
): {
    containerInteractions: DynamicInteractions;
} {
    if (!dynamicInteractions) {
        return {
            containerInteractions: {},
        };
    }

    const { onChange, ...containerInteractions } = dynamicInteractions;
    return {
        containerInteractions,
    };
}

export function toCssLength(value?: number | string): string | undefined {
    if (typeof value === 'number') {
        return `${value}px`;
    }
    return value;
}

export function resolveFlexAlign(value?: FlexAlign): React.CSSProperties['alignItems'] | undefined {
    switch (value) {
        case 'start':
            return 'flex-start';
        case 'end':
            return 'flex-end';
        default:
            return value;
    }
}

export function resolveFlexJustify(value?: FlexJustify): React.CSSProperties['justifyContent'] | undefined {
    switch (value) {
        case 'start':
            return 'flex-start';
        case 'end':
            return 'flex-end';
        case 'between':
            return 'space-between';
        case 'around':
            return 'space-around';
        default:
            return value;
    }
}

export function measureTextInputTarget(
    element: EventTarget | null,
): ReturnType<typeof measureElementTarget> {
    return measureElementTarget(element, 'keyboard');
}

export function measureSelectionTarget(
    element: EventTarget | null,
    choiceSetSize?: number,
): ReturnType<typeof measureElementTarget> {
    return measureElementTarget(element, 'unknown', { choiceSetSize });
}

export function measurePointerInteraction(
    event: React.SyntheticEvent,
    overrides?: Parameters<typeof measurePointerTarget>[2],
): ReturnType<typeof measurePointerTarget> {
    const nativeEvent = event.nativeEvent as { clientX?: number; clientY?: number; detail?: number } | undefined;
    return measurePointerTarget(event.currentTarget, nativeEvent ?? null, overrides);
}

export function bindDrag(
    id: string,
    props: PrimitiveBehaviorProps,
    onInteraction?: PrimitiveRenderProps<PrimitiveBehaviorProps>['onInteraction'],
): React.HTMLAttributes<HTMLElement> & { draggable?: boolean } {
    if (!props.draggable) return {};

    const beginArming = (target: EventTarget | null) => {
        const element = target as HTMLElement | null;
        if (!element) return;
        
        const existingTimer = holdTimers.get(element);
        if (existingTimer) clearTimeout(existingTimer);
        
        armedElements.set(element, false);
        updateDragArmedClass(element, false);
        
        const timer = setTimeout(() => {
            armedElements.set(element, true);
            updateDragArmedClass(element, true);
            holdTimers.delete(element);
        }, DRAG_HOLD_MS);
        
        holdTimers.set(element, timer);
    };

    const resetArming = (target: EventTarget | null) => {
        const element = target as HTMLElement | null;
        if (!element) return;
        
        const timer = holdTimers.get(element);
        if (timer) {
            clearTimeout(timer);
            holdTimers.delete(element);
        }
        
        armedElements.set(element, false);
        updateDragArmedClass(element, false);
    };

    return {
        draggable: true,
        onPointerDown: (e: React.PointerEvent) => {
            if (e.button !== 0) return;
            beginArming(e.currentTarget);
        },
        onMouseDown: (e: React.MouseEvent) => {
            if (e.button !== 0) return;
            beginArming(e.currentTarget);
        },
        onPointerUp: (e: React.PointerEvent) => {
            const isArmed = armedElements.get(e.currentTarget as HTMLElement);
            if (!isArmed) {
                resetArming(e.currentTarget);
            }
        },
        onMouseUp: (e: React.MouseEvent) => {
            const isArmed = armedElements.get(e.currentTarget as HTMLElement);
            if (!isArmed) {
                resetArming(e.currentTarget);
            }
        },
        onPointerCancel: (e: React.PointerEvent) => {
            resetArming(e.currentTarget);
        },
        onPointerLeave: (e: React.PointerEvent) => {
            const isArmed = armedElements.get(e.currentTarget as HTMLElement);
            if (!isArmed) {
                resetArming(e.currentTarget);
            }
        },
        onMouseLeave: (e: React.MouseEvent) => {
            const isArmed = armedElements.get(e.currentTarget as HTMLElement);
            if (!isArmed) {
                resetArming(e.currentTarget);
            }
        },
        onDragStart: (e: React.DragEvent) => {
            e.stopPropagation();
            const element = e.currentTarget as HTMLElement;
            const isArmed = armedElements.get(element);
            if (!isArmed) {
                e.preventDefault();
                resetArming(element);
                return;
            }
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', id);
            beginDragTelemetry(id, e.currentTarget, e);
        },
        onDragOver: (e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            const sourceId = e.dataTransfer.getData('text/plain');
            if (sourceId) {
                updateDragTelemetry(sourceId, e);
            }
        },
        onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            resetArming(e.currentTarget);
            const sourceId = e.dataTransfer.getData('text/plain');
            if (sourceId && sourceId !== id && onInteraction) {
                const measurementHint = finalizeDragTelemetry(sourceId, e.currentTarget, e);
                onInteraction('drop', {
                    sourceId,
                    targetIds: [id],
                    semanticDescription: `User dropped component ${sourceId} onto ${id}`,
                    measurementHint,
                });
            }
            clearDragTelemetry(sourceId);
        },
        onDragEnd: (e: React.DragEvent) => {
            resetArming(e.currentTarget);
            clearDragTelemetry(id);
        }
    };
}

function beginDragTelemetry(
    sourceId: string,
    target: EventTarget | null,
    event: React.DragEvent,
): void {
    const sourceRect = captureRect(target);
    if (!sourceRect) {
        return;
    }
    const startPoint = resolveEventPoint(event, sourceRect);
    activeDragSessions.set(sourceId, {
        sourceRect,
        startPoint,
        lastPoint: startPoint,
        pathLengthPx: 0,
    });
}

function updateDragTelemetry(
    sourceId: string,
    event: React.DragEvent,
): void {
    const session = activeDragSessions.get(sourceId);
    if (!session) {
        return;
    }
    const point = resolveEventPoint(event, session.sourceRect);
    session.pathLengthPx += distance(session.lastPoint, point);
    session.lastPoint = point;
}

function finalizeDragTelemetry(
    sourceId: string,
    target: EventTarget | null,
    event: React.DragEvent,
): ReturnType<typeof measureElementTarget> | undefined {
    const session = activeDragSessions.get(sourceId);
    if (!session) {
        return measurePointerInteraction(event);
    }

    const targetRect = captureRect(target) ?? session.sourceRect;
    const dropPoint = resolveEventPoint(event, targetRect);
    session.pathLengthPx += distance(session.lastPoint, dropPoint);
    session.lastPoint = dropPoint;

    const dragDistancePx = roundMetric(distance(session.startPoint, dropPoint));
    const pathLengthPx = roundMetric(Math.max(session.pathLengthPx, dragDistancePx));
    const pathWidthPx = resolveDragPathWidth(session.sourceRect, targetRect, session.startPoint, dropPoint);

    return measureElementTarget(target, 'pointer', {
        pointerX: dropPoint.x,
        pointerY: dropPoint.y,
        dragDistancePx,
        pathLengthPx,
        pathWidthPx,
    });
}

function clearDragTelemetry(sourceId: string | undefined): void {
    if (!sourceId) {
        return;
    }
    activeDragSessions.delete(sourceId);
}

function captureRect(target: EventTarget | null): RectSnapshot | undefined {
    const element = target as HTMLElement | null;
    if (!element || typeof element.getBoundingClientRect !== 'function') {
        return undefined;
    }
    const rect = element.getBoundingClientRect();
    return {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
    };
}

function resolveEventPoint(
    event: { clientX?: number; clientY?: number },
    rect: RectSnapshot,
): Point {
    const x = typeof event.clientX === 'number' && Number.isFinite(event.clientX)
        ? event.clientX
        : rect.left + rect.width / 2;
    const y = typeof event.clientY === 'number' && Number.isFinite(event.clientY)
        ? event.clientY
        : rect.top + rect.height / 2;
    return { x, y };
}

function resolveDragPathWidth(
    sourceRect: RectSnapshot,
    targetRect: RectSnapshot,
    startPoint: Point,
    endPoint: Point,
): number | undefined {
    const dx = Math.abs(endPoint.x - startPoint.x);
    const dy = Math.abs(endPoint.y - startPoint.y);
    const candidates = dx >= dy
        ? [sourceRect.height, targetRect.height]
        : [sourceRect.width, targetRect.width];
    const valid = candidates.filter((value) => value > 0);
    if (valid.length === 0) {
        return undefined;
    }
    return roundMetric(Math.min(...valid));
}

function distance(left: Point, right: Point): number {
    const dx = right.x - left.x;
    const dy = right.y - left.y;
    return Math.sqrt(dx * dx + dy * dy);
}

function roundMetric(value: number): number {
    return Math.round(value * 100) / 100;
}
