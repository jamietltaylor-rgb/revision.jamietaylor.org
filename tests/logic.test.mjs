import test from "node:test";
import assert from "node:assert/strict";
import * as L from "../public/logic.js";
import * as Shop from "../public/shop.js";

test("dates", () => {
  assert.equal(L.addDays("2026-02-27", 2), "2026-03-01");
  assert.equal(L.addDays("2026-03-28", 2), "2026-03-30"); // across the UK clock change
  assert.equal(L.daysBetween("2026-01-01", "2026-01-31"), 30);
  assert.equal(L.weekday("2026-10-26"), 0); // a Monday
  assert.equal(L.dateStr(new Date(2026, 0, 5)), "2026-01-05");
});

test("answer checking", () => {
  assert.ok(L.isCorrect("paris", "Paris"));
  assert.ok(L.isCorrect("  The Pacific Ocean! ", "pacific ocean"));
  assert.ok(L.isCorrect("canbera", "Canberra"), "one typo in a long word is forgiven");
  assert.ok(!L.isCorrect("cat", "car"), "short answers must be exact");
  assert.ok(!L.isCorrect("", "Paris"));
  assert.ok(L.isCorrect("seven", "7; seven"));
  assert.ok(L.isCorrect("1000", "1,000"));
  assert.ok(!L.isCorrect("1001", "1000"), "numbers are never fuzzy");
  assert.ok(L.isCorrect("cafe", "café"), "missing accents are forgiven");
  assert.ok(L.isCorrect("A", "a"), "an answer that is only an article still works");
  assert.ok(L.isCorrect("Σωκράτης", "σωκράτης"), "non-English letters work");
});

test("spaced repetition", () => {
  assert.deepEqual(L.schedule({ box: 1 }, false, "2026-10-26"), { box: 1, due: "2026-10-26" });
  assert.deepEqual(L.schedule({ box: 1 }, true, "2026-10-26"), { box: 2, due: "2026-10-29" });
  assert.deepEqual(L.schedule({ box: 5 }, true, "2026-10-26"), { box: 5, due: "2026-11-25" });
  assert.deepEqual(L.schedule({ box: 4 }, false, "2026-10-26"), { box: 1, due: "2026-10-26" });
});

test("pickQuestions puts due and weak questions first", () => {
  const today = "2026-10-26";
  const mk = (id, box, due, subjectId = "s") => ({ id, box, due, subjectId });
  const qs = [mk("late", 3, "2026-11-30"), mk("weak", 1, today), mk("strong", 4, "2026-10-01"), mk("other", 1, today, "x")];
  const { picked, dueCount } = L.pickQuestions(qs, { subjectId: "s", count: 2, today });
  assert.deepEqual(picked.map((q) => q.id), ["weak", "strong"]);
  assert.equal(dueCount, 2);
  assert.equal(L.pickQuestions(qs, { count: 99, today }).picked.length, 4);
  assert.equal(L.pickQuestions([], { count: 5, today }).picked.length, 0);
});

test("points and levels", () => {
  assert.equal(L.pointsFor(0), 10);
  assert.equal(L.pointsFor(3), 16);
  assert.equal(L.pointsFor(50), 20);
  let last = 0;
  for (const p of [0, 39, 40, 160, 360, 5000]) {
    const { level, pct } = L.levelFor(p);
    assert.ok(level >= last && pct >= 0 && pct < 100, `level for ${p}`);
    last = level;
  }
  assert.equal(L.levelFor(0).level, 1);
  assert.equal(L.levelFor(40).level, 2);
});

test("streaks", () => {
  const s = { streak: 0, bestStreak: 0, lastDay: "" };
  const d1 = L.updateStreak(s, "2026-10-26");
  assert.deepEqual(d1, { streak: 1, bestStreak: 1, lastDay: "2026-10-26" });
  assert.deepEqual(L.updateStreak(d1, "2026-10-26"), d1, "same day changes nothing");
  const d2 = L.updateStreak(d1, "2026-10-27");
  assert.equal(d2.streak, 2);
  const gap = L.updateStreak(d2, "2026-10-30");
  assert.deepEqual(gap, { streak: 1, bestStreak: 2, lastDay: "2026-10-30" });
  assert.equal(L.currentStreak(d2, "2026-10-27"), 2);
  assert.equal(L.currentStreak(d2, "2026-10-28"), 2, "still alive until the end of the next day");
  assert.equal(L.currentStreak(d2, "2026-10-29"), 0);
});

test("badges", () => {
  const s = L.emptyState();
  assert.deepEqual(L.newBadges(s), []);
  s.stats.answered = 1; s.stats.points = 120; s.stats.bestStreak = 3;
  assert.deepEqual(L.newBadges(s).sort(), ["first", "pts100", "streak3"].sort());
  s.stats.badges.first = "2026-10-26";
  assert.ok(!L.newBadges(s).includes("first"));
  // subject master needs 10+ questions, all mastered
  s.subjects.push({ id: "a", name: "A" });
  for (let i = 0; i < 10; i++) s.questions.push({ id: "q" + i, subjectId: "a", q: "q", a: "a", box: 4, due: "2026-10-26" });
  assert.ok(L.newBadges(s).includes("master"));
  s.questions[0].box = 2;
  assert.ok(!L.newBadges(s).includes("master"));
});

test("home screen summaries", () => {
  const today = "2026-10-28"; // a Wednesday
  const stats = { days: { "2026-10-28": { n: 12, c: 9, p: 90 }, "2026-10-27": { n: 3, c: 3, p: 30 } } };
  const week = L.lastDays(stats, 7, today);
  assert.equal(week.length, 7);
  assert.equal(week[6].n, 12);
  assert.equal(week[5].n, 3);
  assert.equal(week[0].n, 0);
  const cells = L.heatmap(stats, today, 12, 10);
  assert.equal(cells.length, 84);
  assert.equal(cells[0].date, L.addDays("2026-10-26", -77));
  assert.equal(L.weekday(cells[0].date), 0, "grid starts on a Monday");
  assert.ok(cells.find((c) => c.date === today).level >= 3);
  assert.ok(cells.find((c) => c.date === "2026-10-30").future);
  assert.equal(L.heatLevel(0, 10), 0);
  assert.equal(L.heatLevel(4, 10), 1);
  assert.equal(L.heatLevel(25, 10), 4);
});

test("sanitiseState keeps good data and drops junk", () => {
  const good = L.starterState("2026-10-26");
  good.stats.points = 55; good.stats.badges.first = "2026-10-26"; good.stats.days["2026-10-26"] = { n: 4, c: 3, p: 30 };
  const round = L.sanitiseState(JSON.parse(JSON.stringify(good)));
  assert.deepEqual(round, good);

  assert.throws(() => L.sanitiseState(null));
  assert.throws(() => L.sanitiseState([]));
  assert.throws(() => L.sanitiseState("hello"));

  const messy = L.sanitiseState({
    subjects: [{ id: "a", name: "<b>Maths</b>" }, { id: "a", name: "dup" }, { name: "no id" }, 7],
    questions: [
      { id: "1", subjectId: "a", q: "ok?", a: "yes", box: 99, due: "not a date", right: -5 },
      { id: "2", subjectId: "missing", q: "orphan", a: "x" },
      { id: "3", subjectId: "a", q: "", a: "empty" },
      null,
    ],
    stats: { points: "lots", days: { "2026-10-26": { n: 2 }, "__proto__": { n: 1 }, "bad": { n: 1 } }, badges: { first: "2026-10-26", hacker: "2026-10-26" } },
    settings: { dailyGoal: 9999 },
    treats: [{ id: "x", name: "Tea", cost: -3 }, { name: "no id", cost: 5 }],
  });
  assert.equal(messy.subjects.length, 1);
  assert.equal(messy.subjects[0].name, "<b>Maths</b>"); // kept as plain text; the page never treats it as HTML
  assert.equal(messy.questions.length, 1);
  assert.equal(messy.questions[0].box, 5);
  assert.equal(messy.questions[0].due, "1970-01-01");
  assert.equal(messy.questions[0].right, 0);
  assert.equal(messy.stats.points, 0);
  assert.deepEqual(Object.keys(messy.stats.days), ["2026-10-26"]);
  assert.deepEqual(Object.keys(messy.stats.badges), ["first"]);
  assert.equal(messy.settings.dailyGoal, 200);
  assert.deepEqual(messy.treats, [{ id: "x", name: "Tea", cost: 1 }]);
  assert.equal(Object.getPrototypeOf(messy.stats.days), Object.prototype);
});

const rows = (text) => L.parseQuestionList(text).items.map((i) => [i.q, i.a, ...i.choices]);

test("pasted lists: the format the AI prompt asks for", () => {
  const r = L.parseQuestionList("What is 2+2? | 4 | 3 | 5 | 22\nCapital of Spain | Madrid\n\nno separator here\n | no question");
  assert.deepEqual(r.items, [
    { q: "What is 2+2?", a: "4", choices: ["3", "5", "22"] },
    { q: "Capital of Spain", a: "Madrid", choices: [] },
  ]);
  assert.equal(r.skipped, 2);
  assert.deepEqual(rows("a | b | c | b | C"), [["a", "b", "c", "C"]], "duplicates of the answer are dropped");
});

test("pasted lists: numbering, bold, code fences and markdown tables", () => {
  assert.deepEqual(rows("```\n1. **Capital of Italy** | **Rome**\n2) Capital of Peru | Lima\n- Capital of Chad | N'Djamena\n```"),
    [["Capital of Italy", "Rome"], ["Capital of Peru", "Lima"], ["Capital of Chad", "N'Djamena"]]);
  assert.deepEqual(rows("| Question | Answer |\n|---|---|\n| H2O is? | Water |\n| NaCl is? | Salt |"), [["H2O is?", "Water"], ["NaCl is?", "Salt"]]);
});

test("pasted lists: spreadsheet, csv, dashes and double colons", () => {
  assert.deepEqual(rows("Capital of Spain\tMadrid\nCapital of Italy\tRome"), [["Capital of Spain", "Madrid"], ["Capital of Italy", "Rome"]]);
  assert.deepEqual(rows('Capital of Spain, Madrid\n"Who wrote ""Hamlet"", the play?",Shakespeare'), [["Capital of Spain", "Madrid"], ['Who wrote "Hamlet", the play?', "Shakespeare"]]);
  assert.deepEqual(rows("Largest planet — Jupiter\nH2O :: Water\nWhat is 3x3? 9"), [["Largest planet", "Jupiter"], ["H2O", "Water"], ["What is 3x3?", "9"]]);
});

test("pasted lists: Q/A blocks and JSON", () => {
  const blocks = "Q1: What is the powerhouse of the cell?\nA1: Mitochondria\n\n**Question 2:** Which gas do plants take in?\n**Answer:** Carbon dioxide\nWrong options: Oxygen | Nitrogen | Helium\n\nQ: Long question that\ncontinues here?\nA: Yes";
  assert.deepEqual(rows(blocks), [
    ["What is the powerhouse of the cell?", "Mitochondria"],
    ["Which gas do plants take in?", "Carbon dioxide", "Oxygen", "Nitrogen", "Helium"],
    ["Long question that continues here?", "Yes"],
  ]);
  assert.deepEqual(rows('[{"question":"a?","answer":"b","wrong":["c","d"]},["e?","f"],{"q":"","a":"x"},7]'), [["a?", "b", "c", "d"], ["e?", "f"]]);
  assert.equal(L.parseQuestionList('{"questions":[{"q":"a","a":"b"}]}').items.length, 1);
  assert.equal(L.parseQuestionList("[not json").items.length, 0);
});

test("pasted lists: empty, junk and huge input never throw", () => {
  assert.deepEqual(L.parseQuestionList(""), { items: [], skipped: 0, format: "empty" });
  assert.equal(L.parseQuestionList(null).items.length, 0);
  assert.equal(L.parseQuestionList("%%%\n???\n|||").items.length, 0);
  const big = Array.from({ length: 800 }, (_, i) => `q${i} | a${i}`).join("\n");
  assert.equal(L.parseQuestionList(big).items.length, 500);
  assert.equal(L.parseQuestionList("x".repeat(2000) + " | " + "y".repeat(2000)).items[0].q.length, 500);
});

test("duplicates are flagged", () => {
  const existing = [{ subjectId: "s", q: "Capital of France?" }, { subjectId: "other", q: "Capital of Spain?" }];
  const out = L.markDuplicates([{ q: "capital of france" }, { q: "Capital of Spain?" }, { q: "Capital of Spain?" }], existing, "s");
  assert.deepEqual(out.map((o) => o.duplicate), [true, false, true]);
});

test("AI prompt asks for the format the parser reads", () => {
  const p = L.buildAiPrompt({ topic: "Photosynthesis", level: "GCSE", count: 12, style: "choice" });
  assert.ok(p.includes('"Photosynthesis"') && p.includes("12 revision questions") && p.includes("3 wrong options"));
  assert.ok(L.buildAiPrompt({}).includes("[type your topic here]"));
  assert.ok(L.buildAiPrompt({ topic: "x", count: 9999 }).includes("50 revision"));
  const reply = "Which organelle makes ATP? | Mitochondria | Nucleus | Ribosome | Vacuole";
  assert.equal(L.parseQuestionList(reply).items[0].choices.length, 3);
});

test("chests", () => {
  const pts = [0, 0.44, 0.46, 0.74, 0.76, 0.89, 0.91, 0.969, 0.971, 0.9999].map((r) => L.chestReward(() => r));
  assert.deepEqual(pts, [20, 20, 35, 35, 50, 50, 80, 80, 150, 150]);
  const s = L.emptyState();
  assert.equal(L.openChest(s), null);
  s.chests = 2;
  const got = L.openChest(s, () => 0.99);
  assert.equal(got, 150); assert.equal(s.chests, 1); assert.equal(s.stats.points, 150); assert.equal(s.stats.chestsOpened, 1);
  let total = 0; for (let i = 0; i < 20000; i++) total += L.chestReward();
  assert.ok(Math.abs(total / 20000 - 36.9) < 3, "average payout is about 37 points");
});

test("weekly quests", () => {
  const s = L.emptyState(); // goal 10 -> 50 answers, 4 days, 30 correct
  const today = "2026-10-29"; // Thursday; week starts Monday 2026-10-26
  assert.equal(L.weekStart(today), "2026-10-26");
  s.stats.days["2026-10-25"] = { n: 99, c: 99, p: 0 }; // last week doesn't count
  s.stats.days["2026-10-26"] = { n: 20, c: 15, p: 0 };
  s.stats.days["2026-10-27"] = { n: 20, c: 10, p: 0 };
  let q = L.weeklyQuests(s, today);
  assert.deepEqual(q.map((x) => [x.id, x.progress, x.target, x.done]), [["answers", 40, 50, false], ["days", 2, 4, false], ["correct", 25, 30, false]]);
  assert.deepEqual(L.claimQuest(s, "answers", today), { ok: false }, "can't claim unfinished");
  s.stats.days["2026-10-28"] = { n: 12, c: 8, p: 0 };
  s.stats.days["2026-10-29"] = { n: 1, c: 1, p: 0 };
  assert.ok(L.weeklyQuests(s, today).every((x) => x.done));
  assert.deepEqual(L.claimQuest(s, "answers", today), { ok: true, points: 40, chest: false });
  assert.deepEqual(L.claimQuest(s, "answers", today), { ok: false }, "only once");
  L.claimQuest(s, "days", today);
  assert.deepEqual(L.claimQuest(s, "correct", today), { ok: true, points: 40, chest: true });
  assert.equal(s.chests, 1); assert.equal(s.stats.points, 120); assert.equal(s.stats.questsDone, 3);
  assert.ok(L.weeklyQuests(s, "2026-11-02").every((x) => !x.claimed), "a new week starts fresh");
  assert.equal(L.weeklyQuests(s, today).filter((x) => x.claimed).length, 3);
});

test("study buddy", () => {
  assert.equal(L.buddyFor(1).emoji, "🥚");
  assert.equal(L.buddyFor(4).title, "Chick");
  assert.equal(L.buddyFor(99).title, "Dragon");
  assert.equal(L.buddyFor(99).nextLevel, null);
  assert.equal(L.buddyFor(5).nextLevel, 8);
  const s = L.emptyState(); const t = "2026-10-26";
  assert.ok(L.buddyMood(s, t).includes("sleepy"));
  s.stats.streak = 3; s.stats.lastDay = "2026-10-25";
  assert.ok(L.buddyMood(s, t).includes("3-day streak"));
  s.stats.days[t] = { n: 4, c: 3, p: 0 };
  assert.ok(L.buddyMood(s, t).includes("6 more"));
  s.stats.days[t].n = 10;
  assert.ok(L.buddyMood(s, t).includes("thrilled"));
});

test("shop: buying, equipping and refunds-never", () => {
  const s = L.emptyState();
  assert.ok(Shop.isOwned(s, "palette:Paper") && Shop.isOwned(s, "palette:Night"), "two themes are free");
  assert.ok(!Shop.isOwned(s, "hat:Crown"));
  assert.equal(Shop.buyItem(s, "hat:Crown").ok, false);
  s.stats.points = 300;
  assert.deepEqual(Shop.buyItem(s, "hat:Crown"), { ok: true, message: "Unlocked Crown!" });
  assert.equal(s.stats.spent, 250);
  assert.equal(Shop.buyItem(s, "hat:Crown").ok, false, "can't buy twice");
  assert.equal(Shop.buyItem(s, "nope").ok, false);
  assert.ok(Shop.equipItem(s, "hat", "hat:Crown") && s.equipped.hat === "hat:Crown");
  assert.ok(!Shop.equipItem(s, "hat", "hat:Cap"), "can't wear what you don't own");
  assert.ok(!Shop.equipItem(s, "palette", "hat:Crown"), "wrong kind");
  assert.ok(Shop.equipItem(s, "palette", "palette:Night"));
  assert.ok(Shop.equipItem(s, "palette", "") && s.equipped.palette === "");
  assert.equal(Shop.ITEMS.filter((i) => i.kind === "palette").length, 20);
  assert.equal(Shop.ITEMS.filter((i) => i.kind === "font").length, 12);
  assert.equal(new Set(Shop.ITEMS.map((i) => i.id)).size, Shop.ITEMS.length);
});

test("saved data: old v1 saves upgrade cleanly and new fields are checked", () => {
  const v1 = { v: 1, subjects: [{ id: "a", name: "A" }], questions: [], treats: [{ id: "t1", name: "30 minutes of free time", cost: 100 }], settings: { dailyGoal: 5 }, stats: { points: 70 } };
  const up = L.sanitiseState(v1);
  assert.equal(up.v, 2); assert.equal(up.stats.points, 70); assert.equal(up.treats.length, 1); assert.deepEqual(up.equipped, { palette: "", font: "", hat: "" });
  const ids = new Set(Shop.ITEMS.map((i) => i.id));
  const bad = L.sanitiseState({ owned: ["hat:Crown", "hat:Fake", 7], equipped: { palette: "font:Anton", font: "font:Anton", hat: "hat:Fake" }, claims: { "2026-10-26:days": true, "x:y": true, "2026-10-26:bonus": "yes" }, chests: -4, buddy: { name: "  " }, savedAt: "garbage" }, ids);
  assert.deepEqual(bad.owned, ["hat:Crown"]);
  assert.deepEqual(bad.equipped, { palette: "", font: "font:Anton", hat: "" });
  assert.deepEqual(bad.claims, { "2026-10-26:days": true });
  assert.equal(bad.chests, 0); assert.equal(bad.buddy.name, "Pip"); assert.equal(bad.savedAt, "");
  assert.equal(L.sanitiseState({ buddy: { name: "Rex" }, savedAt: "2026-10-26T10:00:00Z" }).buddy.name, "Rex");
});

test("a goal chest can only be earned once a day, and goals have a minimum", () => {
  const out = L.sanitiseState({ settings: { dailyGoal: 1 }, stats: { days: { "2026-10-26": { n: 5, c: 4, p: 9, g: true }, "2026-10-27": { n: 1, g: "yes" } } } });
  assert.equal(out.settings.dailyGoal, 3);
  assert.equal(out.stats.days["2026-10-26"].g, true);
  assert.ok(!("g" in out.stats.days["2026-10-27"]));
});

test("farm pets: one per subject, grow with right answers, keep their name", () => {
  const s = L.emptyState(); const today = "2026-10-26";
  s.subjects.push({ id: "bio", name: "Biology" }, { id: "geo", name: "Geography", petName: "Rex" });
  for (let i = 0; i < 3; i++) s.questions.push({ id: "b" + i, subjectId: "bio", q: "q", a: "a", box: 1, due: i ? "2099-01-01" : today, right: 0, wrong: 0, choices: [] });
  let [bio, geo] = L.farmPets(s, today);
  assert.equal(bio.emoji, "🥚"); assert.equal(bio.title, "Egg"); assert.equal(bio.nextAt, 5); assert.equal(bio.due, 1); assert.equal(bio.total, 3);
  assert.equal(geo.name, "Rex"); assert.ok(L.PET_NAMES.includes(bio.name));
  assert.deepEqual([bio.name, bio.emoji], [L.petFor(s, s.subjects[0], today).name, L.petFor(s, s.subjects[0], today).emoji], "same pet every time");
  s.subjects[0].xp = 5; assert.equal(L.petFor(s, s.subjects[0], today).title, "Baby");
  s.subjects[0].xp = 20; assert.equal(L.petFor(s, s.subjects[0], today).stage, 2);
  s.subjects[0].xp = 100; const grown = L.petFor(s, s.subjects[0], today);
  assert.equal(grown.title, "Legend"); assert.equal(grown.nextAt, null); assert.equal(grown.progress, 100);
  s.subjects[0].xp = 0; s.questions[0].right = 30; assert.equal(L.petFor(s, s.subjects[0], today).stage, 2, "older progress still counts");
  s.questions = []; s.subjects[0].xp = 30; assert.equal(L.petFor(s, s.subjects[0], today).stage, 2, "deleting questions never shrinks a pet");
  const kinds = new Set(Array.from({ length: 40 }, (_, i) => L.petFor(s, { id: "s" + i, name: "x", xp: 100 }, today).emoji));
  assert.ok(kinds.size >= 4, "different subjects get different kinds of pet");
});

test("pet names and growth survive saving, and junk is dropped", () => {
  const out = L.sanitiseState({ subjects: [{ id: "a", name: "A", petName: "  Bubbles  ", xp: 12.7 }, { id: "b", name: "B", petName: 5, xp: -3 }, { id: "c", name: "C", petName: "x".repeat(50) }] });
  assert.equal(out.subjects[0].petName, "Bubbles"); assert.equal(out.subjects[0].xp, 13);
  assert.deepEqual(out.subjects[1], { id: "b", name: "B" });
  assert.equal(out.subjects[2].petName.length, 20);
});

test("the hidden surprise gives points once a day but counts every time", () => {
  const s = L.emptyState();
  assert.equal(L.findSecret(s, "2026-10-26"), 10); assert.equal(s.stats.points, 10);
  assert.equal(L.findSecret(s, "2026-10-26"), 0); assert.equal(s.stats.points, 10); assert.equal(s.stats.secrets, 2);
  assert.equal(L.findSecret(s, "2026-10-27"), 10);
  assert.ok(L.newBadges(s).includes("secret"));
  assert.equal(L.sanitiseState({ lastParade: "2026-10-26", stats: { secrets: 3 } }).lastParade, "2026-10-26");
  assert.equal(L.sanitiseState({ lastParade: "nope" }).lastParade, "");
});

test("answers: other correct wordings are accepted, wrong ones are not", () => {
  const ok = (g, e) => assert.ok(L.isCorrect(g, e), `${g} should match ${e}`);
  const no = (g, e) => assert.ok(!L.isCorrect(g, e), `${g} should NOT match ${e}`);
  ok("it is the mitochondria", "Mitochondria");
  ok("seven continents", "7");
  ok("two", "2");
  ok("Pacific", "Pacific Ocean");
  ok("severn", "River Severn");
  ok("dioxide carbon", "carbon dioxide");
  ok("water and carbon dioxide", "carbon dioxide and water");
  ok("plants", "plant");
  ok("cell membranes", "cell membrane");
  ok("the french revolution", "French Revolution");
  ok("carbon dioxide", "CO2; carbon dioxide");
  no("not paris", "Paris");
  no("7 or 8", "7");
  no("17", "7");
  no("carbon", "carbon dioxide");
  no("henry", "Henry VIII");
  no("2", "World War 2");
  no("Atlantic", "Pacific Ocean");
  no("Pacific Atlantic", "Pacific Ocean");
});

test("pasted JSON can carry alternative answers and a source tag", () => {
  const r = L.parseQuestionList(JSON.stringify([{ q: "Formula for carbon dioxide?", a: "CO2", alt: ["carbon dioxide", "CO₂"], wrong: ["O2"], src: "AQA style" }]));
  assert.equal(r.items[0].a, "CO2; carbon dioxide; CO₂");
  assert.equal(r.items[0].src, "AQA style");
  assert.ok(L.isCorrect("carbon dioxide", r.items[0].a));
});

test("past-paper prompt option", () => {
  assert.ok(!/past-paper/.test(L.buildAiPrompt({ topic: "Cells" })));
  const p = L.buildAiPrompt({ topic: "Cells", paper: true, board: "AQA", level: "GCSE" });
  assert.match(p, /AQA/); assert.match(p, /past-paper/); assert.match(p, /Never make up/);
});

test("exam lists are read from the way people write timetables", () => {
  const r = L.parseExamList("Maths Paper 1 | 14 May 2027 | GCSE | 9:00\nBiology, 21/05/2027, mock\nEnglish Lit - May 17th - A level\nrubbish\nHistory | 3rd June", "2027-04-26");
  assert.equal(r.exams.length, 4); assert.equal(r.skipped, 1);
  assert.deepEqual(r.exams[0], { subject: "Maths", kind: "GCSE", board: "", date: "2027-05-14", paper: "Paper 1", time: "9:00" });
  assert.deepEqual([r.exams[1].subject, r.exams[1].kind, r.exams[1].date], ["Biology", "Mock", "2027-05-21"]);
  assert.deepEqual([r.exams[2].subject, r.exams[2].kind, r.exams[2].date], ["English Lit", "A-level", "2027-05-17"]);
  assert.equal(r.exams[3].date, "2027-06-03");
  assert.equal(L.parseExamList("Maths | 30 Feb 2027", "2027-01-01").exams.length, 0, "impossible dates are skipped");
  assert.equal(L.parseExamList("Maths | 3 Feb", "2027-03-01").exams[0].date, "2028-02-03", "a date without a year means the next one");
});

test("timetable: nearer exams get more time, nobody revises on their own exam day, rest days stay empty", () => {
  const exams = [
    { id: "1", subject: "Maths", kind: "GCSE", date: "2027-05-10", paper: "", time: "" },
    { id: "2", subject: "History", kind: "GCSE", date: "2027-05-24", paper: "", time: "" },
    { id: "3", subject: "Art", kind: "Mock", date: "2027-05-24", paper: "", time: "" },
  ];
  const t = L.buildTimetable(exams, { perDay: 2, minutes: 30, offDays: [6] }, "2027-04-26");
  assert.equal(t[0].date, "2027-04-26"); assert.equal(t.at(-1).date, "2027-05-24");
  for (const d of t) {
    if (d.off) assert.equal(d.sessions.length, 0);
    for (const s of d.sessions) assert.ok(!d.exams.some((e) => L.subjectKey(e.subject) === s.key), "no revision on exam day");
    assert.ok(d.sessions.length <= 2);
  }
  assert.ok(t.find((d) => d.date === "2027-05-02").off, "Sunday is a rest day");
  const week1 = t.slice(0, 7).flatMap((d) => d.sessions).reduce((m, s) => ({ ...m, [s.subject]: (m[s.subject] || 0) + 1 }), {});
  assert.ok(week1.Maths > week1.Art, "the sooner exam gets more sessions");
  assert.ok(week1.Art > 0 && week1.History > 0, "every subject appears in the first week");
  assert.ok(L.buildTimetable([], {}, "2027-04-26").length === 0);
  assert.ok(L.buildTimetable([{ ...exams[0], date: "2020-01-01" }], {}, "2027-04-26").length === 0, "finished exams are ignored");
});

test("exams and the plan survive saving and bad data is cleaned up", () => {
  const s = L.sanitiseState({ exams: [{ id: "a", subject: "Maths", kind: "GCSE", date: "2027-05-14" }, { id: "b", subject: "x", date: "not a date" }, { id: "a", subject: "dup", date: "2027-05-14" }, { id: "c", subject: "Bio", kind: "weird", date: "2027-02-30" }],
    plan: { perDay: 99, minutes: 1, offDays: [6, 6, "x", 9], done: { "2027-05-01|maths|0": true, "junk": true } } });
  assert.equal(s.exams.length, 1); assert.equal(s.exams[0].subject, "Maths");
  assert.deepEqual(s.plan, { perDay: 6, minutes: 10, offDays: [6], exclude: [], done: { "2027-05-01|maths|0": true } });
  assert.deepEqual(L.sanitiseState({}).plan, { perDay: 2, minutes: 30, offDays: [], exclude: [], done: {} });
  assert.equal(L.sanitiseState({ subjects: [{ id: "s", name: "S" }], questions: [{ id: "q", subjectId: "s", q: "Q?", a: "A", src: "AQA past-paper style" }] }).questions[0].src, "AQA past-paper style");
});

test("exam board in a pasted timetable", () => {
  const r = L.parseExamList("Physics Paper 2 | 3 June 2027 | AQA | GCSE\nHistory | 4 June 2027 | pearson edexcel\nGeography | 5 June 2027 | wjec", "2027-04-26");
  assert.deepEqual(r.exams.map((e) => [e.subject, e.board, e.kind]), [["Physics", "AQA", "GCSE"], ["History", "Edexcel", "Other"], ["Geography", "WJEC / Eduqas", "Other"]]);
  assert.equal(L.sanitiseState({ exams: [{ id: "a", subject: "X", date: "2027-05-14", board: "AQA" }, { id: "b", subject: "Y", date: "2027-05-14", board: "Fake" }] }).exams.map((e) => e.board).join(","), "AQA,");
});

test("subjects can be left out of the revision timetable", () => {
  const exams = [
    { id: "1", subject: "Maths", kind: "GCSE", date: "2027-05-10", paper: "", time: "" },
    { id: "2", subject: "Art", kind: "GCSE", date: "2027-05-12", paper: "", time: "" },
  ];
  const t = L.buildTimetable(exams, { perDay: 2, exclude: ["art"] }, "2027-04-26");
  const subjects = new Set(t.flatMap((d) => d.sessions.map((s) => s.subject)));
  assert.deepEqual([...subjects], ["Maths"]);
  assert.ok(t.find((d) => d.date === "2027-05-12").exams.length === 1, "the exam still shows on the calendar");
  assert.equal(L.buildTimetable(exams, { exclude: ["Maths", "ART"] }, "2027-04-26").flatMap((d) => d.sessions).length, 0);
  assert.deepEqual(L.sanitiseState({ plan: { exclude: ["Art", "Art", "", 5] } }).plan.exclude, ["Art"]);
});

test("complete exam questions: parsed with marks, kept when saved, prompt asks for a mark scheme", () => {
  const r = L.parseQuestionList(JSON.stringify([{ q: "Explain why plants need light. [4 marks]", marks: 4, a: "for photosynthesis ; to make glucose ; chlorophyll absorbs light ; energy is transferred" }, { q: "Quick one?", a: "Yes" }]));
  assert.equal(r.items[0].exam, true); assert.equal(r.items[0].marks, 4); assert.deepEqual(r.items[0].choices, []);
  assert.equal(r.items[1].exam, undefined);
  const s = L.sanitiseState({ subjects: [{ id: "s", name: "Bio – Exam questions" }], questions: [{ id: "q", subjectId: "s", q: "Explain.", a: "x ; y ; ".padEnd(900, "z"), exam: true, marks: 40 }, { id: "q2", subjectId: "s", q: "Q?", a: "A", exam: true, marks: 0 }] });
  assert.equal(s.questions[0].exam, true); assert.equal(s.questions[0].marks, 12); assert.ok(s.questions[0].a.length > 300, "mark schemes can be long");
  assert.equal(s.questions[1].exam, undefined, "an exam question needs marks");
  const p = L.buildAiPrompt({ topic: "Cells", mode: "exam", board: "OCR", paper: true });
  assert.match(p, /mark scheme/); assert.match(p, /"marks"/); assert.match(p, /OCR specification/);
  assert.match(L.buildAiPrompt({ topic: "Cells", board: "AQA" }), /AQA specification/);
  assert.doesNotMatch(L.buildAiPrompt({ topic: "Cells" }), /specification/);
  assert.equal(L.sanitiseState({ settings: { board: "AQA" } }).settings.board, "AQA");
  assert.equal(L.sanitiseState({ settings: { board: "Nope" } }).settings.board, "");
});

test("offline marker scores each marking point", () => {
  const scheme = "for photosynthesis ; to make glucose ; chlorophyll absorbs light ; energy is transferred";
  const full = L.markLocally("Plants need light for photosynthesis, to make glucose. Chlorophyll absorbs the light and energy is transferred.", scheme, 4);
  assert.equal(full.awarded, 4); assert.equal(full.total, 4);
  const part = L.markLocally("They use light to do photosynthesis and make glucose", scheme, 4);
  assert.equal(part.awarded, 2); assert.deepEqual(part.points.map((p) => p.met), [true, true, false, false]);
  assert.equal(L.markLocally("I like cheese", scheme, 4).awarded, 0);
  assert.equal(L.markLocally("photosynthesis glucose chlorophyll light energy transferred", scheme, 2).awarded, 2, "never more than the marks available");
  assert.deepEqual(L.schemePoints("a ; b • c\nd"), ["a", "b", "c", "d"]);
});

test("a timetable typed out by another AI (tables, numbering, weekdays, code fences) is understood", () => {
  const reply = "```\n| Subject | Date | Type |\n|---|---|---|\n| Maths | Mon 14 May 2027 | GCSE |\n```\n1. Biology | Fri 21/05/2027 | Mock | AQA | Paper 2 | 9:00\n- English Language | Tuesday 25 May 2027";
  const r = L.parseExamList(reply, "2027-04-26");
  assert.deepEqual(r.exams.map((e) => [e.subject, e.date, e.kind, e.board, e.paper, e.time]), [
    ["Maths", "2027-05-14", "GCSE", "", "", ""],
    ["Biology", "2027-05-21", "Mock", "AQA", "Paper 2", "9:00"],
    ["English Language", "2027-05-25", "Other", "", "", ""],
  ]);
});

test("prompt for turning a photo of a timetable into a list", () => {
  const p = L.buildTimetablePrompt("2026-11-02");
  assert.match(p, /photo/); assert.match(p, /Subject \| date \| type \| exam board \| paper \| time/); assert.match(p, /2026-11-02/); assert.match(p, /14 May 2026/);
  assert.equal(L.parseExamList(p.split("\n").find((l) => /^Subject \|/.test(l)).replace("Subject | date | type | exam board | paper | time", "Maths | 14 May 2027 | GCSE | AQA | Paper 1 | 9:00"), "2027-01-01").exams[0].board, "AQA");
});

test("parseExamList reads timetables laid out with a date heading and the exams underneath", () => {
  const text = `Year 11 Mock Exams - November 2026
Monday 9th November
AM  Maths Paper 1 (9:00)
PM  English Language Paper 1 1:00pm
Tuesday 10th November
Biology Paper 1
Chemistry Paper 1 - Hall
Good luck everyone!
Wednesday 11th November
Week 1`;
  const r = L.parseExamList(text, "2026-11-02");
  assert.deepEqual(r.exams.map((e) => [e.subject, e.paper, e.date, e.time]), [
    ["Maths", "Paper 1", "2026-11-09", "9:00"],
    ["English Language", "Paper 1", "2026-11-09", "1:00pm"],
    ["Biology", "Paper 1", "2026-11-10", ""],
    ["Chemistry", "Paper 1", "2026-11-10", ""],
  ]);
  assert.equal(r.skipped, 3, "the title, the sign-off and the stray 'Week 1' are skipped");
  // sessions without a time are marked AM / PM, and a lone heading with nothing under it adds nothing
  const am = L.parseExamList("Thursday 12th November\nAM: History\nPM - Geography\nFriday 13th November", "2026-11-02");
  assert.deepEqual(am.exams.map((e) => [e.subject, e.time]), [["History", "AM"], ["Geography", "PM"]]);
  // ordinary one-per-line lists are unaffected, and lines before any date heading are never given a date
  assert.equal(L.parseExamList("Intro line\nRE | 17 June 2027 | GCSE", "2026-11-02").exams.length, 1);
  assert.equal(L.parseExamList("Maths\nEnglish", "2026-11-02").exams.length, 0);
});

// ---------- exam multiple choice and figures ----------
test("examFormats only offers multiple choice and graphs for subjects whose exams really have them", () => {
  assert.deepEqual(L.examFormats("Biology"), { mc: true, figures: ["table", "line", "bar", "scatter"] });
  assert.equal(L.examFormats("Combined Science").mc, true);
  assert.equal(L.examFormats("Maths").mc, false, "GCSE Maths papers don't use multiple choice");
  assert.ok(L.examFormats("Further Maths").figures.includes("scatter"));
  assert.deepEqual(L.examFormats("Computer Science").figures, ["table"], "not mistaken for a science");
  assert.deepEqual(L.examFormats("Geography").figures, ["table", "bar", "line", "pie", "scatter"]);
  for (const none of ["History", "English Literature", "French", "Art", "Religious Studies", "Music"]) assert.deepEqual(L.examFormats(none), { mc: false, figures: [] }, none);
  assert.deepEqual(L.examFormats("", ""), { mc: false, figures: [] });
  assert.equal(L.examFormats("Revision", "Quadratic algebra").figures.length > 0, true, "falls back to the topic when the subject name says nothing");
  assert.equal(L.examFormats("History", "Population graphs").figures.length, 0, "a subject that doesn't use them wins over the topic");
});

test("cleanOpts finds the correct option from a letter or the text, and rejects broken sets", () => {
  assert.deepEqual(L.cleanOpts(["A. Oxygen", "B. Carbon dioxide", "C. Nitrogen", "D. Helium"], "B"), { opts: ["Oxygen", "Carbon dioxide", "Nitrogen", "Helium"], a: "Carbon dioxide" });
  assert.equal(L.cleanOpts(["Oxygen", "Carbon dioxide", "Nitrogen"], "carbon dioxide").a, "Carbon dioxide");
  assert.equal(L.cleanOpts(["Oxygen", "Carbon dioxide", "Nitrogen"], "(c) Nitrogen").a, "Nitrogen");
  assert.equal(L.cleanOpts(["x", "y", "z", "w"], "d.").a, "w");
  assert.equal(L.cleanOpts(["a", "b"], "a"), null, "too few options");
  assert.equal(L.cleanOpts(["a", "b", "c", "d", "e", "f"], "a"), null, "too many options");
  assert.equal(L.cleanOpts(["same", "Same", "other"], "other"), null, "duplicate options");
  assert.equal(L.cleanOpts(["one", "two", "three"], "four"), null, "answer isn't one of the options");
  assert.equal(L.cleanOpts(["one", "two", "three"], "E"), null, "letter past the last option");
  assert.equal(L.cleanOpts("nope", "a"), null);
});

test("cleanFigure accepts good tables and charts and refuses broken or unwanted ones", () => {
  const table = L.cleanFigure({ type: "Data table", title: "Table 1", head: ["Time (s)", "Speed (m/s)"], rows: [[0, 0], [5, "12"], [10, 25]] });
  assert.deepEqual(table, { type: "table", title: "Table 1", head: ["Time (s)", "Speed (m/s)"], rows: [["0", "0"], ["5", "12"], ["10", "25"]] });
  const bar = L.cleanFigure({ type: "bar chart", title: "T", xLabel: "Month", yLabel: "mm", labels: ["Jan", "Feb", "Mar"], series: [{ name: "2025", values: [1, "2", 3.5] }] });
  assert.equal(bar.type, "bar"); assert.deepEqual(bar.series[0].values, [1, 2, 3.5]);
  assert.equal(L.cleanFigure({ type: "line graph", labels: [0, 1, 2], values: [3, 4, 5] }).series.length, 1, "a plain values list becomes one series");
  assert.equal(L.cleanFigure({ type: "scatter graph", points: [{ x: 1, y: 2 }, [2, 3], [3, 5]] }).points.length, 3);
  assert.equal(L.cleanFigure({ type: "pie", labels: ["a", "b", "c"], values: [50, 30, 20] }).values.length, 3);
  // broken ones
  assert.equal(L.cleanFigure({ type: "bar", labels: ["a", "b"], series: [{ values: [1] }] }), null, "values don't match the labels");
  assert.equal(L.cleanFigure({ type: "bar", labels: ["a", "b"], series: [{ values: [1, "lots"] }] }), null, "a non-number");
  assert.equal(L.cleanFigure({ type: "pie", labels: ["a", "b"], values: [5, -1] }), null);
  assert.equal(L.cleanFigure({ type: "scatter", points: [[1, 2], [2, 3]] }), null, "too few points");
  assert.equal(L.cleanFigure({ type: "table", head: ["only one"], rows: [["x"]] }), null);
  assert.equal(L.cleanFigure({ type: "hologram" }), null);
  assert.equal(L.cleanFigure(null), null);
  assert.equal(L.cleanFigure({ type: "pie", labels: ["a", "b"], values: [1, 2] }, ["table", "bar"]), null, "not allowed for this subject");
});

test("refersToMissingFigure spots questions that point at something that isn't there", () => {
  for (const bad of ["Figure 1 shows a cell. Name part X.", "Use the graph to find the speed.", "Look at the table below.", "The diagram above shows a circuit.", "Using Table 2, calculate the mean."]) assert.equal(L.refersToMissingFigure(bad), true, bad);
  for (const ok of ["State the function of the mitochondria.", "Use the periodic table to name the element with atomic number 11.", "Explain why a graph of distance against time is a straight line for constant speed."]) assert.equal(L.refersToMissingFigure(ok), false, ok);
});

test("niceScale gives round axes", () => {
  assert.deepEqual(L.niceScale(0, 97).ticks, [0, 20, 40, 60, 80, 100]);
  assert.deepEqual(L.niceScale(3, 3.4).ticks, [3, 3.1, 3.2, 3.3, 3.4]);
  assert.deepEqual(L.niceScale(-4, 9).ticks, [-5, 0, 5, 10]);
  assert.deepEqual(L.niceScale(5, 5).ticks.length > 1, true);
  assert.equal(L.niceScale(NaN, 3).min, 0);
});

test("figureSvg draws each chart type, escapes text, and describes the figure for screen readers", () => {
  const bar = L.cleanFigure({ type: "bar", title: "Sales <script>alert(1)</script> & \"co\"", xLabel: "Month", yLabel: "£", labels: ["Jan", "Feb"], series: [{ name: "A", values: [3, 5] }, { name: "B", values: [4, 2] }] });
  const svg = L.figureSvg(bar);
  assert.match(svg, /^<svg /); assert.equal((svg.match(/<rect /g) || []).length, 4 + 2, "four bars and two legend swatches");
  assert.ok(!svg.includes("<script>") && svg.includes("&lt;script&gt;") && svg.includes("&amp;") && !svg.includes('"co"'), "text is escaped");
  assert.match(svg, /aria-label="Bar chart: Sales/);
  const line = L.figureSvg(L.cleanFigure({ type: "line", labels: ["0", "5", "10"], series: [{ name: "", values: [1, 4, 9] }] }));
  assert.match(line, /<polyline/); assert.equal((line.match(/<circle/g) || []).length, 3);
  assert.match(L.figureSvg(L.cleanFigure({ type: "scatter", points: [[1, 2], [2, 3], [3, 5]] })), /<circle/);
  const pie = L.figureSvg(L.cleanFigure({ type: "pie", labels: ["a", "b", "c"], values: [1, 1, 2] }));
  assert.equal((pie.match(/<path /g) || []).length, 3); assert.match(pie, /50%/);
  assert.match(L.figureSvg(L.cleanFigure({ type: "pie", labels: ["a", "b"], values: [100000, 1] })), /<circle/);
  assert.equal(L.figureSvg(L.cleanFigure({ type: "table", head: ["a", "b"], rows: [["1", "2"]] })), "", "tables are drawn by the page");
  assert.match(L.figureAlt(bar), /Jan 3, Feb 5/);
});

test("exam multiple choice and figure questions survive reading, saving and loading", () => {
  const json = JSON.stringify([
    { q: "Which gas is needed?", marks: 1, opts: ["Oxygen", "Carbon dioxide", "Nitrogen", "Helium"], a: "B" },
    { q: "Figure 1 shows rainfall. Which month was wettest?", marks: 3, a: "March; 60 mm; reads highest bar", fig: { type: "bar", title: "Figure 1", labels: ["Jan", "Feb", "Mar"], series: [{ values: [20, 30, 60] }] } },
    { q: "Broken options", marks: 1, opts: ["only", "two"], a: "only" },
    { q: "Broken figure", marks: 2, a: "x", fig: { type: "bar", labels: ["a"], series: [] } },
    { q: "Plain written", marks: 4, a: "a; b; c; d" },
  ]);
  const r = L.parseQuestionList(json);
  assert.equal(r.items.length, 3); assert.equal(r.skipped, 2);
  const [mc, fig, plain] = r.items;
  assert.equal(mc.a, "Carbon dioxide"); assert.equal(mc.marks, 1); assert.equal(mc.opts.length, 4); assert.equal(mc.exam, true);
  assert.equal(fig.fig.type, "bar"); assert.equal(plain.opts, undefined); assert.equal(plain.fig, undefined);
  // saved state keeps both, and drops a corrupted one
  const state = L.emptyState(); state.subjects.push({ id: "s1", name: "Biology – Exam questions" });
  state.questions.push({ id: "q1", subjectId: "s1", ...mc, box: 1, due: "2026-11-02", right: 0, wrong: 0 }, { id: "q2", subjectId: "s1", ...fig, box: 1, due: "2026-11-02", right: 0, wrong: 0 },
    { id: "q3", subjectId: "s1", q: "bad", a: "x", choices: [], exam: true, marks: 1, opts: ["x"], box: 1, due: "2026-11-02", right: 0, wrong: 0 });
  const back = L.sanitiseState(JSON.parse(JSON.stringify(state)));
  assert.equal(back.questions.length, 2, "the corrupted multiple-choice question was dropped");
  assert.deepEqual(back.questions[0].opts, mc.opts); assert.equal(back.questions[0].a, "Carbon dioxide"); assert.equal(back.questions[1].fig.series[0].values[2], 60);
  assert.equal(L.parseQuestionList("Q | A | wrong1 | wrong2").items[0].opts, undefined, "ordinary quick questions never get options or figures");
});

// ---------- exam-style kinds: 1/2-mark multiple choice, Outline, 3, 6 and 9 markers ----------
test("kindId understands what a model or a paste calls each kind", () => {
  for (const [said, id] of [["mc1", "mc1"], ["MC", "mc1"], ["multiple choice", "mc1"], ["Select two", "mc2"], ["mc2", "mc2"], ["Outline", "outline"], ["outline one", "outline"], ["explain", "three"], ["3 mark", "three"], ["Analyse", "six"], ["discuss", "six"], ["6", "six"], ["Justify", "nine"], ["evaluate", "nine"], ["9-mark", "nine"]]) assert.equal(L.kindId(said), id, said);
  for (const none of ["", "banana", null, undefined, "12"]) assert.equal(L.kindId(none), "", String(none));
  assert.deepEqual(L.EXAM_KIND_IDS, ["mc1", "mc2", "outline", "three", "six", "nine"]);
  assert.deepEqual(L.EXAM_KIND_IDS.map((k) => L.EXAM_KINDS[k].marks), [1, 2, 2, 3, 6, 9]);
});

test("examPlan makes a paper-style mix with every chosen kind present, in paper order", () => {
  const all = L.examPlan(10);
  assert.equal(all.length, 10); assert.deepEqual([...new Set(all)], L.EXAM_KIND_IDS, "every kind appears, in paper order");
  assert.deepEqual(all, [...all].sort((a, b) => L.EXAM_KIND_IDS.indexOf(a) - L.EXAM_KIND_IDS.indexOf(b)));
  assert.ok(all.filter((k) => k === "mc1").length > all.filter((k) => k === "nine").length, "more short questions than 9 markers, like a real paper");
  assert.deepEqual(L.examPlan(4, ["six", "nine"]).sort(), ["nine", "six", "six", "six"].sort());
  assert.deepEqual(L.examPlan(3, ["nine"]), ["nine", "nine", "nine"]);
  assert.equal(L.examPlan(2, L.EXAM_KIND_IDS).length, 2, "fewer questions than kinds is fine");
  assert.deepEqual(L.examPlan(5, ["nonsense"]), []); assert.deepEqual(L.examPlan(0), []); assert.equal(L.examPlan(500).length, 50);
  assert.deepEqual(L.examPlan(5, ["MC", "select two"]).filter((k) => k === "mc2").length > 0, true, "kind names are understood");
});

test("cleanOptsMulti finds the two correct options however the answer is written", () => {
  const opts = ["Glucose", "Oxygen", "Nitrogen", "Helium", "Methane"];
  for (const ans of ["A, B", "A and B", "a & b", ["A", "B"], ["Glucose", "Oxygen"], "Glucose; Oxygen", "Oxygen; Glucose", "Glucose, Oxygen", "A. Glucose; B. Oxygen", "Glucose and Oxygen"]) {
    assert.deepEqual(L.cleanOptsMulti(opts, ans), { opts, answers: ["Glucose", "Oxygen"] }, JSON.stringify(ans));
  }
  assert.equal(L.cleanOptsMulti(opts, "A"), null, "one answer isn't two");
  assert.equal(L.cleanOptsMulti(opts, "A, B, C"), null, "three isn't two");
  assert.equal(L.cleanOptsMulti(opts, "A, A"), null);
  assert.equal(L.cleanOptsMulti(["a", "b", "c"], "A, B"), null, "needs at least four options");
  assert.equal(L.cleanOptsMulti(["a", "a", "c", "d"], "A, C"), null, "duplicate options");
  assert.equal(L.cleanOptsMulti(opts, "F, G"), null);
});

test("exam questions of each kind are read with the right marks, and the case-study extract is kept", () => {
  const r = L.parseQuestionList(JSON.stringify([
    { kind: "mc2", q: "Which TWO are products of photosynthesis?", marks: 2, opts: ["Glucose", "Oxygen", "Nitrogen", "Helium", "Methane"], a: "A, B" },
    { kind: "mc", q: "Which gas is needed?", marks: 1, opts: ["Oxygen", "Carbon dioxide", "Nitrogen", "Helium"], a: "B" },
    { kind: "outline", q: "Outline one way Kiko's could cut costs.", marks: 5, a: "buy in bulk ; so each item costs less", ctx: "Kiko's is a café." },
    { kind: "outline", q: "Outline two ways ...", marks: 4, a: "a ; b ; c ; d" },
    { kind: "three", q: "Explain one benefit ...", marks: 9, a: "id ; dev ; dev" },
    { kind: "Analyse", q: "Analyse the impact ...", marks: 4, a: "a ; b ; c ; d" },
    { kind: "justify", q: "Justify ...", marks: 7, a: "a ; b ; c ; d ; e" },
    { q: "Which of these?", marks: 2, opts: ["a", "b", "c", "d", "e"], a: "B and D" },
    { kind: "mc2", q: "Broken", marks: 2, opts: ["a", "b", "c", "d"], a: "A" },
  ]));
  assert.equal(r.items.length, 8); assert.equal(r.skipped, 1, "a select-two question that doesn't have two answers is skipped");
  const [two, one, out1, out2, three, six, nine, guessed] = r.items;
  assert.deepEqual([two.kind, two.marks, two.pick, two.answers, two.a], ["mc2", 2, 2, ["Glucose", "Oxygen"], "Glucose; Oxygen"]);
  assert.deepEqual([one.kind, one.marks, one.a, one.pick], ["mc1", 1, "Carbon dioxide", undefined]);
  assert.deepEqual([out1.kind, out1.marks, out1.ctx], ["outline", 2, "Kiko's is a café."], "Outline one is worth 2");
  assert.equal(out2.marks, 4, "Outline two is worth 4");
  assert.deepEqual([three.kind, three.marks], ["three", 3]); assert.deepEqual([six.kind, six.marks], ["six", 6]); assert.deepEqual([nine.kind, nine.marks], ["nine", 9]);
  assert.deepEqual([guessed.kind, guessed.marks, guessed.answers], ["mc2", 2, ["b", "d"]], "a 2-mark multiple choice with two answers is select-two even without a kind");
  assert.equal(L.examKindOf(two), "mc2"); assert.equal(L.examKindOf(one), "mc1"); assert.equal(L.examKindOf(six), "six");
  assert.equal(L.isExtended(six), true); assert.equal(L.isExtended(nine), true); assert.equal(L.isExtended(three), false); assert.equal(L.isExtended(two), false);
  // old-style items (no kind) are classed from their marks
  assert.equal(L.examKindOf({ exam: true, marks: 9, q: "x" }), "nine"); assert.equal(L.examKindOf({ exam: true, marks: 3, q: "x" }), "three");
  assert.equal(L.examKindOf({ exam: true, marks: 2, q: "Outline one thing" }), "outline"); assert.equal(L.examKindOf({ exam: true, marks: 4, q: "x" }), "other");
  assert.equal(L.examKindOf({ q: "quick" }), "");
  // a context on a multiple-choice question is not kept
  assert.equal(L.parseQuestionList(JSON.stringify([{ q: "Q?", marks: 1, opts: ["a", "b", "c", "d"], a: "A", ctx: "extra" }])).items[0].ctx, undefined);
});

test("the new question fields survive saving and loading, and broken ones are dropped", () => {
  const raw = {
    subjects: [{ id: "s", name: "Business – Exam questions" }],
    questions: [
      { id: "1", subjectId: "s", q: "Which TWO?", a: "Glucose; Oxygen", exam: true, marks: 2, kind: "mc2", pick: 2, opts: ["Glucose", "Oxygen", "Nitrogen", "Helium", "Methane"], answers: ["Glucose", "Oxygen"] },
      { id: "2", subjectId: "s", q: "Outline one …", a: "p ; q", exam: true, marks: 2, kind: "outline", ctx: "Kiko's is a café." },
      { id: "3", subjectId: "s", q: "Justify …", a: "a ; b", exam: true, marks: 9, kind: "nine" },
      { id: "4", subjectId: "s", q: "Broken", a: "x", exam: true, marks: 2, kind: "mc2", pick: 2, opts: ["a", "b", "c", "d"], answers: ["a"] },
      { id: "5", subjectId: "s", q: "Quick", a: "x", kind: "nine", ctx: "should not be kept" },
    ],
  };
  const s = L.sanitiseState(raw);
  assert.deepEqual(s.questions.map((q) => q.id), ["1", "2", "3", "5"], "the select-two question with a single answer is dropped");
  const [two, out, nine, quick] = s.questions;
  assert.deepEqual([two.marks, two.pick, two.answers, two.kind], [2, 2, ["Glucose", "Oxygen"], "mc2"]);
  assert.deepEqual([out.kind, out.ctx, out.marks], ["outline", "Kiko's is a café.", 2]); assert.equal(nine.kind, "nine");
  assert.equal(quick.kind, undefined); assert.equal(quick.ctx, undefined); assert.equal(quick.exam, undefined);
  assert.deepEqual(L.sanitiseState(JSON.parse(JSON.stringify(s))).questions, s.questions, "saving twice changes nothing");
});

test("the prompt for another AI asks for the chosen kinds, and for a made-up business in Business", () => {
  const biz = L.buildAiPrompt({ topic: "Marketing", mode: "exam", subject: "Business", board: "Edexcel", count: 8 });
  for (const kind of ["mc1", "mc2", "outline", "three", "six", "nine"]) assert.match(biz, new RegExp(`"kind":"${kind}"`), kind);
  assert.match(biz, /made-up business/); assert.match(biz, /"ctx"/); assert.match(biz, /Edexcel specification/); assert.match(biz, /Outline one/); assert.match(biz, /Justify/);
  const hist = L.buildAiPrompt({ topic: "Cold War", mode: "exam", subject: "History", count: 6 });
  assert.doesNotMatch(hist, /"kind":"mc/, "no multiple choice for History unless asked"); assert.match(hist, /"kind":"nine"/); assert.doesNotMatch(hist, /made-up business/);
  const mc = L.buildAiPrompt({ topic: "Cold War", mode: "exam", subject: "History", count: 6, kinds: ["mc1", "mc2"] });
  assert.match(mc, /"kind":"mc2"/); assert.doesNotMatch(mc, /"kind":"six"/);
  assert.match(L.buildAiPrompt({ topic: "Cells", mode: "exam" }), /exam-style/);
  assert.doesNotMatch(L.buildAiPrompt({ topic: "Cells" }), /"kind"/, "quick prompts are unchanged");
  // what the prompt asks for is exactly what the reader accepts
  const reply = JSON.stringify([{ kind: "six", q: "Analyse …", marks: 6, a: "a ; b ; c ; d" }, { kind: "outline", q: "Outline one …", marks: 2, a: "a ; b" }]);
  assert.equal(L.parseQuestionList(reply).items.length, 2);
});

test("6 and 9 mark answers are placed in a level, then given a mark inside it", () => {
  assert.deepEqual(L.levelBands(6), [[1, 2], [3, 4], [5, 6]]); assert.deepEqual(L.levelBands(9), [[1, 3], [4, 6], [7, 9]]); assert.deepEqual(L.levelBands(12), [[1, 4], [5, 8], [9, 12]]);
  const scheme = "Higher prices increase revenue per sale ; competitors may undercut so sales fall ; a premium brand image supports a higher price ; promotion raises awareness ; overall it depends on elasticity";
  const none = L.markLocally("dunno", scheme, 9, "nine");
  assert.deepEqual([none.awarded, none.level], [0, 0]);
  const list = L.markLocally("Higher prices increase revenue per sale. Competitors may undercut so sales fall. Promotion raises awareness.", scheme, 9, "nine");
  assert.equal(list.level, 1, "a list with no explanation stays in level 1"); assert.ok(list.awarded >= 1 && list.awarded <= 3);
  const strong = "I think higher prices increase revenue per sale because each customer pays more, which means profit goes up if demand holds. However competitors may undercut so sales fall as customers switch, which leads to lower revenue and a weaker market share over time. A premium brand image supports a higher price because customers expect quality, so the business can keep its margin. Promotion raises awareness of the brand, which means more people are willing to pay. Overall the best choice depends on elasticity, so the business should test a small rise first and I would recommend that because it limits the risk.";
  const good = L.markLocally(strong, scheme, 9, "nine");
  assert.equal(good.level, 3); assert.ok(good.awarded >= 7 && good.awarded <= 9, String(good.awarded));
  const noJudgement = L.markLocally(strong.replace(/Overall.*$/, "").replace(/I think |however /gi, ""), scheme, 9, "nine");
  assert.ok(noJudgement.level <= 2, "a 9 marker with no judgement can't reach level 3");
  assert.equal(L.markLocally("Higher prices increase revenue per sale because customers pay more, which means profit rises.", scheme, 6, "six").level >= 1, true);
  // shorter questions still count marking points
  assert.equal(L.markLocally("Higher prices increase revenue per sale; competitors may undercut so sales fall", scheme, 3).awarded, 2);
  assert.equal(L.markLocally("Higher prices increase revenue per sale", scheme, 3).level, undefined);
});

test("each subject gets its own kinds of question, names and command words", () => {
  const maths = L.examProfile("Maths", "Quadratics");
  assert.deepEqual(maths.offer, ["outline", "three"]); assert.equal(L.kindLabel("outline", maths), "Calculate"); assert.deepEqual(L.defaultExamKinds("Maths"), ["outline", "three"]);
  const hist = L.examProfile("History");
  assert.deepEqual(hist.on, ["outline", "three", "six", "nine"]); assert.equal(L.kindLabel("nine", hist), "How far do you agree");
  assert.deepEqual(L.defaultExamKinds("Biology"), ["mc1", "mc2", "outline", "three", "six"]);
  assert.deepEqual(L.defaultExamKinds("Business"), L.EXAM_KIND_IDS);
  assert.equal(L.kindLabel("six", L.examProfile("Business")), "Analyse / Discuss");
  assert.deepEqual(L.defaultExamKinds("", "the French revolution"), ["outline", "three", "six", "nine"], "unknown subjects get the written kinds");
  assert.equal(L.kindLabel("mc1", L.examProfile("History")), "Multiple choice");
  // the subject's own command words reach the prompt
  assert.match(L.buildAiPrompt({ topic: "Quadratics", mode: "exam", subject: "Maths", count: 4 }), /Work out/);
  assert.doesNotMatch(L.buildAiPrompt({ topic: "Quadratics", mode: "exam", subject: "Maths", count: 4 }), /"kind":"six"/);
  assert.match(L.buildAiPrompt({ topic: "WW1", mode: "exam", subject: "History", count: 4 }), /How far do you agree/);
});

test("English Language questions come with an extract and a writing task, not trivia about English", () => {
  for (const name of ["English Language", "English", "GCSE English"]) { const p = L.examProfile(name); assert.deepEqual(p.ctxFor, ["outline", "three", "six"], name); assert.equal(L.kindLabel("nine", p), "Writing task"); }
  assert.equal(L.kindLabel("six", L.examProfile("English Literature")), "Analyse the writer's methods", "Literature stays separate");
  const prompt = L.buildAiPrompt({ topic: "persuasive writing", mode: "exam", subject: "English Language", count: 4 });
  assert.match(prompt, /original passage of 80–130 words/); assert.match(prompt, /"ctx":"the extract"/); assert.match(prompt, /WRITING task/); assert.match(prompt, /never ask facts about the English language/);
  const items = L.parseQuestionList(JSON.stringify([{ kind: "six", q: "Read the extract. How does the writer use language to describe the storm?", marks: 6, a: "“howled” personification ; “black walls of water” metaphor", ctx: "The wind howled across the deck. ".repeat(30) }])).items;
  assert.ok(items[0].ctx.length > 700, "a full-length extract is kept");
});

test("the copy-a-prompt text can ask for gap fill", () => {
  const p = L.buildAiPrompt({ topic: "Cells", style: "gapfill" });
  assert.match(p, /GAP FILL/); assert.match(p, /_____/);
});
