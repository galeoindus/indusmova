# indusmova

**सवाल से समझ तक — "From question to understanding."**

indusmova is a Wikimedia knowledge research and discovery platform. Ask a question, or open a topic, and get a direct answer, the key points, a topic-wise breakdown, the facts from the infobox, and every source with a link back to Wikipedia.

It is a **static, single-page application**: plain HTML, CSS and ES modules, no build step, no backend, no API keys. Every fact is fetched live, in the reader's browser, from the public Wikimedia APIs.

---

## What it does

| Feature | Where |
|---|---|
| **Ask** — a question in any of 280+ languages, answered from the best-matching article | `#/ask?q=…` |
| **Search** — matching articles as cards | `#/search?q=…` |
| **Article** — the full article, re-set: title block, sticky table of contents, infobox as a factbox, gallery, sources | `#/article/<Title>` |
| **On this day** — events, births, deaths and holidays for any date, as a timeline | `#/today` |
| **Explore** — categories and the most-read articles right now | `#/explore` |
| **Saved / Bookmarks** — kept on the device | `#/bookmarks` |
| **Reading history** | `#/history` |
| **Sources** — what is read from where, and under which licence | `#/sources` |
| **Markdown export** — copy or download any answer or article as Markdown | answer & article views |
| **Two languages of chrome** — English and हिन्दी, plus 12 content languages | header buttons |
| **Light / dark / system theme**, reading comfort, reading-progress bar | header buttons |
| **Voice search**, where the browser supports it | composer |
| **PWA** — installable, works offline for the shell | `manifest.webmanifest`, `sw.js` |

### How an answer is built

1. **Ask** — the question goes to the Wikipedia search API.
2. **Research** — the best-matching article is fetched in full, with its sections.
3. **Filter** — the article is cleaned (navigation boxes, edit links, footnote markers and MathML annotations dropped), split into a lead and topic sections, and its sentences are scored against the question.
4. **Understand** — a direct answer, key points, topic blocks, facts and sources are laid out.

The default ranker is keyword overlap with a rough IDF weighting. The optional **Understand meaning** switch loads a small open sentence-embedding model (`Xenova/all-MiniLM-L6-v2`, about 23 MB, once) via transformers.js and re-orders the same sentences by cosine similarity. **Nothing is ever generated** — every sentence is quoted from the article, and the ranking only chooses the order.

### APIs used

- Wikipedia Action API — search, `action=parse`, sections, extracts, random, prefix search
- Wikipedia REST API — summaries, on-this-day, featured
- Wikimedia pageviews API — the "most read right now" list
- Wikidata — structured entity data
- Wikimedia Commons — image credits and licences

All are public and CORS-enabled; requests go straight from the browser.

---

## Project layout

```
indusmova/
├── index.html                 the app shell (one document, hash-routed)
├── 404.html                   Cloudflare Pages not-found page
├── topics/                    crawlable index pages (static, no JS needed)
├── questions/
├── how-it-works/
├── help/
├── manifest.webmanifest       PWA manifest
├── sw.js                      service worker (app shell offline)
├── robots.txt · sitemap.xml
├── _headers · _redirects      Cloudflare Pages configuration
├── assets/
│   ├── css/styles.css         the design system (kept intact)
│   ├── css/app.css            additions and corrections on top of it
│   ├── img/                   favicon, icons, Open Graph image
│   └── js/
│       ├── app.js             entry point: context, header, router, rail
│       ├── config.js          site constants, categories, depths, sources
│       ├── api.js             the Wikimedia client (cache, retry, errors)
│       ├── parse.js           clean Wikipedia HTML, split into parts
│       ├── answer.js          compose an answer from a question + article
│       ├── rank.js            keyword ranking + optional meaning model
│       ├── markdown.js        Markdown export
│       ├── i18n.js            English + Hindi chrome strings
│       ├── store.js           localStorage: bookmarks, history, prefs
│       ├── theme.js           theme, comfort, reading progress
│       ├── router.js          hash router
│       ├── ui.js · icons.js · components.js · composer.js
│       └── views/             home, search, ask, article, pages
└── package.json
```

---

## Running it locally

There is nothing to build. Serve the folder over HTTP:

```bash
npx serve .          # or: python3 -m http.server 4173
```

Then open <http://localhost:4173/>.

> Open it over `http://localhost`, not `file://` — ES modules and the Wikimedia APIs need a real origin.

## Deploying to Cloudflare Pages

**Option A — Git integration.** Push this repository to GitHub, then in the Cloudflare dashboard create a Pages project and connect the repo. Use:

- **Framework preset:** None
- **Build command:** *(leave empty)*
- **Build output directory:** `/` (the repository root)

**Option B — direct upload / Wrangler.**

```bash
npx wrangler pages deploy . --project-name=indusmova
```

`_headers` and `_redirects` are read automatically. If you deploy under a different domain, change `SITE.origin` in `assets/js/config.js` and the URLs in `index.html`, `robots.txt`, `sitemap.xml` and the crawlable pages.

---

## Accessibility

Targets WCAG 2.2 AA. Keyboard-navigable throughout, a skip link, visible focus rings, `aria-current` on the active navigation item, live regions for voice and toasts, and a reading-comfort switch that makes translucent surfaces opaque. Motion is reduced under `prefers-reduced-motion`.

## Privacy

No accounts, no analytics, no cookies, no tracking, no server of ours. Bookmarks, history and preferences live in `localStorage` on the device. Your questions go from your browser directly to Wikimedia.

## Licences

- **This project's code** — MIT (see `LICENSE`).
- **Wikipedia article text** — CC BY-SA 4.0.
- **Wikidata data** — CC0 1.0.
- **Wikimedia Commons files** — their own licences, shown with each image.

indusmova is an independent reader and is **not affiliated with or endorsed by the Wikimedia Foundation**.
