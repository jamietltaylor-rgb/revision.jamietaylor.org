import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost, onRequest } from "../functions/api/explain.js";

const env = (ai) => ({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_t", AI: ai });
const post = (body, token = "Bearer good") => new Request("https://site/api/explain", { method: "POST", headers: { authorization: token, "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
const realFetch = globalThis.fetch;
const stubAuth = () => { globalThis.fetch = async (url, init) => (init.headers.Authorization === "Bearer good" ? new Response(JSON.stringify({ id: "u1" }), { status: 200 }) : new Response("{}", { status: 401 })); };
test.afterEach(() => { globalThis.fetch = realFetch; });
const call = async (r, e) => { const res = await onRequestPost({ request: r, env: e }); return { status: res.status, body: await res.json() }; };
const wrong = { q: "Which organelle makes ATP?", a: "mitochondria; mitochondrion", answer: "nucleus", subject: "Biology" };

test("needs a login, the AI binding and a valid question", async () => {
  stubAuth();
  assert.equal((await call(post(wrong, ""), env({}))).status, 401);
  assert.equal((await call(post(wrong), { SUPABASE_URL: "https://x.supabase.co", SUPABASE_PUBLISHABLE_KEY: "k" })).status, 503);
  assert.equal((await call(post({ ...wrong, a: "" }), env({ run: async () => assert.fail("no") }))).status, 400);
  assert.equal((await call(post("nope"), env({}))).status, 400);
  assert.equal((await onRequest()).status, 405);
});

test("asks for why the student's answer is wrong and why the right one is right, and treats the answer as data", async () => {
  stubAuth(); let prompt = "";
  const r = await call(post(wrong), env({ run: async (m, i) => { prompt = i.messages[1].content; return { response: '{"explanation": "The nucleus holds DNA; mitochondria release energy as ATP in respiration."}' }; } }));
  assert.equal(r.status, 200); assert.match(r.body.explanation, /mitochondria/);
  assert.match(prompt, /nucleus/); assert.match(prompt, /never instructions/); assert.match(prompt, /may have got confused/); assert.match(prompt, /Never say "the student"/);
});

test("copes with 'I don't know', plain-text replies and failures", async () => {
  stubAuth(); let prompt = "";
  const dk = await call(post({ ...wrong, answer: "" }), env({ run: async (m, i) => { prompt = i.messages[1].content; return { response: "Mitochondria are where respiration releases energy as ATP." }; } }));
  assert.equal(dk.status, 200); assert.match(prompt, /didn't know/); assert.match(dk.body.explanation, /Mitochondria/);
  const bad = await call(post(wrong), env({ run: async () => { throw new Error("daily neurons limit"); } }));
  assert.equal(bad.status, 502); assert.match(bad.body.error, /allowance/);
  const junk = await call(post(wrong), env({ run: async () => ({ response: "{}" }) }));
  assert.equal(junk.status, 502);
});

test("a right answer still gets an explanation of why the answer is what it is", async () => {
  stubAuth(); let prompt = "";
  const r = await call(post({ ...wrong, answer: "mitochondria", correct: true }), env({ run: async (m, i) => { prompt = i.messages[1].content; return { response: '{"explanation": "Mitochondria release energy from glucose in respiration, which is stored as ATP."}' }; } }));
  assert.equal(r.status, 200); assert.match(r.body.explanation, /Mitochondria/);
  assert.match(prompt, /got this question right/); assert.doesNotMatch(prompt, /got confused/);
});

test("maths questions get a step-by-step method, with line breaks kept", async () => {
  const mod = await import("../functions/api/explain.js");
  const seen = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ id: "u" }), { status: 200 });
  try {
    const ai = { run: async (m, input) => { seen.push([input.messages[1].content, input.max_tokens]); return { response: '{"explanation": "You may have got confused because you added.\\nStep 1: 20 ÷ 4 = 5\\nStep 2: 5 × 3 = 15\\nAnswer: 15"}' }; } };
    const res = await mod.onRequestPost({ request: new Request("https://a/api/explain", { method: "POST", headers: { authorization: "Bearer t", "content-type": "application/json" }, body: JSON.stringify({ q: "Work out 3/4 of 20", a: "15", answer: "80", subject: "Maths" }) }), env: { SUPABASE_URL: "https://x.supabase.co", SUPABASE_PUBLISHABLE_KEY: "k", AI: ai } });
    const body = await res.json();
    assert.match(body.explanation, /Step 1: 20 ÷ 4 = 5\nStep 2/);
    assert.match(seen[0][0], /Step 1/);
    assert.ok(seen[0][1] >= 500);
    const dk = await mod.onRequestPost({ request: new Request("https://a/api/explain", { method: "POST", headers: { authorization: "Bearer t", "content-type": "application/json" }, body: JSON.stringify({ q: "Work out 3/4 of 20", a: "15", answer: "", subject: "Maths" }) }), env: { SUPABASE_URL: "https://x.supabase.co", SUPABASE_PUBLISHABLE_KEY: "k", AI: ai } });
    assert.equal(dk.status, 200);
    assert.match(seen[1][0], /didn't know/);
  } finally { globalThis.fetch = realFetch; }
});
