import test from "node:test";
import assert from "node:assert/strict";
import * as L from "../public/logic.js";

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

test("bulk add", () => {
  const { items, skipped } = L.parseBulk("What is 2+2? | 4\nCapital of Spain\tMadrid\nH2O :: Water\n\njust text\n | empty question");
  assert.deepEqual(items, [{ q: "What is 2+2?", a: "4" }, { q: "Capital of Spain", a: "Madrid" }, { q: "H2O", a: "Water" }]);
  assert.equal(skipped, 2);
  assert.deepEqual(L.parseBulk("a | b | c").items, [{ q: "a", a: "b | c" }]);
  assert.deepEqual(L.parseBulk(null), { items: [], skipped: 0 });
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
