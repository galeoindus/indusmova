# Contributing to indusmova

Thanks for helping. A few things worth knowing before you start.

## Ground rules

- **Source first.** The article breakdown quotes published sentences. Chat may
  use a model, but only over the selected source passages, with citation markers
  preserved and an honest "not in the sources" answer when the passages are
  thin. A change that lets the app invent uncited facts is out of scope.
- **Backend only for grounded AI.** The one server-side component is
  `functions/api/ask.js`, the source-grounded AI endpoint. It may read
  credentials from Cloudflare encrypted Secrets only — never from browser code,
  `.env.example`, commits or logs. No database, no accounts, no analytics.
- **No tracking.** No analytics, no cookies, no third-party scripts beyond the
  font stylesheet and the optional model CDN.

## Working on the code

```bash
npx serve .        # serve at http://localhost:4173
```

There is no build step. Edit a file, reload.

- `assets/css/styles.css` is the design system and should stay intact; put
  additions and corrections in `assets/css/app.css`.
- Keep modules small and documented — every file opens with a short comment
  saying what it is for.
- Match the existing class names. The stylesheet already describes the
  components; prefer reusing one over inventing a new one.

## Checks before you open a pull request

1. `node --check` passes on every file in `assets/js/`.
2. Every view still renders with no console errors, in both light and dark.
3. Keyboard-only navigation still reaches every control.
4. Nothing personal is stored anywhere but `localStorage`.

## Branches, `main`, and the build stamp

`main` is protected by the `protect-main` ruleset: deletions and force-pushes
are refused, history must stay linear, and a change is expected to arrive
through a pull request.

Repository admins are a bypass actor on that ruleset, so a direct
`git push origin main` from an admin account is accepted even though the
remote prints the rule text back at you:

```
remote: error: GH013: Repository rule violations found for refs/heads/main
remote: - Changes must be made through a pull request.
```

Read the line after that block before assuming it failed — if it says
`<old>..<new>  main -> main`, the push landed. Check with
`git rev-parse HEAD` against `gh api repos/galeoindus/indusmova/commits/main --jq .sha`
rather than trusting the warning.

The `version` workflow is a different identity (the `github-actions[bot]`
token), and it is **not** a bypass actor. It therefore commits the stamp to a
short-lived `build/stamp-*` branch and tries to land it through a pull
request; when the repository is not configured to let Actions open pull
requests, it deletes that branch again and exits green, because `deploy`
re-stamps every page before it uploads. Nothing about the live site depends on
the stamp reaching git.

## Reporting a problem

Use the Feedback page in the app, or open an issue. For an accessibility
barrier, please say which assistive technology and browser you used.
