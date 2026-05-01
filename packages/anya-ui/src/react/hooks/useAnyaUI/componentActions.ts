import { getLogger } from '../../../core';
import type { AnyaContextValue } from '../../Provider';
import type { AnyaNode } from '../../defineComponent';

export function runPluginHook(
  plugin: AnyaNode | undefined,
  hook: 'onRegister' | 'onUnregister',
  label: string,
): void {
  if (!plugin) return;
  const fn = plugin[hook];
  if (!fn) return;

  try {
    fn();
  } catch (error) {
    getLogger().warn(`[useAnyaUI.${label}] ${hook} hook failed for '${plugin.name}'.`, error);
  }
}

export function removeNodeRegistrationRun(
  ctx: AnyaContextValue,
  name: string,
): void {
  const node = ctx.nodeMap.get(name);
  runPluginHook(node, 'onUnregister', 'unregister');
  ctx.catalog.unregister(name);
  ctx.nodeRenderMap.delete(name);
  ctx.nodeMap.delete(name);
}

export function registerNodeRun(
  ctx: AnyaContextValue,
  node: AnyaNode,
  removeNodeRegistration: (name: string) => void,
): () => void {
  const previousNode = ctx.nodeMap.get(node.name);

  ctx.catalog.register({
    name: node.name,
    description: node.description,
    propsSchema: node.propsSchema,
    examples: node.examples,
    tags: node.tags,
    capabilities: node.capabilities,
  });

  if (previousNode && previousNode !== node) {
    runPluginHook(previousNode, 'onUnregister', 'register');
  }

  ctx.nodeRenderMap.set(node.name, node.render);
  ctx.nodeMap.set(node.name, node);
  runPluginHook(node, 'onRegister', 'register');

  return () => removeNodeRegistration(node.name);
}
