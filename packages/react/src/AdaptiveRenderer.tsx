/**
 * @anya-ui/react — AdaptiveRenderer
 *
 * The core rendering component that takes a ViewSpec from your
 * agent and renders the corresponding React components.
 *
 * Components are auto-resolved from the Provider's registry.
 * No manual component registry prop needed (but supported as override).
 */

import React, { type ComponentType } from 'react';
import { proxy, useSnapshot } from 'valtio';
import { getLogger, normalizeStyleProp, resolveBindingValue, type InteractionModality, type ViewSpec, type ViewNode, type InteractionEvent, type InteractionSpec } from '@anya-ui/core';
import { useAnyaContext } from './Provider';
import type { AnyaComponent, AnyaRenderProps } from './defineComponent';
import { measureElementTarget, measurePointerTarget } from './behavior/telemetry';

// ─── Types ───────────────────────────────────────────────────────────────

/** Optional manual component map (overrides auto-resolution) */
export type ComponentRegistry = Record<string, ComponentType<AnyaRenderProps<any>>>;
type InteractionDetail = NonNullable<Parameters<AnyaRenderProps['onInteraction']>[1]>;
type RendererInteractionHandler = (
    componentName: string,
    record: Omit<InteractionEvent, 'timestamp'>,
    measurementHint?: InteractionDetail['measurementHint'],
) => void;

type ChangeCapableElement =
    | HTMLInputElement
    | HTMLTextAreaElement
    | HTMLSelectElement;

export interface AdaptiveRendererProps {
    /** The UI spec produced by the agent */
    spec: ViewSpec | null;
    /** Optional manual component map (overrides Provider registry) */
    registry?: ComponentRegistry;
    /** Callback when a component reports an interaction */
    onInteraction?: RendererInteractionHandler;
    /** Renderer for unknown component types */
    unknownComponent?: ComponentType<{ type: string }>;
}

function DefaultUnknownComponent({ type }: { type: string }) {
    return (
        <div style={{
            padding: '12px',
            border: '1px dashed #666',
            borderRadius: '8px',
            color: '#999',
            fontSize: '13px',
        }}>
            Unknown component: <code>{type}</code>
        </div>
    );
}

export function AdaptiveRenderer({
    spec,
    registry: manualRegistry,
    onInteraction,
    unknownComponent: UnknownComponent = DefaultUnknownComponent,
}: AdaptiveRendererProps) {
    // Auto-resolve from Provider if no manual registry
    let resolvedMap: Map<string, ComponentType<any>> | undefined;
    let pluginMap: Map<string, AnyaComponent> | undefined;
    const fallbackDataNodes = React.useMemo(() => proxy<any[]>([]), []);
    let dataNodes: any[] = fallbackDataNodes;
    
    try {
        const ctx = useAnyaContext();
        resolvedMap = ctx.componentMap;
        pluginMap = ctx.pluginMap;
        dataNodes = ctx.viewEngine.getState().context.dataNodes;
    } catch {
        // Not in a provider — manual registry required
    }

    const dataSnap = useSnapshot(dataNodes);

    if (!spec) return null;

    const layoutStyle = getLayoutStyle(spec.layout);

    return (
        <div style={layoutStyle} data-anya-layout={spec.layout}>
            {spec.components.map((comp: ViewNode) => (
                <MemoizedRenderComponent
                    key={comp.id}
                    spec={comp}
                    dataSnap={dataSnap}
                    resolvedMap={resolvedMap}
                    pluginMap={pluginMap}
                    manualRegistry={manualRegistry}
                    onInteraction={onInteraction}
                    unknownComponent={UnknownComponent}
                />
            ))}
        </div>
    );
}

// ─── Internal: Single Component Renderer ─────────────────────────────────

interface RenderComponentProps {
    spec: ViewNode;
    dataSnap: any;
    parentSpec?: ViewNode;
    resolvedMap?: Map<string, ComponentType<any>>;
    pluginMap?: Map<string, AnyaComponent>;
    manualRegistry?: ComponentRegistry;
    onInteraction?: RendererInteractionHandler;
    unknownComponent: ComponentType<{ type: string }>;
}

function RenderComponent({
    spec,
    dataSnap,
    parentSpec,
    resolvedMap,
    pluginMap,
    manualRegistry,
    onInteraction,
    unknownComponent: UnknownComponent,
}: RenderComponentProps) {
    const logger = getLogger();

    // Try manual registry first, then auto-resolved map
    const Component =
        manualRegistry?.[spec.type] ??
        resolvedMap?.get(spec.type);

    if (!Component) {
        return <UnknownComponent type={spec.type} />;
    }

    // Resolve props recursively for live reactivity
    const resolvedProps = React.useMemo(() => {
        return resolveBindingValue(spec.props, {
            interaction: undefined as any,
            dataNodes: dataSnap as any,
        }) as Record<string, unknown>;
    }, [spec.props, dataSnap]);

    const handleInteraction: AnyaRenderProps['onInteraction'] = (action, detail) => {
        const record = buildInteractionRecord(spec, action, detail);

        const plugin = pluginMap?.get(spec.type);
        if (plugin?.onInteraction) {
            try {
                plugin.onInteraction({
                    ...record,
                    timestamp: Date.now(),
                });
            } catch (error) {
                logger.warn(`[AdaptiveRenderer] onInteraction hook failed for '${plugin.name}'.`, error);
            }
        }

        onInteraction?.(spec.type, record, detail?.measurementHint);
    };

    const dynamicInteractions = buildDynamicInteractions(
        spec,
        parentSpec,
        spec.interactions ?? [],
        handleInteraction,
    );

    // Render children recursively
    const children = spec.children?.map((child: ViewNode) => (
        <MemoizedRenderComponent
            key={child.id}
            spec={child}
            dataSnap={dataSnap}
            parentSpec={spec}
            resolvedMap={resolvedMap}
            pluginMap={pluginMap}
            manualRegistry={manualRegistry}
            onInteraction={onInteraction}
            unknownComponent={UnknownComponent}
        />
    ));

    // Belt-and-suspenders: core translator should already normalize, but
    // guard here in case a spec bypasses the decoder.
    const safeProps: Record<string, unknown> & {
        style?: unknown;
        draggable?: boolean;
        dynamicInteractions: Record<string, (event: React.SyntheticEvent) => void>;
    } = {
        ...resolvedProps,
        draggable: spec.draggable,
        dynamicInteractions,
    };
    if (typeof safeProps.style === 'string') {
        logger.warn(`[AdaptiveRenderer] Component '${spec.type}' received a string style prop — this should have been normalized upstream.`);
        safeProps.style = normalizeStyleProp(safeProps.style);
    }

    return (
        <Component
            id={spec.id}
            props={safeProps}
            bindTo={spec.bindTo}
            onInteraction={handleInteraction}
        >
            {children}
        </Component>
    );
}

const MemoizedRenderComponent = React.memo(
    RenderComponent,
    (prev, next) =>
        prev.spec === next.spec
        && prev.dataSnap === next.dataSnap
        && prev.parentSpec === next.parentSpec
        && prev.resolvedMap === next.resolvedMap
        && prev.pluginMap === next.pluginMap
        && prev.manualRegistry === next.manualRegistry
        && prev.onInteraction === next.onInteraction
        && prev.unknownComponent === next.unknownComponent
);

// ─── Layout Helpers ──────────────────────────────────────────────────────

function getLayoutStyle(layout: ViewSpec['layout']): React.CSSProperties {
    switch (layout) {
        case 'row':
            return {
                display: 'flex',
                flexDirection: 'row',
                flexWrap: 'wrap',
                alignItems: 'flex-start',
                gap: '24px',
                padding: '24px',
            };
        case 'grid':
            return {
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                gap: '24px',
                padding: '24px',
            };
        case 'split':
            return {
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
                alignItems: 'start',
                gap: '28px',
                padding: '24px',
            };
        case 'tabs':
            return {
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                padding: '24px',
            };
        case 'stack':
        default:
            return {
                display: 'flex',
                flexDirection: 'column',
                gap: '20px',
                padding: '24px',
            };
    }
}

function buildInteractionRecord(
    spec: ViewNode,
    action: InteractionEvent['action'],
    detail?: InteractionDetail,
): Omit<InteractionEvent, 'timestamp'> {
    return {
        elementId: spec.id,
        componentName: spec.type,
        action,
        trigger: detail?.trigger,
        propName: detail?.propName,
        previousValue: detail?.previousValue,
        newValue: detail?.newValue,
        semanticDescription: detail?.semanticDescription,
        sourceId: detail?.sourceId,
        targetIds: detail?.targetIds,
        targetAction: detail?.targetAction,
    };
}

function buildDynamicInteractions(
    spec: ViewNode,
    parentSpec: ViewNode | undefined,
    interactions: InteractionSpec[],
    handleInteraction: NonNullable<AnyaRenderProps['onInteraction']>,
): Record<string, (event: React.SyntheticEvent) => void> {
    const dynamicInteractions: Record<string, (event: React.SyntheticEvent) => void> = {};
    const interactionsByTrigger = groupInteractionsByTrigger(interactions);
    const choiceSetSize = deriveDynamicChoiceSetSize(spec, parentSpec);

    interactionsByTrigger.forEach((triggerInteractions, trigger) => {
        dynamicInteractions[trigger] = (event: React.SyntheticEvent) => {
            event.stopPropagation();
            const changeDetail = trigger === 'onChange'
                ? extractChangeInteractionDetail(event)
                : {};
            const nativeEvent = event.nativeEvent as { clientX?: number; clientY?: number; detail?: number } | undefined;
            const measurementHint = trigger === 'onChange'
                ? measureElementTarget(
                    event.currentTarget,
                    inferChangeInteractionModality(event.currentTarget),
                    { choiceSetSize },
                )
                : measurePointerTarget(
                    event.currentTarget,
                    nativeEvent ?? null,
                    { choiceSetSize },
                );

            for (const interaction of triggerInteractions) {
                handleInteraction(interaction.action as InteractionEvent['action'], {
                    trigger: interaction.trigger,
                    propName: changeDetail.propName,
                    newValue: changeDetail.newValue,
                    semanticDescription: interaction.description,
                    targetIds: interaction.targetIds,
                    targetAction: interaction.targetAction,
                    measurementHint,
                });
            }
        };
    });

    return dynamicInteractions;
}

function extractChangeInteractionDetail(
    event: React.SyntheticEvent,
): Pick<InteractionDetail, 'propName' | 'newValue'> {
    const target = event.currentTarget as EventTarget | null;
    if (!isChangeCapableElement(target)) {
        return {};
    }

    if (target instanceof HTMLInputElement) {
        if (target.type === 'checkbox') {
            return {
                propName: 'checked',
                newValue: target.checked,
            };
        }
        if (target.type === 'radio') {
            return {
                propName: 'value',
                newValue: target.value,
            };
        }
    }

    return {
        propName: 'value',
        newValue: target.value,
    };
}

function inferChangeInteractionModality(
    target: EventTarget | null,
): InteractionModality {
    if (!isChangeCapableElement(target)) {
        return 'unknown';
    }

    if (target instanceof HTMLInputElement) {
        if (target.type === 'checkbox' || target.type === 'radio' || target.type === 'range') {
            return 'unknown';
        }
        return 'keyboard';
    }

    if (target instanceof HTMLTextAreaElement) {
        return 'keyboard';
    }

    return 'unknown';
}

function isChangeCapableElement(value: EventTarget | null): value is ChangeCapableElement {
    return value instanceof HTMLInputElement
        || value instanceof HTMLTextAreaElement
        || value instanceof HTMLSelectElement;
}

function groupInteractionsByTrigger(
    interactions: InteractionSpec[],
): Map<InteractionSpec['trigger'], InteractionSpec[]> {
    const grouped = new Map<InteractionSpec['trigger'], InteractionSpec[]>();

    for (const interaction of interactions) {
        const existing = grouped.get(interaction.trigger);
        if (existing) {
            existing.push(interaction);
            continue;
        }

        grouped.set(interaction.trigger, [interaction]);
    }

    return grouped;
}

function deriveDynamicChoiceSetSize(
    spec: ViewNode,
    parentSpec?: ViewNode,
): number | undefined {
    const normalizedType = spec.type.toLowerCase();
    if (normalizedType === 'tabs') {
        const count = spec.children?.length ?? 0;
        return count >= 2 ? count : undefined;
    }

    if (!parentSpec || !['button', 'link', 'tabitem'].includes(normalizedType)) {
        return undefined;
    }

    const choiceChildren = (parentSpec.children ?? []).filter((child) =>
        ['button', 'link', 'tabitem'].includes(child.type.toLowerCase()),
    );
    return choiceChildren.length >= 2 ? choiceChildren.length : undefined;
}

