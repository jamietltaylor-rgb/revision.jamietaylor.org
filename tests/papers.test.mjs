import test from "node:test";
import assert from "node:assert/strict";
import { papersFor } from "../public/papers.js";
import * as L from "../public/logic.js";

test("papers depend on subject and exam board", () => {
  assert.equal(papersFor("English Literature", "", "AQA").length, 2);
  assert.match(papersFor("History", "", "Edexcel")[2], /Paper 3/);
  assert.equal(papersFor("History", "", "AQA").length, 2);
  assert.equal(papersFor("Combined Science", "", "AQA").length, 6);
  assert.equal(papersFor("Maths", "", "WJEC / Eduqas").length, 2);
  assert.equal(papersFor("Biology", "", "Any exam board"), null);
  assert.equal(papersFor("Textiles", "", "AQA"), null);
  assert.match(papersFor("Biology – Exam questions".replace(/ – .*/, ""), "", "OCR")[0], /Breadth/);
});
test("chosen paper goes into the prompt and is kept on questions", () => {
  assert.match(L.paperPrompt("AQA", "Paper 2 – Modern texts and poetry"), /AQA Paper 2 – Modern texts and poetry/);
  assert.equal(L.paperPrompt("AQA", ""), "");
  assert.match(L.buildAiPrompt({ topic: "Macbeth", board: "AQA", subject: "English Literature", paperName: "Paper 1 – Shakespeare and the 19th-century novel" }), /Write them for AQA Paper 1/);
});

test("maths diagrams are checked and drawn", () => {
  const f = L.cleanFigure({ type: "diagram", shape: "Sphere", labels: { r: "4.75 cm" } });
  assert.equal(f.type, "shape"); assert.equal(f.labels.r, "4.75 cm");
  const svg = L.figureSvg(f);
  assert.match(svg, /<svg/); assert.match(svg, /4\.75 cm/); assert.match(svg, /NOT accurately drawn/);
  const t = L.cleanFigure({ type: "shape", shape: "triangle", right: "b", labels: { AB: "8 cm", BC: "x<script>", A: "35°" } });
  assert.equal(t.right, "B"); assert.ok(!L.figureSvg(t).includes("<script>"));
  for (const shape of ["rectangle", "circle", "cylinder", "cone", "cuboid"]) assert.match(L.figureSvg(L.cleanFigure({ type: "shape", shape, labels: { r: "3", w: "4", h: "5", l: "6", d: "7", angle: "70" } })), /<svg/);
  assert.equal(L.cleanFigure({ type: "shape", shape: "dragon", labels: { r: "1" } }), null);
  assert.ok(L.examFormats("Maths").figures.includes("shape"));
});
