/* indusmova — Markdown export.
 *
 * "Markdown you can keep" is one of the promises in the footer, so the
 * conversion has to be honest: headings become headings, lists become lists,
 * tables become pipe tables, and every source is listed at the end with its
 * URL. It works on a cleaned article element (see parse.js) or on an answer.
 */

import { textOf } from './parse.js';
import { SITE } from './config.js';

function inline(node) {
  let out = '';
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      out += child.textContent.replace(/\s+/g, ' ');
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const tag = child.tagName;
    const inner = inline(child);
    if (!inner.trim() && tag !== 'BR' && tag !== 'IMG') continue;
    switch (tag) {
      case 'B': case 'STRONG': out += `**${inner.trim()}**`; break;
      case 'I': case 'EM': out += `*${inner.trim()}*`; break;
      case 'CODE': out += `\`${inner.trim()}\``; break;
      case 'SUP': break;
      case 'SUB': out += `~${inner.trim()}~`; break;
      case 'BR': out += '  \n'; break;
      case 'IMG': {
        const alt = child.getAttribute('alt') || '';
        const src = child.getAttribute('src') || '';
        if (src) out += `![${alt}](${src})`;
        break;
      }
      case 'A': {
        const href = child.getAttribute('href') || '';
        const label = inner.trim();
        if (!label) break;
        out += href ? `[${label}](${href})` : label;
        break;
      }
      case 'FIGURE': out += inner; break;
      case 'FIGCAPTION': out += inner.trim() ? `\n\n*${inner.trim()}*\n\n` : ''; break;
      default: out += inner;
    }
  }
  return out;
}

function block(node, depth = 0) {
  const tag = node.tagName;
  switch (tag) {
    case 'H1': return `# ${textOf(node)}\n\n`;
    case 'H2': return `\n## ${textOf(node)}\n\n`;
    case 'H3': return `\n### ${textOf(node)}\n\n`;
    case 'H4': case 'H5': case 'H6': return `\n#### ${textOf(node)}\n\n`;
    case 'P': {
      const text = inline(node).trim();
      return text ? `${text}\n\n` : '';
    }
    case 'UL': return [...node.children].map((li) => `${'  '.repeat(depth)}- ${inline(li).trim()}`).join('\n') + '\n\n';
    case 'OL': return [...node.children].map((li, i) => `${'  '.repeat(depth)}${i + 1}. ${inline(li).trim()}`).join('\n') + '\n\n';
    case 'DL': return [...node.children].map((li) => `${li.tagName === 'DT' ? '**' : ''}${inline(li).trim()}${li.tagName === 'DT' ? '**' : ''}`).join('\n') + '\n\n';
    case 'BLOCKQUOTE': return `> ${inline(node).trim().replace(/\n/g, '\n> ')}\n\n`;
    case 'FIGURE': {
      const img = node.querySelector('img');
      const cap = node.querySelector('figcaption');
      let out = '';
      if (img) out += `![${img.getAttribute('alt') || ''}](${img.getAttribute('src') || ''})\n\n`;
      if (cap && textOf(cap)) out += `*${textOf(cap)}*\n\n`;
      return out;
    }
    case 'TABLE': return table(node);
    case 'HR': return '---\n\n';
    case 'PRE': return `\`\`\`\n${node.textContent.trim()}\n\`\`\`\n\n`;
    default: {
      if (node.children.length === 0) {
        const text = textOf(node);
        return text ? `${text}\n\n` : '';
      }
      return [...node.children].map((c) => block(c, depth)).join('');
    }
  }
}

function table(node) {
  const rows = [...node.querySelectorAll('tr')].map((tr) =>
    [...tr.children].map((cell) => inline(cell).trim().replace(/\|/g, '\\|').replace(/\n/g, ' ')));
  if (!rows.length) return '';
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (r) => [...r, ...Array(width - r.length).fill('')];
  const [head, ...body] = rows;
  let out = `| ${pad(head).join(' | ')} |\n| ${Array(width).fill('---').join(' | ')} |\n`;
  out += body.map((r) => `| ${pad(r).join(' | ')} |`).join('\n');
  return `${out}\n\n`;
}

/** Convert a cleaned article element to Markdown. */
export function articleToMarkdown(root, { title = '', url = '', sources = [] } = {}) {
  let out = '';
  if (title) out += `# ${title}\n\n`;
  out += [...root.children].map((child) => block(child)).join('');
  out = out.replace(/\n{3,}/g, '\n\n').trim();
  if (url) out += `\n\n---\n\nSource: [${title || url}](${url}) — read on indusmova (${SITE.origin}).`;
  if (sources.length) {
    out += '\n\n### Sources\n';
    out += sources.map((s) => `- [${s.name || s.title}](${s.url})`).join('\n');
  }
  return `${out}\n`;
}

/** Convert a composed answer object to Markdown. */
export function answerToMarkdown(answer, { url = '' } = {}) {
  const lines = [];
  lines.push(`# ${answer.question || answer.title}`);
  lines.push('');
  lines.push(`*Answered from published sources by indusmova (${SITE.origin}).*`);
  lines.push('');
  if (answer.core?.length) {
    lines.push('## Answer');
    lines.push('');
    answer.core.forEach((s) => lines.push(`- ${s}`));
    lines.push('');
  }
  if (answer.keyPoints?.length) {
    lines.push('## Key points');
    lines.push('');
    answer.keyPoints.forEach((p) => lines.push(`- ${p.text}${p.section ? `  \n  *— ${p.section}*` : ''}`));
    lines.push('');
  }
  if (answer.topics?.length) {
    lines.push('## In depth');
    lines.push('');
    for (const topic of answer.topics) {
      lines.push(`### ${topic.title}`);
      lines.push('');
      topic.points.forEach((p) => lines.push(`- ${p}`));
      lines.push('');
    }
  }
  if (answer.facts?.length) {
    lines.push('## Facts');
    lines.push('');
    answer.facts.forEach((f) => lines.push(`- **${f.label}:** ${f.value}`));
    lines.push('');
  }
  if (answer.citations?.length) {
    lines.push('## Citations');
    lines.push('');
    answer.citations.forEach((c, i) => lines.push(`${i + 1}. ${c}`));
    lines.push('');
  }
  if (url) {
    lines.push('---');
    lines.push('');
    lines.push(`Source: [${answer.title}](${url}) — via indusmova.`);
  }
  return `${lines.join('\n')}\n`;
}

export function download(filename, text) {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.md') ? filename : `${filename}.md`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
