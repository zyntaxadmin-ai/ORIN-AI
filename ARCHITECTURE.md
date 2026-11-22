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
| `js/skills.js` | Skills: built-in list (`SKILLS`), custom skills, Auto picking (`skAuto`), prompt text (`skPrompt`, `skSys`, `skIndex`), the composer Skills menu and the Settings → Skills page |
| `js/connectors.js` | Connectors (Vercel, Netlify, Cloudflare, Render, Supabase, Notify, MCP servers, custom APIs): `cnRegister()`, `cnHttp()` (native HTTP in the Android app, fetch in a browser), Settings → Connectors page, `allTools()` and `cnRun()` for the agent |
| `js/extras.js` | Background keep-alive (`bgBusy`), notifications, Memory (`memNote`), extra agent tools (`EXTRA_TOOLS`, `extraTool`: fetch_url, check_site, create_branch, rerun/dispatch workflow, remember), deploy site check (`postDeploy`), chat export/import |
| `js/agent-tools.js` | Tool definitions (`TOOLS`) and the executor `tool()` |
| `js/agent.js` | Agent loop, history trimming, system prompt |
| `js/push.js` | Drafts, diffs, push, deploy status, PR actions, undo |
| `js/checks.js`, `js/preview.js`, `js/preview-frame.js` | Pre-push checks, live preview in a sandboxed iframe |
| `js/templates.js` | Project templates (data only) |
| `js/repomap.js` | Repo map: index of files → functions, classes, routes, headings with line numbers, cached by blob sha (`repo_map` tool, also used by `search_code` on big repos) |
| `js/chat.js`, `js/settings.js` | `send()`, `render()`, settings screens, the global click handler, start-up |

## Where to start for common changes

- **New settings row or button:** draw it in `js/settings.js` (or `ghHTML()` in `js/github.js` for the GitHub page), give the button `data-act`, and add an `else if(d.act==='…')` branch in the click handler in `js/settings.js`.
- **New built-in skill:** add an object to `SKILLS` in `js/skills.js` (`id`, `name`, `grp` of `ui`, `code` or `gh`, short `desc`, a `kw` regex that Auto matches against the user's message, and a `body` of instructions; `agent:1` makes it GitHub-agent only). Keep the body short, it is sent with every message while the skill is active. Active skills are added by `skSys()` (normal chat, in `callProvider`) and `skPrompt()` (agent, in `agentSys`). Chat state lives in `chat.sk` (`pins` ticked by the user, `sel` picked by Auto); settings live in `S.sk`.
- **New connector (plugin):** call `cnRegister({id,name,ic,desc,help,fields,test,tools})` in `js/connectors.js` (or any script loaded after it). Each tool has `name`, `description`, `parameters`, `run(args,cfg)` and optionally `confirm(args)` (return a question to ask the user first, or null). It appears in Settings → Connectors by itself and its tools reach the agent once its token is saved. Always use `cnHttp()` / `cnJson()` for requests.
- **New agent tool:** add its definition to `TOOLS` (GitHub tools) or `EXTRA_TOOLS` (everything else) and a case to `tool()` in `js/agent-tools.js` (or `extraTool()` in `js/extras.js`); mention it in the system prompt in `js/agent.js` if the agent needs to know when to use it.
- **GitHub calls:** always go through `gh(path, options)` so rate limits and errors are handled the same way everywhere.
- **Secrets:** the GitHub token, connector tokens (`S.cn`) and API keys stay in this browser only. Never sync them and never commit them (`scripts/check.js` scans for them).

## Before you push

Run `node scripts/check.js`. It checks that every file is loaded and listed in `sw.js`, that each script (and all scripts joined in load order) parses, that the CSP is intact, and that no secret is committed. It also prints a **warning** for source lines longer than 400 characters: please break long lines into several lines when you touch them, because short lines make line-range reads and diffs much more useful.
