import React from 'react';
import { z } from 'zod';
import {
    LineChart as ReLineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from 'recharts';
import { defineComponent } from '../../defineComponent';
import type { PrimitiveBehaviorProps, PrimitiveRenderProps } from '../shared';
import { CHART_DEFAULTS, resolveColor } from './chartShared';

interface LineChartDataset {
    label: string;
    data: number[];
    color?: string;
    curve?: 'linear' | 'monotone' | 'step';
}

interface LineChartProps extends PrimitiveBehaviorProps {
    labels: string[];
    datasets: LineChartDataset[];
    title?: string;
    showGrid?: boolean;
    height?: number;
}

export const LineChart = defineComponent({
    name: 'LineChart',
    description:
        'A professional line chart using Recharts. Ideal for showing trends over time.',
    propsSchema: z.object({
        labels: z.array(z.string()),
        datasets: z.array(
            z.object({
                label: z.string(),
                data: z.array(z.number()),
                color: z.string().optional(),
                curve: z.enum(['linear', 'monotone', 'step']).optional(),
            }),
        ),
        title: z.string().optional(),
        showGrid: z.boolean().optional(),
        height: z.number().optional(),
        className: z.string().optional(),
        style: z.record(z.any()).optional(),
    }),
    tags: ['chart', 'data', 'visualization', 'recharts', 'line'],
    examples: [
        'type: LineChart\nprops:\n  labels: ["Width", "Height", "Depth"]\n  datasets:\n    - label: Dimension Trend\n      data:\n        - { $data: { nodeId: "dimensions", path: "width" } }\n        - { $data: { nodeId: "dimensions", path: "height" } }\n        - { $data: { nodeId: "dimensions", path: "depth" } }\n      curve: monotone\n  title: Reactive Dimensions',
    ],
    render: ({ id, props }: PrimitiveRenderProps<LineChartProps>) => {
        const height = props.height ?? CHART_DEFAULTS.height;
        const datasets = props.datasets ?? [];
        const labels = props.labels ?? [];
        const showGrid = props.showGrid ?? true;

        // Transform data for Recharts
        const chartData = labels.map((label, index) => {
            const entry: any = { name: label };
            datasets.forEach((ds) => {
                const val = ds.data?.[index];
                entry[ds.label] = (val !== null && val !== undefined) ? val : 0;
            });
            return entry;
        });

        const containerStyle: React.CSSProperties = {
            width: '100%',
            height: `${height}px`,
            ...props.style,
        };

        return (
            <div id={id} className={`anya-linechart ${props.className || ''}`} style={containerStyle} {...props.dynamicInteractions}>
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
                    <ReLineChart
                        data={chartData}
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    >
                        {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="var(--anya-chart-grid, rgba(255,255,255,0.1))" />}
                        <XAxis dataKey="name" stroke="var(--anya-chart-text, #888)" fontSize={12} />
                        <YAxis stroke="var(--anya-chart-text, #888)" fontSize={12} />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: 'var(--anya-card-bg, #222)',
                                border: '1px solid var(--anya-border-color, #444)',
                                borderRadius: '8px',
                                color: 'var(--anya-text-main, #eee)'
                            }}
                        />
                        <Legend wrapperStyle={{ paddingTop: '10px' }} />
                        {datasets.map((ds, i) => (
                            <Line
                                key={ds.label}
                                type={ds.curve ?? 'monotone'}
                                dataKey={ds.label}
                                stroke={resolveColor(i, ds.color)}
                                strokeWidth={2}
                                dot={{ r: 4 }}
                                activeDot={{ r: 6 }}
                                animationDuration={500}
                            />
                        ))}
                    </ReLineChart>
                </ResponsiveContainer>
            </div>
        );
    },
});
