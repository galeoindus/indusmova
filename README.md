# indusmova

** From question to understanding. **

indusmova is a Wikimedia knowledge research and discovery platform. Ask a question, or open a topic, and get a direct answer, the key points, a topic-wise breakdown, the facts from the infobox, and every source with a link back to Wikipedia.

It is a **static, single-page application**: plain HTML, CSS and ES modules, no build step, no backend, no API keys. Every fact is fetched live, in the reader's browser, from the public Wikimedia APIs.

---

## What it does

| Feature | Where |
|---|---|
| **Ask** — a question in any of 280+ languages, answered from the best-matching article | `#/ask?q=…` |
| **Search** — matching articles as cards | `#/search?q=…` |
| **Article** — opens as an indusmova **breakdown**, not a Wikipedia page: evidence, the definition, key points, numbered topic blocks that open short and extend on demand, facts, sources, method. Two more tabs carry the full re-set text and the Markdown. | `#/article/<Title>` |
| **On this day** — events, births, deaths and holidays for any date, as a timeline | `#/today` |
| **Explore** — categories and the most-read articles right now | `#/explore` |
| **Saved / Bookmarks** — kept on the device | `#/bookmarks` |
| **Reading history** | `#/history` |
| **Articles** — thirteen topics published as complete, indexable article pages: lead, quick facts, numbered table of contents, sections with inline citations, references, related topics | `/articles/<slug>/` |
| **Library** — one search across every free, keyless source indusmova knows, grouped by source and named | `#/library?q=…` |
| **Work** — a book, paper or archive item, rendered in the same architecture as an article | `#/work?src=…&id=…` |
| **Sources** — every source, what it is, and under which licence | `#/sources` |
| **Markdown export** — copy or download any answer or article as Markdown | answer & article views |
| **Two languages of chrome** — English and हिन्दी, plus 12 content languages | header buttons |
| **Light / dark / system theme**, reading comfort, reading-progress bar | header buttons |
| **Voice search**, where the browser supports it | composer |
| **PWA** — installable, works offline for the shell | `manifest.webmanifest`, `sw.js` |

### The answer architecture

Every answer — asked or opened — is laid out the same way, from components the
design system already defines:

```
.evidence      how the answer was ranked, and from how much
.qa-answer     the sentences that answer it (.line-list)
.answer-card   the key points (.points-list)
.topic-block   numbered topics, short by default, each extendable
.factbox       the infobox, as label/value rows
.src-group     sources as cards, with licences
.method-note   exactly how the answer was produced
.fb-row        emoji feedback
```

**Answer depth acts immediately.** Quick answer, Detailed and Deep dive
re-compose the open answer the moment they are clicked — no second submit, no
reload. Deep dive also opens every topic block extended. A thin `.depth-bar`
shows which level is active.

### How an answer is built

1. **Ask** — the question goes to the Wikipedia search API.
2. **Research** — the best-matching article is fetched in full, with its sections.
3. **Filter** — the article is cleaned (navigation boxes, edit links, footnote markers and MathML annotations dropped), split into a lead and topic sections, and its sentences are scored against the question.
4. **Understand** — a direct answer, key points, topic blocks, facts and sources are laid out.

The default ranker is keyword overlap with a rough IDF weighting. The optional **Understand meaning** switch loads a small open sentence-embedding model (`Xenova/all-MiniLM-L6-v2`, about 23 MB, once) via transformers.js and re-orders the same sentences by cosine similarity. **Nothing is ever generated** — every sentence is quoted from the article, and the ranking only chooses the order.

### Reading progress in the contents

The contents panel follows the current practice for long articles: it stays
collapsed until asked for (the header button, or the button above the tabs),
shows how much is left — *"12 of 34 sections · about 25 min left"* — marks each
section unread, being read or read, and marks the current item with
`aria-current`. Choosing a section scrolls to it, opens it, records it in the
address bar as `?s=…`, and closes the panel.

### Tests and checks

```bash
npm run check     # parse every module, verify every import, catch debug leftovers
npm test          # 20 unit tests: routing, query keys, parsing, slugs, links
npm run verify    # both
```

`npm run check` exists because the audit found the previous check script ran
`node --check` on the entry module alone. It now covers every file, and — more
usefully — verifies that each named import is really exported by the module it
comes from, which is the mistake that reaches a browser as "does not provide an
export named…" and leaves a blank page.

### Open sources

Everything indusmova reads is free, public and needs **no API key**. They are
called straight from the browser, so each one has to send CORS headers — arXiv
and Google Books do not, and are deliberately absent.

| Family | Sources |
|---|---|
| Wikimedia | Wikipedia, Wikiquote, Wikisource, Wikinews, Wikibooks, Wikiversity, Wikivoyage, Wiktionary, Wikidata, Wikimedia Commons |
| Books | Project Gutenberg (Gutendex), Open Library, Internet Archive |
| Research | Crossref, OpenAlex, Europe PMC, PubMed, DOAJ |
| Metrics | Wikimedia pageviews (the "most read right now" list) |

The Library searches all of them at once and names the source on every result.
A source that is unreachable or rate-limited is reported as such and the rest
still render. Wikipedia's sister projects use the same API shape, so they get
the same full breakdown as an article; the others render as a *work* — title,
summary, metadata as facts, and a link to the source.

### The Evidence Desk redesign

The interface follows the redesign proposal's "Evidence Desk" direction — a
calm, source-forward research surface.

**One clear starting point.** The home page leads with one labelled field and a
two-option mode control, *Ask a question* / *Find an article*, each with a
one-line explanation of what it will do. The submit button and the helper line
change with the mode; the text you have typed is kept when you switch. An
example prompt fills the field rather than firing a navigation you did not ask
for, and submitting an empty field says so instead of doing nothing.

**Evidence before decoration.** An answer reads: the query, the article it came
from, *Passages selected from this Wikipedia article — not newly written*, the
core answer, key points, numbered topic blocks, facts, sources, then the method.
Citation markers carry a name a screen reader can use ("Open source 2, section
'Causes'"), the facts panel says the facts come from the infobox and may be
incomplete, and the method note keeps its headline counts visible while the
detail stays disclosed. Ranking is described as relevance, never as truth.

**Navigation around the task, not the feature list.** The sidebar is grouped
Discover / My library / About; the header keeps four destinations; the phone bar
carries four. Saved content is labelled *On this device*, and the sidebar says
plainly that it does not sync. Language controls name their setting — "Wikipedia
edition" and "Interface language" — because they are two different things.

**Recovery designed as part of the product.** Offline, rate-limited, not found,
no results and storage-blocked states each say what happened in plain language,
keep the query on screen, and offer one next step. A failed lookup never erases
the question.

### The article template

Every article — the static pages and the in-app view — follows one structure:

```
breadcrumbs        Home > Topics > <Title>, every crumb a real link
lead               one H1, a short sourced lead, source and revision metadata
quick facts        the infobox, as label/value rows
contents           a numbered, nested table of contents with stable anchors
sections           Wikipedia's own numbering (2, 2.1), never a heading-only stub
inline citations   [1] [2] [3] in reading order, each linking to its reference
references         the numbered list the markers point at
related topics     internal links, plus the other language editions
footer             attribution, licence and the modification notice
```

**Attribution is explicit.** Reused text carries the source, the licence, a link
to the original and a statement that indusmova reformats and condenses it —
which the licence requires and which the audit asked for. Pictures are checked
**one at a time**: each gallery image asks Wikimedia Commons for its own licence
and author, because a text licence does not cover the media.

### Stable article URLs

`/articles/<slug>/` is a real path. Cloudflare Pages serves the thirteen
generated pages from disk and rewrites everything else under `/articles/*` to
the app shell, which reads the slug out of the address bar. So a link can be
shared, pasted, refreshed and crawled, and the canonical URL always matches
what the reader sees.

### The section jumper

An article's whole structure is available from a **Jump to a section** panel
that stays collapsed until it is asked for — the jump button in the header
(next to the language buttons), or the button above the tabs. Choosing a
section scrolls to it and opens it; the panel closes itself.

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
│       ├── answerui.js        the shared answer architecture
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
