/* indusmova — shared markup pieces.
 *
 * Every view is built from these: the same card, the same section heading, the
 * same skeleton and error box. Keeping them here is what makes the dashboard,
 * the search results and the explore grid feel like one product.
 */

import { el, esc, clamp, compactNumber, cleanUrl } from './ui.js';
import { icon, PLACEHOLDER_MARK } from './icons.js';
import { t } from './i18n.js';
import { articleHref, searchHref } from './router.js';

/**
 * Breadcrumbs: Home > Category > Article. Every crumb but the last is a real
 * link, so keyboard users and crawlers can walk back up.
 */
export function breadcrumbs(trail = []) {
  const nav = el('nav', { class: 'crumbs', 'aria-label': 'Breadcrumb' });
  const ol = el('ol');
  trail.forEach((crumb, i) => {
    const li = el('li');
    if (i < trail.length - 1 && crumb.href) {
      li.append(el('a', { href: crumb.href, text: crumb.label }));
    } else {
      li.append(el('span', { 'aria-current': 'page', text: crumb.label }));
    }
    ol.append(li);
  });
  nav.append(ol);
  return nav;
}

/** <section class="sec"> with a heading and an optional "view all" link. */
export function sectionHead({ title, iconName = '', more, moreLabel = t('viewAll'), className = 'sec-head' } = {}) {
  const left = el('div', {
    html: `<h2>${iconName ? `<span class="ic">${icon(iconName)}</span>` : ''}${esc(title)}</h2>`,
  });
  const wrap = el('div', { class: className });
  wrap.append(left);
  if (more) {
    wrap.append(el('a', { class: 'rail-more', href: more, html: `${esc(moreLabel)} →` }));
  }
  return wrap;
}

/** A band head used inside the dashboard bands. */
export function bandHead({ title, iconName = '', blurb = '', more, moreLabel = t('viewAll') } = {}) {
  const head = el('div', { class: 'dash-band-head' });
  const left = el('div');
  left.append(el('h2', {
    html: `${iconName ? `<span class="ic">${icon(iconName)}</span>` : ''}${esc(title)}`,
  }));
  if (blurb) left.append(el('p', { text: blurb }));
  head.append(left);
  if (more) head.append(el('a', { class: 'rail-more', href: more, html: `${esc(moreLabel)} →` }));
  return head;
}

/** Article card — used in most-read, explore and search. */
export function card(item, { tag = '', lang = '' } = {}) {
  const href = articleHref(item.title, lang);
  const node = el('a', { class: 'card', href });
  const thumb = el('div', { class: 'card-thumb' });
  if (item.thumb?.src) {
    thumb.append(el('img', {
      src: cleanUrl(item.thumb.src), alt: '', loading: 'lazy', decoding: 'async',
    }));
  } else {
    thumb.classList.add('placeholder');
    thumb.setAttribute('aria-hidden', 'true');
    thumb.innerHTML = PLACEHOLDER_MARK;
  }
  node.append(thumb);
  const body = el('div', { class: 'card-body' });
  body.append(el('h3', { text: item.title }));
  const blurb = item.extract || item.description || '';
  if (blurb) body.append(el('p', { text: clamp(blurb, 150) }));
  if (tag) body.append(el('div', { class: 'card-meta', html: `<span class="badge">${esc(tag)}</span>` }));
  node.append(body);
  return node;
}

/** Question card with a picture, a tag and a source chip. */
export function qCard({ question, extract, thumb, tag, sourceTitle }) {
  const node = el('a', { class: 'q-card', href: searchHref(question) });
  const thumbWrap = el('span', { class: 'q-thumb' });
  if (thumb) thumbWrap.append(el('img', { src: cleanUrl(thumb), alt: '', loading: 'lazy', decoding: 'async' }));
  if (tag) thumbWrap.append(el('span', { class: 'q-tag', text: tag }));
  node.append(thumbWrap);
  const body = el('span', { class: 'q-body' });
  body.append(el('h3', { text: question }));
  if (extract) body.append(el('p', { text: clamp(extract, 120) }));
  const foot = el('span', { class: 'q-foot' });
  if (sourceTitle) {
    foot.append(el('span', { class: 'srcs', html: `${icon('sources')}${esc(sourceTitle)}` }));
  }
  body.append(foot);
  node.append(body);
  return node;
}

/** Category tile. */
export function catCard(cat) {
  return el('a', {
    class: 'cat-card',
    href: searchHref(cat.query),
    html: `<span class="ic">${icon(cat.icon)}</span><strong>${esc(cat.label)}</strong>`,
  });
}

/** Source row for the rail and the sources view. */
export function srcRow(source, { link = true } = {}) {
  const inner = `
    <span class="src-mark" aria-hidden="true">${esc(source.mark || 'W')}</span>
    <span class="src-body">
      <span class="src-name">${esc(source.name)}</span>
      <span class="src-kind">${esc(source.kind)}</span>
    </span>`;
  return link
    ? el('a', { class: 'src-row', href: source.home, target: '_blank', rel: 'noopener noreferrer', html: inner })
    : el('div', { class: 'src-row', html: inner });
}

/** Trend row with a rank, a name, a view count and a spark line. */
export function trendRow(item, rank) {
  const sparks = [
    '0.0,2.0 46.0,18.0',
    '0.0,2.0 23.0,11.2 46.0,18.0',
    '0.0,2.0 15.3,9.1 30.7,14.4 46.0,18.0',
    '0.0,2.0 11.5,8.4 23.0,13.1 34.5,16.4 46.0,18.0',
  ];
  const points = sparks[(rank - 1) % sparks.length];
  return el('a', {
    class: 'trend-row',
    href: articleHref(item.title),
    html: `
      <span class="trend-rank">${rank}</span>
      <span class="trend-body">
        <span class="trend-name">${esc(item.title)}</span>
        <span class="trend-meta">${item.views ? `${compactNumber(item.views)} views` : esc(item.meta || '')}</span>
      </span>
      <svg class="trend-spark" viewBox="0 0 46 20" fill="none" aria-hidden="true">
        <polyline points="${points}" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></polyline>
      </svg>`,
  });
}

/** Skeleton card grid, shown while a view loads. */
export function skeletonGrid(count = 6, variant = 'card') {
  const wrap = el('div', { class: variant === 'q' ? 'q-grid' : variant === 'cat' ? 'cat-grid' : 'grid' });
  for (let i = 0; i < count; i++) {
    wrap.append(el('div', {
      class: variant === 'card' ? 'card' : variant === 'q' ? 'q-card' : 'cat-card',
      html: variant === 'cat'
        ? '<span class="sk-line sk-90"></span>'
        : `<div class="card-thumb placeholder"></div><div class="card-body"><span class="sk-line sk-80"></span><span class="sk-line sk-90"></span><span class="sk-line sk-60"></span></div>`,
      'aria-hidden': 'true',
    }));
  }
  return wrap;
}

export function errorBox(message, { onRetry } = {}) {
  const box = el('div', { class: 'error-box' });
  box.innerHTML = `<p><strong>${esc(t('errorTitle'))}</strong> ${esc(message || t('errorBody'))}</p>`;
  if (onRetry) {
    const btn = el('button', { type: 'button', class: 'btn btn-primary', text: t('retry') });
    btn.addEventListener('click', onRetry);
    box.append(btn);
  }
  return box;
}

export function emptyState({ iconName = 'info', title, body, cta, ctaHref }) {
  const box = el('div', { class: 'state' });
  box.innerHTML = `<span class="ic">${icon(iconName)}</span><h3>${esc(title)}</h3><p>${esc(body)}</p>`;
  if (cta && ctaHref) box.append(el('a', { class: 'btn btn-primary', href: ctaHref, text: cta }));
  return box;
}

/** The little "read on Wikipedia" + "ask about it" row used under an answer. */
export function rowCta({ title, lang, wikiUrl }) {
  const row = el('div', { class: 'row-cta' });
  row.append(el('a', { class: 'btn btn-primary', href: articleHref(title, lang), text: t('readBreakdown') }));
  row.append(el('a', { class: 'btn btn-ghost', href: searchHref(title, { mode: 'ask', lang }), text: t('askAboutIt') }));
  if (wikiUrl) {
    row.append(el('a', {
      class: 'btn btn-ghost', href: wikiUrl, target: '_blank', rel: 'noopener noreferrer',
      html: `${esc(t('readOnWikipedia'))} ↗`,
    }));
  }
  return row;
}

/** A toast, bottom-centre. */
let toastTimer = null;
export function toast(message) {
  let node = document.getElementById('indusmova-toast');
  if (!node) {
    node = el('div', { id: 'indusmova-toast', class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(node);
  }
  node.textContent = message;
  node.classList.add('shown');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('shown'), 2600);
}

export { esc, clamp, cleanUrl };
