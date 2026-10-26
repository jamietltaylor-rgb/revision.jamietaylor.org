# Revise

A revision app: write your own questions, answer them, and earn points, streaks, levels, badges and rewards.

- No login, no database, no build step. It's plain HTML, CSS and JavaScript.
- Progress is saved in your browser on that device. Use **Questions → Download backup** to move it elsewhere.

## Files
- `public/` — the website itself (this is the folder Cloudflare publishes)
- `tests/logic.test.mjs` — optional tests for the scoring and scheduling rules (`node --test tests/logic.test.mjs`)

## Hosting on Cloudflare Pages
- Framework preset: None
- Build command: (leave empty)
- Build output directory: `public`
