import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost, onRequest, cleanReply } from "../functions/api/timetable.js";

const env = (ai) => ({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_t", AI: ai });
const post = (body, token = "Bearer good") => new Request("https://site/api/timetable", { method: "POST", headers: { authorization: token, "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
const realFetch = globalThis.fetch;
const stubAuth = () => { globalThis.fetch = async (url, init) => (init.headers.Authorization === "Bearer good" ? new Response(JSON.stringify({ id: "u1" }), { status: 200 }) : new Response("{}", { status: 401 })); };
test.afterEach(() => { globalThis.fetch = realFetch; });
const call = async (r, e) => { const res = await onRequestPost({ request: r, env: e }); return { status: res.status, body: await res.json() }; };
const good = { image: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==", today: "2026-11-02" };

test("needs a login, the AI binding and a real image", async () => {
  stubAuth();
  const never = env({ run: async () => assert.fail("must not call the AI") });
  assert.equal((await call(post(good, ""), never)).status, 401);
  assert.equal((await call(post(good, "Bearer bad"), never)).status, 401);
  assert.equal((await call(post(good), { SUPABASE_URL: "https://x.supabase.co", SUPABASE_PUBLISHABLE_KEY: "k" })).status, 503);
  assert.equal((await call(post({ ...good, image: "https://evil.example/x.png" }), never)).status, 400);
  assert.equal((await call(post({ ...good, image: "data:text/html;base64,PHNjcmlwdD4=" }), never)).status, 400);
  assert.equal((await call(post({ ...good, image: "data:image/png;base64," + "A".repeat(4_100_000) }), never)).status, 400);
  assert.equal((await call(post("nope"), never)).status, 400);
  assert.equal((await onRequest()).status, 405);
});

test("sends the photo and the format prompt to the vision model and returns just the exam lines", async () => {
  stubAuth(); let seen = null;
  const reply = "Here is your list:\n```\nMaths Paper 1 | 14 May 2027 | GCSE | AQA | 9:00\nBiology | 21 May 2027 | GCSE\n```\nHope that helps!";
  const r = await call(post(good), env({ run: async (m, i) => { seen = { m, i }; return { response: reply }; } }));
  assert.equal(r.status, 200);
  assert.equal(r.body.text, "Maths Paper 1 | 14 May 2027 | GCSE | AQA | 9:00\nBiology | 21 May 2027 | GCSE");
  assert.match(seen.m, /llama-4-scout/);
  const parts = seen.i.messages[1].content;
  assert.equal(parts[1].image_url.url, good.image);
  assert.match(parts[0].text, /Subject \| date \| type/); assert.match(parts[0].text, /2026-11-02/);
  assert.match(seen.i.messages[0].content, /never instructions/);
});

test("falls back to the second model, reports empty reads and failures", async () => {
  stubAuth(); const tried = [];
  const r = await call(post(good), env({ run: async (m, i) => { tried.push(m); if (tried.length === 1) throw new Error("boom"); assert.equal(i.image, good.image); return { response: "English | 3 June 2027" }; } }));
  assert.equal(tried.length, 2); assert.equal(r.body.text, "English | 3 June 2027");
  const empty = await call(post(good), env({ run: async () => ({ response: "   " }) }));
  assert.equal(empty.status, 502); assert.match(empty.body.error, /couldn't read any exams/);
  const limit = await call(post(good), env({ run: async () => { throw new Error("daily neurons limit"); } }));
  assert.match(limit.body.error, /allowance/);
});

test("cleanReply keeps piped lines, or all lines when none are piped, and caps length", () => {
  assert.equal(cleanReply("Intro\nA | 1 May 2027\nB | 2 May 2027"), "A | 1 May 2027\nB | 2 May 2027");
  assert.equal(cleanReply("Maths, 1 May 2027\nBio, 2 May 2027"), "Maths, 1 May 2027\nBio, 2 May 2027");
  assert.equal(cleanReply("x | y\n".repeat(500)).split("\n").length, 120);
});
