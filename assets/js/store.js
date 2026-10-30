/* indusmova — local state: bookmarks, reading history and preferences.
 *
 * Everything is kept in localStorage on the device. indusmova has no accounts
 * and no account server, so a reader's saved data never leaves their browser
 * except when they explicitly ask chat to answer. Writes are
 * wrapped so a full or disabled storage never breaks the page.
 */

import { STORAGE_KEYS } from './config.js';

/** Whether this browser is letting us keep anything at all. */
let storageWorks = true;
export function storageAvailable() { return storageWorks; }

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch {
    storageWorks = false;
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // Private browsing or a full disk; the page still works, it just forgets.
    storageWorks = false;
    return false;
  }
}

/* A minimal event bus so views can react to a save without polling. */
const listeners = new Map();

export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => listeners.get(event)?.delete(fn);
}

function emit(event, payload) {
  for (const fn of listeners.get(event) || []) {
    try { fn(payload); } catch { /* a broken listener must not break the rest */ }
  }
}

/* --------------------------------------------------------------- bookmarks */

export function getBookmarks() {
  return read(STORAGE_KEYS.bookmarks, []);
}

export function isBookmarked(id) {
  return getBookmarks().some((b) => b.id === id);
}

/** Toggle a bookmark. `item` = { id, title, question, lang, url, extract }. */
export function toggleBookmark(item) {
  const list = getBookmarks();
  const at = list.findIndex((b) => b.id === item.id);
  if (at >= 0) {
    list.splice(at, 1);
    write(STORAGE_KEYS.bookmarks, list);
    emit('bookmarks', list);
    return false;
  }
  list.unshift({ ...item, savedAt: Date.now() });
  write(STORAGE_KEYS.bookmarks, list.slice(0, 500));
  emit('bookmarks', list);
  return true;
}

export function removeBookmark(id) {
  const list = getBookmarks().filter((b) => b.id !== id);
  write(STORAGE_KEYS.bookmarks, list);
  emit('bookmarks', list);
}

export function clearBookmarks() {
  write(STORAGE_KEYS.bookmarks, []);
  emit('bookmarks', []);
}

/* ----------------------------------------------------------------- history */

export function getHistory() {
  return read(STORAGE_KEYS.history, []);
}

export function pushHistory(item) {
  const list = getHistory().filter((h) => h.id !== item.id);
  list.unshift({ ...item, readAt: Date.now() });
  write(STORAGE_KEYS.history, list.slice(0, 200));
  emit('history', list);
}

export function clearHistory() {
  write(STORAGE_KEYS.history, []);
  emit('history', []);
}

/* ------------------------------------------------------------- preferences */

export function getPref(key, fallback = null) {
  return read(STORAGE_KEYS[key] ?? key, fallback);
}

export function setPref(key, value) {
  write(STORAGE_KEYS[key] ?? key, value);
  emit('pref', { key, value });
  return value;
}

export function getPrefs() {
  return {
    theme: getPref('theme', 'auto'),
    comfort: getPref('comfort', false),
    uiLang: getPref('uiLang', 'en'),
    contentLang: getPref('contentLang', 'en'),
    depth: getPref('depth', 'detailed'),
    deepRank: getPref('deepRank', false),
    mode: getPref('mode', 'search'),
  };
}
