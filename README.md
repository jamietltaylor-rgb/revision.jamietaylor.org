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
