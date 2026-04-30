import { getLogger } from '@anya-ui/core';
import type { AnyaContextValue } from '../../Provider';
import type { AnyaComponent } from '../../defineComponent';

export function runPluginHook(
  plugin: AnyaComponent | undefined,
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

export function removeComponentRegistrationRun(
  ctx: AnyaContextValue,
  name: string,
): void {
  const plugin = ctx.pluginMap.get(name);
  runPluginHook(plugin, 'onUnregister', 'unregister');
  ctx.catalog.unregister(name);
  ctx.componentMap.delete(name);
  ctx.pluginMap.delete(name);
}

export function registerComponentRun(
  ctx: AnyaContextValue,
  component: AnyaComponent,
  removeComponentRegistration: (name: string) => void,
): () => void {
  const previousPlugin = ctx.pluginMap.get(component.name);

  ctx.catalog.register({
    name: component.name,
    description: component.description,
    propsSchema: component.propsSchema,
    examples: component.examples,
    tags: component.tags,
    capabilities: component.capabilities,
  });

  if (previousPlugin && previousPlugin !== component) {
    runPluginHook(previousPlugin, 'onUnregister', 'register');
  }

  ctx.componentMap.set(component.name, component.render);
  ctx.pluginMap.set(component.name, component);
  runPluginHook(component, 'onRegister', 'register');

  return () => removeComponentRegistration(component.name);
}
