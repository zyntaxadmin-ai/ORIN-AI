# Orin

A personal AI chat app that runs entirely in the browser. Bring your own API providers, set a fallback order, and sync everything across your devices.

**Live app:** https://zyntaxadmin-ai.github.io/ORIN-AI/

No build step, no framework, no server. The whole app is a single `index.html` file.

## Features

- **Any provider.** Add OpenAI-compatible APIs (OpenRouter, Groq, DeepSeek, Together, OpenAI, local servers), Anthropic, or Gemini. Quick-fill presets included.
- **Auto fallback.** Providers are tried in your chosen order. If one fails (error, rate limit, timeout), the next one takes over.
- **Model picker.** Choose **Auto** or pin one specific provider from the composer.
- **Streaming replies** with a **Stop** button.
- **Attachments.** Images, text/code files, and PDFs (PDFs work with Gemini and Anthropic).
- **Web search.** Turn on the 🌐 button and Orin searches the web (via Tavily) before answering, then shows source links under the reply. Add your Tavily key in Settings.
- **Image generation.** Turn on the 🎨 button to send your message as an image prompt to any OpenAI-compatible `/images/generations` API (OpenAI, Together, ...). Configure it in Settings.
- **More file types.** Attach `.zip`, whole folders (desktop browsers), Word (`.docx`), Excel (`.xlsx`, as CSV per sheet) and PowerPoint (`.pptx`) — read fully in the browser, no libraries. Zips/folders skip binaries, `node_modules`, `.git` and files over 1.5MB. Up to 10 attachments per message.
- **Plan-first (safer agent).** In Settings → GitHub choose Off / Big tasks / Always. The AI shows a plan card (summary, files, steps) and waits for **Approve** before touching more than one file or deleting anything. Edits are blocked in code until you approve.
- **Cheaper agent runs.** Claude requests use prompt caching (system, tools and conversation prefix); old bulky tool outputs are trimmed so they are not re-sent every step; the usage line shows how many input tokens were cached.
- **Big files.** Text files up to 15MB per attachment (no silent truncation). **Smart mode** kicks in automatically when attached files exceed ~55% of the model's context: only the excerpts relevant to your question are sent (local BM25 search, no server), and in GitHub agent mode the AI can also use `search_attachment` / `read_attachment` to explore the file. Files are stored in IndexedDB, not localStorage, so chats stay light; the tray shows size and token estimate, and Orin warns before sending more than the model's context window (set per provider in Settings → Providers → Context window).
- **Organised Settings.** Settings opens as a menu (Providers & Models, System prompt, Web search, Image generation, GitHub, Appearance & Voice, Account & Sync, Backup); each item opens its own page with a short status line.
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
- **Light and dark themes** in a white and blue style.

## Project structure

| File | Purpose |
| --- | --- |
| `index.html` | The entire app (HTML, CSS, JavaScript) |
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
4. Open `index.html`, find this line, and paste your values:

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
4. Start chatting. Use **+** for attachments, the model pill to pick Auto or a specific provider, and the mic for voice.

## Security notes

- Only use the **Publishable (anon) key** in the app. **Never** put the Secret / service_role key in `index.html`.
- Your API keys are stored in your Supabase database as plain JSON, protected by Row Level Security so only the signed-in owner can read them. The Supabase project owner can also see them in the dashboard, so keep your Supabase account secure.
- If this is only for you or a few people, turn off **Allow new users to sign up** in Supabase (**Authentication → Sign In / Providers**) and add users manually.
- Images and PDFs are kept in memory for the current session only. They are not saved to the device or the cloud.
- Logging out clears local data from that device. Your data stays in the cloud.

## Known limitations

- Some providers block direct browser requests (CORS). Those will show a "Network/CORS block" error. Use another provider or put a small proxy (for example a Cloudflare Worker) in front.
- Voice input depends on browser support and works best in Chrome.
- When two devices edit at the same time, the most recent save wins.

## Tech

Plain HTML, CSS, and JavaScript. Supabase Auth and PostgREST over `fetch`. No dependencies.

## License

Personal project. Add a license of your choice if you plan to share it.
