/**
 * @anya-ui/core — ComponentCatalog
 *
 * Single responsibility: declarative registry of available UI components.
 * Holds component schemas, descriptions, and generates LLM-facing catalogs.
 */

import YAML from 'yaml';
import { z, type ZodType } from 'zod';

// ─── Component Definition ────────────────────────────────────────────────

export type ComponentCapability =
  | 'media_control'
  | 'drag_drop'
  | 'theme_mutation'
  | (string & {});

export interface ComponentDefinition<T extends ZodType = ZodType> {
  /** Unique component type name, e.g. "ColorSlider", "Timeline" */
  name: string;
  /** Human-readable description for the LLM */
  description: string;
  /** Zod schema defining the component's props */
  propsSchema: T;
  /** 1-5 Tool Use Examples (YAML format) for the LLM prompt */
  examples?: string[];
  /** Tags for search/discovery */
  tags?: string[];
  /** Optional capabilities used by the component plugin */
  capabilities?: ComponentCapability[];
}

type ChangeListener = () => void;

function stringifyPromptYaml(value: unknown): string {
  return YAML.stringify(value, { lineWidth: 0 }).trimEnd();
}

function getPropKeys(schema: ZodType): string[] {
  if (!(schema instanceof z.ZodObject)) {
    return [];
  }

  const shape = schema.shape as Record<string, ZodType>;
  return Object.keys(shape);
}

export interface ComponentCatalogOptions {
  /**
   * Optional allowlist for plugin capabilities.
   * If undefined or empty, all capabilities are allowed.
   */
  allowedCapabilities?: ComponentCapability[];
}

// ─── Catalog ─────────────────────────────────────────────────────────────

export class ComponentCatalog {
  private components = new Map<string, ComponentDefinition>();
  private listeners = new Set<ChangeListener>();
  private allowedCapabilities: Set<string> | null;

  constructor(opts?: ComponentCatalogOptions) {
    this.allowedCapabilities =
      opts?.allowedCapabilities && opts.allowedCapabilities.length > 0
        ? new Set(opts.allowedCapabilities)
        : null;
  }

  setAllowedCapabilities(capabilities?: ComponentCapability[]): void {
    this.allowedCapabilities =
      capabilities && capabilities.length > 0 ? new Set(capabilities) : null;
    this.notify();
  }

  getAllowedCapabilities(): ComponentCapability[] | null {
    if (!this.allowedCapabilities) return null;
    return Array.from(this.allowedCapabilities) as ComponentCapability[];
  }

  private assertCapabilitiesAllowed(def: ComponentDefinition): void {
    if (!this.allowedCapabilities || !def.capabilities?.length) return;

    const disallowed = def.capabilities.filter(
      (capability) => !this.allowedCapabilities!.has(capability)
    );

    if (disallowed.length > 0) {
      throw new Error(
        `[ComponentCatalog] Component '${def.name}' uses disallowed capabilities: ${disallowed.join(', ')}.`
      );
    }
  }

  register<T extends ZodType>(def: ComponentDefinition<T>): this {
    this.assertCapabilitiesAllowed(def);
    this.components.set(def.name, def);
    this.notify();
    return this;
  }

  unregister(name: string): boolean {
    const deleted = this.components.delete(name);
    if (deleted) this.notify();
    return deleted;
  }

  get(name: string): ComponentDefinition | undefined {
    return this.components.get(name);
  }

  has(name: string): boolean {
    return this.components.has(name);
  }

  list(): ComponentDefinition[] {
    return Array.from(this.components.values());
  }

  /** Subscribe to catalog changes. Returns unsubscribe fn. */
  onChange(fn: ChangeListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }

  /**
   * Generate the LLM-facing catalog in YAML format.
   * Injected into the system prompt so the LLM knows
   * what tools are available.
   */
  toLLMCatalog(): string {
    const payload = {
      components: Array.from(this.components.values()).map((comp) => {
        const entry: Record<string, unknown> = {
          name: comp.name,
          description: comp.description,
        };

        const props = getPropKeys(comp.propsSchema);
        if (props.length > 0) {
          entry.props = props;
        }
        if (comp.tags?.length) {
          entry.tags = [...comp.tags];
        }
        if (comp.capabilities?.length) {
          entry.capabilities = [...comp.capabilities];
        }
        if (comp.examples?.length) {
          entry.examples = [...comp.examples];
        }

        return entry;
      }),
    };

    return stringifyPromptYaml(payload);
  }
}
