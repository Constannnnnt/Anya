import React from 'react';
import {
    CheckCircle2,
    Circle,
    CircleAlert,
    CirclePlay,
    ExternalLink,
    GitBranch,
    Image as ImageIcon,
    Info,
    List,
    ListOrdered,
    Network,
    Play,
    Sparkles,
    Split,
    Video,
    Waypoints,
    Workflow,
    XCircle,
    type LucideIcon,
} from 'lucide-react';

type IconSize = 'sm' | 'md' | 'lg';

const ICON_COMPONENTS: Record<string, LucideIcon> = {
    check: CheckCircle2,
    'check-circle': CheckCircle2,
    'check-circle-2': CheckCircle2,
    circle: Circle,
    'circle-alert': CircleAlert,
    'circle-play': CirclePlay,
    'external-link': ExternalLink,
    'git-branch': GitBranch,
    image: ImageIcon,
    info: Info,
    list: List,
    'list-ordered': ListOrdered,
    network: Network,
    play: Play,
    sparkles: Sparkles,
    split: Split,
    video: Video,
    waypoints: Waypoints,
    workflow: Workflow,
    x: XCircle,
    'x-circle': XCircle,
};

const ICON_ALIASES: Record<string, string> = {
    call_split: 'split',
    external: 'external-link',
    format_list_bulleted: 'list',
    format_list_numbered: 'list-ordered',
    hub: 'network',
    info_outline: 'info',
    play_circle: 'circle-play',
};

function normalizeIconKey(value: string): string {
    return value
        .trim()
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/[\s_]+/g, '-')
        .toLowerCase();
}

function looksLikeInlineGlyph(value: string): boolean {
    const trimmed = value.trim();
    if (!trimmed) return false;
    if (trimmed.length <= 2) return true;
    return /[^\x20-\x7E]/.test(trimmed);
}

function getIconComponent(name: string): LucideIcon | null {
    const normalized = normalizeIconKey(name);
    const resolved = ICON_ALIASES[normalized] ?? normalized;
    return ICON_COMPONENTS[resolved] ?? null;
}

function getIconPixelSize(size: IconSize): number {
    switch (size) {
        case 'sm':
            return 14;
        case 'lg':
            return 22;
        default:
            return 18;
    }
}

export function renderIconToken(
    value: string | undefined,
    options?: {
        className?: string;
        size?: IconSize;
        color?: string;
    }
): React.ReactNode {
    if (!value) return null;

    const trimmed = value.trim();
    const Component = getIconComponent(trimmed);
    if (Component) {
        const size = options?.size ?? 'md';
        return (
            <Component
                className={`anya-icon anya-icon-${size} ${options?.className ?? ''}`.trim()}
                size={getIconPixelSize(size)}
                color={options?.color}
                aria-hidden="true"
                strokeWidth={2}
            />
        );
    }

    if (!looksLikeInlineGlyph(trimmed)) return null;

    return (
        <span
            className={`anya-icon anya-icon-${options?.size ?? 'md'} ${options?.className ?? ''}`.trim()}
            style={options?.color ? { color: options.color } : undefined}
            aria-hidden="true"
        >
            {trimmed}
        </span>
    );
}
