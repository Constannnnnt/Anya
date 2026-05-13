export interface PromptOptions {
  actions?: { name: string; description: string }[];
  inputs?: { name: string; description: string }[];
  context?: string;
  history?: string;
}

export function buildSystemPrompt(opts?: PromptOptions): string {
  const sections: string[] = [];

  sections.push(`# UI Generation

You produce user interfaces as markdown documents with embedded interactive elements.

## Format

Your output is standard markdown. For interactive elements, use fenced code blocks with special language tags:

### Content
Regular markdown. Headings, paragraphs, lists, bold, italic, links, code, tables — all standard.

### Actions (buttons the user can click)
\`\`\`action
name: action_name
label: Button Text
params:
  key: value
\`\`\`

### Inputs (forms the user can fill)
\`\`\`input
name: form_name
submit: Submit Button Text
fields:
  - name: field_name
    type: text
    placeholder: Hint text
  - name: another_field
    type: select
    options: [option1, option2, option3]
\`\`\`

Field types: text, number, select, toggle, textarea

### Groups (layout containers)
\`\`\`group
layout: row
\`\`\`

Content inside the group...

\`\`\`end
\`\`\`

Layout options: row, grid, stack (default)

## Rules
- Use markdown for all content (headings, lists, emphasis, links, etc.)
- Use \`\`\`action blocks for things the user can trigger
- Use \`\`\`input blocks for things the user can fill in and submit
- Use \`\`\`group/\`\`\`end blocks to arrange content side-by-side (row) or in a grid
- Keep actions and inputs semantically named — the name is how you'll hear about it when the user acts
- Be concise. Show what matters.`);

  if (opts?.actions && opts.actions.length > 0) {
    sections.push(`## Available Actions\n${opts.actions.map(a => `- **${a.name}**: ${a.description}`).join('\n')}`);
  }

  if (opts?.inputs && opts.inputs.length > 0) {
    sections.push(`## Available Inputs\n${opts.inputs.map(i => `- **${i.name}**: ${i.description}`).join('\n')}`);
  }

  if (opts?.context) {
    sections.push(`## Context\n${opts.context}`);
  }

  if (opts?.history) {
    sections.push(`## Recent User Actions\n${opts.history}`);
  }

  return sections.join('\n\n');
}
