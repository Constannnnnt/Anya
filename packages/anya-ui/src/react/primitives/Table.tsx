import React from 'react';
import { z } from 'zod';
import { defineComponent } from '../defineComponent';
import type { PrimitiveBehaviorProps, PrimitiveRenderProps } from './shared';

interface TableProps extends PrimitiveBehaviorProps {
    columns: string[];
    rows: string[][];
    caption?: string;
    striped?: boolean;
}

export const Table = defineComponent({
    name: 'Table',
    description: 'A data table with columns (header strings) and rows (arrays of cell strings).',
    propsSchema: z.object({
        columns: z.array(z.string()),
        rows: z.array(z.array(z.string())),
        caption: z.string().optional(),
        striped: z.boolean().optional(),
        className: z.string().optional(),
        style: z.record(z.any()).optional(),
    }),
    tags: ['data', 'table'],
    examples: [
        'type: Table\nprops:\n  columns: [Name, Role, Status]\n  rows:\n    - [Alice, Engineer, Active]\n    - [Bob, Designer, Away]',
    ],
    render: ({ id, props }: PrimitiveRenderProps<TableProps>) => (
        <div id={id} className={`anya-table-wrapper ${props.className || ''}`} style={props.style} {...props.dynamicInteractions}>
            <table className={`anya-table ${props.striped ? 'anya-table-striped' : ''}`}>
                {props.caption && <caption className="anya-table-caption">{props.caption}</caption>}
                <thead>
                    <tr>
                        {(props.columns ?? []).map((col, i) => (
                            <th key={i} className="anya-table-th">{col}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {(props.rows ?? []).map((row, ri) => (
                        <tr key={ri} className="anya-table-tr">
                            {Array.isArray(row) && row.map((cell, ci) => (
                                <td key={ci} className="anya-table-td">{cell}</td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    ),
});
