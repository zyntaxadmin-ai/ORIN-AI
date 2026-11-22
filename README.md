# Orin

A personal AI chat app that runs entirely in the browser. Bring your own API providers, set a fallback order, and sync everything across your devices.

**Live app:** https://zyntaxadmin-ai.github.io/ORIN-AI/

No build step, no framework, no server. Plain HTML, CSS and JavaScript files that GitHub Pages serves as they are.

## Features

- **Any provider.** Add OpenAI-compatible APIs (OpenRouter, Groq, DeepSeek, Together, OpenAI, local servers), Anthropic, or Gemini. Quick-fill presets included.
- **Smart fallback.** Providers are tried in your chosen order, and every error is understood: a rejected key or missing model skips to the next provider right away and is flagged in Settings; a rate limit, overload or network error is retried a couple of times first; a message too long for one model moves on to the next. A provider that keeps failing rests for a few minutes (or until you fix it) and is tried last. A short notice above the reply says what is happening, and when everything fails you get a plain explanation of what to fix. Retries, rest time and the first-reply timeout are set in Settings → Providers & Models. Each provider can be marked as not reading images or not supporting tool calling (Edit provider), and providers that cannot do the job, or whose context window is too small for the chat, are skipped before any call is made. Health is kept on your device only.
- **Pinned model with backup.** When you pick one model in the model menu, turn on "If it fails, use my other providers" to have it tried first and the rest as backup.
- **Connectors.** Settings → Connectors links Vercel, Netlify, Cloudflare (Pages, Workers), Render, Supabase, ntfy notifications, any remote **MCP server** (by URL) and any REST API (base URL plus a token header). In agent mode the assistant can read why a deploy failed (build logs), check status, run read-only SQL, trigger a redeploy, and so on; anything that changes something asks you first. Tokens stay on the device. New services are added with `cnRegister()` (see ARCHITECTURE.md). In a normal browser some services block web pages (CORS): the Android app talks to them directly, or put `scripts/cors-proxy-worker.js` on your own Cloudflare Worker and set it under Browser access.
- **Keeps working in the background.** While a reply or agent run is going the screen is kept awake (browsers) and the Android app shows a small "Orin is working" notification (a foreground service) so the phone does not freeze it. If the network drops or the app was away, the call is repeated without marking your provider as failed. If the app is killed anyway, the chat says the reply was interrupted and offers Retry.
- **Notifications.** When a reply that took more than 15 seconds ends while the app is hidden you get a notification (on the device, and through ntfy if you set a topic). The agent can also send one itself (`send_notification`).
- **Memory.** Settings → Memory holds short notes known in every chat. Say "remember that I use Vercel" and the assistant saves it; notes sync with your account.
- **More agent tools.** `fetch_url` (read any page), `check_site` (is the live site really up: status, error page, missing files; also run automatically after a Pages deploy), `create_branch`, `list_workflows`, `rerun_workflow`, `dispatch_workflow`.
- **Chat export / import.** The ⋯ menu of a chat exports it as Markdown or JSON; Settings → Backup imports a chat file (Orin JSON or Markdown with `## Me` / `## Orin` headings).
- **Skills.** 14 built-in instruction packs for web developers: UI Design, Design System & Themes, Responsive Check, Accessibility, Performance & SEO, Component Builder, Animation & Motion, Code Review, Debug Helper, Architecture Review, Deploy Helper, and for the GitHub agent Repo Reader, Repo Editor and Commit & PR Workflow. Turn **Auto** on and Orin picks the skills that fit each message (English and Bangla trigger words, no extra AI call, at most 3, kept for the chat); the GitHub agent can also load more with `load_skill`. Or switch Auto off and tick skills yourself with the **Skills** button next to the message box. Settings → Skills switches single skills on or off and lets you write your own skills with trigger words. Skills sync with your account.
- **Model picker.** Choose **Auto** or pin one specific provider from the composer. On a phone it opens as a bottom sheet; providers are numbered in fallback order, a provider that is resting shows why, and the fallback option is a switch.
- **Home screen.** After login you land on a home screen with a message box: type there and a new chat starts with that message. Each active provider is shown as a small satellite circling the Orin ring (the first one, which answers first, is amber), with quick-start chips for common tasks. Your chat history stays in the menu (sidebar on wide screens).
- **Streaming replies** with a **Stop** button. Text is revealed smoothly instead of jumping in bursts (switched off if your device asks for reduced motion).
- **Code highlighting.** Code blocks are coloured (JS, Python, HTML, CSS, JSON, SQL, shell and more) with a small built-in highlighter, no library.
- **Continue.** If a reply is cut off by the output limit (or you press Stop), a **Continue** button carries on from where it stopped.
- **Fork a chat.** The fork button under a reply copies the chat up to that message into a new chat, to try another direction.
- **Temperature.** Settings → System prompt has a creativity slider (or Default). Models that refuse a temperature are retried without it automatically.
- **Long chats without a message limit.** The whole chat is sent while it fits the model's context window (set per provider in Settings; default 128k, Claude 200k, Gemini 1M). A window you set yourself is used to skip a provider that cannot take a message and to warn before a very long one; the automatic default is only used to decide when to summarize and never blocks a message. When it is about 60% full, the older messages are summarized once (up to about 900 words) and only the summary plus the newest 24 messages are sent. The chat on screen keeps everything. Turn summaries off in Settings → System prompt. Claude-type providers are asked for up to 32k tokens per reply (a model that allows less is detected and remembered automatically), and the GitHub agent may take up to 150 steps per run.
- **Attachments.** Images, text/code files, and PDFs (PDFs work with Gemini and Anthropic).
- **Web search.** Turn on the 🌐 button and Orin searches the web (via Tavily) before answering, then shows source links under the reply. Add your Tavily key in Settings.
- **Image generation.** Turn on the 🎨 button to send your message as an image prompt to any OpenAI-compatible `/images/generations` API (OpenAI, Together, ...). Configure it in Settings.
- **More file types.** Attach `.zip`, whole folders (desktop browsers), Word (`.docx`), Excel (`.xlsx`, as CSV per sheet) and PowerPoint (`.pptx`) — read fully in the browser, no libraries. Zips/folders skip binaries, `node_modules`, `.git` and files over 1.5MB. Up to 10 attachments per message.
- **Project templates.** The agent can scaffold a new project in one step: static site, Leaflet map, installable PWA, Vite + React (with a GitHub Pages workflow) or Cloudflare Worker. It keeps a per-chat **task checklist** so long builds can resume, can turn on **GitHub Pages** and set the repo description/topics (each with your confirmation).
- **Checks before push.** Draft files get a syntax check (JS, JSON, HTML inline scripts, CSS braces) and a secret scan (API keys, tokens, private keys, `.env`); warnings show on the draft card, the agent sees them in its tool results and fixes them, and Push asks for confirmation if any remain.
- **Actions log auto-fix.** The agent tool `get_actions_log` reads the failed jobs and steps of the latest GitHub Actions run on the current branch, finds the cause in your files and stages a fix. When a deploy fails after a push, the deploy card shows an **Ask AI to fix** button that sends the failure to the agent.
- **Images and docs for the agent.** `generate_image` uses the image API from Settings → Image generation and stages the result as a `.jpg` in the repo (asks for confirmation each time because it uses your API credits). `search_docs` looks up official documentation with your Tavily key, or reads one docs page when given a URL.
- **Repo map (find code in one step).** The agent tool `repo_map` returns an index of the repo: every file with its functions, classes, routes, SQL objects and headings, each with a line number (staged drafts included). `find` takes several names at once and returns just `path:line` hits; `path` maps one folder. Each file is read once and remembered by its blob sha (also on this device between chats), so repeat calls are instant. On a big repo `search_code` tries this index first instead of GitHub's lagging code search. The reply is kept under about 2,500 tokens and gets less detailed on very large repos.
- **Finds code without re-reading files.** `search_code` now searches the live files of the repo (staged drafts included) and returns `path:line` hits instead of using GitHub's lagging code-search index. The new `find_in_file` takes several queries for one file and returns line numbers, so the agent reads only a narrow line range. A big file read without a range returns an outline, repo file reads are cached during a run, an identical re-read is refused while the earlier result is still in the conversation, and trimmed old results say what they were so the agent can re-read just that part.
- **GitHub rate limits.** When GitHub answers with a rate limit (many parallel requests, big zip), Orin waits the `Retry-After` time (up to 25 s, twice) and retries instead of failing; for longer limits it says how long to wait. A plain 403 now says it is a token permission problem.
- **Rename without rewriting.** The agent tool `rename_file` moves one text file by staging a delete of the old path and the same content at the new path, so it no longer has to write the whole file again. Folders and images are not supported; the executable bit is kept.
- **Safer push.** Before a push Orin compares every file you changed with what is on GitHub now. If someone changed one of them after it was staged (another device, another person), it lists the files and asks before overwriting; a branch that moved during the push gives a clear message and keeps your draft.
- **Keys stay on the device.** The GitHub token, provider API keys, the Tavily key and the image API key are never uploaded with cloud sync (chats, the provider list, models and settings still sync); enter each key once on every device. A provider without a key shows **key nai** in Settings → Providers, and a toast reminds you after you sign in on a new device. Keys that an older version left in the cloud are removed from the cloud copy on the next sync (a device with no key of its own takes the old cloud key over once, so nothing is lost). **Log out** wipes this device's data including the keys.
- **Checks on every push.** `.github/workflows/check.yml` parses the inline scripts, `sw.js` and `manifest.json` and fails if a token or API key is committed.
- **Cheaper, faster agent.** In agent mode big attached files are no longer pasted into every step; the agent gets an index and tools instead. For a zip/folder of updated files it calls `compare_attachment` (new / changed / same vs the repo) and `apply_attachment` (stages them without rewriting each file; needs plan approval in plan-first mode), and `read_files` reads several files in one call. Old file contents in the tool-call history are cut after two turns, read pages are ~30000 chars, the prompt tells the agent to read only what it needs and to batch independent tool calls, and the step limit is 40.
- **Live preview.** A **Preview** button on the draft card runs the draft website (HTML + CSS + JS + images + JSON) in a sandboxed iframe, with phone/tablet/desktop widths, in-preview page links, and an error bar with an **Ask AI to fix** button.
- **Plan-first (safer agent).** In Settings → GitHub choose Off / Big tasks / Always. The AI shows a plan card (summary, files, steps) and waits for **Approve** before touching more than one file or deleting anything. Edits are blocked in code until you approve.
- **Cheaper agent runs.** Claude requests use prompt caching (system, tools and conversation prefix); old bulky tool outputs are trimmed so they are not re-sent every step; the usage line shows how many input tokens were cached.
- **Big files.** Text files up to 15MB per attachment (no silent truncation). **Smart mode** kicks in automatically when attached files exceed ~55% of the model's context: only the excerpts relevant to your question are sent (local BM25 search, no server), and in GitHub agent mode the AI can also use `search_attachment` / `read_attachment` to explore the file. Files are stored in IndexedDB, not localStorage, so chats stay light; the tray shows size and token estimate, and Orin warns before sending more than the model's context window (set per provider in Settings → Providers → Context window).
- **Organised Settings.** Settings opens as a grouped menu with a profile card at the top (Providers & Models, System prompt, Web search, Image generation, GitHub, Appearance & Voice, Account & Sync, Backup); each row has a status dot (green: ready, orange: needs attention) and opens its own page. Each provider row has an on/off switch and Edit, Retry now and move buttons. Theme is chosen from three previews (System, Light, Dark).
- **GitHub agent mode.** Pick any of your repos (or create a new one) from the **+** menu. The AI lists, reads, creates and edits files by itself using tool calling (OpenAI-compatible, Anthropic, Gemini). Changes are staged as a draft; you review them and press **Push**. **Undo** restores the previous commit. Needs a GitHub token (classic, `repo` scope). Writes to `.git/` and `.github/workflows/` are blocked. The draft card shows a red/green line diff, and you can push straight to the branch or open a **Branch + Pull Request** (with Merge/Close buttons). Any branch of the repo can be selected.
  - Smarter agent: streaming replies, repo-wide code search, multi-edit per file, saved repo notes (so later chats already know the project), read-only access to other repos.
  - Issues & PRs: the agent can list/read/create issues, read PRs with review comments, switch to a PR branch to fix them, and write the PR description (editable before opening).
  - Safety: per-file ✕ in the draft, commit **History** with non-destructive **Restore**, and a live **Deploy status** (GitHub Pages) after push/merge.
  - Files: attach any repo file to the chat from the repo sheet; the agent can commit images you attached (`save_attachment`).
- **Voice input** (Web Speech API) in Bangla, English, or Hindi.
- **Markdown rendering.** Headings, lists, tables, code blocks, links.
- **Accounts and cloud sync.** Email and password login via Supabase. Providers, API keys, system prompt, and chat history follow you to every device.
- **Multiple accounts.** Each account's data is separate and protected by Row Level Security.
- **Installable (PWA).** Add to home screen and use it like a native app.
- **Light and dark themes** (see Design below), following the system setting by default.

## Design

The look is called **Orbit**. Orin's mark is a ring, and every provider you add is something that can take over when another one fails, so the mark carries one amber satellite. It is the only thing that moves on its own: it circles the logo slowly, speeds up while Orin is thinking, sits at the end of a reply while it is being written, and each active provider orbits on the home screen.

- **Colours:** ink `#0d1230`, paper `#f4f6fb`, cobalt `#2f4dff`, satellite amber `#ffb224` (used for the satellite and warnings only). The chat history drawer and sidebar are ink-coloured in both themes. Colours are CSS variables at the top of `css/app.css`, with a dark set under `prefers-color-scheme` and `data-theme`.
- **Type:** Poppins for titles, Inter for text and the interface. Both are Latin subsets in `fonts/` (OFL licence in `fonts/LICENSE.txt`), so the app makes no font requests to other sites and works offline. Bangla uses the device's own Bangla font.
- **Motion:** the satellite, the rings drawing in on the home screen, a short entrance for your own new messages, and bottom-sheet menus. Everything stops when the device asks for reduced motion.
- **Phone first:** pop-up menus become bottom sheets under 700px; from 1024px the chat history is a permanent sidebar.

## Project structure

| File | Purpose |
| --- | --- |
| `index.html` | The page: HTML and the list of scripts to load (order matters) |
| `css/app.css` | All styles (design "Orbit": ink sidebar, cobalt accent, one amber satellite) |
| `fonts/` | Inter and Poppins, Latin subsets as WOFF, served from the app itself (offline-safe) |
| `preview.html`, `js/preview-frame.js` | Empty page (no CSP, by design) that the sandboxed live-preview iframe loads; the draft HTML is sent to it with `postMessage` |
| `js/core.js` | State, storage, helpers, markdown and code highlighting, chat list |
| `js/cloud.js` | Cloud sync and login (Supabase URL and publishable key are here), the home screen markup |
| `js/providers.js` | AI provider calls and streaming |
| `js/readers.js` | zip / folder / office file readers, pop-up menus and the model picker, theme and voice settings blocks |
| `js/github.js` | GitHub API helper (`gh()`), repos, branches, history, tree cache |
| `js/checks.js`, `js/preview.js` | Pre-push checks, live preview |
| `js/templates.js` | Project templates (data) |
| `js/repomap.js` | Repo map: cached index of files and their functions/classes with line numbers (`repo_map` tool) |
| `js/agent-tools.js` | Agent tool definitions (`TOOLS`) and the `tool()` executor |
| `js/agent.js` | Agent loop, history trimming, system prompt |
| `js/push.js` | Drafts, diffs, push, deploy status, PR actions, undo |
| `js/chat.js`, `js/settings.js` | `send()`, `render()`, settings screens, click handling, home message box, start-up |
| `manifest.json` | PWA manifest (name, colors, icons) |
| `sw.js` | Service worker for installability and offline shell |
| `icon-192.png`, `icon-512.png` | App icons |

## Setup

### 1. Deploy on GitHub Pages

1. Fork or clone this repository.
2. Go to **Settings → Pages**.
3. Set **Source** to **Deploy from a branch**, branch `main`, folder `/ (root)`.
4. Wait a minute. Your app will be live at `https://<username>.github.io/<repo>/`.

### 2. Create the Supabase backend (for login and sync)

1. Create a free project at [supabase.com](https://supabase.com).
2. In the **SQL Editor**, run:

   ```sql
   create table orin_data (user_id uuid primary key references auth.users(id) on delete cascade, data jsonb not null, updated_at timestamptz default now());
   alter table orin_data enable row level security;
   create policy "own row" on orin_data for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
   ```

3. Copy your **Project URL** and **Publishable key** from **Project Settings → API Keys**.
4. Open `js/cloud.js`, find this line, and paste your values:

   ```js
   const SB_URL='https://YOUR-PROJECT.supabase.co',SB_KEY='YOUR_PUBLISHABLE_KEY';
   ```

5. Create your account:
   - Either use **Create account** in the app, or
   - Add a user manually in **Authentication → Users** (tick **Auto Confirm User**).

### 3. Install on your phone

Open the live link in Chrome and choose **Install app** (or **Add to Home screen**) from the menu.

## Using it

1. Log in.
2. Open **Settings → Add provider**. Pick a preset or enter a name, format, base URL, API key, and model name.
3. Reorder providers with the arrows. Toggle them on or off.
4. Start chatting: type in the box on the home screen to begin a new chat. Inside a chat, use **+** for attachments, the model pill to pick Auto or a specific provider, and the mic for voice.

## Security notes

- Only use the **Publishable (anon) key** in the app. **Never** put the Secret / service_role key in any file of this repo.
- API keys and the GitHub token are **not** sent to Supabase: they are stored only in this browser (localStorage) on each device. Chats and the provider list (names, URLs, models) are stored in your Supabase database as JSON, protected by Row Level Security so only the signed-in owner can read them; the Supabase project owner can see them in the dashboard. Anyone with access to this browser profile (or to a backup file you export, which includes the keys) can read the keys.
- If this is only for you or a few people, turn off **Allow new users to sign up** in Supabase (**Authentication → Sign In / Providers**) and add users manually.
- Images and PDFs are kept in memory for the current session only. They are not saved to the device or the cloud.
- Logging out clears local data from that device. Your data stays in the cloud.

## Content Security Policy

`index.html` carries a CSP `<meta>` (GitHub Pages cannot set headers): scripts only from this site (no inline scripts or `on…=` handlers), no plugins, `base-uri`/`form-action` limited to self. This blocks injected inline script, e.g. from a bad markdown/HTML string.

- `'unsafe-eval'` is needed only because the pre-push check parses your draft JS with `new Function` (it is never run).
- `connect-src` still allows any `https:` and localhost URLs, because providers use URLs you type yourself. So the CSP does **not** stop a script from sending data out; it stops script from being injected in the first place.
- The live preview runs your draft in a sandboxed iframe (no `allow-same-origin`) that loads `preview.html`, which has no CSP so the draft's own inline scripts and CDN libraries work. The draft cannot read the app's storage, keys or DOM.
- `npm run`-free check: `node scripts/check.js` (also run by the `Check` workflow) fails if the CSP is weakened, an inline script/handler is added, or a page/script is missing from `sw.js`.

## Known limitations

- Some providers block direct browser requests (CORS). Those will show a "Network/CORS block" error. Use another provider or put a small proxy (for example a Cloudflare Worker) in front.
- Voice input depends on browser support and works best in Chrome.
- When two devices edit at the same time, the most recent save wins.

## Tech

Plain HTML, CSS, and JavaScript. Supabase Auth and PostgREST over `fetch`. No dependencies (the two fonts are bundled files, not a library).

The `js/*.js` files are plain scripts, not modules: they share one global scope and `index.html` loads them in a fixed order, so a new file must be added to the `<script>` list (and to `sw.js`). Top-level code in a file may only call functions from files loaded earlier or from functions that run later (event handlers, timers). The `Check` workflow parses every file and the files joined in load order, which catches duplicate `const` names across files.

## License

Personal project. Add a license of your choice if you plan to share it.
