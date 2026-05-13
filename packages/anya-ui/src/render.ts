import { marked } from 'marked';
import type { Spec, SpecNode, ActionNode, InputNode, GroupNode, ContentNode, FieldDef } from './spec';
import { isAction, isInput, isGroup, isContent } from './spec';

export interface RenderOptions {
  onAction: (name: string, payload: { params?: Record<string, unknown>; values?: Record<string, unknown> }) => void;
}

export function render(spec: Spec, opts: RenderOptions): HTMLElement {
  const root = document.createElement('div');
  root.className = 'anya';
  for (const node of spec.nodes) {
    root.appendChild(renderNode(node, opts));
  }
  return root;
}

function renderNode(node: SpecNode, opts: RenderOptions): HTMLElement {
  if (isContent(node)) return renderContent(node);
  if (isAction(node)) return renderAction(node, opts);
  if (isInput(node)) return renderInput(node, opts);
  if (isGroup(node)) return renderGroup(node, opts);
  return renderContent({ markdown: '' });
}

function renderContent(node: ContentNode): HTMLElement {
  const div = document.createElement('div');
  div.className = 'anya-content';
  div.innerHTML = marked(node.markdown) as string;
  return div;
}

function renderAction(node: ActionNode, opts: RenderOptions): HTMLElement {
  const btn = document.createElement('button');
  btn.className = 'anya-action';
  btn.textContent = node.label;
  btn.type = 'button';
  if (node.disabled) {
    btn.disabled = true;
    btn.setAttribute('aria-disabled', 'true');
  }
  btn.addEventListener('click', () => {
    if (node.confirm && !confirm(node.confirm)) return;
    opts.onAction(node.action, { params: node.params });
  });
  return btn;
}

function renderInput(node: InputNode, opts: RenderOptions): HTMLElement {
  const form = document.createElement('form');
  form.className = 'anya-input';

  if (node.label) {
    const heading = document.createElement('label');
    heading.className = 'anya-input-label';
    heading.textContent = node.label;
    form.appendChild(heading);
  }

  for (const field of node.fields) {
    form.appendChild(renderField(field));
  }

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'anya-action';
  submitBtn.textContent = node.submit ?? 'Submit';
  form.appendChild(submitBtn);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const values: Record<string, unknown> = {};
    for (const field of node.fields) {
      const el = form.elements.namedItem(field.name);
      if (el instanceof HTMLInputElement) {
        if (field.type === 'toggle') {
          values[field.name] = el.checked;
        } else if (field.type === 'number') {
          values[field.name] = el.valueAsNumber;
        } else {
          values[field.name] = el.value;
        }
      } else if (el instanceof HTMLTextAreaElement) {
        values[field.name] = el.value;
      } else if (el instanceof HTMLSelectElement) {
        values[field.name] = el.value;
      }
    }
    opts.onAction(node.input, { values });
  });

  return form;
}

function renderField(field: FieldDef): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'anya-field';

  if (field.label) {
    const lbl = document.createElement('label');
    lbl.textContent = field.label;
    lbl.setAttribute('for', `anya-field-${field.name}`);
    wrapper.appendChild(lbl);
  }

  let input: HTMLElement;

  switch (field.type) {
    case 'textarea': {
      const ta = document.createElement('textarea');
      ta.name = field.name;
      ta.id = `anya-field-${field.name}`;
      if (field.placeholder) ta.placeholder = field.placeholder;
      if (field.value != null) ta.value = String(field.value);
      if (field.required) ta.required = true;
      input = ta;
      break;
    }
    case 'select': {
      const sel = document.createElement('select');
      sel.name = field.name;
      sel.id = `anya-field-${field.name}`;
      if (field.required) sel.required = true;
      for (const opt of field.options ?? []) {
        const option = document.createElement('option');
        option.value = opt;
        option.textContent = opt;
        if (field.value === opt) option.selected = true;
        sel.appendChild(option);
      }
      input = sel;
      break;
    }
    case 'toggle': {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.name = field.name;
      cb.id = `anya-field-${field.name}`;
      if (field.value) cb.checked = true;
      input = cb;
      break;
    }
    case 'number': {
      const num = document.createElement('input');
      num.type = 'number';
      num.name = field.name;
      num.id = `anya-field-${field.name}`;
      if (field.placeholder) num.placeholder = field.placeholder;
      if (field.value != null) num.value = String(field.value);
      if (field.required) num.required = true;
      input = num;
      break;
    }
    default: {
      const txt = document.createElement('input');
      txt.type = 'text';
      txt.name = field.name;
      txt.id = `anya-field-${field.name}`;
      if (field.placeholder) txt.placeholder = field.placeholder;
      if (field.value != null) txt.value = String(field.value);
      if (field.required) txt.required = true;
      input = txt;
      break;
    }
  }

  wrapper.appendChild(input);
  return wrapper;
}

function renderGroup(node: GroupNode, opts: RenderOptions): HTMLElement {
  const div = document.createElement('div');
  div.className = `anya-group anya-layout-${node.layout ?? 'stack'}`;
  for (const child of node.content) {
    div.appendChild(renderNode(child, opts));
  }
  return div;
}
