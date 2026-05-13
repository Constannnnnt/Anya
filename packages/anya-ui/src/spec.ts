export interface ActionNode {
  action: string;
  label: string;
  params?: Record<string, unknown>;
  confirm?: string;
  disabled?: boolean;
}

export interface FieldDef {
  name: string;
  type?: 'text' | 'number' | 'select' | 'toggle' | 'textarea';
  label?: string;
  placeholder?: string;
  options?: string[];
  value?: unknown;
  required?: boolean;
}

export interface InputNode {
  input: string;
  label?: string;
  fields: FieldDef[];
  submit?: string;
}

export interface GroupNode {
  layout?: 'row' | 'grid' | 'stack';
  content: SpecNode[];
}

export interface ContentNode {
  markdown: string;
}

export type SpecNode = ContentNode | ActionNode | InputNode | GroupNode;

export interface Spec {
  nodes: SpecNode[];
}

export interface ActionFeedback {
  action: string;
  params?: Record<string, unknown>;
  values?: Record<string, unknown>;
  timestamp: number;
}

export function isAction(n: SpecNode): n is ActionNode {
  return 'action' in n;
}

export function isInput(n: SpecNode): n is InputNode {
  return 'input' in n;
}

export function isGroup(n: SpecNode): n is GroupNode {
  return 'layout' in n || 'content' in n;
}

export function isContent(n: SpecNode): n is ContentNode {
  return 'markdown' in n;
}
