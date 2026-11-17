import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost, readRequest, buildMessages, parseReply } from "../functions/api/ask.js";

const realFetch = globalThis.fetch;
const env = (ai) => ({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_PUBLISHABLE_KEY: "k", AI: ai });
const req = (body, auth = "Bearer tok") => new Request("https://a/api/ask", { method: "POST", headers: { authorization: auth, "content-type": "application/json" }, body: JSON.stringify(body) });
const okLogin = () => { globalThis.fetch = async () => new Response(JSON.stringify({ id: "u" }), { status: 200 }); };
test.afterEach(() => { globalThis.fetch = realFetch; });

test("readRequest validates", () => {
  assert.ok(readRequest({ question: "hi" }).error);
  const r = readRequest({ question: "  Why is the sky blue?  ", subject: "Physics", board: "AQA" });
  assert.equal(r.question, "Why is the sky blue?");
});
test("prompt carries subject and treats the question as data", () => {
  const m = buildMessages({ question: "What is osmosis?", subject: "Biology", topic: "", board: "AQA" });
  assert.match(m[1].content, /subject: Biology/);
  assert.match(m[1].content, /exam board: AQA/);
  assert.match(m[1].content, /not instructions/);
});
test("parseReply strips markdown", () => { assert.equal(parseReply({ response: "**Osmosis** is the movement of water across a membrane." }), "Osmosis is the movement of water across a membrane."); assert.equal(parseReply({ response: "ok" }), null); });
test("needs a sign-in", async () => { assert.equal((await onRequestPost({ request: req({ question: "hello there" }, ""), env: env({}) })).status, 401); });
test("answers, falls back to the second model, explains quota", async () => {
  okLogin();
  let n = 0;
  const ai = { run: async () => { n++; if (n === 1) throw new Error("boom"); return { response: "Osmosis is water moving through a membrane from dilute to concentrated." }; } };
  const res = await onRequestPost({ request: req({ question: "What is osmosis?" }), env: env(ai) });
  assert.equal(res.status, 200);
  assert.match((await res.json()).answer, /Osmosis/);
  const res2 = await onRequestPost({ request: req({ question: "What is osmosis?" }), env: env({ run: async () => { throw new Error("neurons used up"); } }) });
  assert.match((await res2.json()).error, /allowance/);
});
