/* indusmova — turning Wikipedia's HTML into something we can read and re-shape.
 *
 * Wikipedia hands back a very rich document (nav boxes, edit links, footnote
 * markers, infoboxes, galleries, protocol-relative image URLs). This module
 * cleans all of that into plain, safe nodes, then splits the result into the
 * pieces the answer builder and the article view actually want: a lead, a set
 * of topic sections, the fact boxes, the images and the citation list.
 */

import { stripTags } from './ui.js';

const DROP_SELECTORS = [
  'script', 'style', 'link', 'meta', 'noscript',
  '.mw-editsection', '.mw-empty-elt', '.navbox', '.vertical-navbox',
  '.metadata', '.ambox', '.mbox', '.sistersitebox', '.side-box',
  '.hatnote', '.rellink', '.dablink', '.seealso',
  '#toc', '.toc', '.mw-jump-link', '.noprint',
  '.mw-references-wrap', '.reflist', '.references',
  '.shortdescription', '.mw-indicators',
  '.navigation-not-searchable', '.catlinks', '#catlinks',
  '.mw-authority-control', '.authority-control',
  '.mbox-image', '.ombox', '.tmbox', '.cmbox', '.fmbox',
  // MathML carries a raw LaTeX annotation that reads as noise in prose; the
  // rendered image is kept instead (see replaceMath below).
  'math', 'annotation', '.mwe-math-mathml-inline', '.mwe-math-mathml-display',
  '.mw-kartographer-maplink', '.mw-cite-backlink',
];

const KEEP_TAGS = new Set([
  'P', 'DIV', 'SPAN', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'SUB', 'SUP', 'BR', 'HR',
  'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'DL', 'DT', 'DD',
  'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH', 'CAPTION',
  'FIGURE', 'FIGCAPTION', 'IMG', 'A', 'BLOCKQUOTE', 'Q', 'CITE', 'CODE', 'PRE',
  'ABBR', 'TIME', 'MARK', 'SMALL', 'BIG', 'ARTICLE', 'SECTION', 'ASIDE', 'MAIN',
  'HEADER', 'FOOTER', 'NAV', 'WBR', 'RUBY', 'RT', 'RP', 'BDI', 'BDO', 'DFN', 'KBD', 'SAMP', 'VAR',
]);

const SAFE_ATTR = new Set([
  'href', 'src', 'srcset', 'alt', 'title', 'class', 'id', 'colspan', 'rowspan',
  'scope', 'width', 'height', 'lang', 'dir', 'datetime', 'cite', 'loading', 'decoding', 'sizes',
]);

/** Parse an HTML string into a document, detached from the live page. */
export function toDoc(html) {
  return new DOMParser().parseFromString(`<div id="__root">${html || ''}</div>`, 'text/html');
}

/** Absolute https URL for a Wikimedia protocol-relative or relative asset. */
export function absoluteUrl(url, base = 'https://en.wikipedia.org') {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url.replace(/^http:/, 'https:');
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('/')) return base.replace(/\/$/, '') + url;
  return url;
}

/** Rewrite an in-article link so it stays inside indusmova where it can. */
export function routeHref(href) {
  if (!href) return null;
  const wiki = href.match(/^(?:https?:)?\/\/([a-z-]+)\.wikipedia\.org\/wiki\/(.+)$/i) || href.match(/^\/wiki\/(.+)$/);
  if (wiki) {
    const lang = wiki[2] ? wiki[1] : '';
    // A cross-reference can point at a section: /wiki/Chandrayaan-3#Design.
    // The fragment is a section anchor, not part of the title (F-10).
    const [pagePart, ...rest] = (wiki[2] || wiki[1]).split('#');
    const fragment = rest.join('#');
    let title;
    try { title = decodeURIComponent(pagePart); } catch { return null; }
    if (/^(File|Special|Help|Category|Portal|Wikipedia|Template|Talk):/i.test(title)) return null;
    const params = new URLSearchParams();
    if (lang) params.set('lang', lang);
    if (fragment) params.set('s', fragment);
    const query = params.toString();
    return {
      internal: true,
      href: `#/article/${encodeURIComponent(title.replace(/ /g, '_'))}${query ? `?${query}` : ''}`,
    };
  }
  if (/^(?:https?:)?\/\//i.test(href)) return { internal: false, href: absoluteUrl(href) };
  if (href.startsWith('#')) return { internal: true, href };
  return null;
}

/**
 * Turn Wikipedia's footnote markers into our own numbered citations.
 *
 * Wikipedia writes `<sup class="reference"><a href="#cite_note-x">[1]</a></sup>`
 * and keeps the matching entry in a list at the end. We read that list once,
 * renumber the markers 1..n in reading order, and point them at the reference
 * list we render ourselves — so the article carries inline citations near the
 * claims, as the audit asks.
 */
/**
 * Re-present a paragraph as one point per sentence.
 *
 * The reader asked for the article to read the way the breakdown reads: a line
 * starts, a full stop ends it, that is one point, then the next one below. The
 * inline links and citation markers are carried across, so nothing is lost by
 * the change — only the presentation.
 */
export function paragraphsToPoints(root) {
  const SENTENCE_END = /([.!?][\"'”’)\]]?)\s+(?=[A-Z0-9\"'“([\u0900-\u097F])/g;
  const skip = 'figure, figcaption, table, .infobox, .thumb, .reflist, .references, .navbox, blockquote';

  for (const p of [...root.querySelectorAll('p')]) {
    if (p.closest(skip)) continue;
    if ((p.textContent || '').trim().length < MIN_SENTENCE) continue;

    // Build the points from the paragraph's own nodes, so links, emphasis and
    // citation markers survive intact.
    const points = [];
    let current = [];
    const flush = () => { if (current.length) { points.push(current); current = []; } };

    for (const node of [...p.childNodes]) {
      if (node.nodeType !== 3) { current.push(node.cloneNode(true)); continue; }
      const text = node.textContent;
      let start = 0;
      SENTENCE_END.lastIndex = 0;
      let match;
      while ((match = SENTENCE_END.exec(text))) {
        const end = match.index + match[1].length;
        current.push(document.createTextNode(text.slice(start, end)));
        flush();
        start = end + (match[0].length - match[1].length);
      }
      if (start < text.length) current.push(document.createTextNode(text.slice(start)));
    }
    flush();

    if (points.length < 2) continue; // a single sentence reads better as prose

    const ul = document.createElement('ul');
    ul.className = 'line-list points-prose';
    for (const nodes of points) {
      const li = document.createElement('li');
      nodes.forEach((n) => li.append(n));
      ul.append(li);
    }
    p.replaceWith(ul);
  }
  return root;
}

/** The text of every reference, keyed by the id its marker points at. */
function collectReferenceTexts(root) {
  const texts = new Map();
  root.querySelectorAll('li[id^="cite_note"], ol.references > li, .references > li').forEach((li) => {
    if (!li.id || texts.has(li.id)) return;
    // A reference item carries an inline <style> block for its own citation
    // template; that is not part of the citation.
    const clone = li.cloneNode(true);
    clone.querySelectorAll('style, script, .mw-cite-backlink, .cite-bracket').forEach((n) => n.remove());
    const text = textOf(clone);
    if (text) texts.set(li.id, text);
  });
  return texts;
}

/**
 * Number the markers 1..n in the order a reader meets them, and return the
 * reference list in that same order. Runs *after* the junk is removed, so a
 * marker inside a navbox cannot steal a number.
 */
function numberCitations(root, texts) {
  const targetOf = (sup) => {
    const link = sup.querySelector('a[href^="#cite_note"], a[href^="#cite_ref"]');
    return link ? decodeURIComponent(link.getAttribute('href').slice(1)) : '';
  };

  // Number by first appearance in the text, the way a reader meets them.
  // Markers inside the infobox are not part of the reading text — the view
  // moves that box into the fact panel — so they must not take the first
  // numbers and leave the article starting at [11].
  const sups = [...root.querySelectorAll('sup.reference')]
    .filter((sup) => !sup.closest('table.infobox, .infobox'));
  const sequence = [];
  for (const sup of sups) {
    const t = targetOf(sup);
    if (t && !sequence.includes(t)) sequence.push(t);
  }

  // Number every marker that appears in the text, in the order it appears, so
  // the first citation a reader meets is [1] even if a reference item was not
  // found for it.
  const references = [];
  const number = new Map();
  for (const target of sequence) {
    number.set(target, references.length + 1);
    references.push(texts.get(target) || '');
  }
  for (const [id, text] of texts) {
    if (!number.has(id)) { number.set(id, references.length + 1); references.push(text); }
  }

  let fallback = references.length;
  for (const sup of sups) {
    const target = targetOf(sup);
    let n = number.get(target);
    if (!n) { fallback += 1; n = fallback; }
    const marker = root.ownerDocument.createElement('sup');
    marker.className = 'cite';
    const a = root.ownerDocument.createElement('a');
    a.setAttribute('href', `#ref-${n}`);
    a.textContent = `[${n}]`;
    marker.append(a);
    sup.replaceWith(marker);
  }

  return references;
}

/** Clean a subtree in place: drop junk, keep a safe tag/attribute set. */
function cleanSubtree(root) {
  // Math: keep the rendered formula image, drop the MathML annotation that
  // would otherwise leak raw LaTeX ({\displaystyle ...}) into the text.
  root.querySelectorAll('.mwe-math-element').forEach((node) => {
    const img = node.querySelector('img');
    if (img) node.replaceWith(img);
    else node.remove();
  });

  for (const sel of DROP_SELECTORS) root.querySelectorAll(sel).forEach((n) => n.remove());

  // Footnotes left behind as bare "[1]" superscripts. Our own numbered
  // markers look the same, so they are skipped — otherwise this pass would
  // delete the citations it was written to tidy up around (F-04).
  root.querySelectorAll('sup').forEach((sup) => {
    if (sup.classList.contains('cite')) return;
    // A real citation marker also reads "[1]", so it must be told apart from a
    // leftover bare footnote by the link it carries (F-04).
    if (sup.querySelector('a[href^="#cite"]')) return;
    if (/^\[\d+\]$/.test(sup.textContent.trim())) sup.remove();
  });

  // Walk everything and reduce to the allow-list.
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  const toUnwrap = [];
  let node = walker.nextNode();
  while (node) {
    const tag = node.tagName;
    if (!KEEP_TAGS.has(tag)) {
      toUnwrap.push(node);
    } else {
      for (const attr of [...node.attributes]) {
        const name = attr.name.toLowerCase();
        if (!SAFE_ATTR.has(name) && !name.startsWith('data-') && !name.startsWith('aria-')) {
          node.removeAttribute(attr.name);
        }
      }
      if (tag === 'IMG') {
        node.setAttribute('src', absoluteUrl(node.getAttribute('src')));
        if (node.hasAttribute('srcset')) {
          node.setAttribute('srcset', node.getAttribute('srcset').split(',').map((part) => {
            const [u, d] = part.trim().split(/\s+/, 2);
            return `${absoluteUrl(u)}${d ? ` ${d}` : ''}`;
          }).join(', '));
        }
        node.setAttribute('loading', 'lazy');
        node.setAttribute('decoding', 'async');
      }
      if (tag === 'A') {
        const routed = routeHref(node.getAttribute('href'));
        if (!routed) {
          node.removeAttribute('href');
        } else if (routed.internal) {
          node.setAttribute('href', routed.href);
        } else {
          node.setAttribute('href', routed.href);
          node.setAttribute('target', '_blank');
          node.setAttribute('rel', 'noopener noreferrer');
        }
      }
    }
    node = walker.nextNode();
  }
  // Unwrap in reverse so children are handled before parents.
  for (const n of toUnwrap.reverse()) {
    if (n.parentNode) {
      while (n.firstChild) n.parentNode.insertBefore(n.firstChild, n);
      n.remove();
    }
  }

  joinTextRuns(root);
  return root;
}

/**
 * Wikipedia's HTML routinely ends a link and starts the next word with no
 * space between the nodes (`</a>The first…`). textContent then reads as
 * "observationThe first". Where a text node follows another node with no
 * whitespace and starts with a capital or digit, insert the missing space.
 */
function joinTextRuns(root) {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const inserts = [];
  let node = walker.nextNode();
  while (node) {
    const prev = node.previousSibling;
    const text = node.nodeValue || '';
    if (prev && text) {
      const before = (prev.nodeType === Node.TEXT_NODE ? prev.nodeValue : prev.textContent) || '';
      const last = before.slice(-1);
      const first = text[0];
      if (last && !/\s/.test(last) && /[A-Z0-9\u0900-\u097F]/.test(first)) {
        inserts.push(node);
      }
    }
    node = walker.nextNode();
  }
  for (const n of inserts) n.nodeValue = ` ${n.nodeValue}`;
}

/** Clean raw article HTML and return a single container element. */
export function clean(html) {
  const doc = toDoc(html);
  const root = doc.getElementById('__root');
  // Read the reference texts while the list is still there, clean the rest,
  // then number the surviving markers in reading order.
  const texts = collectReferenceTexts(root);
  cleanSubtree(root);
  root.references = numberCitations(root, texts);
  return root;
}

/** Elements that are not prose: tables, captions, images and boxes. */
const NON_PROSE = 'table, figure, .thumb, .gallery, .infobox, .sidebar, .side-box, .navbox, .metadata, style, sup, .hatnote, .mw-editsection, .mw-empty-elt, .quotebox, .wikitable';

/**
 * Prose text only.
 *
 * The full article keeps its tables and infobox, but none of that belongs in
 * the sentences we quote — otherwise a reader gets "Predecessor Bindusara
 * Successor Dasharatha" as an answer. Strip the non-prose first, then read.
 */
export function proseText(node) {
  if (!node) return '';
  const clone = node.cloneNode(true);
  clone.querySelectorAll(NON_PROSE).forEach((n) => n.remove());
  labelLeadIns(clone);
  return stripNoise(textOf(clone));
}

/** Characters that only appear in IPA / pronunciation transcriptions. */
const IPA = /[\u0250-\u02AF\u02C8\u02CC\u02B0-\u02FF\u1D00-\u1D7F]/;

/**
 * Remove the pronunciation asides Wikipedia puts after a name —
 * "( ə-SHOH-kə; Sanskrit: [ɐˈɕoːkɐ], IAST: Aśoka; …)" — which otherwise turn
 * the first sentence of an article into unreadable noise. Ordinary
 * parentheses, like "(born 3 February 1984)", are left alone.
 */
export function stripNoise(text) {
  return String(text || '')
    .replace(/\([^()]*\)/g, (m) => (IPA.test(m) ? ' ' : m))
    .replace(/\[[^\[\]]*\]/g, (m) => (IPA.test(m) ? ' ' : m))
    .replace(/\s+([,;:.])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A paragraph that opens with a short bold phrase is a labelled clause
 * ("Modern research and observation The first detection…"). Give the label a
 * dash so it reads as one.
 */
function labelLeadIns(root) {
  root.querySelectorAll('p, li, dd, dt').forEach((block) => {
    const first = block.firstElementChild;
    if (!first || !/^(B|STRONG|EM|I)$/.test(first.tagName)) return;
    const label = (first.textContent || '').trim();
    if (!label || label.length > 48 || /[.!?:;]$/.test(label)) return;
    if (label.split(/\s+/).length > 6) return;
    const rest = block.textContent.slice(label.length).trimStart();
    if (!rest || !/^[A-Z\u0900-\u097F]/.test(rest)) return;
    first.after(root.ownerDocument.createTextNode(' — '));
  });
}

/** Plain text of a cleaned element, with block boundaries turned into spaces. */
export function textOf(node) {
  if (!node) return '';
  const clone = node.cloneNode(true);
  // MediaWiki's parse output packs block tags together with no whitespace, so
  // textContent would read "...87On 10 April...". Give every block a trailing
  // space and every <br> a space, then collapse.
  clone.querySelectorAll('br').forEach((br) => br.replaceWith(' '));
  clone.querySelectorAll('p, div, li, dd, dt, h1, h2, h3, h4, h5, h6, tr, td, th, caption, figcaption, blockquote, section, article')
    .forEach((el) => el.append(' '));
  const raw = clone.textContent || '';
  return stripTags(raw).replace(/\{\\displaystyle[^}]*\}/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Split prose into sentences, keeping the text readable. */
/**
 * Shorter than this and a fragment is a caption, a label or a table cell
 * rather than a sentence worth showing. Named, because the tests pin it down.
 */
export const MIN_SENTENCE = 25;

export function sentences(text) {
  const clean = stripNoise(String(text || ''))
    .replace(/\{\\displaystyle[^}]*\}/g, ' ')
    .replace(/\\[a-zA-Z]+(\{[^}]*\})?/g, ' ')
    // Words stuck together by markup with no space between the nodes.
    .replace(/([a-z\u0900-\u097F0-9])([A-Z\u0900-\u097F])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return [];
  // Abbreviations and initials shouldn't end a sentence.
  const guarded = clean.replace(
    /\b(?:Mr|Mrs|Ms|Dr|Prof|St|vs|etc|e\.g|i\.e|No|Fig|approx|ca|cf|Sr|Jr|Ltd|Inc|Co|Gov|Gen|Col|Capt|Lt|Sgt|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|c|r|b|d|fl|n|p|pp|ed|trans|lit|viz|al)\./g,
    (m) => m.replace(/\./g, '\u0001'),
  );
  return guarded
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'“(\u0900-\u097F])/)
    .map((s) => s.replace(/\u0001/g, '.').replace(/\s+/g, ' ').trim())
    .filter((s) => s.length >= MIN_SENTENCE)
    // Drop anything that is mostly symbols — infobox fragments, formula
    // leftovers, table captions — rather than readable prose.
    .filter((s) => {
      const letters = (s.match(/[\p{L}\p{N}]/gu) || []).length;
      return letters / s.length > 0.6;
    });
}

/**
 * Split a cleaned article into its parts.
 * Returns { lead, sections, infobox, factboxes, images, tables, citations }.
 */
export function splitArticle(root, sectionMeta = []) {
  const container = root.cloneNode(true);

  // Modern MediaWiki output wraps the whole body in `.mw-parser-output` and
  // every heading in a `.mw-heading` div. Unwrap the first and treat the
  // second as the heading, or the article looks like one long empty lead.
  container.querySelectorAll('.mw-parser-output').forEach((wrapper) => {
    const parent = wrapper.parentNode;
    if (!parent) return;
    while (wrapper.firstChild) parent.insertBefore(wrapper.firstChild, wrapper);
    wrapper.remove();
  });

  const headingOf = (node) => {
    if (!node || node.nodeType !== 1) return null;
    if (/^H[1-6]$/.test(node.tagName)) return node;
    if (node.classList && (node.classList.contains('mw-heading') || node.classList.contains('mw-heading2') || node.classList.contains('mw-heading3'))) {
      return node.querySelector('h1, h2, h3, h4, h5, h6');
    }
    return null;
  };

  const SKIP = /^(references|notes|external links|see also|further reading|bibliography|sources|citations|footnotes|works cited)$/i;

  const infobox = container.querySelector('table.infobox, .infobox');
  const factboxes = [...container.querySelectorAll('.factbox, table.factbox')];
  const tables = [...container.querySelectorAll('table')].filter((t) => !t.classList.contains('infobox'));

  const images = collectImages(container);

  // A flat list of the article's top-level blocks, each tagged with the heading
  // it starts, if it is one.
  const blocks = [...container.children].map((node) => ({ node, heading: headingOf(node) }));
  const firstHeadingAt = blocks.findIndex((b) => b.heading);
  const isRealHeading = (h) => h && !SKIP.test(h.textContent.trim()) && !/^cite_note/i.test(h.id || '');

  // The lead is everything before the first real heading.
  const lead = document.createElement('div');
  lead.className = 'prose';
  const stop = firstHeadingAt < 0 ? blocks.length : firstHeadingAt;
  for (let i = 0; i < stop; i++) lead.append(blocks[i].node.cloneNode(true));

  // Sections: from each heading to the next heading of the same or higher level.
  const sections = [];
  blocks.forEach((block, i) => {
    const h = block.heading;
    if (!isRealHeading(h)) return;
    const level = Number(h.tagName.slice(1)) || 2;
    const body = document.createElement('div');
    body.className = 'prose';
    for (let j = i + 1; j < blocks.length; j++) {
      const nextH = blocks[j].heading;
      if (nextH) {
        const nextLevel = Number(nextH.tagName.slice(1)) || 2;
        if (nextLevel <= level) break;
        // A deeper heading is its own section; skip it here so a section's
        // text does not begin with the next subsection's title.
        continue;
      }
      body.append(blocks[j].node.cloneNode(true));
    }
    const id = h.id || body.querySelector('[id]')?.id || `section-${i}`;
    const meta = sectionMeta.find((s) => s.id === id) || {};
    if (textOf(body).length > 40) {
      sections.push({
        id,
        // The API's section label can carry markup ("<i>Vikram</i> lander").
        line: stripTags(meta.line || h.textContent || '').trim(),
        level: meta.level || level,
        index: meta.index || String(sections.length + 1),
        number: meta.number || '',
        html: body.innerHTML,
        text: proseText(body),
        images: collectImages(body).slice(0, 4),
      });
    }
  });

  const citations = [...container.querySelectorAll('ol.references li, .references li, cite')]
    .map((li) => textOf(li))
    .filter(Boolean);

  return {
    leadHtml: lead.innerHTML,
    leadText: proseText(lead),
    sections,
    infoboxHtml: infobox ? infobox.outerHTML : '',
    factboxes: factboxes.map((f) => f.outerHTML),
    tables: tables.slice(0, 6).map((t) => t.outerHTML),
    images,
    citations,
    references: root.references || [],
  };
}

/**
 * Every real picture in a document, in order, with its caption.
 *
 * Wikipedia's HTML also carries rendered formulas, 20px icons and category
 * symbols. Those are not pictures a reader wants, so they are filtered out —
 * but nothing else is, so no illustration is missed.
 */
export function collectImages(root) {
  const out = [];
  const seen = new Set();
  for (const img of root.querySelectorAll('img')) {
    const src = absoluteUrl(img.getAttribute('src'));
    if (!src || seen.has(src)) continue;
    if (/\/media\/math\/render\//.test(src)) continue;          // rendered formulas
    if (/\.svg($|\?)/i.test(src) && !/\.svg\.png/i.test(src)) continue; // raw vector icons
    const alt = (img.getAttribute('alt') || '').trim();
    if (/^(icon|edit|symbol|logo|flag icon)$/i.test(alt)) continue;
    const w = Number(img.getAttribute('width')) || 0;
    const h = Number(img.getAttribute('height')) || 0;
    if (w && h && w < 80 && h < 80) continue;                     // tiny chrome
    if (/\/20px-|\/25px-|Symbol_/.test(src)) continue;
    seen.add(src);
    // The File: page the image came from, so its own licence can be read.
    const link = img.closest('a[href*="/wiki/File:"], a[href*="/wiki/Special:Redirect/file/"]');
    let file = '';
    if (link) {
      try { file = decodeURIComponent(link.getAttribute('href').split('/wiki/').pop()); } catch { file = ''; }
    } else {
      const guess = src.match(/\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/]+?)(?:\.(?:jpg|jpeg|png|gif|webp|tif|tiff|svg)|\/)/i)?.[1] || '';
      try { file = decodeURIComponent(guess); } catch { file = guess; }
    }
    file = file.replace(/_/g, ' ').trim();
    out.push({
      src,
      alt,
      file: file ? `File:${file}` : '',
      width: w,
      height: h,
      caption: textOf(img.closest('figure, .thumb, .thumbinner')?.querySelector('figcaption, .thumbcaption') || null),
    });
  }
  return out;
}

/** A short, readable plain-text version of an article, for the answer model. */
export function plainText(html, { max = 6000 } = {}) {
  const root = clean(html);
  const text = textOf(root);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Count words in a cleaned element. */
export function wordCount(html) {
  return textOf(typeof html === 'string' ? clean(html) : html).split(/\s+/).filter(Boolean).length;
}
