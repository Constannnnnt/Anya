import { describe, expect, it } from 'vitest';
import { ViewRegistry } from '../views';

describe('ViewRegistry', () => {
  it('stores app views and templates separately', () => {
    const registry = new ViewRegistry();

    registry.registerAppView({
      id: 'orders-main',
      title: 'Orders',
      workflow: 'orders',
      spec: {
        layout: 'stack',
        nodes: [], }, });
    registry.registerTemplate({
      id: 'orders-summary',
      title: 'Orders Summary',
      workflow: 'orders',
      spec: {
        layout: 'grid',
        nodes: [], }, });

    expect(registry.listAppViews()).toEqual([
      expect.objectContaining({ id: 'orders-main', title: 'Orders' }),
    ]);
    expect(registry.listTemplates()).toEqual([
      expect.objectContaining({ id: 'orders-summary', title: 'Orders Summary' }),
    ]); });

  it('creates a generated or app view from a template and can promote the current view back into a template', () => {
    const registry = new ViewRegistry();

    registry.registerTemplate({
      id: 'profile-template',
      title: 'Profile Template',
      workflow: 'profile',
      spec: {
        layout: 'stack',
        nodes: [{ id: 'h1', type: 'Heading', props: { text: 'Profile' } }], }, });

    const generated = registry.createViewFromTemplate('profile-template');
    const appView = registry.createViewFromTemplate('profile-template', {
      id: 'profile-main',
      kind: 'app',
      title: 'Profile Main', });

    expect(generated).toEqual(
      expect.objectContaining({
        kind: 'generated',
        templateId: 'profile-template', }),
    );
    expect(appView).toEqual(
      expect.objectContaining({
        id: 'profile-main',
        kind: 'app',
        title: 'Profile Main',
        templateId: 'profile-template', }),
    );

    const promoted = registry.promoteViewToTemplate({
      id: 'profile-saved',
      title: 'Saved Profile',
      sourceViewId: 'profile-main',
      spec: appView!.spec,
      bindings: [], });

    expect(promoted).toEqual(
      expect.objectContaining({
        id: 'profile-saved',
        sourceViewId: 'profile-main', }),
    );
    expect(registry.getTemplate('profile-saved')).toEqual(
      expect.objectContaining({ title: 'Saved Profile' }),
    ); }); });
