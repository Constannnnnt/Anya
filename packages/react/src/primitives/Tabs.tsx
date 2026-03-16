import React from 'react';
import { z } from 'zod';
import { defineComponent } from '../defineComponent';
import {
    measurePointerInteraction,
    type PrimitiveBehaviorProps,
    type PrimitiveRenderProps,
} from './shared';

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
        const tabLabels: string[] = childArray.map((child: any) => getTabLabel(child));
        const tabLabelKey = tabLabels.join('\u0000');
        const [activeIdx, setActiveIdx] = React.useState(() => resolveDefaultTabIndex(tabLabels, props.defaultTab));

        React.useEffect(() => {
            setActiveIdx((currentIdx) => resolveActiveTabIndex(currentIdx, tabLabels, props.defaultTab));
        }, [props.defaultTab, tabLabelKey]);

        return (
            <div id={id} className={`anya-tabs ${props.className || ''}`} style={props.style} {...props.dynamicInteractions}>
                <div className="anya-tabs-list" role="tablist">
                    {tabLabels.map((label, i) => (
                        <button
                            key={i}
                            type="button"
                            role="tab"
                            aria-selected={i === activeIdx}
                            className={`anya-tab-trigger ${i === activeIdx ? 'active' : ''}`}
                            onClick={(e) => {
                                setActiveIdx(i);
                                onInteraction('tab_change', {
                                    propName: 'activeTab',
                                    previousValue: tabLabels[activeIdx],
                                    newValue: label,
                                    semanticDescription: `User switched to tab "${label}"`,
                                    measurementHint: measurePointerInteraction(e, { choiceSetSize: tabLabels.length }),
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

function getTabLabel(child: any): string {
    return child?.props?.props?.label ?? child?.props?.label ?? '—';
}

function resolveDefaultTabIndex(tabLabels: string[], defaultTab?: string): number {
    if (!defaultTab) {
        return 0;
    }

    const index = tabLabels.indexOf(defaultTab);
    return index >= 0 ? index : 0;
}

function resolveActiveTabIndex(
    currentIdx: number,
    tabLabels: string[],
    defaultTab?: string,
): number {
    if (tabLabels.length === 0) {
        return 0;
    }

    if (defaultTab) {
        return resolveDefaultTabIndex(tabLabels, defaultTab);
    }

    if (currentIdx < tabLabels.length) {
        return currentIdx;
    }

    return tabLabels.length - 1;
}
