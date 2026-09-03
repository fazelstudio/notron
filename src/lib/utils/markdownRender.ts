import { marked } from 'marked';

export type TocNode = {
  id: string;
  text: string;
  level: number;
  children: TocNode[];
};

export type RenderResult = {
  html: string;
  toc: TocNode[];
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-') || 'section';
}

function buildTree(headings: { id: string; text: string; level: number }[]): TocNode[] {
  const roots: TocNode[] = [];
  const stack: TocNode[] = [];
  for (const h of headings) {
    const node: TocNode = { id: h.id, text: h.text, level: h.level, children: [] };
    while (stack.length && stack[stack.length - 1].level >= node.level) stack.pop();
    if (stack.length) stack[stack.length - 1].children.push(node);
    else roots.push(node);
    stack.push(node);
  }
  return roots;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderMarkdown(content: string): RenderResult {
  const tokens = marked.lexer(content);
  const headings: { id: string; text: string; level: number }[] = [];
  const used = new Map<string, number>();
  for (const token of tokens) {
    if (token.type === 'heading') {
      const base = slugify(token.text);
      const count = used.get(base) || 0;
      used.set(base, count + 1);
      headings.push({ id: count === 0 ? base : `${base}-${count}`, text: token.text, level: token.depth });
    }
  }

  const renderer = new marked.Renderer();
  let i = 0;
  renderer.heading = function ({ tokens, depth }: { tokens: any[]; depth: number }) {
    const text = this.parser.parseInline(tokens);
    const id = headings[i++]?.id ?? '';
    return `<h${depth} id="${id}">${text}</h${depth}>`;
  };

  renderer.code = function ({ text, lang }: { text: string; lang?: string }) {
    const langClass = lang ? ` class="language-${lang}"` : '';
    const escaped = escapeHtml(text);
    return `<div class="md-code-block relative group"><pre${langClass ? '' : ''}><code${langClass}>${escaped}</code></pre><button class="md-copy-btn" data-md-copy="${escapeHtml(text)}" title="Copy code"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button></div>`;
  };

  const html = marked.parse(content, { renderer }) as string;
  return { html, toc: buildTree(headings) };
}
