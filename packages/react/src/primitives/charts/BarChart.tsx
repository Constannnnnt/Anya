import React from 'react';
import { z } from 'zod';
import {
    BarChart as ReBarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    Cell,
} from 'recharts';
import { defineComponent } from '../../defineComponent';
import type { PrimitiveBehaviorProps, PrimitiveRenderProps } from '../shared';
import { CHART_DEFAULTS, resolveColor } from './chartShared';

interface BarChartDataset {
    label: string;
    data: number[];
    color?: string;
}

interface BarChartProps extends PrimitiveBehaviorProps {
    labels: string[];
    datasets: BarChartDataset[];
    title?: string;
    orientation?: 'vertical' | 'horizontal';
    showValues?: boolean;
    showGrid?: boolean;
    height?: number;
}

export const BarChart = defineComponent({
    name: 'BarChart',
    description:
        'A professional bar chart using Recharts. Supports multiple datasets, animations, and responsive layouts.',
    propsSchema: z.object({
        labels: z.array(z.string()),
        datasets: z.array(
            z.object({
                label: z.string(),
                data: z.array(z.number()),
                color: z.string().optional(),
            }),
        ),
        title: z.string().optional(),
        orientation: z.enum(['vertical', 'horizontal']).optional(),
        showValues: z.boolean().optional(),
        showGrid: z.boolean().optional(),
        height: z.number().optional(),
        className: z.string().optional(),
        style: z.record(z.any()).optional(),
    }),
    tags: ['chart', 'data', 'visualization', 'recharts'],
    examples: [
        'type: LineChart\nprops:\n  labels: ["Width", "Height", "Depth"]\n  datasets:\n    - label: Dimension Trend\n      data:\n        - { $data: { nodeId: "dimensions", path: "width" } }\n        - { $data: { nodeId: "dimensions", path: "height" } }\n        - { $data: { nodeId: "dimensions", path: "depth" } }\n      curve: monotone\n  title: Reactive Dimensions',
    ],
    render: ({ id, props }: PrimitiveRenderProps<BarChartProps>) => {
        const height = props.height ?? CHART_DEFAULTS.height;
        const isHorizontal = props.orientation === 'horizontal';
        const datasets = props.datasets ?? [];
        const labels = props.labels ?? [];
        const showGrid = props.showGrid ?? true;

        // Transform data for Recharts
        const chartData = labels.map((label, index) => {
            const entry: any = { name: label };
            datasets.forEach((ds) => {
                if (!ds || !ds.label) return;
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
            <div id={id} className={`anya-barchart ${props.className || ''}`} style={containerStyle} {...props.dynamicInteractions}>
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
                    <ReBarChart
                        data={chartData}
                        layout={isHorizontal ? 'vertical' : 'horizontal'}
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    >
                        {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="var(--anya-chart-grid, rgba(255,255,255,0.1))" />}
                        {isHorizontal ? (
                            <>
                                <XAxis type="number" stroke="var(--anya-chart-text, #888)" fontSize={12} />
                                <YAxis dataKey="name" type="category" stroke="var(--anya-chart-text, #888)" fontSize={12} />
                            </>
                        ) : (
                            <>
                                <XAxis dataKey="name" stroke="var(--anya-chart-text, #888)" fontSize={12} />
                                <YAxis stroke="var(--anya-chart-text, #888)" fontSize={12} />
                            </>
                        )}
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
                            <Bar
                                key={ds.label}
                                dataKey={ds.label}
                                fill={resolveColor(i, ds.color)}
                                radius={[4, 4, 0, 0]}
                                animationDuration={500}
                                label={props.showValues ? { position: isHorizontal ? 'right' : 'top', fill: 'var(--anya-chart-text, #888)', fontSize: 10 } : false}
                            />
                        ))}
                    </ReBarChart>
                </ResponsiveContainer>
            </div>
        );
    },
});
