// Pure logic for the revision app. There is no page code in here, so it can be tested on its own.

export const BOX_DAYS = [0, 1, 3, 7, 14, 30]; // days until a question comes back, indexed by box 1-5
export const MAX_BOX = 5;
export const MASTERED_BOX = 4; // a question in box 4 or 5 counts as "mastered"
export const DEFAULT_GOAL = 10;
export const GOAL_BONUS = 25;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---------- dates (always plain "YYYY-MM-DD" strings in the user's own time zone) ----------
export function dateStr(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const parse = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
export function addDays(s, n) {
  return new Date(parse(s) + n * 86400000).toISOString().slice(0, 10);
}
export function daysBetween(a, b) {
  return Math.round((parse(b) - parse(a)) / 86400000);
}
/** Monday = 0 … Sunday = 6 */
export function weekday(s) {
  return (new Date(parse(s)).getUTCDay() + 6) % 7;
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function shuffle(arr, rand = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- checking answers ----------
function basic(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // é -> e, so a missing accent isn't marked wrong
    .replace(/(\d),(?=\d{3}\b)/g, "$1") // 1,000 -> 1000
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
export function normalise(s) {
  const b = basic(s);
  const withoutArticles = b.replace(/\b(the|a|an)\b/g, " ").replace(/\s+/g, " ").trim();
  return withoutArticles || b;
}
export function levenshtein(a, b) {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}
/** Several accepted answers can be written in one box, separated by ";" */
export function acceptedAnswers(expected) {
  return String(expected ?? "").split(";").map((s) => s.trim()).filter(Boolean);
}
export function isCorrect(given, expected) {
  const g = normalise(given);
  if (!g) return false;
  return acceptedAnswers(expected).some((alt) => {
    const e = normalise(alt);
    if (!e) return false;
    if (g === e) return true;
    if (/^[\d\s]+$/.test(e)) return false; // numbers must match exactly
    const allowed = e.length >= 9 ? 2 : e.length >= 5 ? 1 : 0; // forgive small typos in longer answers
    return allowed > 0 && Math.abs(g.length - e.length) <= allowed && levenshtein(g, e) <= allowed;
  });
}

// ---------- spaced repetition ("boxes") ----------
export function schedule(q, correct, today) {
  if (!correct) return { box: 1, due: today }; // wrong answers come straight back
  const box = Math.min(MAX_BOX, (q.box || 1) + 1);
  return { box, due: addDays(today, BOX_DAYS[box]) };
}

/** Due questions first, weakest boxes first. Returns the picked questions and how many were due. */
export function pickQuestions(questions, { subjectId = "all", count = 10, today, rand = Math.random }) {
  const pool = questions.filter((q) => subjectId === "all" || q.subjectId === subjectId);
  const isDue = (q) => q.due <= today;
  const ranked = shuffle(pool, rand).sort(
    (a, b) => (isDue(a) ? 0 : 1) - (isDue(b) ? 0 : 1) || a.box - b.box || a.due.localeCompare(b.due),
  );
  return { picked: ranked.slice(0, count), dueCount: pool.filter(isDue).length };
}

// ---------- points, levels, streaks ----------
export const pointsFor = (combo) => 10 + Math.min(10, Math.max(0, combo) * 2);

export function levelFor(points) {
  const need = (level) => 40 * (level - 1) ** 2;
  const level = Math.floor(Math.sqrt(Math.max(0, points) / 40)) + 1;
  const current = need(level);
  const next = need(level + 1);
  return { level, current, next, pct: Math.round(((points - current) / (next - current)) * 100) };
}

export function updateStreak(stats, today) {
  if (stats.lastDay === today) return { streak: stats.streak, bestStreak: stats.bestStreak, lastDay: today };
  const streak = stats.lastDay && addDays(stats.lastDay, 1) === today ? stats.streak + 1 : 1;
  return { streak, bestStreak: Math.max(stats.bestStreak, streak), lastDay: today };
}
export function currentStreak(stats, today) {
  return stats.lastDay === today || (stats.lastDay && addDays(stats.lastDay, 1) === today) ? stats.streak : 0;
}

// ---------- badges ----------
export const subjectMastered = (state) =>
  state.subjects.some((s) => {
    const qs = state.questions.filter((q) => q.subjectId === s.id);
    return qs.length >= 10 && qs.every((q) => q.box >= MASTERED_BOX);
  });

export const BADGES = [
  { id: "first", icon: "👣", name: "First steps", text: "Answer your first question", test: (s) => s.stats.answered >= 1 },
  { id: "pts100", icon: "🥉", name: "Bronze Scholar", text: "Earn 100 points", test: (s) => s.stats.points >= 100 },
  { id: "pts500", icon: "🥈", name: "Silver Scholar", text: "Earn 500 points", test: (s) => s.stats.points >= 500 },
  { id: "pts1000", icon: "🥇", name: "Gold Scholar", text: "Earn 1,000 points", test: (s) => s.stats.points >= 1000 },
  { id: "pts2500", icon: "💎", name: "Diamond Scholar", text: "Earn 2,500 points", test: (s) => s.stats.points >= 2500 },
  { id: "pts5000", icon: "👑", name: "Revision Legend", text: "Earn 5,000 points", test: (s) => s.stats.points >= 5000 },
  { id: "streak3", icon: "🔥", name: "On a roll", text: "Revise 3 days in a row", test: (s) => s.stats.bestStreak >= 3 },
  { id: "streak7", icon: "⚡", name: "Week warrior", text: "Revise 7 days in a row", test: (s) => s.stats.bestStreak >= 7 },
  { id: "streak14", icon: "🚀", name: "Fortnight focus", text: "Revise 14 days in a row", test: (s) => s.stats.bestStreak >= 14 },
  { id: "streak30", icon: "🏆", name: "Unstoppable", text: "Revise 30 days in a row", test: (s) => s.stats.bestStreak >= 30 },
  { id: "perfect", icon: "🎯", name: "Perfect round", text: "Get every question right in a round of 5 or more", test: (s) => s.stats.perfectRounds >= 1 },
  { id: "goal", icon: "✅", name: "Goal getter", text: "Reach your daily goal", test: (s) => s.stats.goalDays >= 1 },
  { id: "answered100", icon: "💯", name: "Century", text: "Answer 100 questions", test: (s) => s.stats.answered >= 100 },
  { id: "answered500", icon: "🏃", name: "Marathon", text: "Answer 500 questions", test: (s) => s.stats.answered >= 500 },
  { id: "maker10", icon: "✍️", name: "Question maker", text: "Write 10 of your own questions", test: (s) => s.stats.created >= 10 },
  { id: "master", icon: "🧠", name: "Subject master", text: "Master every question in a subject (10 or more)", test: subjectMastered },
];
export const newBadges = (state) => BADGES.filter((b) => !state.stats.badges[b.id] && b.test(state)).map((b) => b.id);

// ---------- summaries for the Home screen ----------
export function subjectProgress(state, today) {
  return state.subjects.map((s) => {
    const qs = state.questions.filter((q) => q.subjectId === s.id);
    return {
      id: s.id,
      name: s.name,
      total: qs.length,
      mastered: qs.filter((q) => q.box >= MASTERED_BOX).length,
      due: qs.filter((q) => q.due <= today).length,
    };
  });
}
export function lastDays(stats, n, today) {
  return Array.from({ length: n }, (_, i) => {
    const date = addDays(today, i - (n - 1));
    const d = stats.days[date];
    return { date, n: d ? d.n : 0, c: d ? d.c : 0 };
  });
}
export function heatLevel(n, goal) {
  if (n <= 0) return 0;
  if (n < goal * 0.5) return 1;
  if (n < goal) return 2;
  if (n < goal * 2) return 3;
  return 4;
}
/** Cells in column order (one column per week, Monday at the top). */
export function heatmap(stats, today, weeks, goal) {
  const start = addDays(today, -weekday(today) - (weeks - 1) * 7);
  return Array.from({ length: weeks * 7 }, (_, i) => {
    const date = addDays(start, i);
    if (date > today) return { date, future: true, level: 0, n: 0 };
    const n = stats.days[date] ? stats.days[date].n : 0;
    return { date, future: false, level: heatLevel(n, goal), n };
  });
}

// ---------- adding lots of questions at once ----------
/** One per line, "question | answer". A tab or "::" also works as the separator. */
export function parseBulk(text) {
  const items = [];
  let skipped = 0;
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const sep = line.includes("|") ? "|" : line.includes("\t") ? "\t" : line.includes("::") ? "::" : null;
    if (!sep) { skipped++; continue; }
    const at = line.indexOf(sep);
    const q = line.slice(0, at).trim();
    const a = line.slice(at + sep.length).trim();
    if (q && a) items.push({ q: q.slice(0, 500), a: a.slice(0, 300) }); else skipped++;
  }
  return { items, skipped };
}

// ---------- saved data ----------
export const defaultTreats = () => [
  { id: "t1", name: "30 minutes of free time", cost: 100 },
  { id: "t2", name: "A favourite snack", cost: 150 },
  { id: "t3", name: "An evening off", cost: 500 },
];

export function emptyState() {
  return {
    v: 1,
    subjects: [],
    questions: [],
    treats: defaultTreats(),
    redeemed: [],
    settings: { dailyGoal: DEFAULT_GOAL },
    stats: {
      points: 0, spent: 0, answered: 0, correct: 0, streak: 0, bestStreak: 0, lastDay: "",
      perfectRounds: 0, goalDays: 0, created: 0, days: {}, badges: {},
    },
  };
}

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v, min, max, fallback) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback);

/** Turns anything loaded from storage or an imported file into safe, well-formed data. */
export function sanitiseState(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("That file isn't a revision backup.");
  const out = emptyState();

  const subjectIds = new Set();
  for (const s of (Array.isArray(raw.subjects) ? raw.subjects : []).slice(0, 100)) {
    const id = str(s && s.id, 40);
    const name = str(s && s.name, 60);
    if (!id || !name || subjectIds.has(id)) continue;
    subjectIds.add(id);
    out.subjects.push({ id, name });
  }

  const questionIds = new Set();
  for (const q of (Array.isArray(raw.questions) ? raw.questions : []).slice(0, 5000)) {
    if (!q || typeof q !== "object") continue;
    const id = str(q.id, 40);
    const text = str(q.q, 500);
    const answer = str(q.a, 300);
    const subjectId = str(q.subjectId, 40);
    if (!id || !text || !answer || !subjectIds.has(subjectId) || questionIds.has(id)) continue;
    questionIds.add(id);
    out.questions.push({
      id, subjectId, q: text, a: answer,
      choices: (Array.isArray(q.choices) ? q.choices : []).map((c) => str(c, 200)).filter(Boolean).slice(0, 5),
      box: Math.round(num(q.box, 1, MAX_BOX, 1)),
      due: typeof q.due === "string" && DATE_RE.test(q.due) ? q.due : "1970-01-01",
      right: Math.round(num(q.right, 0, 1e6, 0)),
      wrong: Math.round(num(q.wrong, 0, 1e6, 0)),
    });
  }

  if (Array.isArray(raw.treats)) {
    out.treats = [];
    for (const t of raw.treats.slice(0, 30)) {
      const id = str(t && t.id, 40);
      const name = str(t && t.name, 60);
      if (id && name) out.treats.push({ id, name, cost: Math.round(num(t.cost, 1, 100000, 100)) });
    }
  }
  if (Array.isArray(raw.redeemed)) {
    for (const r of raw.redeemed.slice(0, 50)) {
      const name = str(r && r.name, 60);
      if (name) out.redeemed.push({ name, cost: Math.round(num(r.cost, 0, 100000, 0)), date: typeof r.date === "string" && DATE_RE.test(r.date) ? r.date : "" });
    }
  }
  out.settings.dailyGoal = Math.round(num(raw.settings && raw.settings.dailyGoal, 1, 200, DEFAULT_GOAL));

  const st = raw.stats && typeof raw.stats === "object" ? raw.stats : {};
  for (const k of ["points", "spent", "answered", "correct", "streak", "bestStreak", "perfectRounds", "goalDays", "created"]) {
    out.stats[k] = Math.round(num(st[k], 0, 1e9, 0));
  }
  out.stats.lastDay = typeof st.lastDay === "string" && DATE_RE.test(st.lastDay) ? st.lastDay : "";
  if (st.days && typeof st.days === "object") {
    const keys = Object.keys(st.days).filter((k) => DATE_RE.test(k)).sort().slice(-200);
    for (const k of keys) {
      const d = st.days[k];
      if (d && typeof d === "object") out.stats.days[k] = { n: Math.round(num(d.n, 0, 1e6, 0)), c: Math.round(num(d.c, 0, 1e6, 0)), p: Math.round(num(d.p, 0, 1e7, 0)) };
    }
  }
  if (st.badges && typeof st.badges === "object") {
    for (const b of BADGES) {
      const when = st.badges[b.id];
      if (typeof when === "string" && DATE_RE.test(when)) out.stats.badges[b.id] = when;
    }
  }
  return out;
}

export function starterState(today) {
  const s = emptyState();
  const subjectId = "example-geography";
  s.subjects.push({ id: subjectId, name: "Example: Geography (delete me)" });
  const add = (q, a, choices = []) =>
    s.questions.push({ id: uid(), subjectId, q, a, choices, box: 1, due: today, right: 0, wrong: 0 });
  add("What is the capital of France?", "Paris");
  add("Which is the longest river in the UK?", "River Severn; Severn", ["River Thames", "River Trent", "River Tyne"]);
  add("What is the largest ocean on Earth?", "Pacific Ocean; Pacific");
  add("How many continents are there?", "7; seven");
  add("What is the capital of Australia?", "Canberra", ["Sydney", "Melbourne", "Perth"]);
  return s;
}
