/**
 * ../../core — NodeCatalog
 *
 * Single responsibility: declarative registry of available UI nodes.
 * Holds component schemas, descriptions, and generates LLM-facing catalogs.
 */

import YAML from 'yaml';
import { z, type ZodType } from 'zod';

// ─── Component Definition ────────────────────────────────────────────────

export type NodeCapability =
  | 'media_control'
  | 'drag_drop'
  | 'theme_mutation'
  | (string & {});

export interface NodeDefinition<T extends ZodType = ZodType> {
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
  capabilities?: NodeCapability[];
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

export interface NodeCatalogOptions {
  /**
   * Optional allowlist for plugin capabilities.
   * If undefined or empty, all capabilities are allowed.
   */
  allowedCapabilities?: NodeCapability[];
}

// ─── Catalog ─────────────────────────────────────────────────────────────

export class NodeCatalog {
  private nodes = new Map<string, NodeDefinition>();
  private listeners = new Set<ChangeListener>();
  private allowedCapabilities: Set<string> | null;

  constructor(opts?: NodeCatalogOptions) {
    this.allowedCapabilities =
      opts?.allowedCapabilities && opts.allowedCapabilities.length > 0
        ? new Set(opts.allowedCapabilities)
        : null;
  }

  setAllowedCapabilities(capabilities?: NodeCapability[]): void {
    this.allowedCapabilities =
      capabilities && capabilities.length > 0 ? new Set(capabilities) : null;
    this.notify();
  }

  getAllowedCapabilities(): NodeCapability[] | null {
    if (!this.allowedCapabilities) return null;
    return Array.from(this.allowedCapabilities) as NodeCapability[];
  }

  private assertCapabilitiesAllowed(def: NodeDefinition): void {
    if (!this.allowedCapabilities || !def.capabilities?.length) return;

    const disallowed = def.capabilities.filter(
      (capability) => !this.allowedCapabilities!.has(capability)
    );

    if (disallowed.length > 0) {
      throw new Error(
        `[NodeCatalog] Component '${def.name}' uses disallowed capabilities: ${disallowed.join(', ')}.`
      );
    }
  }

  register<T extends ZodType>(def: NodeDefinition<T>): this {
    this.assertCapabilitiesAllowed(def);
    this.nodes.set(def.name, def);
    this.notify();
    return this;
  }

  unregister(name: string): boolean {
    const deleted = this.nodes.delete(name);
    if (deleted) this.notify();
    return deleted;
  }

  get(name: string): NodeDefinition | undefined {
    return this.nodes.get(name);
  }

  has(name: string): boolean {
    return this.nodes.has(name);
  }

  list(): NodeDefinition[] {
    return Array.from(this.nodes.values());
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
    return this.toLLMDetailedCatalog();
  }

  /**
   * Generate a lightweight summary catalog for progressive disclosure (Round 1).
   * Contains only name, description, and tags — no props, examples, or capabilities.
   * Typically ~200 tokens for 50 nodes vs ~2000+ for the full catalog.
   */
  toLLMSummary(): string {
    const payload = {
      nodes: Array.from(this.nodes.values()).map((comp) => {
        const entry: Record<string, unknown> = {
          name: comp.name,
          description: comp.description,
        };
        if (comp.tags?.length) {
          entry.tags = [...comp.tags];
        }
        return entry;
      }),
    };

    return stringifyPromptYaml(payload);
  }

  /**
   * Generate a detailed catalog filtered to specific nodes (Round 2).
   * If no names are provided, returns the full catalog (backward-compatible).
   */
  toLLMDetailedCatalog(names?: string[]): string {
    const source = names && names.length > 0
      ? names
          .map((n) => this.nodes.get(n))
          .filter((c): c is NodeDefinition => c !== undefined)
      : Array.from(this.nodes.values());

    const payload = {
      nodes: source.map((comp) => {
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
