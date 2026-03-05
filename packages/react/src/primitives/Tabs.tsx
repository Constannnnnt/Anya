import React, { useState } from 'react';
import { z } from 'zod';
import { defineComponent } from '../defineComponent';
import type { PrimitiveBehaviorProps, PrimitiveRenderProps } from './shared';

interface TabsProps extends PrimitiveBehaviorProps {
    defaultTab?: string;
}

export const Tabs = defineComponent({
    name: 'Tabs',
    description: 'A tab navigation container. Nest TabItem children inside; each TabItem has a label.',
    propsSchema: z.object({
        defaultTab: z.string().optional(),
        className: z.string().optional(),
        style: z.record(z.any()).optional(),
    }),
    tags: ['layout', 'tabs', 'navigation'],
    render: ({ id, props, children, onInteraction }: PrimitiveRenderProps<TabsProps>) => {
        const childArray = React.Children.toArray(children) as React.ReactElement[];
        const tabLabels: string[] = childArray.map(
            (c: any) => c?.props?.props?.label ?? c?.props?.label ?? '—'
        );
        const [activeIdx, setActiveIdx] = useState(() => {
            if (props.defaultTab) {
                const idx = tabLabels.indexOf(props.defaultTab);
                return idx >= 0 ? idx : 0;
            }
            return 0;
        });

        return (
            <div id={id} className={`anya-tabs ${props.className || ''}`} style={props.style} {...props.dynamicInteractions}>
                <div className="anya-tabs-list" role="tablist">
                    {tabLabels.map((label, i) => (
                        <button key={i} role="tab" aria-selected={i === activeIdx}
                            className={`anya-tab-trigger ${i === activeIdx ? 'active' : ''}`}
                            onClick={() => {
                                setActiveIdx(i);
                                onInteraction('tab_change', {
                                    propName: 'activeTab',
                                    previousValue: tabLabels[activeIdx],
                                    newValue: label,
                                    semanticDescription: `User switched to tab "${label}"`,
                                });
                            }}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                <div className="anya-tabs-panel" role="tabpanel">
                    {childArray[activeIdx]}
                </div>
            </div>
        );
    },
});
