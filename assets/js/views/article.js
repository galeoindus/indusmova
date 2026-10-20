/* indusmova — the article view.
 *
 * The full Wikipedia article, re-set in indusmova's own reading layout: a
 * title block, the action row (save, copy Markdown, download, share, open the
 * source), a sticky table of contents beside the prose, the infobox as a
 * factbox, a gallery for the images, and the sources underneath.
 *
 * A small tab strip switches between the readable article and its Markdown
 * export, so what you can copy is exactly what you can see.
 */

import { el, clamp, cleanUrl } from '../ui.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';
import { clean, wordCount } from '../parse.js';
import { articleToMarkdown, download } from '../markdown.js';
import { sectionHead, card, errorBox, emptyState, toast } from '../components.js';
import { articleHref, searchHref } from '../router.js';

export async function renderArticle(ctx, route) {
  const title = (route.params.title || '').replace(/_/g, ' ').trim();
  const wrap = el('div', { class: 'wrap' });

  if (!title) {
    wrap.append(emptyState({
      iconName: 'book', title: t('notFound'), body: t('notFoundBody'),
      cta: t('goHome'), ctaHref: '#/',
    }));
    return wrap;
  }

  const mount = el('div');
  mount.append(el('div', { class: 'state', html: `<span class="spinner" aria-hidden="true"></span><p>${t('loading')}</p>` }));
  wrap.append(mount);
  build(ctx, mount, title);
  return wrap;
}

async function build(ctx, mount, title, retry = 0) {
  const route = ctx.route || {};
  const lang = route.query?.lang || ctx.state.contentLang;
  try {
    const data = await ctx.api.article(lang, title);
    const root = clean(data.html);
    render(ctx, mount, { data, root, lang });
    ctx.pushHistory({ id: `article:${lang}:${data.title}`, kind: 'article', title: data.title, lang, url: articleHref(data.title, lang) });
  } catch (err) {
    mount.innerHTML = '';
    const message = err?.status === 404 ? t('notFoundBody') : err?.message;
    mount.append(errorBox(message, { onRetry: () => build(ctx, mount, title, retry + 1) }));
    if (err?.name === 'ApiError' && err.status !== 404 && retry === 0) {
      setTimeout(() => build(ctx, mount, title, 1), 600);
    }
  }
}

function render(ctx, mount, { data, root, lang }) {
  mount.innerHTML = '';
  const wikiUrl = `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(data.title.replace(/ /g, '_'))}`;

  // Header
  const head = el('div', { class: 'article-head' });
  head.append(el('span', { class: 'kicker', text: `${lang}.wikipedia.org` }));
  head.append(el('h1', { class: 'article-title', text: data.title }));

  // Find the first paragraph for a subtitle, if the API gave us nothing.
  const firstP = root.querySelector('p');
  const subtitle = firstP ? clamp(firstP.textContent, 200) : '';
  if (subtitle) head.append(el('p', { class: 'article-sub', text: subtitle }));

  const words = wordCount(data.html);
  const meta = el('p', { class: 'article-sub', style: 'color:var(--faint);font-size:13px' });
  meta.textContent = `${words.toLocaleString()} ${t('words')} · ~${Math.max(1, Math.round(words / 220))} ${t('minRead')}${data.revid ? ` · rev ${data.revid}` : ''}`;
  head.append(meta);
  mount.append(head);

  mount.append(actions(ctx, { title: data.title, lang, wikiUrl, root, data }));

  // Tabs: Read | Markdown
  const { tabs, panelRead, panelMd } = buildTabs(ctx, { data, root, lang, wikiUrl });
  mount.append(tabs);

  // Read panel. The prose is the wide column; the table of contents and the
  // infobox sit in the narrow rail beside it.
  const grid = el('div', { class: 'article-grid' });
  const panel = el('div', { class: 'panel' });
  const prose = el('div', { class: 'prose' });
  prose.innerHTML = root.innerHTML;
  panel.append(prose);
  grid.append(panel);

  const infobox = root.querySelector('.infobox, table.infobox');
  const factbox = infobox ? infoboxToFactbox(infobox, data.title) : null;
  if (infobox) prose.querySelector('.infobox')?.remove();

  const toc = buildToc(data.sections);
  if (toc || factbox) {
    grid.classList.add('rail-open');
    const rail = el('aside', { class: 'toc-rail' });
    if (toc) rail.append(toc);
    if (factbox) rail.append(factbox);
    grid.append(rail);
  }
  panelRead.append(grid);

  // Gallery
  const gallery = buildGallery(root);
  if (gallery) panelRead.append(gallery);

  // Sources
  panelRead.append(sourcesBlock(data, lang, wikiUrl));

  mount.append(panelRead);
  mount.append(panelMd);

  // Related
  loadRelated(ctx, mount, { title: data.title, lang });

  // TOC active-section highlight
  if (toc) observeToc(panel);
}

function actions(ctx, { title, lang, wikiUrl, root, data }) {
  const row = el('div', { class: 'article-actions' });
  const id = `article:${lang}:${title}`;

  const save = el('button', { type: 'button', class: `btn btn-ghost${ctx.isBookmarked(id) ? ' is-on' : ''}`, html: `${icon('bookmark')}${esc(ctx.isBookmarked(id) ? t('saved') : t('bookmarks'))}` });
  save.addEventListener('click', () => {
    const saved = ctx.toggleBookmark({
      id, title, lang, url: articleHref(title, lang),
      extract: clamp(root.querySelector('p')?.textContent || '', 160),
    });
    save.innerHTML = `${icon('bookmark')}${esc(saved ? t('saved') : t('bookmarks'))}`;
    save.classList.toggle('is-on', saved);
    toast(saved ? t('saved') : t('remove'));
  });
  row.append(save);

  const copy = el('button', { type: 'button', class: 'btn btn-ghost', html: `${icon('copy')}${esc(t('copyMarkdown'))}` });
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(articleToMarkdown(root, { title, url: wikiUrl }));
      toast(t('copied'));
    } catch { toast(t('errorBody')); }
  });
  row.append(copy);

  const dl = el('button', { type: 'button', class: 'btn btn-ghost', html: `${icon('download')}${esc(t('downloadMarkdown'))}` });
  dl.addEventListener('click', () => download(`${title.replace(/[^\w\s-]/g, '')}.md`, articleToMarkdown(root, { title, url: wikiUrl })));
  row.append(dl);

  const share = el('button', { type: 'button', class: 'btn btn-ghost', html: `${icon('share')}${esc(t('share'))}` });
  share.addEventListener('click', async () => {
    const url = `${location.origin}${location.pathname}${articleHref(title, lang)}`;
    if (navigator.share) { try { await navigator.share({ title, url }); } catch { /* cancelled */ } }
    else { try { await navigator.clipboard.writeText(url); toast(t('linkCopied')); } catch { /* ignore */ } }
  });
  row.append(share);

  row.append(el('a', { class: 'btn btn-ghost', href: wikiUrl, target: '_blank', rel: 'noopener noreferrer', html: `${esc(t('readOnWikipedia'))} ↗` }));

  // Offer another language when the article exists in one.
  const alt = (data.langlinks || []).find((l) => l.lang === 'hi') || (data.langlinks || [])[0];
  if (alt && alt.lang !== lang) {
    row.append(el('a', {
      class: 'btn btn-ghost', href: articleHref(alt.title, alt.lang),
      html: `${icon('globe')}${esc(alt.lang.toUpperCase())}`,
    }));
  }
  return row;
}

function buildTabs(ctx, { data, root, lang, wikiUrl }) {
  const tabs = el('div', { class: 'tabs', role: 'tablist' });
  const panelRead = el('div', { class: 'tabpanel', role: 'tabpanel', id: 'tab-read' });
  const panelMd = el('div', { class: 'tabpanel', role: 'tabpanel', id: 'tab-md', hidden: true });

  const mk = (label, target) => {
    const btn = el('button', { type: 'button', class: 'tab', role: 'tab', text: label, 'aria-selected': target === 'read' ? 'true' : 'false' });
    btn.addEventListener('click', () => {
      const readOn = target === 'read';
      panelRead.hidden = !readOn;
      panelMd.hidden = readOn;
      tabs.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
    });
    return btn;
  };
  tabs.append(mk(t('readArticle'), 'read'));
  tabs.append(mk(t('copyMarkdown'), 'md'));

  const md = el('div', { class: 'md' });
  const pre = el('pre', { class: 'md-raw' });
  pre.textContent = articleToMarkdown(root, { title: data.title, url: wikiUrl });
  const mdActions = el('div', { class: 'md-actions' });
  const dl = el('button', { type: 'button', class: 'btn btn-primary', html: `${icon('download')}${esc(t('downloadMarkdown'))}` });
  dl.addEventListener('click', () => download(`${data.title.replace(/[^\w\s-]/g, '')}.md`, pre.textContent));
  const cp = el('button', { type: 'button', class: 'btn btn-ghost', html: `${icon('copy')}${esc(t('copyMarkdown'))}` });
  cp.addEventListener('click', async () => { try { await navigator.clipboard.writeText(pre.textContent); toast(t('copied')); } catch { /* ignore */ } });
  mdActions.append(dl, cp);
  md.append(mdActions, pre);
  panelMd.append(md);

  return { tabs, panelRead, panelMd };
}

function buildToc(sections) {
  const top = (sections || []).filter((s) => s.level === 2);
  if (top.length < 2) return null;
  const toc = el('div', { class: 'toc' });
  toc.append(el('h3', { text: t('sections') }));
  for (const s of sections) {
    if (s.level > 3) continue;
    const a = el('a', {
      href: `#${s.id}`,
      text: s.line,
      class: s.level === 3 ? 'lvl3' : '',
    });
    a.addEventListener('click', (event) => {
      event.preventDefault();
      document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      history.replaceState(null, '', `${location.pathname}${location.hash.split('?')[0]}`);
    });
    toc.append(a);
  }
  return toc;
}

function observeToc(panel) {
  const links = [...document.querySelectorAll('.toc a')];
  if (!links.length || !('IntersectionObserver' in window)) return;
  const map = new Map();
  links.forEach((a) => {
    const id = a.getAttribute('href').slice(1);
    const target = document.getElementById(id);
    if (target) map.set(target, a);
  });
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      links.forEach((l) => l.classList.remove('active'));
      map.get(entry.target)?.classList.add('active');
    }
  }, { rootMargin: '-80px 0px -70% 0px', threshold: 0 });
  map.forEach((_, target) => observer.observe(target));
}

function infoboxToFactbox(infobox, title) {
  const rows = [...infobox.querySelectorAll('tr')];
  const facts = [];
  for (const tr of rows) {
    const th = tr.querySelector('th');
    const td = tr.querySelector('td');
    if (!th || !td) continue;
    const label = th.textContent.replace(/\s+/g, ' ').trim();
    const value = td.textContent.replace(/\s+/g, ' ').trim();
    if (!label || !value || label.length > 60 || value.length > 260) continue;
    facts.push({ label, value });
    if (facts.length >= 14) break;
  }
  if (!facts.length) return null;
  const box = el('div', { class: 'factbox' });
  box.append(el('h3', { html: `${esc(t('facts'))}<span class="factbox-src">${esc(title)}</span>` }));
  const dl = el('dl');
  for (const f of facts) {
    const row = el('div', { class: 'row' });
    row.append(el('dt', { text: f.label }));
    row.append(el('dd', { text: f.value }));
    dl.append(row);
  }
  box.append(dl);
  return box;
}

function buildGallery(root) {
  const imgs = [...root.querySelectorAll('img')]
    .map((img) => ({
      src: cleanUrl(img.getAttribute('src')),
      alt: img.getAttribute('alt') || '',
      caption: img.closest('figure')?.querySelector('figcaption')?.textContent?.trim()
        || img.closest('.thumb')?.querySelector('.thumbcaption')?.textContent?.trim() || '',
    }))
    .filter((i) => i.src && !/\.svg$/i.test(i.src))
    .filter((i, idx, arr) => arr.findIndex((x) => x.src === i.src) === idx)
    .slice(0, 12);
  if (imgs.length < 3) return null;
  const section = el('section', { class: 'sec' });
  section.append(sectionHead({ title: t('pictures') }));
  const gallery = el('div', { class: 'gallery' });
  for (const img of imgs) {
    const figure = el('figure');
    figure.append(el('img', { src: img.src, alt: img.alt, loading: 'lazy', decoding: 'async' }));
    if (img.caption) figure.append(el('figcaption', { text: clamp(img.caption, 160) }));
    gallery.append(figure);
  }
  section.append(gallery);
  return section;
}

function sourcesBlock(data, lang, wikiUrl) {
  const group = el('div', { class: 'src-group', style: 'margin-top:26px' });
  group.append(el('h3', { text: t('sourcesHeading') }));
  const list = el('ul', { class: 'line-list' });
  const li = el('li');
  li.append(el('a', { href: wikiUrl, target: '_blank', rel: 'noopener noreferrer', text: `Wikipedia (${lang}) — ${data.title}` }));
  list.append(li);
  group.append(list);
  group.append(el('p', { class: 'src-credit', text: t('attribution') }));
  return group;
}

async function loadRelated(ctx, mount, { title, lang }) {
  try {
    const related = await ctx.api.related(lang, title);
    if (!related.length) return;
    const section = el('section', { class: 'sec' });
    section.append(sectionHead({ title: t('related'), more: searchHref(title, { lang }) }));
    const grid = el('div', { class: 'grid' });
    related.slice(0, 6).forEach((page) => grid.append(card(page, { lang })));
    section.append(grid);
    mount.append(section);
  } catch { /* bonus */ }
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
