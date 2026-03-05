/**
 * @anya-ui/core — ComponentCatalog
 *
 * Single responsibility: declarative registry of available UI components.
 * Holds component schemas, descriptions, and generates LLM-facing catalogs.
 */

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
    const lines: string[] = ['components:'];
    for (const comp of this.components.values()) {
      lines.push(`  - name: ${comp.name}`);
      lines.push(`    description: ${comp.description}`);
      if (comp.propsSchema instanceof z.ZodObject) {
        const shape = comp.propsSchema.shape as Record<string, ZodType>;
        const propKeys = Object.keys(shape);
        if (propKeys.length > 0) {
          lines.push(`    props: [${propKeys.join(', ')}]`);
        }
      }
      if (comp.tags?.length) {
        lines.push(`    tags: [${comp.tags.join(', ')}]`);
      }
      if (comp.capabilities?.length) {
        lines.push(`    capabilities: [${comp.capabilities.join(', ')}]`);
      }
      if (comp.examples?.length) {
        lines.push(`    examples:`);
        for (const ex of comp.examples) {
          const exLines = ex.split('\n');
          lines.push(`      - |`);
          for (const el of exLines) {
            lines.push(`          ${el}`);
          }
        }
      }
    }
    return lines.join('\n');
  }
}
