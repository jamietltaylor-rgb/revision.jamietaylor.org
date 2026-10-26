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
