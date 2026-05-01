/**
 * ../react — Agent-agnostic React bindings for Anya UI.
 *
 * Primary API:
 *  - defineComponent()  → bundle schema + React component
 *  - <AnyaProvider>     → set up registry context
 *  - useAnyaUI()        → grouped agent/view/runtime facade
 *  - <AdaptiveRenderer> → render ViewSpec → React nodes
 */

// ─── Core ────────────────────────────────────────────────────────────────

export { defineComponent, type AnyaNode, type AnyaRenderProps, type DefineComponentInput } from './defineComponent';
export { AnyaProvider, useAnyaContext, type AnyaProviderProps, type AnyaContextValue } from './Provider';
export {
  useAnyaUI,
  type AppliedViewChangeToAppResult,
  type AppliedViewChangeToTemplateResult,
  type ApplyViewChangeToAppOptions,
  type ApplyViewChangeToTemplateOptions,
  type CompletedAgentSession,
  type CreateViewChangeDraftFromRecommendationOptions,
  type FinishAgentSessionOptions,
  type PublishViewOptions,
  type SaveSessionViewAsAppOptions,
  type SaveSessionViewAsTemplateOptions,
  type UseAnyaUI,
  type ViewChangeDraftResult,
} from './hooks/useAnyaUI';
export { AdaptiveRenderer, type AdaptiveRendererProps, type ComponentRegistry } from './AdaptiveRenderer';

// ─── Built-in Primitives (the legos) ─────────────────────────────────────

export {
  Heading, Text, Badge, Card, Section, Divider,
  Timeline, TimelineItem, List, ListItem,
  builtInPrimitives,
} from './primitives';
