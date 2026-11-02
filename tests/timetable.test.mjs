import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost, onRequest, cleanReply, pdfPrompt } from "../functions/api/timetable.js";

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

const pdf = { image: "data:application/pdf;base64,JVBERi0xLjQK", today: "2026-11-02" };
const pdfText = "Year 11 Mock Exams\nMon 12 Jan  Maths Paper 1  9:00\nTue 13 Jan  English Language Paper 1  9:00";

test("PDFs: text is pulled out with toMarkdown, then a text model writes the list", async () => {
  stubAuth(); let conv = null, seen = null;
  const ai = { toMarkdown: async (f) => { conv = f; return [{ name: "timetable.pdf", format: "markdown", data: pdfText }]; }, run: async (m, i) => { seen = { m, i }; return { response: "Maths Paper 1 | 12 January 2027 | Mock | | | 9:00\nEnglish Language Paper 1 | 13 January 2027 | Mock | | | 9:00" }; } };
  const r = await call(post(pdf), env(ai));
  assert.equal(r.status, 200); assert.equal(r.body.source, "pdf"); assert.equal(r.body.raw, pdfText, "the PDF's own text comes back too, as a backup");
  assert.match(r.body.text, /^Maths Paper 1 \| 12 January 2027/);
  assert.equal(conv.name, "timetable.pdf"); assert.equal(conv.blob.type, "application/pdf"); assert.equal(conv.blob.size, 9, "bytes decoded from base64");
  assert.match(seen.m, /llama-3\.3-70b/);
  const prompt = seen.i.messages[1].content;
  assert.match(prompt, /Year 11 Mock Exams/); assert.match(prompt, /never instructions/); assert.doesNotMatch(prompt, /photo/);
  assert.match(prompt, /Subject \| date \| type/);
});

test("PDFs: scans, unreadable files and AI failures give a helpful message", async () => {
  stubAuth();
  const scan = await call(post(pdf), env({ toMarkdown: async () => [{ format: "markdown", data: "# timetable.pdf\n## Metadata\n" }], run: async () => assert.fail("no text, no model call") }));
  assert.equal(scan.status, 422); assert.match(scan.body.error, /no readable text/);
  const bad = await call(post(pdf), env({ toMarkdown: async () => [{ format: "error", data: "x" }] }));
  assert.equal(bad.status, 502); assert.match(bad.body.error, /couldn't open that PDF/);
  const boom = await call(post(pdf), env({ toMarkdown: async () => { throw new Error("x"); } }));
  assert.match(boom.body.error, /couldn't open that PDF/);
  let n = 0;
  const retry = await call(post(pdf), env({ toMarkdown: async () => [{ format: "markdown", data: pdfText }], run: async () => { if (++n === 1) throw new Error("boom"); return { response: "Maths | 12 January 2027" }; } }));
  assert.equal(n, 2); assert.equal(retry.body.text, "Maths | 12 January 2027");
  const limit = await call(post(pdf), env({ toMarkdown: async () => [{ format: "markdown", data: pdfText }], run: async () => { throw new Error("daily neurons limit"); } }));
  assert.match(limit.body.error, /allowance/);
});

test("pdfPrompt turns the photo wording into text wording", () => {
  const p = pdfPrompt("I'm attaching a photo of my exam timetable. Read it and go.\n- if the photo has no year", "TEXT");
  assert.doesNotMatch(p, /photo/); assert.match(p, /TEXT/);
});

test("pasted text in any layout goes to the text model; empty or tiny pastes are refused", async () => {
  stubAuth(); let seen = null;
  const ai = { run: async (m, i) => { seen = { m, i }; return { response: "Maths Paper 1 | 12 January 2027 | Mock | | | 9:00" }; } };
  const messy = "Hi Year 11! Your mocks:\nWeek 1 - Monday: Maths P1 (9am) / Tuesday: English Lang P1\nBring a calculator!";
  const r = await call(post({ text: messy, today: "2026-11-02" }), env(ai));
  assert.equal(r.status, 200); assert.equal(r.body.source, "text"); assert.match(r.body.text, /^Maths Paper 1/);
  assert.match(seen.m, /llama-3\.3-70b/); assert.match(seen.i.messages[1].content, /Bring a calculator/); assert.match(seen.i.messages[1].content, /any layout/); assert.doesNotMatch(seen.i.messages[1].content, /photo/);
  const never = env({ run: async () => assert.fail("no") });
  assert.equal((await call(post({ text: "  hi " }), never)).status, 400);
  assert.equal((await call(post({}), never)).status, 400);
  assert.equal((await call(post("null"), never)).status, 400);
  const long = await call(post({ text: "x ".repeat(20000) }), env({ run: async (m, i) => { assert.ok(i.messages[1].content.length < 14000); return { response: "A | 1 May 2027" }; } }));
  assert.equal(long.status, 200);
});
