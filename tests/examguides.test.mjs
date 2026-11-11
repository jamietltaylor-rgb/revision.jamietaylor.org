import test from "node:test";
import assert from "node:assert/strict";
import { findGuide, guideForQuestions, guideForMarking, guideSources, GUIDES } from "../public/examguides.js";
import { onRequestPost as generate } from "../functions/api/generate.js";
import { onRequestPost as mark } from "../functions/api/mark.js";

const env = (ai) => ({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_t", AI: ai });
const realFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = realFetch; });
const stubAuth = () => { globalThis.fetch = async () => new Response(JSON.stringify({ id: "u1" }), { status: 200 }); };
const req = (url, body) => new Request(url, { method: "POST", headers: { authorization: "Bearer good", "content-type": "application/json" }, body: JSON.stringify(body) });

test("subjects find the right guide", () => {
  assert.equal(findGuide("Business Studies").id, "business");
  assert.equal(findGuide("English Language").id, "english-language");
  assert.equal(findGuide("English Literature"), null, "literature isn't language");
  assert.equal(findGuide("Maths").id, "maths");
  assert.equal(findGuide("Biology").id, "science");
  assert.equal(findGuide("Computer Science"), null);
  assert.equal(findGuide("", "Cells and photosynthesis in biology").id, "science", "falls back to the topic");
  assert.equal(findGuide("French"), null);
});

test("board-specific notes only appear for that board", () => {
  assert.match(guideForQuestions("Edexcel", "Business"), /1BS0/);
  assert.doesNotMatch(guideForQuestions("AQA", "Business"), /1BS0/);
  assert.match(guideForQuestions("Any exam board", "Business"), /command word|marks/i);
  assert.match(guideForMarking("AQA", "English Language"), /L4 7-8/);
  assert.doesNotMatch(guideForMarking("OCR", "English Language"), /L4 7-8/);
  assert.equal(guideForQuestions("AQA", "French"), "");
});

test("every guide has style, marking and sources for its boards", () => {
  for (const g of GUIDES) {
    assert.ok(g.general.style.length > 60 && g.general.marking.length > 60, g.id);
    for (const [b, v] of Object.entries(g.boards)) { assert.ok(v.paper && v.sources.length, `${g.id}/${b}`); }
  }
  assert.ok(guideSources().length >= 6);
});

test("the question maker and the marker both receive the guide", async () => {
  stubAuth(); let gen, mk;
  await generate({ request: req("https://s/api/generate", { topic: "Marketing", subject: "Business", level: "GCSE", board: "Edexcel", count: 3, mode: "exam", kinds: ["outline", "three", "six"] }), env: env({ run: async (m, i) => { gen = i.messages[1].content; return { response: "[]" }; } }) });
  assert.match(gen, /published papers and mark schemes/);
  assert.match(gen, /1BS0/);
  await mark({ request: req("https://s/api/mark", { q: "Analyse one benefit.", a: "benefit ; because", marks: 6, answer: "It helps sales because customers see it.", subject: "Business", ctx: "Ace Cafe sells coffee." }), env: env({ run: async (m, i) => { mk = i.messages[1].content; return { response: '{"level":2,"mark":3,"met":[1],"feedback":"ok"}' }; } }) });
  assert.match(mk, /HOW EXAMINERS MARK THIS SUBJECT/);
  assert.match(mk, /do not fit the business/i);
});
