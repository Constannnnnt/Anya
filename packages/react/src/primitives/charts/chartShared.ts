/**
 * @anya-ui/react — Chart & Diagram Shared Utilities
 *
 * Constants, math helpers, types, and reusable sub-components
 * shared across all chart and diagram primitives.
 */

import React from 'react';

// ─── Color Palette ───────────────────────────────────────────────────────

/** Curated 6-color palette for chart series. */
export const CHART_PALETTE = [
    '#7c3aed', // purple (accent)
    '#0d9488', // teal
    '#d97706', // amber
    '#e11d48', // rose
    '#2563eb', // blue
    '#16a34a', // green
];

/** Resolve a series color: use explicit color if provided, otherwise cycle the palette. */
export function resolveColor(index: number, explicitColor?: string): string {
    return explicitColor || CHART_PALETTE[index % CHART_PALETTE.length];
}

// ─── Diagram Variant Colors ─────────────────────────────────────────────

export interface VariantColorSet {
    fill: string;
    stroke: string;
    text: string;
}

/** Node variant color mapping for SVG diagrams. */
export const DIAGRAM_VARIANT_COLORS: Record<string, VariantColorSet> = {
    default: { fill: '#1e1e1e', stroke: 'rgba(255,255,255,0.08)', text: '#e8e8e8' },
    accent:  { fill: 'rgba(124,58,237,0.15)', stroke: '#7c3aed', text: '#a78bfa' },
    success: { fill: 'rgba(16,185,129,0.12)', stroke: '#10b981', text: '#34d399' },
    warning: { fill: 'rgba(245,158,11,0.12)', stroke: '#f59e0b', text: '#fbbf24' },
    danger:  { fill: 'rgba(239,68,68,0.12)', stroke: '#ef4444', text: '#f87171' },
};

// ─── Chart Layout Defaults ──────────────────────────────────────────────

export const CHART_DEFAULTS = {
    width: 680,
    height: 300,
    padding: { top: 40, right: 20, bottom: 50, left: 60 },
} as const;

// ─── Axis Math ──────────────────────────────────────────────────────────

/** Round a data max up to a "nice" axis boundary (1, 2, 5, 10 multiples). */
export function computeNiceMax(max: number): number {
    if (max <= 0) return 10;
    const magnitude = Math.pow(10, Math.floor(Math.log10(max)));
    const normalized = max / magnitude;
    if (normalized <= 1) return magnitude;
    if (normalized <= 2) return 2 * magnitude;
    if (normalized <= 5) return 5 * magnitude;
    return 10 * magnitude;
}

/** Generate evenly-spaced tick values from 0 to `max`. */
export function generateTicks(max: number, count: number): number[] {
    const step = max / count;
    return Array.from({ length: count + 1 }, (_, i) => Math.round(i * step));
}

/** Compute axis-ready values from an array of datasets. */
export function computeAxisScale(datasets: { data: number[] }[]) {
    const allValues = datasets.flatMap((d) => d.data ?? []);
    const dataMax = allValues.length > 0 ? Math.max(...allValues) : 10;
    const niceMax = computeNiceMax(dataMax);
    const ticks = generateTicks(niceMax, 5);
    return { niceMax, ticks };
}

// ─── SVG Path Builders ──────────────────────────────────────────────────

export interface Point {
    x: number;
    y: number;
}

/** Build a smooth cubic Bézier path through the given points. */
export function smoothPath(points: Point[]): string {
    if (points.length < 2) return '';
    if (points.length === 2) {
        return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
    }

    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[Math.max(0, i - 1)];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[Math.min(points.length - 1, i + 2)];

        const tension = 0.3;
        const cp1x = p1.x + (p2.x - p0.x) * tension;
        const cp1y = p1.y + (p2.y - p0.y) * tension;
        const cp2x = p2.x - (p3.x - p1.x) * tension;
        const cp2y = p2.y - (p3.y - p1.y) * tension;

        d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }
    return d;
}

/** Build a straight-line polyline path through the given points. */
export function linearPath(points: Point[]): string {
    if (points.length < 1) return '';
    return points.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ');
}

// ─── Reusable Sub-Components ────────────────────────────────────────────

export interface ChartLegendItem {
    label: string;
    color: string;
    suffix?: string;
}

/** Shared chart legend rendered as HTML below the SVG. */
export function ChartLegend({ items }: { items: ChartLegendItem[] }) {
    if (items.length <= 1) return null;
    return React.createElement(
        'div',
        { className: 'anya-chart-legend' },
        items.map((item, i) =>
            React.createElement(
                'span',
                { key: i, className: 'anya-chart-legend-item' },
                React.createElement('span', {
                    className: 'anya-chart-legend-swatch',
                    style: { background: item.color },
                }),
                item.label,
                item.suffix ? ` ${item.suffix}` : '',
            ),
        ),
    );
}

/** SVG chart title text element. */
export function ChartTitle({
    text,
    x,
    y,
}: {
    text: string | undefined;
    x: number;
    y?: number;
}) {
    if (!text) return null;
    return React.createElement('text', {
        x,
        y: y ?? 20,
        textAnchor: 'middle',
        fill: 'var(--anya-chart-text, #aaa)',
        fontSize: '14',
        fontWeight: '600',
        fontFamily: 'system-ui, sans-serif',
        children: text,
    });
}
