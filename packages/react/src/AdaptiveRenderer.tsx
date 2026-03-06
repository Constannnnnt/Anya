/**
 * @anya-ui/react — AdaptiveRenderer
 *
 * The core rendering component that takes a UIRenderSpec from your
 * agent and renders the corresponding React components.
 *
 * Components are auto-resolved from the Provider's registry.
 * No manual component registry prop needed (but supported as override).
 */

import React, { type ComponentType } from 'react';
import { getLogger, normalizeStyleProp, type UIRenderSpec, type UIComponentSpec, type UIInteractionRecord, type UIInteractionDefinition } from '@anya-ui/core';
import { useAnyaContext } from './Provider';
import type { AnyaComponent, AnyaRenderProps } from './defineComponent';

// ─── Types ───────────────────────────────────────────────────────────────

/** Optional manual component map (overrides auto-resolution) */
export type ComponentRegistry = Record<string, ComponentType<AnyaRenderProps<any>>>;

export interface AdaptiveRendererProps {
    /** The UI spec produced by the agent */
    spec: UIRenderSpec | null;
    /** Optional manual component map (overrides Provider registry) */
    registry?: ComponentRegistry;
    /** Callback when a component reports an interaction */
    onInteraction?: (componentName: string, record: Omit<UIInteractionRecord, 'timestamp'>) => void;
    /** Fallback for unknown components */
    fallback?: ComponentType<{ type: string }>;
}

function DefaultFallback({ type }: { type: string }) {
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
    fallback: FallbackComponent = DefaultFallback,
}: AdaptiveRendererProps) {
    // Auto-resolve from Provider if no manual registry
    let resolvedMap: Map<string, ComponentType<any>> | undefined;
    let pluginMap: Map<string, AnyaComponent> | undefined;
    try {
        const ctx = useAnyaContext();
        resolvedMap = ctx.componentMap;
        pluginMap = ctx.pluginMap;
    } catch {
        // Not in a provider — manual registry required
    }

    if (!spec) return null;

    const layoutStyle = getLayoutStyle(spec.layout);

    return (
        <div style={layoutStyle} data-anya-layout={spec.layout}>
            {spec.components.map((comp: UIComponentSpec) => (
                <MemoizedRenderComponent
                    key={comp.id}
                    spec={comp}
                    resolvedMap={resolvedMap}
                    pluginMap={pluginMap}
                    manualRegistry={manualRegistry}
                    onInteraction={onInteraction}
                    fallback={FallbackComponent}
                />
            ))}
        </div>
    );
}

// ─── Internal: Single Component Renderer ─────────────────────────────────

interface RenderComponentProps {
    spec: UIComponentSpec;
    resolvedMap?: Map<string, ComponentType<any>>;
    pluginMap?: Map<string, AnyaComponent>;
    manualRegistry?: ComponentRegistry;
    onInteraction?: (componentName: string, record: Omit<UIInteractionRecord, 'timestamp'>) => void;
    fallback: ComponentType<{ type: string }>;
}

function RenderComponent({
    spec,
    resolvedMap,
    pluginMap,
    manualRegistry,
    onInteraction,
    fallback: Fallback,
}: RenderComponentProps) {
    const logger = getLogger();
    // Try manual registry first, then auto-resolved map
    const Component =
        manualRegistry?.[spec.type] ??
        resolvedMap?.get(spec.type);

    if (!Component) {
        return <Fallback type={spec.type} />;
    }

    const handleInteraction: AnyaRenderProps['onInteraction'] = (action, detail) => {
        const record = {
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
        } as Omit<UIInteractionRecord, 'timestamp'>;

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

        onInteraction?.(spec.type, record);
    };

    // Generate native React event handlers from the agent's interaction specs
    const dynamicInteractions: Record<string, (event: React.SyntheticEvent) => void> = {};
    if (spec.interactions) {
        const grouped = new Map<UIInteractionDefinition['trigger'], UIInteractionDefinition[]>();
        spec.interactions.forEach((interaction) => {
            const existing = grouped.get(interaction.trigger);
            if (existing) {
                existing.push(interaction);
            } else {
                grouped.set(interaction.trigger, [interaction]);
            }
        });

        grouped.forEach((interactions, trigger) => {
            dynamicInteractions[trigger] = (event: React.SyntheticEvent) => {
                event.stopPropagation();
                for (const interaction of interactions) {
                    handleInteraction(interaction.action as UIInteractionRecord['action'], {
                        trigger: interaction.trigger,
                        semanticDescription: interaction.description,
                        targetIds: interaction.targetIds,
                        targetAction: interaction.targetAction,
                    });
                }
            };
        });
    }

    // Render children recursively
    const children = spec.children?.map((child: UIComponentSpec) => (
        <MemoizedRenderComponent
            key={child.id}
            spec={child}
            resolvedMap={resolvedMap}
            pluginMap={pluginMap}
            manualRegistry={manualRegistry}
            onInteraction={onInteraction}
            fallback={Fallback}
        />
    ));

    // Belt-and-suspenders: core translator should already normalize, but
    // guard here in case a spec bypasses the decoder.
    const safeProps: Record<string, unknown> & {
        style?: unknown;
        draggable?: boolean;
        dynamicInteractions: Record<string, (event: React.SyntheticEvent) => void>;
    } = {
        ...(spec.props as Record<string, unknown>),
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
        && prev.resolvedMap === next.resolvedMap
        && prev.pluginMap === next.pluginMap
        && prev.manualRegistry === next.manualRegistry
        && prev.onInteraction === next.onInteraction
        && prev.fallback === next.fallback
);

// ─── Layout Helpers ──────────────────────────────────────────────────────

function getLayoutStyle(layout: UIRenderSpec['layout']): React.CSSProperties {
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
