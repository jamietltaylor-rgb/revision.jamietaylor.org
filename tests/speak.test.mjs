import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost, onRequest, readRequest, toAudioBody } from "../functions/api/speak.js";

const realFetch = globalThis.fetch;
const env = (ai) => ({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_PUBLISHABLE_KEY: "k", AI: ai });
const req = (body, auth = "Bearer tok") => new Request("https://a/api/speak", { method: "POST", headers: { authorization: auth, "content-type": "application/json" }, body: JSON.stringify(body) });
const okLogin = () => { globalThis.fetch = async () => new Response(JSON.stringify({ id: "u" }), { status: 200 }); };
test.afterEach(() => { globalThis.fetch = realFetch; });

test("readRequest cleans text and picks a known voice", () => {
  assert.equal(readRequest({ text: "  hello   there ", speaker: "helios" }).speaker, "helios");
  assert.equal(readRequest({ text: "hi", speaker: "evil" }).speaker, "athena");
  assert.ok(readRequest({ text: "   " }).error);
  assert.equal(readRequest({ text: "x".repeat(900) }).text.length, 400);
});
test("needs a sign-in", async () => {
  const res = await onRequestPost({ request: req({ text: "hi" }, ""), env: env({}) });
  assert.equal(res.status, 401);
});
test("returns mp3 audio from the AI", async () => {
  okLogin();
  const calls = [];
  const ai = { run: async (m, input, opts) => { calls.push([m, input, opts]); return new Response(new Uint8Array(500), { status: 200 }); } };
  const res = await onRequestPost({ request: req({ text: "Is this a dagger", speaker: "athena" }), env: env(ai) });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "audio/mpeg");
  assert.equal((await res.arrayBuffer()).byteLength, 500);
  assert.equal(calls[0][0], "@cf/deepgram/aura-1");
  assert.equal(calls[0][1].speaker, "athena");
});
test("explains quota and plan problems", async () => {
  okLogin();
  let res = await onRequestPost({ request: req({ text: "hi" }), env: env({ run: async () => { throw new Error("you have used all your neurons"); } }) });
  assert.match((await res.json()).error, /allowance/);
  res = await onRequestPost({ request: req({ text: "hi" }), env: env({ run: async () => { throw new Error("402 payment required"); } }) });
  assert.match((await res.json()).error, /free plan/);
});
test("toAudioBody handles bytes and base64", async () => {
  assert.ok(await toAudioBody(new Uint8Array(3)));
  const b = await toAudioBody({ audio: btoa("abc") });
  assert.equal(b.length, 3);
  assert.equal(await toAudioBody(null), null);
});
test("GET is refused", async () => { assert.equal((await onRequest()).status, 405); });
