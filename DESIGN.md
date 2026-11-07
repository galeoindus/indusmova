# Indusmova Design System

Version: 1.0  
Product: Indusmova — evidence-first Wikimedia knowledge discovery

## Experience principles

1. **Evidence before decoration.** The interface should make it easy to ask, compare, read and verify. Reading surfaces remain opaque, quiet and high-contrast.
2. **One product, one theme.** `indusmova:theme` is the single persistent preference for the home SPA, chat, Research Desk, static article pages and utility pages. Values are `auto`, `light`, or `dark`; the global controller resolves `auto` from `prefers-color-scheme`.
3. **One visual vocabulary.** Use semantic tokens rather than page-specific hard-coded colours. New components must consume `--im-*` variables or mapped legacy aliases.
4. **Responsive by default.** Start with a single-column mobile reading flow; progressively add navigation rails, grids and secondary panels at wider breakpoints. Preserve document order and keyboard order.
5. **Accessible depth.** Shadow, blur, gradients and colour are never the only indicators of hierarchy, state or action. Focus rings, labels and text contrast remain explicit.

## Design tokens

| Purpose | Token | Light | Dark |
|---|---|---|---|
| Page | `--im-bg` | `#f3f6f2` | `#0b1110` |
| Main surface | `--im-surface` | `#ffffff` | `#111b18` |
| Raised surface | `--im-surface-2` | `#eaf0eb` | `#17231e` |
| Primary text | `--im-text` | `#17251f` | `#e9f0eb` |
| Muted text | `--im-muted` | `#52645a` | `#b0beb5` |
| Border | `--im-border` | `#d5e0d8` | `#293b32` |
| Action | `--im-accent` | `#176b4c` | `#83d4a8` |
| Warm highlight | `--im-warm` | `#a65f32` | `#e2a978` |

Legacy aliases (`--bg`, `--surface`, `--panel`, `--text`, `--ink`, `--muted`, `--border`, `--accent`) are mapped by `design-system.css` so existing components migrate without a wholesale rewrite.

## Multimorphism usage rules

### Glassmorphism

Use only for transient or persistent chrome that sits above content: sticky top bars, floating controls, suggestion popovers, menus and the mobile bottom navigation. Keep a solid background fallback for browsers without `backdrop-filter`, and switch to opaque surfaces when reading comfort is enabled. Never put long paragraphs or small low-contrast labels directly on a blurred/translucent surface.

### Neumorphism

Use very lightly for tactile controls: search/composer wells, icon toggles and a small number of pressed/selected controls. Keep an actual border and a visible focus outline. Do not apply double shadows to every card, because this removes separation and can make controls indistinguishable from decoration.

### Claymorphism

Reserve for one focal surface per screen: homepage hero, welcome card, Article of the Day and a chat empty-state identity area. The clay silhouette must not contain long-form text at low contrast. Avoid stacking several clay cards inside one another.

### Flat/elevated reading surfaces

Article text, source citations, tables, infoboxes and answer bodies should use solid surfaces, restrained borders and clear typographic hierarchy. This is the default for information-dense content.

## Component rules

- Buttons: one semantic primary action per region; icon-only controls have an accessible name and a minimum 44 × 44 px touch target on mobile.
- Inputs: labels/placeholders must meet contrast requirements; focus is shown by border and outline, not glow alone.
- Cards: consistent radius and border; image ratio is consistent within a collection; card hover does not move content enough to disrupt the pointer.
- Navigation: current page is identified by icon/text/state, not colour alone.
- Article pages: prose width around 65–72 characters, high line-height, visible citations and a persistent global theme switch.
- Motion: short and purposeful; respect `prefers-reduced-motion`.
- Themes: never set page-local `data-theme` state without synchronizing the root through `window.IndusTheme`.

## Architecture map

- `assets/css/design-system.css`: final shared visual token and multimorphism layer.
- `assets/js/global-theme.js`: single theme controller, localStorage persistence, system preference handling and cross-tab synchronization.
- `assets/js/theme.js`: home-only reading comfort and reading-progress behaviours; it delegates theme state globally.
- `scripts/stamp-build.mjs`: installs the shared CSS/JS on every HTML entry point and cache-busts them during each release.
- `assets/css/*`: legacy page/component sheets. Migrate selectors into semantic tokens over time; do not add new page-local colour palettes.

## Google toolchain to use

- **Google Stitch**: ideation, multiple screen directions, high-fidelity prototypes and a `DESIGN.md` handoff. Use it to validate information architecture and layout variations before large visual changes. https://stitch.withgoogle.com/
- **Google AI Studio + Gemini Interactions API**: prototype answer generation, structured output, streaming and tool/function-calling. Google documents Interactions API as generally available and recommended for new Gemini projects; assess migration separately before changing the current Cloudflare provider. Keep API keys server-side (Cloudflare Function/secret), never in browser source. https://aistudio.google.com/ and https://ai.google.dev/gemini-api/docs/interactions-overview
- **Google Antigravity**: agentic coding workflow for repository-wide implementation, test execution and browser/terminal verification. Treat generated changes as proposals and review diffs/tests before merging. https://antigravity.google/
- **Chrome DevTools**: responsive/device simulation, network throttling, performance tracing, CSS inspection and accessibility debugging. Device simulation approximates mobile and is not a substitute for at least one real-device check. https://developer.chrome.com/docs/devtools/device-mode
- **Lighthouse / Lighthouse CI**: repeatable performance, accessibility, SEO and best-practice audits; add CI budgets to prevent regressions. https://developer.chrome.com/docs/lighthouse/overview
- **Material Symbols**: use a single consistent icon family and optical sizing/weight rather than mixed emoji and unrelated SVG styles. Self-host the required subset for predictable performance. https://developers.google.com/fonts/docs/material_symbols
- **Firebase Studio**: do not choose it for new work. Google disabled new workspace creation and sign-up on June 22, 2026, and announced shutdown for March 22, 2027. Existing workspaces should be migrated to Google AI Studio or Antigravity before shutdown. https://firebase.google.com/docs/studio/migrating-project

## Verification checklist

- [ ] Check theme on home, chat, Research Desk, article detail, topics, help, questions, and 404.
- [ ] Check `auto → light → dark` and system theme changes; verify cross-tab sync.
- [ ] Check at 360 px, 390 px, 768 px, 1024 px and 1440 px widths.
- [ ] Check keyboard-only navigation, focus visibility and accessible names.
- [ ] Check text contrast for both themes (WCAG AA: 4.5:1 normal text; 3:1 large text).
- [ ] Check prefers-reduced-motion, 200% zoom and long article reading.
- [ ] Run unit tests, site audit, deep audit, Lighthouse and a real mobile smoke test.


## Amigo assistant layer

The conversational assistant is named **Amigo**; the knowledge platform remains indusmova. The `amigo-mark.svg` is a neutral geometric chat-face mark. Assistant progress and answer-reveal states use restrained CSS motion, with a complete reduced-motion fallback. The old wheel-like loader is replaced by a neutral progress ring. The shared `amigo-ui.css` composes with the existing light/dark design tokens and responsive article-gallery layout; `amigo-chat.css` is scoped to the dedicated chat route. Preserve the existing source-grounding, URL validation, server-side secret handling, and privacy notice when extending the agent.
