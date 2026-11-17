/* Orin · skills — built-in and custom skills, manual picking, Auto selection, composer menu and Settings page.
   Plain script (no modules): shares one global scope with the other js/*.js files, loaded in the order listed in index.html.
   A skill is a short instruction pack. Active skills are added to the system prompt (normal chat and GitHub agent).
   State: S.sk = {auto: false when switched off, off: {id: 1} switched-off skills, custom: [{id,name,desc,kw,body}]}
          chat.sk = {pins: [ids the user ticked], sel: [ids Auto picked, newest first, max 3]} */
const SK_GROUPS=[['ui','Web & UI'],['code','Code & quality'],['gh','GitHub agent'],['custom','Your skills']];
const SK_MAX_AUTO=3,SK_MAX_PINS=5,SK_BUDGET=9000;
const SKILLS=[
 {id:'ui-design',name:'UI Design',grp:'ui',desc:'Design direction: type, color, layout, polish',
  kw:/\b(ui|ux|design|redesign|layout|landing|hero|navbar|footer|card|cards|palette|typography|font|fonts|color|colour|mockup|look|style|beautiful|modern|pretty)\b|ডিজাইন|লেআউট|ইউআই|রঙ|কালার|ফন্ট|সুন্দর|দেখতে|ল্যান্ডিং/i,
  body:`UI DESIGN. Before writing UI code, decide a design direction in 2-3 lines: purpose, audience, one memorable idea, tone (editorial, playful, calm, luxury, brutalist...). Then execute it with intent.
- Type: one distinctive heading font plus one readable body font (max 2 families); clear scale (12/14/16/20/28/40/56); tight line-height on big text.
- Color: one dominant color, one sharp accent, neutral surfaces, all as CSS variables. Avoid default purple-on-white gradients and flat grey boxes.
- Layout: consistent spacing scale (4/8/12/16/24/40/64), strong alignment, generous whitespace, one focal point per screen; vary section rhythm instead of repeating identical cards.
- Details: real-feeling copy, consistent radius and shadows, visible hover/focus/active states, empty/loading/error states.
- No lorem ipsum and no generic "Welcome to our website" hero text. When editing an existing project, keep its current look unless asked to change it.`},
 {id:'design-system',name:'Design System & Themes',grp:'ui',desc:'Tokens, dark mode, theme presets, one source of truth',
  kw:/\b(theme|themes|dark\s?mode|light\s?mode|design\s?system|tokens?|css\s?variables?|brand|branding|tailwind\s?config|palette)\b|থিম|ডার্ক\s?মোড|ব্র্যান্ড/i,
  body:`DESIGN SYSTEM AND THEMES. Put every visual decision in tokens; never hard-code colors inside components.
- Define CSS variables on :root: --bg, --surface, --ink, --muted, --line, --accent, --accent-ink, radius, spacing scale, font stacks, shadow levels.
- Dark mode: redefine the same variables under @media (prefers-color-scheme: dark) and a [data-theme] attribute so the user can also toggle it. Save the choice in localStorage inside try/catch and set the theme before first paint to avoid a flash.
- Check contrast (text 4.5:1, large text 3:1) in both themes; do not just invert colors.
- Build components from tokens only (buttons, inputs, cards, badges) with variants (primary, ghost, danger) and sizes.
- With Tailwind, keep tokens in the config theme/extend instead of scattered arbitrary values. Keep one source of truth.`},
 {id:'responsive',name:'Responsive Check',grp:'ui',desc:'Mobile-first layouts, check 360/768/1280 px',
  kw:/\b(responsive|mobile|tablet|breakpoint|breakpoints|media\s?quer(y|ies)|viewport|overflow|screen\s?size|phone|adaptive|grid|flex|flexbox)\b|রেসপন্সিভ|মোবাইল|ফোনে|স্ক্রিন/i,
  body:`RESPONSIVE CHECK. Design mobile-first and verify at 360, 768 and 1280 px.
- Include <meta name="viewport" content="width=device-width,initial-scale=1">. Use min-width media queries or container queries; prefer fluid units (clamp(), %, rem, fr) over fixed px widths.
- Hunt for: horizontal scroll (images, tables, long words, 100vw), tap targets under 44px, input text under 16px (iOS zoom), fixed headers covering content, 100vh problems on phones (use dvh), tables and code blocks that need overflow-x:auto.
- Images: max-width:100%, height:auto, width/height attributes or aspect-ratio to avoid layout shift, srcset when sizes differ a lot.
- Navigation must collapse into a usable mobile menu; no hover-only interactions.
- When reviewing, list concrete problems per breakpoint with file and selector, then fix them. The Preview button on the draft card shows phone, tablet and desktop widths: ask the user to check there.`},
 {id:'accessibility',name:'Accessibility',grp:'ui',desc:'WCAG AA: semantics, contrast, keyboard, labels',
  kw:/\b(a11y|accessib\w*|aria|screen\s?reader|contrast|alt\s?text|keyboard\s?nav\w*|focus|wcag|tab\s?order)\b|অ্যাক্সেসিবিলিটি|কনট্রাস্ট/i,
  body:`ACCESSIBILITY. Aim for WCAG 2.2 AA.
- Semantic HTML first: header, nav, main, section, button (not div onclick), a for links, a label for every input, one h1 and ordered headings, lang on <html>.
- Images: meaningful alt text, alt="" for decoration. Icon-only buttons need aria-label. Do not add ARIA where native HTML already works.
- Contrast 4.5:1 for text, 3:1 for large text and UI borders. Never use color alone to show state.
- Keyboard: everything reachable with Tab in a logical order, a visible :focus-visible style (never outline:none without a replacement), Esc closes modals, focus is trapped in dialogs and restored afterwards.
- Respect prefers-reduced-motion; do not autoplay moving content.
- Forms: clear error messages linked with aria-describedby.
- Report issues as: problem, where (file:line), fix.`},
 {id:'perf-seo',name:'Performance & SEO',grp:'ui',desc:'Speed, Core Web Vitals, meta tags, sitemap',
  kw:/\b(seo|performance|speed|slow|lighthouse|core\s?web\s?vitals|lcp|cls|lazy|optimi[sz]e|bundle|minify|meta\s?tags?|sitemap|robots|page\s?speed|compress\w*)\b|স্পিড|ধীর|স্লো|এসইও|অপটিমাইজ/i,
  body:`PERFORMANCE AND SEO.
- Images: modern formats (webp/avif), right size, width/height set, loading="lazy" below the fold, fetchpriority="high" on the hero image.
- CSS/JS: remove unused code, defer scripts, avoid render-blocking third-party scripts, preload only fonts that are really used, font-display:swap, subset fonts.
- Avoid layout shift (reserve space), long tasks, huge DOMs and heavy scroll animations.
- SEO basics: unique <title> (50-60 chars) and meta description (150-160), one h1, canonical link, Open Graph and Twitter tags, descriptive link text, sitemap.xml and robots.txt, JSON-LD structured data when it fits.
- Static hosting: add a service worker or cache headers only when you can version them safely.
- Targets: LCP under 2.5 s, CLS under 0.1, INP under 200 ms. Tell the user which change gives the biggest win first.`},
 {id:'component-builder',name:'Component Builder',grp:'ui',desc:'Reusable accessible components: nav, forms, modals',
  kw:/\b(component|components|button|buttons|form|forms|modal|dialog|navbar|menu|dropdown|tabs?|accordion|carousel|slider|table|pricing|testimonial|tailwind|shadcn|react|vue|svelte|input|toast|sidebar)\b|কম্পোনেন্ট|ফর্ম|বাটন|মডাল/i,
  body:`COMPONENT BUILDER. Build reusable, accessible components.
- Use the simplest stack the project already uses (plain HTML/CSS/JS, React, Tailwind, shadcn/ui). Do not add a framework or library unless asked.
- One component, one job. Inputs as props or attributes, no hidden global state. Cover the states: default, hover, focus-visible, active, disabled, loading, error, empty.
- Prefer native elements (button, dialog, details, nav) over custom ones; keyboard and screen-reader support are part of "done".
- Mobile-first; spacing and colors come from the existing tokens or CSS variables.
- Typical set: navbar with mobile menu, hero, feature grid, pricing, testimonial, FAQ accordion, form with validation, modal, toast, tabs, table, footer.
- Keep the code short and readable and show a usage example after the component.`},
 {id:'animation',name:'Animation & Motion',grp:'ui',desc:'Smooth, light animations and micro-interactions',
  kw:/\b(animat\w*|motion|transitions?|hover|parallax|keyframes?|micro-?interactions?|gsap|lottie|fade|spinner|loader|skeleton)\b|অ্যানিমেশন|এনিমেশন|ট্রানজিশন/i,
  body:`ANIMATION AND MOTION. Motion should explain, not decorate.
- Animate only transform and opacity (smooth on every device); avoid animating width, height, top or left. Use will-change sparingly.
- Durations: 120-200 ms for hover and press, 250-400 ms for entrances and panels. ease-out for entering, ease-in for leaving; keep one small set of easing tokens.
- Prefer CSS transitions and keyframes, and IntersectionObserver for scroll reveals. Add a library (GSAP, Motion) only when the effect needs it.
- Always honor prefers-reduced-motion (reduce or remove movement).
- Worth adding: button press, focus ring, toggles, skeleton loaders, section reveal, form success. Stagger lists with small delays (40-80 ms).
- Never hide content behind an animation; clean up listeners and timers.`},
 {id:'code-review',name:'Code Review',grp:'code',desc:'Review code for bugs, security and clarity',
  kw:/\b(review|audit|code\s?quality|clean\s?up|best\s?practices?|smell|security|xss|vulnerab\w*|lint)\b|রিভিউ|কোড\s?দেখ|নিরাপত্তা|সিকিউরিটি/i,
  body:`CODE REVIEW. Read the changed code and the code around it before judging. Go in this order and be specific (file:line, what is wrong, how to fix):
1. Correctness: logic errors, off-by-one, unhandled null/undefined, async mistakes (missing await, races), wrong assumptions about data.
2. Security: XSS (innerHTML with user data, unescaped output), injection, secrets in code, unsafe eval, missing validation, open redirects, loose CORS or CSP, tokens stored without need.
3. Robustness: error handling, empty/loading/error states, edge cases, leaks (listeners, timers).
4. Maintainability: naming, duplication, function size, dead code, comments that lie.
5. Performance and accessibility: obvious waste, missing labels.
Group findings as Must fix / Should fix / Nice to have, and praise what is good in one line. Do not rewrite code the user did not ask you to change: propose the fix, and stage it only when asked.`},
 {id:'debug',name:'Debug Helper',grp:'code',desc:'Find the root cause of errors and broken pages',
  kw:/\b(bug|bugs|debug\w*|error|errors|exception|crash\w*|broken|fails?|failed|failing|fix|stack\s?trace|console|undefined|404|500|cors|blank\s?page|white\s?screen)\b|বাগ|এরর|ভুল|কাজ\s?করছে\s?না|কাজ\s?করে\s?না|ঠিক\s?কর|সমস্যা|ফিক্স/i,
  body:`DEBUG HELPER. Find the cause before changing code.
1. Restate the symptom and the expected behavior in one line. Get the exact error text, file, line and steps; if missing, check the Preview error bar or the Actions log first.
2. Form 2-3 hypotheses ranked by likelihood and test the cheapest first by reading the exact lines involved (not whole files).
3. Common web causes: wrong file path or letter case, script load order, null element (script runs before the DOM exists), undefined variable or typo, CORS or CSP blocking, missing await, stale cache or service worker, wrong base path on GitHub Pages, build config, wrong package version.
4. Fix the root cause with the smallest change. Do not add try/catch just to hide an error.
5. Say what you changed and how the user can confirm it works. If you could not verify it, say so.`},
 {id:'architecture',name:'Architecture Review',grp:'code',desc:'Project structure, refactors, file size, dependencies',
  kw:/\b(architect\w*|structure|folder\s?structure|refactor\w*|split|modular\w*|organi[sz]e|scal(e|able|ability)|state\s?management|monolith|dependency|dependencies|tech\s?stack|big\s?file|large\s?file)\b|আর্কিটেকচার|স্ট্রাকচার|ভাগ\s?কর/i,
  body:`ARCHITECTURE REVIEW. Understand before you propose.
- First map the project: entry points, how files load, where state lives, build and deploy setup (package.json, config files, workflows). Read ARCHITECTURE or README if present.
- Judge: file size and responsibility (one file, one job), duplicated logic, hidden or circular dependencies, global state, naming consistency, folder layout, configuration and secrets handling, testability.
- Recommend small steps ordered by value and risk (quick wins first) and give the tradeoff of each in one line. Do not suggest a rewrite or a new framework without strong reasons.
- For refactors: keep behavior identical, move code in small safe steps, update every import, script tag or registration that points to it, and follow the project's own conventions.
- End with a short prioritized list the user can approve.`},
 {id:'deploy',name:'Deploy Helper',grp:'code',desc:'GitHub Pages, Vercel, Netlify, Cloudflare, domains',
  kw:/\b(deploy\w*|hosting|host|github\s?pages|pages|vercel|netlify|cloudflare|domain|dns|ssl|https|workflow|actions|build\s?failed|publish|go\s?live|production)\b|ডিপ্লয়|হোস্টিং|ডোমেইন|পাবলিশ|লাইভ/i,
  body:`DEPLOY HELPER.
- Static sites: GitHub Pages (branch or Actions workflow), Netlify, Cloudflare Pages or Vercel. Give exact setting values (branch, folder, build command, output directory) for the project's real structure.
- Check before deploying: relative vs absolute asset paths (a project site lives under /repo-name/), case-sensitive file names, index.html at the root, a 404.html, no secrets committed, an .env.example, no console errors.
- GitHub Pages: Vite needs base: '/repo/', single-page apps need a 404.html fallback, a custom domain needs a CNAME file, and HTTPS should be enforced.
- Custom domain: say which DNS records to add (A, ALIAS or CNAME) and that propagation can take time.
- When a deploy fails: read the Actions log, find the first real error (not the last line), fix that, and explain it in plain words.`},
 {id:'repo-reader',name:'Repo Reader',grp:'gh',agent:1,desc:'Read and explain a GitHub repo with path:line proof',
  kw:/\b(explain|understand|how\s+does|how\s+do|where\s+is|where\s+does|find|locate|trace|walk\s?through|overview|summari[sz]e|what\s+does|read|codebase|repo|repository|flow)\b|বুঝিয়ে|বুঝতে|কোথায়|খুঁজে|কীভাবে|কিভাবে|পড়ো|রেপো|কোডবেস|ওভারভিউ/i,
  body:`REPO READER. When the user asks to understand, explain or find something in the repository:
1. Start from the project's own docs if they exist (README, ARCHITECTURE, CONTRIBUTING) and the manifest (package.json, config, workflows) to learn the stack, entry points and conventions.
2. Follow the real flow: entry file, then the function that handles the thing asked, then what it calls. Use repo_map find and find_in_file for names and read only narrow line ranges.
3. Answer with evidence: cite path:line for every claim, and separate what you saw in the code from what you are guessing.
4. Explain simply: purpose first, then the flow in numbered steps, then gotchas (global state, load order, side effects, TODOs).
5. If the answer is not in the code you read, say so and say what you would check next. Never invent files or functions.`},
 {id:'repo-editor',name:'Repo Editor',grp:'gh',agent:1,desc:'Add or change code in a repo, matching its style',
  kw:/\b(add|create|implement|build|make|change|update|modify|rename|remove|delete|integrate|extend|feature|new\s+page|new\s+file)\b|অ্যাড|যোগ|বানাও|তৈরি|যুক্ত|পরিবর্তন|আপডেট|সরাও|মুছ|ফিচার|বদলাও/i,
  body:`REPO EDITOR. When adding or changing code in an existing repository:
1. Match the project: same language level, naming, formatting, file layout and patterns. Find the closest existing feature and copy its approach.
2. Find every place a change must touch: imports or script tags, registries, routes, config, service worker or cache lists, CSP, types, tests, docs. Read the project's rules (ARCHITECTURE, README, CONTRIBUTING) first if they exist and follow them.
3. Make the smallest working change. Do not reformat or rewrite untouched code, and do not add dependencies unless asked.
4. New files get complete content and are registered where needed. For existing files use edit_file or edit_many with exact text; never guess content you did not read.
5. Check your work: re-read the edited region, look for syntax errors, unused names and duplicate identifiers in shared scopes, and fix any WARNING in tool results.
6. Finish with: what changed (one line per file), anything the user must do (push, install, settings), and risks.`},
 {id:'git-workflow',name:'Commit & PR Workflow',grp:'gh',agent:1,desc:'Commit messages, PR text, branches, review fixes',
  kw:/\b(commit|commits|push|pull\s?request|pr|branch|branches|merge|issue|issues|changelog|release|review\s?comments?|conflict|revert|rebase|tag)\b|কমিট|পুশ|ব্রাঞ্চ|মার্জ|ইস্যু|পিআর/i,
  body:`COMMIT AND PR WORKFLOW.
- One logical change per commit. Commit message: imperative subject under 72 characters ("Add skills picker"), a blank line, then a short body that explains why when it is not obvious.
- Pull request description: Summary (what and why), Changes (one bullet per area), How to test (steps), Notes or screenshots for UI, Risks, and "Fixes #N" when an issue applies.
- Branch names: type/short-topic (feat/skills-picker, fix/mobile-nav). Suggest a branch for risky or multi-file work instead of the default branch.
- To fix PR review comments: read the PR and its comments, switch to its branch, address each comment, and list which comment each change answers.
- Never commit secrets; check that .gitignore covers .env. Remind the user that your changes are staged as a draft and need the Push button.`}
];

/* ---------- state helpers ---------- */
const skAutoOn=()=>!(S.sk&&S.sk.auto===false);
const skCustom=()=>((S.sk&&S.sk.custom)||[]).map(x=>({id:x.id,name:x.name||'Skill',grp:'custom',desc:x.desc||'Your own skill',kwl:x.kw||'',body:x.body||'',custom:1}));
const skAll=()=>SKILLS.concat(skCustom());
const skById=id=>skAll().find(s=>s.id===id);
const skOff=s=>!!(S.sk&&S.sk.off&&S.sk.off[s.id]);
/* usable in this chat: switched on, and GitHub-agent skills only while the agent is on */
const skUsable=s=>!skOff(s)&&(!s.agent||agentOn());
function skRe(s){
  if(s.kw)return s.kw;
  const w=String(s.kwl||'').split(/[,\n]/).map(x=>x.trim()).filter(Boolean).slice(0,40).map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
  if(!w.length)return null;
  try{return new RegExp('(?:^|[^\\p{L}\\p{N}])(?:'+w.join('|')+')(?=$|[^\\p{L}\\p{N}])','iu')}catch(e){return null}
}
function skScore(s,txt){
  const re=skRe(s);if(!re)return 0;
  const g=new RegExp(re.source,re.flags.replace('g','')+'g'),seen=new Set();let m,n=0;
  while((m=g.exec(txt))&&n++<60){seen.add(m[0].toLowerCase().trim());if(m[0]==='')g.lastIndex++}
  return seen.size;
}
/* which usable skills match this message, best first (no extra AI call, works offline) */
function skPicks(txt){
  const t=String(txt||'').slice(0,4000);
  return skAll().filter(skUsable).map((s,i)=>({s,n:skScore(s,t),i})).filter(x=>x.n>0).sort((a,b)=>b.n-a.n||a.i-b.i).slice(0,SK_MAX_AUTO).map(x=>x.s.id);
}
/* Auto: called from send(). Skills picked for the newest message come first, older picks stay while there is room. */
function skAuto(c,txt){
  if(!c||!skAutoOn())return;
  const p=skPicks(txt);if(!p.length)return;
  const sk=c.sk=c.sk||{};
  sk.sel=p.concat((sk.sel||[]).filter(id=>!p.includes(id))).slice(0,SK_MAX_AUTO);
}
function skActive(c){
  if(!c)return[];
  const sk=c.sk||{},ids=(sk.pins||[]).slice();
  if(skAutoOn())(sk.sel||[]).forEach(id=>{if(!ids.includes(id))ids.push(id)});
  const out=[];let n=0;
  for(const id of ids){const s=skById(id);if(!s||!skUsable(s))continue;n+=s.body.length;if(n>SK_BUDGET&&out.length)break;out.push(s)}
  return out;
}
function skPrompt(c){
  const a=skActive(c);if(!a.length)return '';
  return '\n\n[Skills]\nThese skills are active for this chat. Apply the ones that fit the request; the user\'s own instructions always come first.\n'+a.map(s=>'\n### '+s.name+'\n'+s.body.trim()).join('\n');
}
/* system prompt for normal chat: the Settings prompt plus the active skills */
const skSys=()=>S.system+skPrompt(chat());
/* GitHub agent: short list of the other skills it may load by itself */
function skIndex(c){
  if(!skAutoOn())return '';
  const on=new Set(skActive(c).map(s=>s.id)),l=skAll().filter(s=>skUsable(s)&&!on.has(s.id));
  if(!l.length)return '';
  return '\nMore skills you can load with load_skill (id: when to use): '+l.map(s=>s.id+': '+s.desc).join(' | ')+'. Load one only when the task clearly needs it.';
}
function skLoad(c,id){
  const q=String(id||'').toLowerCase().trim(),s=skAll().find(x=>x.id===q||x.name.toLowerCase()===q);
  if(!skAutoOn())return 'Skills are set to manual (Auto is off), so only the skills the user ticked are used. Continue without loading more.';
  if(!s)return 'No skill with that id. Available: '+skAll().filter(skUsable).map(x=>x.id).join(', ');
  if(!skUsable(s))return 'That skill is switched off by the user.';
  const sk=c.sk=c.sk||{};sk.sel=[s.id].concat((sk.sel||[]).filter(x=>x!==s.id)).slice(0,SK_MAX_AUTO);rawSave();
  return 'SKILL '+s.name+' (loaded for this chat):\n'+s.body.trim();
}

/* ---------- composer button, chips and menu ---------- */
function updateSkillUI(){
  const b=$('skb');if(!b)return;
  const n=skActive(chat()).length;
  b.innerHTML=ico('spark',14)+'<span class="skl">Skills</span>'+(n?'<b class="skn">'+n+'</b>':'');
  b.className='pill'+(skAutoOn()?' au':'');
  b.setAttribute('aria-label','Skills, auto '+(skAutoOn()?'on':'off')+(n?', '+n+' active':''));
  updateModes();
}
function skChips(){
  const c=chat();if(!c)return '';
  const pins=(c.sk&&c.sk.pins)||[];
  return skActive(c).map(s=>'<button type="button" class="chip '+(pins.includes(s.id)?'on':'au')+'" data-skrm="'+qa(s.id)+'" aria-label="Remove skill '+qa(s.name)+'">'+ico('spark',13)+esc(s.name)+ico('x',12)+'</button>').join('');
}
function skMenuInner(){
  const c=chat(),pins=(c&&c.sk&&c.sk.pins)||[],sel=(c&&c.sk&&c.sk.sel)||[],auto=skAutoOn();
  let h='<button class="pi" data-skauto="1" role="switch" aria-checked="'+auto+'"><span><b>Auto</b><small>'+(auto?'On: Orin picks skills for each message':'Off: only the skills you tick are used')+'</small></span><i>'+(auto?ico('check',16):'')+'</i></button><hr>';
  for(const [g,label] of SK_GROUPS){
    const l=skAll().filter(s=>s.grp===g&&skUsable(s));if(!l.length)continue;
    h+='<div class="skg">'+label+'</div>'+l.map(s=>{
      const p=pins.includes(s.id);
      return '<button class="pi'+(p?' sel':'')+'" data-sk="'+qa(s.id)+'"><span><b>'+esc(s.name)+'</b><small>'+esc(s.desc)+'</small></span>'+(p?'<i>'+ico('check',16)+'</i>':(auto&&sel.includes(s.id)?'<i class="sa">auto</i>':''))+'</button>';
    }).join('');
  }
  return h+'<hr><button class="pi" data-act="skset"><span><b>Manage skills</b><small>Switch skills on or off, add your own</small></span><i>›</i></button>';
}
const skMenu=()=>'<div class="skm">'+skMenuInner()+'</div>';
function skRefresh(){
  const m=document.querySelector('#pop .skm');if(m)m.innerHTML=skMenuInner();
  updateSkillUI();
  if($('sheet').classList.contains('on')&&spage==='skills')drawSheet();
}
function skPin(id){
  const c=chat();if(!c){toast('Open a chat first');return}
  const sk=c.sk=c.sk||{},pins=sk.pins=sk.pins||[],i=pins.indexOf(id);
  if(i>=0)pins.splice(i,1);
  else{if(pins.length>=SK_MAX_PINS){toast('You can tick up to '+SK_MAX_PINS+' skills');return}pins.push(id)}
  save();skRefresh();
}
function skRemove(id){
  const c=chat();if(!c||!c.sk)return;
  c.sk.pins=(c.sk.pins||[]).filter(x=>x!==id);c.sk.sel=(c.sk.sel||[]).filter(x=>x!==id);
  save();skRefresh();
}
function skAutoToggle(){
  S.sk=Object.assign({},S.sk,{auto:!skAutoOn()});
  save();skRefresh();toast(skAutoOn()?'Auto skills on':'Auto skills off: only the skills you tick are used');
}
function skSwitch(id){
  const off=Object.assign({},S.sk&&S.sk.off);
  if(off[id])delete off[id];else off[id]=1;
  S.sk=Object.assign({},S.sk,{off});save();skRefresh();
}

/* ---------- Settings page ---------- */
let skEdit=null;
const skSummary=()=>(skAutoOn()?'Auto':'Manual')+' · '+skAll().filter(s=>!skOff(s)).length+' skills on';
function skRow(s){
  const on=!skOff(s);
  return '<div class="skr"><div class="n"><b>'+esc(s.name)+'</b><small>'+esc(s.desc)+(s.agent?' · GitHub agent only':'')+'</small></div>'+
   (s.custom?'<button class="chip" data-skedit="'+qa(s.id)+'">Edit</button>':'')+
   '<button class="tgl '+(on?'on':'')+'" data-skon="'+qa(s.id)+'" role="switch" aria-checked="'+on+'" aria-label="'+qa(s.name)+'"></button></div>';
}
function skillsHTML(){
  if(skEdit)return skEditHTML();
  const auto=skAutoOn();
  let h='<div class="sec"><h3>Auto skills</h3><div class="row" style="margin-top:0;align-items:center;gap:10px">'+
   '<p class="h" style="flex:1;margin:0">Orin picks the right skills for each message, and the GitHub agent can load more by itself. '+
   'Switch off to use only the skills you tick in the chat. You can also tick skills with the Skills button next to the message box.</p>'+
   '<button class="tgl '+(auto?'on':'')+'" data-skauto="1" role="switch" aria-checked="'+auto+'" aria-label="Auto skills"></button></div></div>';
  for(const [g,label] of SK_GROUPS){
    const l=skAll().filter(s=>s.grp===g);
    if(!l.length&&g!=='custom')continue;
    h+='<div class="sec"><h3>'+label+'</h3>'+(l.map(skRow).join('')||'<p class="h">Write your own instructions, and Auto can use them when your message contains your trigger words.</p>')+(g==='custom'?'<div class="row"><button class="btn sm" data-act="sknew">Add skill</button></div>':'')+'</div>';
  }
  return h;
}
function skEditHTML(){
  const s=skEdit;
  return '<div class="sec"><h3>'+(s._new?'New skill':'Edit skill')+'</h3>'+
   '<label>Name</label><input class="f" id="ske-n" maxlength="40" value="'+qa(s.name)+'" placeholder="e.g. My landing page style">'+
   '<label>When to use it (one short line)</label><input class="f" id="ske-d" maxlength="100" value="'+qa(s.desc)+'" placeholder="e.g. Landing pages in my brand style">'+
   '<label>Trigger words (comma separated, optional). Auto picks this skill when your message has one of them.</label><input class="f" id="ske-k" maxlength="300" value="'+qa(s.kw)+'" placeholder="landing, hero, ল্যান্ডিং">'+
   '<label>Instructions</label><textarea class="f" id="ske-b" rows="10" maxlength="6000" placeholder="Rules and steps the AI should follow">'+esc(s.body)+'</textarea>'+
   '<div class="row"><button class="btn" data-act="sksave">Save</button><button class="btn ghost" data-act="skcancel">Cancel</button>'+(s._new?'':'<button class="btn danger" data-skdel="'+qa(s.id)+'">Delete</button>')+'</div></div>';
}
function skSave(){
  const v=id=>($(id)&&$(id).value||'').trim(),name=v('ske-n'),body=v('ske-b');
  if(!name){toast('Give the skill a name');return}
  if(!body){toast('Write the instructions');return}
  const o={id:skEdit._new?'c_'+uid():skEdit.id,name:name.slice(0,40),desc:v('ske-d').slice(0,100),kw:v('ske-k').slice(0,300),body:body.slice(0,6000)};
  const list=((S.sk&&S.sk.custom)||[]).slice(),i=list.findIndex(x=>x.id===o.id);
  if(i>=0)list[i]=o;else list.push(o);
  S.sk=Object.assign({},S.sk,{custom:list});skEdit=null;save();drawSheet();updateSkillUI();toast('Skill saved');
}
async function skDelete(id){
  if(!await ask('Delete this skill?','It will be removed from all chats.','Delete',true))return;
  S.sk=Object.assign({},S.sk,{custom:((S.sk&&S.sk.custom)||[]).filter(x=>x.id!==id)});
  skEdit=null;save();drawSheet();updateSkillUI();
}
/* click handler (called from the global click handler in settings.js): returns true when the click was a skills action */
function skHandle(d){
  if(d.skauto!==undefined){skAutoToggle();return true}
  if(d.sk!==undefined){skPin(d.sk);return true}
  if(d.skrm!==undefined){skRemove(d.skrm);return true}
  if(d.skon!==undefined){skSwitch(d.skon);return true}
  if(d.skedit!==undefined){const s=((S.sk&&S.sk.custom)||[]).find(x=>x.id===d.skedit);if(s){skEdit=Object.assign({},s);drawSheet();$('sbody').scrollTop=0}return true}
  if(d.skdel!==undefined){skDelete(d.skdel);return true}
  if(d.act==='sknew'){skEdit={_new:1,name:'',desc:'',kw:'',body:''};drawSheet();$('sbody').scrollTop=0;return true}
  if(d.act==='sksave'){skSave();return true}
  if(d.act==='skcancel'){skEdit=null;drawSheet();return true}
  if(d.act==='skset'){closePop();editing=null;view='';spage='skills';skEdit=null;openSheet();return true}
  return false;
}
{const b=$('skb');if(b)b.onclick=e=>pop(e.currentTarget,skMenu(),'Skills')}
