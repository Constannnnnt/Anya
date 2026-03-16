import React from 'react';
import { z } from 'zod';
import {
    PieChart as RePieChart,
    Pie,
    Cell,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from 'recharts';
import { defineComponent } from '../../defineComponent';
import type { PrimitiveBehaviorProps, PrimitiveRenderProps } from '../shared';
import { resolveColor } from './chartShared';

interface PieSegment {
    label: string;
    value: number;
    color?: string;
}

interface PieChartProps extends PrimitiveBehaviorProps {
    segments: PieSegment[];
    title?: string;
    variant?: 'pie' | 'doughnut';
    showLegend?: boolean;
    showValues?: boolean;
    size?: number;
}

export const PieChart = defineComponent({
    name: 'PieChart',
    description:
        'A professional pie or doughnut chart using Recharts for proportional data visualization.',
    propsSchema: z.object({
        segments: z.array(
            z.object({
                label: z.string(),
                value: z.number(),
                color: z.string().optional(),
            }),
        ),
        title: z.string().optional(),
        variant: z.enum(['pie', 'doughnut']).optional(),
        showLegend: z.boolean().optional(),
        showValues: z.boolean().optional(),
        size: z.number().optional(),
        className: z.string().optional(),
        style: z.record(z.any()).optional(),
    }),
    tags: ['chart', 'data', 'visualization', 'recharts'],
    examples: [
        'type: PieChart\nprops:\n  segments: { $data: { nodeId: "market_share_node" } }\n  title: Live Market Share\n  variant: doughnut',
    ],
    render: ({ id, props }: PrimitiveRenderProps<PieChartProps>) => {
        const size = props.size ?? 300;
        const segments = props.segments ?? [];
        const isDoughnut = props.variant === 'doughnut';
        const showLegend = props.showLegend ?? true;

        const containerStyle: React.CSSProperties = {
            width: '100%',
            height: `${size}px`,
            ...props.style,
        };

        return (
            <div id={id} className={`anya-piechart ${props.className || ''}`} style={containerStyle} {...props.dynamicInteractions}>
                {props.title && (
                    <div style={{
                        textAlign: 'center',
                        marginBottom: '10px',
                        fontSize: '14px',
                        fontWeight: '600',
                        color: 'var(--anya-chart-title, #ccc)'
                    }}>
                        {props.title}
                    </div>
                )}
                <ResponsiveContainer width="100%" height="100%">
                    <RePieChart>
                        <Pie
                            data={segments}
                            dataKey="value"
                            nameKey="label"
                            cx="50%"
                            cy="50%"
                            innerRadius={isDoughnut ? '60%' : 0}
                            outerRadius="80%"
                            paddingAngle={2}
                            animationDuration={500}
                            label={props.showValues ? ({ percent }) => `${((percent || 0) * 100).toFixed(0)}%` : false}
                        >
                            {segments.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={resolveColor(index, entry.color)} />
                            ))}
                        </Pie>
                        <Tooltip
                            contentStyle={{
                                backgroundColor: 'var(--anya-card-bg, #222)',
                                border: '1px solid var(--anya-border-color, #444)',
                                borderRadius: '8px',
                                color: 'var(--anya-text-main, #eee)'
                            }}
                        />
                        {showLegend && <Legend />}
                    </RePieChart>
                </ResponsiveContainer>
            </div>
        );
    },
});
