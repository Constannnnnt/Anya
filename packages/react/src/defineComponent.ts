/**
 * @anya-ui/react — defineComponent
 *
 * Bundles a component's LLM schema (name, description, propsSchema)
 * with its React implementation into a single registration object.
 *
 * Like registering a tool — the definition IS the component.
 */

import type { ComponentType } from 'react';
import type { ZodType } from 'zod';
import type {
  ComponentCapability,
  UIInteractionMeasurementHint,
  UIInteractionRecord,
} from '@anya-ui/core';

// ─── Types ───────────────────────────────────────────────────────────────

/**
 * Props that every Anya component render function receives.
 */
export interface AnyaRenderProps<T = Record<string, unknown>> {
  /** Instance ID for this component */
  id: string;
  /** The validated props from the LLM */
  props: T;
  /** Report an interaction back to the framework */
  onInteraction: (
    action: UIInteractionRecord['action'],
    detail?: {
      trigger?: 'onClick' | 'onDoubleClick' | 'onMouseEnter' | 'onMouseLeave';
      propName?: string;
      previousValue?: unknown;
      newValue?: unknown;
      semanticDescription?: string;
      sourceId?: string;
      targetIds?: string[];
      targetAction?: string;
      measurementHint?: UIInteractionMeasurementHint;
    }
  ) => void;
  /** Elements this component's state natively binds to */
  bindTo?: string[];
  /** Children (for nested components) */
  children?: React.ReactNode;
}

/**
 * A fully-defined Anya component: schema + implementation.
 */
export interface AnyaComponent<T extends ZodType = ZodType> {
  /** Unique component type name, e.g. "ColorSlider" */
  name: string;
  /** Human-readable description for the LLM */
  description: string;
  /** Zod schema defining the component's props */
  propsSchema: T;
  /** The React component that renders this tool */
  render: ComponentType<AnyaRenderProps<any>>;
  /** 1-5 Tool Use Examples (YAML format) for the LLM prompt */
  examples?: string[];
  /** Tags for search/discovery */
  tags?: string[];
  /** Optional capabilities used by this component */
  capabilities?: ComponentCapability[];
  /** Lifecycle hook called once on successful registration */
  onRegister?: () => void;
  /** Lifecycle hook called once on unregister */
  onUnregister?: () => void;
  /** Optional per-component interaction hook */
  onInteraction?: (interaction: UIInteractionRecord) => void;
}

/**
 * Definition input — same as AnyaComponent but with a generic render type.
 */
export interface DefineComponentInput<T extends ZodType = ZodType> {
  name: string;
  description: string;
  propsSchema: T;
  render: ComponentType<AnyaRenderProps<any>>;
  examples?: string[];
  tags?: string[];
  capabilities?: ComponentCapability[];
  onRegister?: () => void;
  onUnregister?: () => void;
  onInteraction?: (interaction: UIInteractionRecord) => void;
}

// ─── Factory ─────────────────────────────────────────────────────────────

/**
 * Define an Anya component — bundles LLM schema + React implementation.
 *
 * @example
 * const Slider = defineComponent({
 *   name: 'ColorSlider',
 *   description: 'A slider for adjusting numeric params',
 *   propsSchema: z.object({ label: z.string(), min: z.number(), ... }),
 *   render: ({ props, onInteraction }) => <input type="range" ... />,
 * });
 */
export function defineComponent<T extends ZodType>(
  input: DefineComponentInput<T>
): AnyaComponent<T> {
  return { ...input };
}
