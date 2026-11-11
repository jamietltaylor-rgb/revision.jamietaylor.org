# Revise

A revision app: write or generate questions, answer them, and earn points, streaks, levels, badges, chests, weekly quests and unlockable looks. Every subject hatches its own pet, and all your pets live together on a farm.

- Plain HTML/CSS/JavaScript in `public/`. No build step.
- Optional logins + cloud saving through Supabase (free), so your progress follows you between devices.
- Optional "make questions for me" through Cloudflare's free Workers AI (`functions/api/generate.js`).
- Without the setup below the app still works: it saves in the browser only, and you can paste questions from another AI.

## Setup, in order

### 1. Put it on GitHub and Cloudflare Pages
- Upload the *contents* of this folder to a new, empty GitHub repository.
- Cloudflare → Workers & Pages → Create → Pages → Connect to Git → pick the repo.
- Framework preset **None**, build command **empty**, build output directory **`public`**. Save and Deploy.
- Custom domains tab → Set up a custom domain → `revision.jamietaylor.org`.

### 2. Logins (Supabase, free)
1. Make a **new** project at supabase.com (don't reuse the Lovable Cloud one). Choose any name, a database password you store somewhere safe, and the nearest region.
2. **SQL Editor → New query**: paste all of `supabase-setup.sql` and press Run.
3. **Authentication → Sign In / Providers → Email**: switch **Confirm email OFF** and save. (This is what makes sign-up work without email verification.)
4. Copy two things: the **Project URL** and the **publishable key** (Project Settings → API Keys; it starts `sb_publishable_`). Never use the `secret` / `service_role` key anywhere in this app.
5. On GitHub open `public/config.js`, paste them in between the quotes, and commit. Cloudflare redeploys automatically.

### 3. Optional: lock the door once everyone has signed up
Anyone who finds the site can create an account. When you and anyone you want to share it with have signed up, you can switch off new sign-ups in Supabase (Authentication → Sign In / Providers → turn off "Allow new users to sign up").

### 4. Question maker (Cloudflare Workers AI)
In your Pages project: **Settings → Bindings → Add → Workers AI**, variable name exactly `AI`. Then **Settings → Variables and secrets**, add two plain-text variables:
- `SUPABASE_URL` — same Project URL as step 2
- `SUPABASE_PUBLISHABLE_KEY` — same publishable key

Then redeploy (Deployments → the latest one → Retry, or make any small commit). The free allowance is shared across the whole site and resets daily.

## Notes
- Usernames are turned into private fake addresses (like `jamie@revise.invalid`). There is no email, so there is **no password reset**.
- Supabase free projects can pause after about a week with no use. Open the project in the dashboard and press Restore if that happens.
- Tests (optional, need Node 20+): `node --test tests/*.test.mjs` and `node tests/smoke.mjs`.

## Exam timetable, past-paper style questions and answer checking

- **Plan tab** – add mocks, GCSEs and A-levels (or paste a whole timetable) and the app builds a revision timetable. Sooner exams get more sessions, a subject is never set on its own exam day, and you can choose sessions per day, minutes each and rest days.
- **Past-paper style questions** – tick the box in *Make questions on a topic* and pick an exam board. Questions are tagged "past-paper style". Real past papers are copyrighted and an AI can't quote them reliably, so for the genuine papers use the exam board's own website.
- **Answers** – other correct wordings are accepted (number words, plurals, extra words, word order, small typos, the distinctive part of a name). If it still marks you wrong, "I was right ✔" counts it and remembers your wording.
- Nothing new to set up in Supabase or Cloudflare.
- **Exam board** – pick it once in *Make questions on a topic*; it's remembered and used to tailor every question set.
- **Complete exam questions** – choose "Complete exam questions" as the type, then tick which kinds you want. They are set the way real papers set them (modelled on the Edexcel GCSE Business sample papers):
  - **Multiple choice (1 mark)** – pick one of A–D. **Select two (2 marks)** – pick two of A–E, 1 mark each.
  - **Outline one… (2 marks)** – a point plus a linked development. **Explain one… (3 marks)** – 1 mark identify, 2 marks develop.
  - **Analyse / Discuss (6 marks)** and **Justify (9 marks)** – extended answers marked in **levels** (6: 1–2, 3–4, 5–6; 9: 1–3, 4–6, 7–9) for knowledge, application, chains of reasoning and (9 markers) a justified judgement.
  - In **Business**, the Outline / Analyse / Justify questions are set around a made-up business with a short case-study extract shown above the question.
  You get a paper-style mix (more short questions than 9 markers). The Revise tab can practise just multiple choice, just Outline/Explain, or just extended answers. They're saved as their own topic, e.g. "Biology – Exam questions". The kinds live in `EXAM_KINDS` in `public/logic.js`; the question maker (`functions/api/generate.js`) and the marker (`functions/api/mark.js`) both read them. Pasted lists can use `{"kind":"six","q":…,"marks":6,"a":"point ; point","ctx":"…"}`.
- **Marking** – typed answers to complete exam questions are marked by the AI against the mark scheme (6 and 9 markers are given a level, then a mark inside it) (new file `functions/api/mark.js`, same setup as the question maker). If the AI isn't available, the app falls back to matching key words.
- **Exam multiple choice and graph questions** – “Complete exam questions” can include multiple-choice questions (options in a fixed order, marked automatically; multiple choice is switched on by default only for subjects that have it, but you can tick it for any subject) and questions that come with a table, bar chart, line graph, scatter graph or pie chart (drawn in the app, no images needed). They are only made for subjects whose real exams have them (the sciences, Maths, Geography, Business, Economics, Psychology, Sociology, PE, Computer Science and similar); the subject you pick tells the maker which. The list is `FORMAT_RULES` in `public/logic.js`. Written answers about a graph are marked by the AI like other exam answers.
- **Smart answer checking** – if you're signed in and a typed short answer doesn't match, the AI (new file `functions/api/check.js`, same setup as the question maker) decides whether it's a typo, a synonym or another correct answer. If yes it counts as correct, and the exact answer is still shown. If the AI isn't available the normal result stands.
- **Date headings** – the timetable list reader also understands timetables written with the date as a heading (e.g. “Monday 9th November”) and the exams underneath, with optional AM / PM.
- **Photo of a timetable** – in the Plan tab's paste box, "Copy a prompt to turn a photo into a list" gives you text to paste into another AI (with your photo attached). Paste its reply back into the box.
- **Erase a topic's questions** – the Questions tab's "Your topics" card has "Erase questions" (keeps the topic) and "Delete topic" (removes both).
- **Add to home screen** – the bottom of the Home tab has step-by-step instructions for iPhone/iPad, Android and computers (with an "Install now" button where the browser allows it).
- **Confirm boxes** – erasing or deleting now asks in the app itself instead of the browser's pop-up.
- **Revise tab** has two sub-tabs, ⚡ Quick questions and 📝 Exam questions, so you can practise them separately.
- **Checking the AI setup** – open `/api/generate` on your site in a browser. `{"ok":true,"login":true,"ai":true}` means everything is connected. The Questions tab also has a "Check it's set up" button.
- **Visit counter and admin panel** – `public/stats.js` counts anonymous visits (a random id kept on the visitor's own device, no names or addresses) and shows a hidden admin panel: tap 5 times quickly in the very bottom-right corner (there is no button) and type the admin password. The numbers for all four sites are kept by the Lost Roads server (`roads2d.jamietaylor.org/api/stats/`). The same file is used by Revise, Shared List, PackSmart and Lost Roads. `app.js` reports feature counters through `track(...)` (quizzes, exams, questions, AI use) and shows a "Send feedback" link at the bottom of each screen while the owner has the feedback box switched on.

## Exam guides (how real papers are laid out and marked)
`public/examguides.js` holds, per subject and exam board, the paper layout, question styles, command words and mark-scheme rules, paraphrased from the exam boards' own published papers and mark schemes (each entry lists its `sources`). The question maker (`functions/api/generate.js`) and the marker (`functions/api/mark.js`) both read it. To add a subject, add an entry to `GUIDES`.
