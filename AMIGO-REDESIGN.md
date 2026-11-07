# Amigo UI redesign

## Product boundary

**Amigo** is the assistant experience inside the existing indusmova knowledge platform. The platform name, article URLs, saved-chat keys, language preferences, theme preferences, and source-library routes remain stable so existing links and user data continue to work.

## Design decisions

- Use a neutral geometric assistant mark and a single Amigo identity across the chat rail, welcome state, answer metadata, progress state, and site launcher.
- Use one shared token system for light and dark themes. The Amigo chat layer consumes the existing semantic tokens rather than introducing a separate theme preference store.
- Keep controls in clear groups: chat navigation, chat-level actions, composer tools, and send/stop actions. Primary touch targets are approximately 42–44 CSS px.
- Use a responsive gallery grid for source galleries and consecutive article figures. Captions and source order are preserved; the grid changes with the available width.
- Keep long-form article content opaque and readable. Glass effects are limited to persistent navigation and control surfaces.
- Use short, restrained motion for the assistant's progress and answer-reveal states. `prefers-reduced-motion` disables decorative motion.
- Reserve the phone navigation's height, include safe-area insets, and place the floating Amigo launcher above it.

## Files changed

- `chat/index.html`: Amigo title, identity, avatar and chat-specific styling.
- `assets/img/amigo-mark.svg`: new neutral vector mark.
- `assets/js/chat-page.js`: Amigo answer identity, progress avatar and completion-aware answer animation.
- `assets/js/chat-launcher.js`: Amigo launcher identity and mobile placement.
- `assets/js/views/article.js`: groups adjacent article figures and applies the gallery grid class.
- `assets/js/parse.js`: keeps gallery captions out of sentence-to-bullet conversion.
- `assets/css/amigo-ui.css`: shared gallery, card, focus and mobile-navigation refinements.
- `assets/css/amigo-chat.css`: chat layout, composer, answer card, avatar motion and responsive control refinements.
- `assets/css/styles.css` and `assets/css/system.css`: neutral progress indicators replace the old wheel-style loader.
- `scripts/stamp-build.mjs`: adds the shared Amigo stylesheet to new build outputs.
- `index.html`: removes the duplicate phone-navigation bar.
- `test/chat-ui.test.mjs`: updated identity checks and added regression checks for animation and galleries.

## Safety and compatibility

The change is primarily a presentation and article-layout update. It does not move provider credentials into browser code, change the source URL allow-list, weaken request-size/origin checks, alter server-side passage handling, or remove the existing security headers. Chat history and theme preference keys remain unchanged. Existing source citations and Wikipedia links retain their URL validation.

Amigo currently uses the repository's existing source-grounded chat/research backend. This UI update does **not** claim to add a new autonomous tool-execution framework, long-running agent scheduler, external connectors, or a new memory backend. Those require a separate permissioned backend design and explicit data-retention rules.

## Local verification

From the project root:

```sh
npm ci
npm run check
npm test
npm run audit:deep
```

The build stamp is generated from the current Git commit by `npm run stamp:build`. For an environment without Git metadata, provide a seven-character hexadecimal `BUILD_COMMIT` value when running the script.

The deployment should continue to store provider/API credentials as Cloudflare Pages secrets or environment bindings, never in public JavaScript or static HTML.
