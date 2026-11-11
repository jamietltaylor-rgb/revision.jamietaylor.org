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
    assert.equal(findGuide("Maths").id, "maths");
  assert.equal(findGuide("Biology").id, "biology");
  assert.equal(findGuide("Chemistry").id, "chemistry");
  assert.equal(findGuide("Physics").id, "physics");
  assert.equal(findGuide("Combined Science").id, "science");
  assert.equal(findGuide("History").id, "history");
  assert.equal(findGuide("Geography").id, "geography");
  assert.equal(findGuide("English Literature").id, "english-literature");
  assert.equal(findGuide("Computer Science").id, "computer-science", "not the sciences");
  assert.equal(findGuide("", "Cells and photosynthesis in biology").id, "biology", "falls back to the topic");
  assert.equal(findGuide("French").id, "languages");
  assert.equal(findGuide("Religious Studies").id, "religious-studies");
  assert.equal(findGuide("Psychology").id, "psychology");
  assert.equal(findGuide("Sociology").id, "sociology");
  assert.equal(findGuide("PE").id, "pe");
  assert.equal(findGuide("Latin"), null, "no guide yet");
});

test("board-specific notes only appear for that board", () => {
  assert.match(guideForQuestions("Edexcel", "Business"), /1BS0/);
  assert.doesNotMatch(guideForQuestions("AQA", "Business"), /1BS0/);
  assert.match(guideForQuestions("Any exam board", "Business"), /command word|marks/i);
  assert.match(guideForMarking("AQA", "English Language"), /L4 7-8/);
  assert.doesNotMatch(guideForMarking("OCR", "English Language"), /L4 7-8/);
  assert.equal(guideForQuestions("AQA", "Latin"), "");
});

test("OCR notes are added to every subject that has them", () => {
  for (const id of ["maths","english-language","english-literature","biology","chemistry","physics","history","geography","computer-science","religious-studies","psychology","business","pe"]) assert.ok(GUIDES.find((g) => g.id === id).boards.OCR, id);
  assert.match(guideForQuestions("OCR", "Maths"), /J560/);
  assert.match(guideForMarking("OCR", "Physics"), /ECF/);
});

test("WJEC / Eduqas and CCEA notes are added", () => {
  for (const id of ["maths","english-language","english-literature","biology","history","geography","computer-science","business","religious-studies"]) assert.ok(GUIDES.find((g) => g.id === id).boards["WJEC / Eduqas"], id);
  assert.match(guideForQuestions("WJEC / Eduqas", "English Language"), /Component 1/);
  assert.match(guideForMarking("CCEA", "Maths"), /MA = a combined/);
});

test("Edexcel notes are added to every subject that has them", () => {
  for (const id of ["english-language","english-literature","biology","chemistry","physics","history","geography","computer-science","religious-studies","psychology","languages","pe","business","maths"]) assert.ok(GUIDES.find((g) => g.id === id).boards.Edexcel, id);
  assert.match(guideForMarking("Edexcel", "Physics"), /power-of-ten/);
  assert.match(guideForQuestions("Edexcel", "French"), /1FR0/);
  assert.doesNotMatch(guideForMarking("AQA", "Physics"), /power-of-ten/);
});

test("every guide has style, marking and sources for its boards", () => {
  for (const g of GUIDES) {
    assert.ok(g.general.style.length > 60 && g.general.marking.length > 60, g.id);
    for (const [b, v] of Object.entries(g.boards)) { assert.ok(v.paper && v.sources.length, `${g.id}/${b}`); }
    assert.ok(g.general.style.length < 900 && g.general.marking.length < 1500, `${g.id} stays short enough for the prompt`);
  }
  assert.ok(guideSources().length >= 48);
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
