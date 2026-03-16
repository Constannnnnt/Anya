import React from 'react';
import { z } from 'zod';
import { defineComponent } from '../../defineComponent';
import type { PrimitiveBehaviorProps, PrimitiveRenderProps } from '../shared';
import { ChartTitle, DIAGRAM_VARIANT_COLORS } from './chartShared';

interface DiagramNode {
    id: string;
    label: string;
    x: number;
    y: number;
    width?: number;
    height?: number;
    variant?: 'default' | 'accent' | 'success' | 'warning' | 'danger';
    subtitle?: string;
}

interface DiagramEdge {
    from: string;
    to: string;
    label?: string;
    curved?: boolean;
}

interface DiagramProps extends PrimitiveBehaviorProps {
    nodes: DiagramNode[];
    edges: DiagramEdge[];
    title?: string;
    width?: number;
    height?: number;
}

/** Find the center point of a node for edge connections. */
function nodeCenter(node: DiagramNode): { x: number; y: number } {
    const w = node.width ?? 140;
    const h = node.height ?? 44;
    return { x: node.x + w / 2, y: node.y + h / 2 };
}

/**
 * Compute connection points on node edges for an arrow from `from` to `to`.
 * Returns the closest edge intersection points.
 */
function connectionPoints(from: DiagramNode, to: DiagramNode): { x1: number; y1: number; x2: number; y2: number } {
    const fc = nodeCenter(from);
    const tc = nodeCenter(to);
    const fw = from.width ?? 140;
    const fh = from.height ?? 44;
    const tw = to.width ?? 140;
    const th = to.height ?? 44;

    const gap = 4;
    const dx = tc.x - fc.x;
    const dy = tc.y - fc.y;

    let x1: number, y1: number, x2: number, y2: number;

    if (Math.abs(dx) > Math.abs(dy)) {
        if (dx > 0) {
            x1 = from.x + fw + gap;
            x2 = to.x - gap;
        } else {
            x1 = from.x - gap;
            x2 = to.x + tw + gap;
        }
        y1 = fc.y;
        y2 = tc.y;
    } else {
        x1 = fc.x;
        x2 = tc.x;
        if (dy > 0) {
            y1 = from.y + fh + gap;
            y2 = to.y - gap;
        } else {
            y1 = from.y - gap;
            y2 = to.y + th + gap;
        }
    }

    return { x1, y1, x2, y2 };
}

export const Diagram = defineComponent({
    name: 'Diagram',
    description:
        'An SVG diagram for flowcharts and structural diagrams. Define nodes with positions and connect them with edges. Supports variants (accent, success, warning, danger) and curved edges.',
    propsSchema: z.object({
        nodes: z.array(
            z.object({
                id: z.string(),
                label: z.string(),
                x: z.number(),
                y: z.number(),
                width: z.number().optional(),
                height: z.number().optional(),
                variant: z.enum(['default', 'accent', 'success', 'warning', 'danger']).optional(),
                subtitle: z.string().optional(),
            }),
        ),
        edges: z.array(
            z.object({
                from: z.string(),
                to: z.string(),
                label: z.string().optional(),
                curved: z.boolean().optional(),
            }),
        ),
        title: z.string().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
        className: z.string().optional(),
        style: z.record(z.any()).optional(),
    }),
    tags: ['diagram', 'data', 'visualization', 'flowchart'],
    examples: [
        'type: Diagram\nprops:\n  title: Request Flow\n  nodes:\n    - id: client\n      label: Client\n      x: 40\n      y: 60\n      variant: accent\n    - id: server\n      label: API Server\n      x: 260\n      y: 60\n    - id: db\n      label: Database\n      x: 480\n      y: 60\n      variant: success\n  edges:\n    - from: client\n      to: server\n      label: request\n    - from: server\n      to: db\n      label: query',
    ],
    render: ({ id, props }: PrimitiveRenderProps<DiagramProps>) => {
        const svgWidth = props.width ?? 680;
        const svgHeight = props.height ?? 400;
        const nodes = props.nodes ?? [];
        const edges = props.edges ?? [];

        const nodeMap = new Map(nodes.map((n) => [n.id, n]));

        return (
            <div id={id} className={`anya-diagram ${props.className || ''}`} style={props.style} {...props.dynamicInteractions}>
                <svg width="100%" viewBox={`0 0 ${svgWidth} ${svgHeight}`} role="img" aria-label={props.title ?? 'Diagram'}>
                    <defs>
                        <marker
                            id={`arrow-${id}`}
                            viewBox="0 0 10 10"
                            refX="9"
                            refY="5"
                            markerWidth="6"
                            markerHeight="6"
                            orient="auto"
                        >
                            <path d="M0,0 L10,5 L0,10 Z" fill="var(--anya-diagram-arrow, #666)" />
                        </marker>
                    </defs>

                    <ChartTitle text={props.title} x={svgWidth / 2} y={24} />

                    {/* Edges */}
                    {edges.map((edge, i) => {
                        const fromNode = nodeMap.get(edge.from);
                        const toNode = nodeMap.get(edge.to);
                        if (!fromNode || !toNode) return null;

                        const { x1, y1, x2, y2 } = connectionPoints(fromNode, toNode);

                        if (edge.curved) {
                            const midX = (x1 + x2) / 2;
                            const midY = Math.min(y1, y2) - 40;
                            return (
                                <g key={`edge-${i}`}>
                                    <path
                                        d={`M ${x1} ${y1} Q ${midX} ${midY}, ${x2} ${y2}`}
                                        fill="none"
                                        stroke="var(--anya-diagram-edge, #555)"
                                        strokeWidth="1.5"
                                        markerEnd={`url(#arrow-${id})`}
                                    />
                                    {edge.label && (
                                        <text x={midX} y={midY - 4} textAnchor="middle" fill="var(--anya-diagram-label, #777)" fontSize="11" fontFamily="system-ui, sans-serif">
                                            {edge.label}
                                        </text>
                                    )}
                                </g>
                            );
                        }

                        const midX = (x1 + x2) / 2;
                        const midY = (y1 + y2) / 2;

                        return (
                            <g key={`edge-${i}`}>
                                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--anya-diagram-edge, #555)" strokeWidth="1.5" markerEnd={`url(#arrow-${id})`} />
                                {edge.label && (
                                    <text x={midX} y={midY - 6} textAnchor="middle" fill="var(--anya-diagram-label, #777)" fontSize="11" fontFamily="system-ui, sans-serif">
                                        {edge.label}
                                    </text>
                                )}
                            </g>
                        );
                    })}

                    {/* Nodes */}
                    {nodes.map((node) => {
                        const w = node.width ?? 140;
                        const h = node.subtitle ? Math.max(node.height ?? 56, 56) : (node.height ?? 44);
                        const colors = DIAGRAM_VARIANT_COLORS[node.variant ?? 'default'] ?? DIAGRAM_VARIANT_COLORS.default;

                        return (
                            <g key={`node-${node.id}`}>
                                <rect
                                    x={node.x}
                                    y={node.y}
                                    width={w}
                                    height={h}
                                    rx={6}
                                    fill={colors.fill}
                                    stroke={colors.stroke}
                                    strokeWidth={node.variant && node.variant !== 'default' ? 1.5 : 1}
                                />
                                <text
                                    x={node.x + w / 2}
                                    y={node.subtitle ? node.y + h * 0.38 : node.y + h / 2}
                                    textAnchor="middle"
                                    dominantBaseline="central"
                                    fill={colors.text}
                                    fontSize="13"
                                    fontWeight="500"
                                    fontFamily="system-ui, sans-serif"
                                >
                                    {node.label}
                                </text>
                                {node.subtitle && (
                                    <text
                                        x={node.x + w / 2}
                                        y={node.y + h * 0.66}
                                        textAnchor="middle"
                                        dominantBaseline="central"
                                        fill={colors.text}
                                        fontSize="11"
                                        fontFamily="system-ui, sans-serif"
                                        opacity={0.7}
                                    >
                                        {node.subtitle}
                                    </text>
                                )}
                            </g>
                        );
                    })}
                </svg>
            </div>
        );
    },
});
