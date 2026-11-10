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

// ---------- exam-style kinds ----------
test("outline and explain-one questions are marked on linked points, and the scenario is shown to the marker", async () => {
  stubAuth(); let prompt = "";
  const outline = { q: "Outline one way Kiko's Kitchen could improve its service.", a: "train staff ; so customers wait less", marks: 2, kind: "outline", ctx: "Kiko's Kitchen is a small café.", answer: "Train its staff so that customers wait less" };
  const r = await call(post(outline), env({ run: async (m, i) => { prompt = i.messages[1].content; return { response: '{"met":[1,2],"feedback":"Good."}' }; } }));
  assert.equal(r.body.awarded, 2); assert.equal(r.body.level, undefined);
  assert.match(prompt, /Outline/); assert.match(prompt, /LINKED/); assert.match(prompt, /Kiko's Kitchen is a small café/);
  const three = await call(post({ q: "Explain one benefit of ...", a: "id ; dev ; dev2", marks: 3, kind: "three", answer: "x" }), env({ run: async (m, i) => { prompt = i.messages[1].content; return { response: '{"met":[1],"feedback":""}' }; } }));
  assert.equal(three.body.awarded, 1); assert.match(prompt, /Explain one/); assert.match(prompt, /identifying a valid point/);
});

test("6 and 9 mark answers are marked in levels, and the mark is kept inside the level", async () => {
  stubAuth(); let prompt = "";
  const nine = { q: "Justify whether Kiko's Kitchen should open a second site.", a: "revenue ; costs ; risk ; judgement", marks: 9, ctx: "Kiko's Kitchen is a café.", answer: "It should because more customers means more revenue, so profit rises. Overall yes." };
  const run = (reply) => env({ run: async (m, i) => { prompt = i.messages[1].content; return { response: reply }; } });
  const r = await call(post(nine), run('{"level":2,"mark":5,"met":[1,2],"feedback":"Develop the risks."}'));
  assert.equal(r.status, 200); assert.equal(r.body.level, 2); assert.equal(r.body.awarded, 5); assert.equal(r.body.total, 9);
  assert.deepEqual(r.body.points.map((p) => p.met), [true, true, false, false]);
  assert.match(prompt, /Level 3 \(7–9 marks\)/); assert.match(prompt, /justified judgement/); assert.match(prompt, /INDICATIVE CONTENT/); assert.match(prompt, /Kiko's Kitchen is a café/);
  // a mark outside the level's range is pulled back inside it; a missing level is worked out from the mark
  assert.equal((await call(post(nine), run('{"level":1,"mark":8,"feedback":""}'))).body.awarded, 3);
  assert.equal((await call(post(nine), run('{"mark":8,"feedback":""}'))).body.level, 3);
  assert.equal((await call(post(nine), run('{"level":0,"mark":4,"feedback":""}'))).body.awarded, 0);
  // six-markers use the 1–2 / 3–4 / 5–6 levels, and an answer longer than before is accepted
  const six = { q: "Analyse the impact ...", a: "a ; b ; c ; d", marks: 6, answer: "word ".repeat(600) };
  const s = await call(post(six), run('{"level":3,"mark":6,"met":[1,2,3],"feedback":"Great."}'));
  assert.equal(s.body.awarded, 6); assert.match(prompt, /Level 1 \(1–2 marks\)/);
  // a reply that isn't JSON falls through to the next model, then fails kindly
  const bad = await call(post(nine), env({ run: async () => ({ response: "I think about 5." }) }));
  assert.equal(bad.status, 502);
});
