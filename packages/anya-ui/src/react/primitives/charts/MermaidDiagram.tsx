import React from 'react';
import { z } from 'zod';
import { defineComponent } from '../../defineComponent';
import type { PrimitiveBehaviorProps, PrimitiveRenderProps } from '../shared';

interface MermaidDiagramProps extends PrimitiveBehaviorProps {
    definition: string;
    title?: string;
    theme?: 'default' | 'dark' | 'neutral';
}

/**
 * Minimal sanitization for LLM-generated mermaid definitions.
 * Only handles the most critical transforms; we rely on the fallback
 * rendering for anything else.
 */
function sanitizeMermaidDefinition(raw: string): string {
    let def = raw.trim();

    // Strip markdown code fences that LLMs sometimes wrap definitions in
    def = def.replace(/^```(?:mermaid)?\s*/i, '').replace(/```\s*$/, '').trim();

    // Fix HTML entities that YAML serialization may produce
    def = def.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');

    // Fix escaped quotes from JSON/YAML serialization
    def = def.replace(/\\"/g, '"');

    // Fix double-escaped newlines from YAML
    def = def.replace(/\\n/g, '\n');

    return def;
}

/**
 * Strip mermaid style directives that are a common source of parse errors.
 */
function stripStyleDirectives(def: string): string {
    return def
        .split('\n')
        .filter(line => !line.trim().startsWith('style ') && !line.trim().startsWith('classDef '))
        .join('\n');
}

/**
 * Renders a Mermaid.js diagram from a text definition.
 * Uses direct DOM rendering for reliability with mermaid v11.
 * Falls back to a formatted code block if rendering fails.
 */
function MermaidRenderer({ id, props }: PrimitiveRenderProps<MermaidDiagramProps>) {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const [fallbackDef, setFallbackDef] = React.useState<string>('');
    const [loading, setLoading] = React.useState(true);

    const definition = props.definition ?? '';
    const theme = props.theme ?? 'dark';
    const [debouncedDefinition, setDebouncedDefinition] = React.useState('');

    // Debounce the definition to avoid rendering partial streaming chunks
    React.useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedDefinition(definition);
        }, 250);
        return () => clearTimeout(timer);
    }, [definition]);

    /**
     * Check if a mermaid definition looks "structurally complete" enough to attempt rendering.
     * Prevents rendering partial lines like "graph LR\n  A -->"
     */
    function isStructurallyComplete(def: string): boolean {
        const trimmed = def.trim();
        if (!trimmed) return false;
        
        // Always allow very short ones if they don't look like they are in mid-arrow
        if (trimmed.length < 20) return true;

        // If it starts with a common diagram type, look for at least one relationship or termination
        const lower = trimmed.toLowerCase();
        if (lower.startsWith('graph') || lower.startsWith('flowchart')) {
            // Must have an arrow or a node definition with a label or a newline/semicolon after first line
            return trimmed.includes('-->') || trimmed.includes('---') || (trimmed.match(/\n/g) || []).length > 1;
        }
        
        return true; // Default to true for other types for now
    }

    React.useEffect(() => {
        let cancelled = false;

        async function renderDiagram() {
            const sanitized = sanitizeMermaidDefinition(debouncedDefinition);
            if (!sanitized || !isStructurallyComplete(sanitized)) {
                if (containerRef.current) containerRef.current.innerHTML = '';
                setLoading(false);
                return;
            }

            try {
                setLoading(true);
                setFallbackDef('');

                // @ts-ignore -- CDN URL import resolved at runtime
                const mermaid = await import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.esm.min.mjs');
                if (cancelled) return;

                const mermaidApi = mermaid.default;
                mermaidApi.initialize({
                    startOnLoad: false,
                    theme,
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                    fontSize: 14,
                    securityLevel: 'loose',
                });

                const uniqueId = `mermaid-${id}-${Date.now()}`;

                try {
                    // First attempt: render as-is
                    const { svg } = await mermaidApi.render(uniqueId, sanitized);
                    if (!cancelled && containerRef.current) {
                        containerRef.current.innerHTML = svg;
                        setLoading(false);
                    }
                } catch {
                    // Second attempt: strip style directives and retry
                    const simplified = stripStyleDirectives(sanitized);
                    try {
                        const retryId = `mermaid-retry-${id}-${Date.now()}`;
                        const { svg } = await mermaidApi.render(retryId, simplified);
                        if (!cancelled && containerRef.current) {
                            containerRef.current.innerHTML = svg;
                            setLoading(false);
                        }
                    } catch {
                        // Final fallback: show as code block
                        if (!cancelled) {
                            setFallbackDef(sanitized);
                            setLoading(false);
                            if (containerRef.current) containerRef.current.innerHTML = '';
                        }
                    }
                }
            } catch {
                // Module import failed or other critical error
                if (!cancelled) {
                    setFallbackDef(sanitizeMermaidDefinition(definition));
                    setLoading(false);
                    if (containerRef.current) containerRef.current.innerHTML = '';
                }
            }
        }

        renderDiagram();
        return () => {
            cancelled = true;
            if (containerRef.current) containerRef.current.innerHTML = '';
        };
    }, [debouncedDefinition, theme, id]);

    return (
        <div
            id={id}
            className={`anya-mermaid-diagram ${props.className || ''}`}
            style={props.style}
            {...props.dynamicInteractions}
        >
            {props.title && (
                <div className="anya-mermaid-title">{props.title}</div>
            )}
            <div className="anya-mermaid-content">
                {loading && (
                    <div className="anya-mermaid-loading">
                        <span className="anya-mermaid-spinner" />
                    </div>
                )}
                {fallbackDef && (
                    <pre className="anya-mermaid-fallback" style={{
                        padding: 'var(--anya-space-4, 16px)',
                        background: 'var(--anya-bg-tertiary, #1a1a2e)',
                        borderRadius: 'var(--anya-radius-md, 8px)',
                        fontSize: '0.8rem',
                        lineHeight: 1.5,
                        overflow: 'auto',
                        whiteSpace: 'pre-wrap',
                        color: 'var(--anya-text-secondary, #aaa)',
                        border: '1px solid var(--anya-border-light, #333)',
                    }}>
                        {fallbackDef}
                    </pre>
                )}
                <div 
                    ref={containerRef} 
                    className="anya-mermaid-svg-container"
                    style={{ display: loading || fallbackDef ? 'none' : 'block' }} 
                />
            </div>
        </div>
    );
}

export const MermaidDiagram = defineComponent({
    name: 'MermaidDiagram',
    description:
        'Renders a Mermaid.js diagram. Supports flowcharts, sequence, ER, state, class, mindmap. Keep definitions simple: use graph LR or graph TD, plain text labels, --> arrows.',
    propsSchema: z.object({
        definition: z.string().describe('Mermaid diagram definition. Use YAML block scalar |. Keep it simple: graph LR/TD, --> arrows, plain labels.'),
        title: z.string().optional(),
        theme: z.enum(['default', 'dark', 'neutral']).optional(),
        className: z.string().optional(),
        style: z.record(z.any()).optional(),
    }),
    tags: ['diagram', 'data', 'visualization', 'mermaid'],
    examples: [
        'type: MermaidDiagram\nprops:\n  title: User Flow\n  definition: |\n    graph LR\n      A[Start] --> B{Login?}\n      B -->|Yes| C[Dashboard]\n      B -->|No| D[Sign Up]\n      D --> C',
        'type: MermaidDiagram\nprops:\n  title: System Architecture\n  definition: |\n    graph TD\n      Client[Web Client] --> API[API Server]\n      API --> DB[Database]\n      API --> Cache[Redis Cache]',
    ],
    render: MermaidRenderer,
});

