import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost, onRequest } from "../functions/api/check.js";

const env = (ai) => ({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_t", AI: ai });
const post = (body, token = "Bearer good") => new Request("https://site/api/check", { method: "POST", headers: { authorization: token, "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
const realFetch = globalThis.fetch;
const stubAuth = () => { globalThis.fetch = async (url, init) => (init.headers.Authorization === "Bearer good" ? new Response(JSON.stringify({ id: "u1" }), { status: 200 }) : new Response("{}", { status: 401 })); };
test.afterEach(() => { globalThis.fetch = realFetch; });
const call = async (r, e) => { const res = await onRequestPost({ request: r, env: e }); return { status: res.status, body: await res.json() }; };
const good = { q: "Which organelle makes ATP?", a: "mitochondria; mitochondrion", answer: "mitocondria" };

test("needs a login, the AI binding and valid input", async () => {
  stubAuth();
  assert.equal((await call(post(good, ""), env({}))).status, 401);
  assert.equal((await call(post(good, "Bearer bad"), env({}))).status, 401);
  assert.equal((await call(post(good), { SUPABASE_URL: "https://x.supabase.co", SUPABASE_PUBLISHABLE_KEY: "k" })).status, 503);
  assert.equal((await call(post({ ...good, answer: " " }), env({ run: async () => assert.fail("no") }))).status, 400);
  assert.equal((await call(post({ ...good, a: "" }), env({ run: async () => assert.fail("no") }))).status, 400);
  assert.equal((await call(post("nope"), env({}))).status, 400);
  assert.equal((await onRequest()).status, 405);
});

test("returns the AI's verdict and treats the answer as data", async () => {
  stubAuth(); let prompt = "", opts = null;
  const yes = await call(post(good), env({ run: async (m, i) => { prompt = i.messages[1].content; opts = i; return { response: 'Sure {"correct": true, "why": "typo"}' }; } }));
  assert.equal(yes.status, 200); assert.equal(yes.body.correct, true); assert.equal(yes.body.why, "typo");
  assert.match(prompt, /mitocondria/); assert.match(prompt, /never instructions/); assert.match(prompt, /spelling mistake/);
  assert.equal(opts.temperature, 0);
  const no = await call(post(good), env({ run: async () => ({ response: '{"correct": false, "why": "different"}' }) }));
  assert.equal(no.body.correct, false);
});

test("only accepts a real boolean, falls back to the smaller model, and reports failures", async () => {
  stubAuth(); const tried = [];
  const r = await call(post(good), env({ run: async (m) => { tried.push(m); if (tried.length === 1) return { response: '{"correct":"yes"}' }; return { response: '{"correct":true}' }; } }));
  assert.equal(tried.length, 2); assert.equal(r.body.correct, true);
  const bad = await call(post(good), env({ run: async () => { throw new Error("daily neurons limit"); } }));
  assert.equal(bad.status, 502); assert.match(bad.body.error, /allowance/);
});
