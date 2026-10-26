// Pure logic for the revision app. There is no page code in here, so it can be tested on its own.

export const BOX_DAYS = [0, 1, 3, 7, 14, 30]; // days until a question comes back, indexed by box 1-5
export const MAX_BOX = 5;
export const MASTERED_BOX = 4; // a question in box 4 or 5 counts as "mastered"
export const DEFAULT_GOAL = 10;
export const MIN_GOAL = 3;
export const QUEST_REWARD = 40;

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
  { id: "secret", icon: "🔍", name: "Secret finder", text: "Find the hidden surprise", test: (s) => s.stats.secrets >= 1 },
  { id: "chest1", icon: "🎁", name: "Treasure hunter", text: "Open your first chest", test: (s) => s.stats.chestsOpened >= 1 },
  { id: "quest1", icon: "📜", name: "Quest taker", text: "Complete a weekly quest", test: (s) => s.stats.questsDone >= 1 },
  { id: "quest10", icon: "🗺️", name: "Adventurer", text: "Complete 10 weekly quests", test: (s) => s.stats.questsDone >= 10 },
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

// ---------- reading a pasted list of questions ----------
const MAX_PASTE = 500;
const clean = (v) => String(v ?? "").replace(/\*\*|__/g, "").replace(/\s+/g, " ").trim();
const stripNumber = (line) => line.replace(/^\s*(?:\(?\d{1,3}[.):]|[-*•])\s+/, "");

function splitCsv(line) {
  const out = [];
  let cur = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function toItem(parts) {
  const cells = parts.map(clean);
  const q = cells[0];
  const a = cells[1];
  if (!q || !a) return null;
  const choices = [...new Set(cells.slice(2).filter(Boolean))].filter((c) => normalise(c) !== normalise(a)).slice(0, 5);
  return { q: q.slice(0, 500), a: a.slice(0, 300), choices: choices.map((c) => c.slice(0, 200)) };
}

function fromJson(text) {
  let data;
  try { data = JSON.parse(text); } catch { return null; }
  if (data && !Array.isArray(data)) data = data.questions || data.items || data.cards || null;
  if (!Array.isArray(data)) return null;
  const items = [];
  let skipped = 0;
  for (const row of data) {
    let item = null;
    if (Array.isArray(row)) item = toItem(row);
    else if (row && typeof row === "object") {
      const q = row.q ?? row.question ?? row.front ?? row.prompt;
      const a = row.a ?? row.answer ?? row.back;
      const wrong = row.wrong ?? row.choices ?? row.options ?? row.distractors ?? [];
      item = toItem([q, a, ...(Array.isArray(wrong) ? wrong : [])]);
    }
    if (item) items.push(item); else skipped++;
  }
  return { items, skipped };
}

function fromBlocks(lines) {
  const items = [];
  let skipped = 0;
  let cur = null;
  let field = null;
  const flush = () => { if (cur) { const it = toItem([cur.q, cur.a, ...cur.w]); if (it) items.push(it); else skipped++; } cur = null; field = null; };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    let m;
    if ((m = line.match(/^(?:\*\*)?\s*(?:Q(?:uestion)?)\s*\d*\s*[.:)]\s*(?:\*\*)?\s*(.*)$/i))) { flush(); cur = { q: m[1], a: "", w: [] }; field = "q"; }
    else if (cur && (m = line.match(/^(?:\*\*)?\s*(?:A(?:nswer)?)\s*\d*\s*[.:)]\s*(?:\*\*)?\s*(.*)$/i))) { cur.a = m[1]; field = "a"; }
    else if (cur && (m = line.match(/^(?:\*\*)?\s*(?:Wrong(?:\s+options?|\s+answers?)?|Options?|Choices?|Distractors?)\s*[.:)]\s*(?:\*\*)?\s*(.*)$/i))) {
      cur.w.push(...m[1].split(/\s*[|;]\s*/).filter(Boolean)); field = "w";
    } else if (cur && field === "w") cur.w.push(stripNumber(line).replace(/^[A-E][.)]\s+/, ""));
    else if (cur && field) cur[field] += " " + line;
    else skipped++;
  }
  flush();
  return { items, skipped };
}

/**
 * Reads a pasted list of questions from almost any layout:
 *   question | answer | wrong 1 | wrong 2     (the format the prompt asks other AIs for)
 *   tab-separated rows from a spreadsheet, "question, answer" CSV, markdown tables,
 *   "question :: answer", "question — answer", Q:/A: blocks, or a JSON list.
 * Never throws; returns { items: [{q, a, choices}], skipped, format }.
 */
export function parseQuestionList(text) {
  const src = String(text ?? "").replace(/^```[a-z]*\s*$/gim, "").trim();
  if (!src) return { items: [], skipped: 0, format: "empty" };

  if (/^[\[{]/.test(src)) {
    const j = fromJson(src);
    if (j) return { ...j, items: j.items.slice(0, MAX_PASTE), format: "json" };
  }
  const lines = src.split(/\r?\n/);
  const hasQ = lines.some((l) => /^\s*(?:\*\*)?\s*Q(?:uestion)?\s*\d*\s*[.:)]/i.test(l));
  const hasA = lines.some((l) => /^\s*(?:\*\*)?\s*A(?:nswer)?\s*\d*\s*[.:)]/i.test(l));
  if (hasQ && hasA) { const b = fromBlocks(lines); return { ...b, items: b.items.slice(0, MAX_PASTE), format: "blocks" }; }

  const items = [];
  let skipped = 0;
  for (const raw of lines) {
    let line = raw.trim();
    if (!line) continue;
    if (/^[|\s:-]+$/.test(line)) continue; // table divider like |---|---|
    let parts = null;
    if (line.startsWith("|")) {
      parts = line.replace(/^\||\|$/g, "").split("|");
      if (items.length === 0 && /^\s*(question|q|front|prompt)\s*$/i.test(parts[0])) continue; // table header row
    } else {
      line = stripNumber(line);
      if (line.includes("|")) parts = line.split("|");
      else if (line.includes("\t")) parts = line.split("\t");
      else if (line.includes("::")) parts = line.split("::");
      else if (/\s[—–]\s/.test(line)) parts = line.split(/\s[—–]\s/);
      else if (/^\s*[^,]+,\s*[^,]+/.test(line) && line.includes(",") && !/\?\s*$/.test(line)) parts = splitCsv(line);
      else if (/\?\s+\S/.test(line)) { const at = line.indexOf("?") + 1; parts = [line.slice(0, at), line.slice(at)]; }
    }
    const item = parts ? toItem(parts) : null;
    if (item) items.push(item); else skipped++;
  }
  return { items: items.slice(0, MAX_PASTE), skipped: skipped + Math.max(0, items.length - MAX_PASTE), format: "lines" };
}

/** Marks which items are already in the app (same question text in the same subject). */
export function markDuplicates(items, questions, subjectId) {
  const seen = new Set(questions.filter((q) => q.subjectId === subjectId).map((q) => normalise(q.q)));
  return items.map((it) => {
    const key = normalise(it.q);
    const duplicate = seen.has(key);
    seen.add(key);
    return { ...it, duplicate };
  });
}

export const LEVELS = ["Primary school", "Years 7–9 (KS3)", "GCSE", "A-level", "University", "Just for fun"];
export const STYLES = { typed: "typed answers", choice: "multiple choice", mixed: "a mix of typed and multiple choice" };

/** The text people copy into another AI (ChatGPT, Gemini…) to get questions this app can read. */
export function buildAiPrompt({ topic, level = "GCSE", count = 15, style = "mixed" } = {}) {
  const t = clean(topic).slice(0, 120) || "[type your topic here]";
  const n = Math.max(1, Math.min(50, Math.round(Number(count)) || 15));
  const styleLine = {
    typed: "Do not include wrong options — every question is answered by typing.",
    choice: "Give 3 wrong options for every question (so each one is multiple choice).",
    mixed: "Give 3 wrong options for about half the questions and none for the rest.",
  }[style] || "";
  return `Write ${n} revision questions about "${t}" at ${clean(level) || "GCSE"} level.

Reply with ONLY the questions, one per line, in exactly this format:
question | answer | wrong option 1 | wrong option 2 | wrong option 3

Rules:
- ${styleLine}
- One line per question. No numbering, headings, bullet points, bold text or intro/outro text.
- Keep every answer short (1–6 words) so it can be typed, and make sure it is factually correct.
- Don't use the "|" character inside a question or answer.
- Cover a range of subtopics and don't repeat questions.`;
}

// ---------- chests (a surprise reward for reaching your daily goal) ----------
export const CHEST_TABLE = [[20, 45], [35, 30], [50, 15], [80, 7], [150, 3]]; // [points, weight]
export function chestReward(rand = Math.random) {
  let roll = rand() * CHEST_TABLE.reduce((n, [, w]) => n + w, 0);
  for (const [points, weight] of CHEST_TABLE) { if ((roll -= weight) < 0) return points; }
  return CHEST_TABLE[0][0];
}
export function openChest(state, rand = Math.random) {
  if (state.chests < 1) return null;
  const points = chestReward(rand);
  state.chests--;
  state.stats.points += points;
  state.stats.chestsOpened++;
  return points;
}

// ---------- weekly quests ----------
export const weekStart = (date) => addDays(date, -weekday(date));

export function weeklyQuests(state, today) {
  const ws = weekStart(today);
  const goal = state.settings.dailyGoal;
  let answered = 0, correct = 0, days = 0;
  for (let i = 0; i < 7; i++) {
    const d = state.stats.days[addDays(ws, i)];
    if (d && d.n > 0) { answered += d.n; correct += d.c; days++; }
  }
  const defs = [
    { id: "answers", text: `Answer ${goal * 5} questions`, progress: answered, target: goal * 5 },
    { id: "days", text: "Revise on 4 different days", progress: days, target: 4 },
    { id: "correct", text: `Get ${goal * 3} answers right`, progress: correct, target: goal * 3 },
  ];
  return defs.map((q) => ({ ...q, reward: QUEST_REWARD, done: q.progress >= q.target, claimed: Boolean(state.claims[`${ws}:${q.id}`]) }));
}
/** Claims a finished quest. Claiming all three also earns a chest. */
export function claimQuest(state, id, today) {
  const quest = weeklyQuests(state, today).find((q) => q.id === id);
  if (!quest || !quest.done || quest.claimed) return { ok: false };
  const ws = weekStart(today);
  state.claims[`${ws}:${id}`] = true;
  state.stats.points += quest.reward;
  state.stats.questsDone++;
  const sweep = weeklyQuests(state, today).every((q) => q.claimed);
  if (sweep && !state.claims[`${ws}:bonus`]) { state.claims[`${ws}:bonus`] = true; state.chests++; }
  return { ok: true, points: quest.reward, chest: sweep };
}

// ---------- the farm: every subject you revise gets its own pet ----------
export const PET_LINES = [
  ["🥚", "🐣", "🐥", "🐔", "🦚"],
  ["🥚", "🐱", "🐈", "🐯", "🦁"],
  ["🥚", "🦎", "🐊", "🐲", "🐉"],
  ["🥚", "🐟", "🐠", "🐬", "🐳"],
  ["🥚", "🐭", "🐹", "🐰", "🦄"],
  ["🥚", "🐛", "🐝", "🦋", "🦜"],
];
export const PET_STAGE_TITLES = ["Egg", "Baby", "Young", "Grown", "Legend"];
export const PET_STAGE_AT = [0, 5, 20, 50, 100]; // right answers needed in that subject
export const PET_NAMES = ["Pip", "Maple", "Biscuit", "Clover", "Pebble", "Nugget", "Juniper", "Waffles", "Sprout", "Mochi", "Olive", "Ziggy", "Pudding", "Basil", "Poppy", "Tango"];
function hashStr(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}
export function petFor(state, subject, today) {
  const hash = hashStr(subject.id);
  const line = PET_LINES[hash % PET_LINES.length];
  const qs = state.questions.filter((q) => q.subjectId === subject.id);
  const xp = Math.max(subject.xp || 0, qs.reduce((n, q) => n + q.right, 0)); // never shrinks when you delete questions
  let stage = 0;
  PET_STAGE_AT.forEach((need, i) => { if (xp >= need) stage = i; });
  const nextAt = PET_STAGE_AT[stage + 1] ?? null;
  const from = PET_STAGE_AT[stage];
  return {
    subjectId: subject.id, subjectName: subject.name, emoji: line[stage], stage, title: PET_STAGE_TITLES[stage],
    name: subject.petName || PET_NAMES[(hash >>> 4) % PET_NAMES.length], xp, nextAt,
    progress: nextAt === null ? 100 : Math.round(((xp - from) / (nextAt - from)) * 100),
    due: qs.filter((q) => q.due <= today).length, total: qs.length,
  };
}
export const farmPets = (state, today) => state.subjects.map((s) => petFor(state, s, today));

/** The hidden surprise: every find counts for the badge, but the bonus points are once a day. Returns bonus points. */
export function findSecret(state, today) {
  state.stats.secrets++;
  if (state.lastParade === today) return 0;
  state.lastParade = today;
  state.stats.points += 10;
  return 10;
}

// ---------- your study buddy ----------
export const BUDDY_STAGES = [
  [1, "🥚", "Egg"], [2, "🐣", "Hatchling"], [3, "🐥", "Chick"], [5, "🐦", "Fledgling"],
  [8, "🦜", "Parrot"], [12, "🦅", "Eagle"], [18, "🐉", "Dragon"],
];
export function buddyFor(level) {
  let stage = BUDDY_STAGES[0];
  for (const s of BUDDY_STAGES) if (level >= s[0]) stage = s;
  const next = BUDDY_STAGES.find((s) => s[0] > level);
  return { emoji: stage[1], title: stage[2], nextLevel: next ? next[0] : null };
}
export function buddyMood(state, today) {
  const d = state.stats.days[today];
  const n = d ? d.n : 0;
  const streak = currentStreak(state.stats, today);
  if (n >= state.settings.dailyGoal) return "is thrilled — daily goal smashed!";
  if (n > 0) return `is happy — ${state.settings.dailyGoal - n} more to hit today's goal.`;
  if (streak > 0) return `is waiting — answer a question to keep your ${streak}-day streak alive.`;
  return "is sleepy — wake them up with a question.";
}

// ---------- saved data ----------
export const TREAT_IDEAS = [
  { name: "Watch an episode", cost: 80 },
  { name: "Lie-in on a weekend", cost: 150 },
  { name: "Game time — 1 hour", cost: 200 },
  { name: "A favourite snack", cost: 150 },
  { name: "Takeaway night", cost: 400 },
  { name: "Day out with friends", cost: 800 },
];

export function emptyState() {
  return {
    v: 2,
    savedAt: "",
    subjects: [],
    questions: [],
    treats: [],
    redeemed: [],
    settings: { dailyGoal: DEFAULT_GOAL },
    buddy: { name: "Pip" },
    chests: 0,
    lastParade: "",
    owned: [],
    equipped: { palette: "", font: "", hat: "" },
    claims: {},
    stats: {
      points: 0, spent: 0, answered: 0, correct: 0, streak: 0, bestStreak: 0, lastDay: "",
      perfectRounds: 0, goalDays: 0, created: 0, chestsOpened: 0, questsDone: 0, secrets: 0, days: {}, badges: {},
    },
  };
}

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v, min, max, fallback) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback);

/** Turns anything loaded from storage, the cloud or an imported file into safe, well-formed data. */
export function sanitiseState(raw, catalogueIds = null) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("That file isn't a revision backup.");
  const out = emptyState();
  out.savedAt = typeof raw.savedAt === "string" && !Number.isNaN(Date.parse(raw.savedAt)) ? raw.savedAt : "";

  const subjectIds = new Set();
  for (const s of (Array.isArray(raw.subjects) ? raw.subjects : []).slice(0, 100)) {
    const id = str(s && s.id, 40);
    const name = str(s && s.name, 60);
    if (!id || !name || subjectIds.has(id)) continue;
    subjectIds.add(id);
    const petName = str(s && s.petName, 20);
    const xp = Math.round(num(s && s.xp, 0, 1e7, 0));
    out.subjects.push({ id, name, ...(petName ? { petName } : {}), ...(xp ? { xp } : {}) });
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
  out.settings.dailyGoal = Math.round(num(raw.settings && raw.settings.dailyGoal, MIN_GOAL, 200, DEFAULT_GOAL));
  out.buddy.name = str(raw.buddy && raw.buddy.name, 20) || "Pip";
  out.chests = Math.round(num(raw.chests, 0, 1000, 0));
  out.lastParade = typeof raw.lastParade === "string" && DATE_RE.test(raw.lastParade) ? raw.lastParade : "";
  const known = (id) => !catalogueIds || catalogueIds.has(id);
  if (Array.isArray(raw.owned)) out.owned = [...new Set(raw.owned.map((x) => str(x, 60)).filter((x) => x && known(x)))].slice(0, 200);
  const eq = raw.equipped && typeof raw.equipped === "object" ? raw.equipped : {};
  for (const kind of ["palette", "font", "hat"]) {
    const id = str(eq[kind], 60);
    out.equipped[kind] = id.startsWith(kind + ":") && known(id) ? id : "";
  }
  if (raw.claims && typeof raw.claims === "object") {
    for (const k of Object.keys(raw.claims).filter((k) => /^\d{4}-\d{2}-\d{2}:(answers|days|correct|bonus)$/.test(k)).sort().slice(-60)) {
      if (raw.claims[k] === true) out.claims[k] = true;
    }
  }

  const st = raw.stats && typeof raw.stats === "object" ? raw.stats : {};
  for (const k of ["points", "spent", "answered", "correct", "streak", "bestStreak", "perfectRounds", "goalDays", "created", "chestsOpened", "questsDone", "secrets"]) {
    out.stats[k] = Math.round(num(st[k], 0, 1e9, 0));
  }
  out.stats.lastDay = typeof st.lastDay === "string" && DATE_RE.test(st.lastDay) ? st.lastDay : "";
  if (st.days && typeof st.days === "object") {
    const keys = Object.keys(st.days).filter((k) => DATE_RE.test(k)).sort().slice(-200);
    for (const k of keys) {
      const d = st.days[k];
      if (d && typeof d === "object") out.stats.days[k] = { n: Math.round(num(d.n, 0, 1e6, 0)), c: Math.round(num(d.c, 0, 1e6, 0)), p: Math.round(num(d.p, 0, 1e7, 0)), ...(d.g === true ? { g: true } : {}) }; // g = today's goal chest already given
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
