import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import {
  AccordionItem,
  Button,
  Checkbox,
  TabItem,
  Tabs,
  TextInput,
  Tooltip, } from '../primitives';

describe('stateful primitives', () => {
  it('syncs TextInput state when the value prop changes', () => {
    const TextInputComponent = TextInput.render;
    const onInteraction = vi.fn();
    const { rerender } = render(
      <TextInputComponent
        id="text-input"
        props={{ value: 'alpha' } }
        onInteraction={onInteraction }
      />
    );

    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('alpha');

    fireEvent.change(input, { target: { value: 'beta' } });
    expect(input.value).toBe('beta');

    rerender(
      <TextInputComponent
        id="text-input"
        props={{ value: 'gamma' } }
        onInteraction={onInteraction }
      />
    );

    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('gamma'); });

  it('syncs Checkbox state and forwards dynamic click interactions', () => {
    const CheckboxComponent = Checkbox.render;
    const onInteraction = vi.fn();
    const onClick = vi.fn();
    const { rerender } = render(
      <CheckboxComponent
        id="checkbox"
        props={{
          label: 'Terms',
          checked: false,
          dynamicInteractions: { onClick }, } }
        onInteraction={onInteraction }
      />
    );

    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    fireEvent.click(checkbox);
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(
      <CheckboxComponent
        id="checkbox"
        props={{
          label: 'Terms',
          checked: true,
          dynamicInteractions: { onClick }, } }
        onInteraction={onInteraction }
      />
    );

    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true); });

  it('syncs Tabs when defaultTab changes after mount', () => {
    const TabsComponent = Tabs.render;
    const TabItemComponent = TabItem.render;
    const onInteraction = vi.fn();

    const { rerender } = render(
      <TabsComponent id="tabs" props={{ defaultTab: 'One' } } onInteraction={onInteraction }>
        <TabItemComponent id="tab-one" props={{ label: 'One' } } onInteraction={onInteraction }>
          <div>Panel One</div>
        </TabItemComponent>
        <TabItemComponent id="tab-two" props={{ label: 'Two' } } onInteraction={onInteraction }>
          <div>Panel Two</div>
        </TabItemComponent>
      </TabsComponent>
    );

    expect(screen.getByRole('tabpanel').textContent).toContain('Panel One');

    rerender(
      <TabsComponent id="tabs" props={{ defaultTab: 'Two' } } onInteraction={onInteraction }>
        <TabItemComponent id="tab-one" props={{ label: 'One' } } onInteraction={onInteraction }>
          <div>Panel One</div>
        </TabItemComponent>
        <TabItemComponent id="tab-two" props={{ label: 'Two' } } onInteraction={onInteraction }>
          <div>Panel Two</div>
        </TabItemComponent>
      </TabsComponent>
    );

    expect(screen.getByRole('tabpanel').textContent).toContain('Panel Two'); });

  it('syncs AccordionItem expansion and forwards dynamic click interactions once', () => {
    const AccordionItemComponent = AccordionItem.render;
    const onInteraction = vi.fn();
    const onClick = vi.fn();
    const { rerender } = render(
      <AccordionItemComponent
        id="accordion-item"
        props={{
          title: 'Details',
          defaultExpanded: false,
          dynamicInteractions: { onClick }, } }
        onInteraction={onInteraction }
      >
        <div>Body</div>
      </AccordionItemComponent>
    );

    const trigger = screen.getByRole('button', { name: /details/i });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(trigger);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    rerender(
      <AccordionItemComponent
        id="accordion-item"
        props={{
          title: 'Details',
          defaultExpanded: true,
          dynamicInteractions: { onClick }, } }
        onInteraction={onInteraction }
      >
        <div>Body</div>
      </AccordionItemComponent>
    );

    expect(screen.getByRole('button', { name: /details/i }).getAttribute('aria-expanded')).toBe('true');

    rerender(
      <AccordionItemComponent
        id="accordion-item"
        props={{
          title: 'Details',
          defaultExpanded: false,
          dynamicInteractions: { onClick }, } }
        onInteraction={onInteraction }
      >
        <div>Body</div>
      </AccordionItemComponent>
    );

    expect(screen.getByRole('button', { name: /details/i }).getAttribute('aria-expanded')).toBe('false'); });

  it('keeps Tooltip visibility behavior while forwarding hover interactions', () => {
    const TooltipComponent = Tooltip.render;
    const onMouseEnter = vi.fn();
    const onMouseLeave = vi.fn();
    const { container } = render(
      <TooltipComponent
        id="tooltip"
        props={{
          text: 'Helpful hint',
          dynamicInteractions: {
            onMouseEnter,
            onMouseLeave, }, } }
        onInteraction={vi.fn() }
      >
        <button type="button">Trigger</button>
      </TooltipComponent>
    );

    const wrapper = container.querySelector('#tooltip') as HTMLElement;
    fireEvent.mouseEnter(wrapper);
    expect(onMouseEnter).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('tooltip').textContent).toContain('Helpful hint');

    fireEvent.mouseLeave(wrapper);
    expect(onMouseLeave).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('tooltip')).toBeNull(); });

  it('defaults Button to type=button so it does not submit parent forms', () => {
    const ButtonComponent = Button.render;
    const onSubmit = vi.fn((event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault(); });

    render(
      <form onSubmit={onSubmit }>
        <ButtonComponent id="save-button" props={{ label: 'Save' } } onInteraction={vi.fn() } />
      </form>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).not.toHaveBeenCalled(); }); });
