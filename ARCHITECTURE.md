# Orin architecture

A short map for people and AI assistants who edit this repo. The README explains what Orin does; this file explains where things live and the rules that keep it working.

## How the app is built

- Plain HTML, CSS and JavaScript. No build step, no framework, no modules.
- `js/*.js` are classic scripts that share **one global scope**. `index.html` loads them in a fixed order, so a file may only call, at load time, things defined in files above it. Functions that run later (click handlers, timers, `send()`) can use anything.
- Every new script must be added in **two** places: the `<script>` list in `index.html` and `SHELL` in `sw.js`. `node scripts/check.js` fails if either is missing.
- No inline `<script>` and no inline `on…=` handlers (the Content-Security-Policy blocks them). Use `data-act="name"` on a button and handle it in the click handler in `js/settings.js`.

## Files

| File | Responsibility |
| --- | --- |
| `js/core.js` | State `S`, storage, helpers (`esc`, `qa`, `toast`), markdown, code highlighting, chat list |
| `js/cloud.js` | Supabase login and sync, home screen markup |
| `js/providers.js`, `js/fallback.js` | Provider calls, streaming, fallback order, health and retries |
| `js/readers.js` | zip / folder / Office readers, pop-up menus, model picker |
| `js/github.js` | `gh()` API helper with rate-limit retry, repo list, branches, history, tree cache, **access check** (`ghAccess`, `ghAccHTML`) |
| `js/agent-tools.js` | Tool definitions (`TOOLS`) and the executor `tool()` |
| `js/agent.js` | Agent loop, history trimming, system prompt |
| `js/push.js` | Drafts, diffs, push, deploy status, PR actions, undo |
| `js/checks.js`, `js/preview.js`, `js/preview-frame.js` | Pre-push checks, live preview in a sandboxed iframe |
| `js/templates.js` | Project templates (data only) |
| `js/chat.js`, `js/settings.js` | `send()`, `render()`, settings screens, the global click handler, start-up |

## Where to start for common changes

- **New settings row or button:** draw it in `js/settings.js` (or `ghHTML()` in `js/github.js` for the GitHub page), give the button `data-act`, and add an `else if(d.act==='…')` branch in the click handler in `js/settings.js`.
- **New agent tool:** add its definition to `TOOLS` and a case to `tool()` in `js/agent-tools.js`; mention it in the system prompt in `js/agent.js` if the agent needs to know when to use it.
- **GitHub calls:** always go through `gh(path, options)` so rate limits and errors are handled the same way everywhere.
- **Secrets:** the GitHub token and API keys stay in this browser only. Never sync them and never commit them (`scripts/check.js` scans for them).

## Before you push

Run `node scripts/check.js`. It checks that every file is loaded and listed in `sw.js`, that each script (and all scripts joined in load order) parses, that the CSP is intact, and that no secret is committed. It also prints a **warning** for source lines longer than 400 characters: please break long lines into several lines when you touch them, because short lines make line-range reads and diffs much more useful.
