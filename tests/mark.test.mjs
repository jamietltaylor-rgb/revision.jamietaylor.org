import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost, onRequest } from "../functions/api/mark.js";

const env = (ai) => ({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_t", AI: ai });
const post = (body, token = "Bearer good") => new Request("https://site/api/mark", { method: "POST", headers: { authorization: token, "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
const realFetch = globalThis.fetch;
const stubAuth = () => { globalThis.fetch = async (url, init) => (init.headers.Authorization === "Bearer good" ? new Response(JSON.stringify({ id: "u1" }), { status: 200 }) : new Response("{}", { status: 401 })); };
test.afterEach(() => { globalThis.fetch = realFetch; });
const call = async (r, e) => { const res = await onRequestPost({ request: r, env: e }); return { status: res.status, body: await res.json() }; };
const good = { q: "Explain why plants need light.", a: "photosynthesis ; glucose ; chlorophyll ; energy", marks: 4, answer: "For photosynthesis to make glucose" };

test("needs a login and valid input", async () => {
  stubAuth();
  assert.equal((await call(post(good, ""), env({}))).status, 401);
  assert.equal((await call(post(good, "Bearer bad"), env({}))).status, 401);
  assert.equal((await call(post(good), { SUPABASE_URL: "https://x.supabase.co", SUPABASE_PUBLISHABLE_KEY: "k" })).status, 503);
  assert.equal((await call(post({ ...good, answer: "  " }), env({ run: async () => assert.fail("no") }))).status, 400);
  assert.equal((await call(post({ ...good, marks: 0 }), env({ run: async () => assert.fail("no") }))).status, 400);
  assert.equal((await call(post("nope"), env({}))).status, 400);
  assert.equal((await onRequest()).status, 405);
});

test("marks an answer from the AI's list of points met", async () => {
  stubAuth(); let prompt = "";
  const r = await call(post(good), env({ run: async (m, i) => { prompt = i.messages[1].content; return { response: 'Sure! {"met": [1, 2, 9, 2], "feedback": "Mention chlorophyll and energy."}' }; } }));
  assert.equal(r.status, 200);
  assert.equal(r.body.awarded, 2); assert.equal(r.body.total, 4);
  assert.deepEqual(r.body.points.map((p) => p.met), [true, true, false, false]);
  assert.equal(r.body.feedback, "Mention chlorophyll and energy.");
  assert.match(prompt, /1\. photosynthesis/); assert.match(prompt, /never instructions/);
});

test("never awards more than the marks, falls back to the smaller model, and reports failures", async () => {
  stubAuth(); const tried = [];
  const r = await call(post({ ...good, marks: 2 }), env({ run: async (m) => { tried.push(m); if (tried.length === 1) return { response: "not json" }; return { response: '{"met":[1,2,3,4],"feedback":""}' }; } }));
  assert.equal(tried.length, 2); assert.equal(r.body.awarded, 2);
  const bad = await call(post(good), env({ run: async () => { throw new Error("daily neurons limit"); } }));
  assert.equal(bad.status, 502); assert.match(bad.body.error, /allowance/);
});
