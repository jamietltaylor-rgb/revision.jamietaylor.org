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
const NUMBER_WORDS = {
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  eleven: "11", twelve: "12", thirteen: "13", fourteen: "14", fifteen: "15", sixteen: "16", seventeen: "17", eighteen: "18",
  nineteen: "19", twenty: "20", thirty: "30", forty: "40", fifty: "50", sixty: "60", seventy: "70", eighty: "80", ninety: "90",
  hundred: "100", thousand: "1000", first: "1st", second: "2nd", third: "3rd",
};
const FILLER = new Set(["the", "a", "an", "and", "of", "it", "its", "is", "was", "are", "were", "be", "to", "that", "this", "i", "think", "answer", "called", "known", "as", "in", "by"]);
// Words that don't identify an answer on their own ("Pacific" is enough for "Pacific Ocean").
const GENERIC = new Set(["ocean", "sea", "river", "lake", "mount", "mountain", "city", "island", "war", "battle", "king", "queen", "republic", "kingdom", "county", "park", "road", "street", "empire", "dynasty", "treaty", "act", "party", "university", "bay", "desert", "forest", "valley", "canal", "bridge", "cathedral", "castle", "world", "great", "united", "state", "new"]);

function stem(w) {
  if (/^\d/.test(w) || w.length <= 3) return w;
  if (w.endsWith("ies") && w.length > 4) return w.slice(0, -3) + "y";
  if (/(ss|us|is|ous)$/.test(w)) return w;
  if (/(ches|shes|xes|zes|ses)$/.test(w) && w.length > 4) return w.slice(0, -2);
  if (w.endsWith("s")) return w.slice(0, -1);
  return w;
}
function answerTokens(s, dropFiller = true) {
  const all = basic(s).split(" ").filter(Boolean).map((w) => stem(NUMBER_WORDS[w] ?? w));
  const kept = dropFiller ? all.filter((w) => !FILLER.has(w)) : all;
  return kept.length ? kept : all;
}
const isNumeric = (w) => /^\d/.test(w);
function tokenMatch(e, g) {
  if (e === g) return true;
  if (isNumeric(e) || isNumeric(g)) return false;
  const allowed = Math.min(e.length, g.length) >= 9 ? 2 : Math.min(e.length, g.length) >= 5 ? 1 : 0;
  return allowed > 0 && Math.abs(e.length - g.length) <= allowed && levenshtein(e, g) <= allowed;
}
/** Matches every expected word against the words given. Returns the spare given-words and unmatched expected-words, or null if nothing matched. */
function alignTokens(exp, giv) {
  const free = giv.map((_, i) => i);
  const missing = [];
  for (const e of exp) {
    const at = free.findIndex((i) => tokenMatch(e, giv[i]));
    if (at === -1) missing.push(e); else free.splice(at, 1);
  }
  return { missing, spare: free.map((i) => giv[i]), matched: exp.length - missing.length };
}

export function acceptedAnswers(expected) {
  return String(expected ?? "").split(";").map((s) => s.trim()).filter(Boolean);
}

/**
 * Is `given` a correct answer? Forgiving about: capitals, punctuation, accents, "the/a/an", plurals,
 * small typos in longer words, numbers written as words (seven = 7), word order, extra words around
 * the answer ("it is the mitochondria"), and the distinctive part of a name ("Pacific" for "Pacific Ocean").
 * Strict about: different numbers, hedging ("7 or 8") and denying the answer ("not Paris").
 */
export function isCorrect(given, expected) {
  const g = normalise(given);
  if (!g) return false;
  const rawGiven = String(given ?? "").toLowerCase();
  return acceptedAnswers(expected).some((alt) => {
    const e = normalise(alt);
    if (!e) return false;
    if (g === e) return true;
    const rawAlt = alt.toLowerCase();

    // typo in a single long phrase (e.g. run-together words)
    if (!/^[\d\s]+$/.test(e)) {
      const allowed = e.length >= 9 ? 2 : e.length >= 5 ? 1 : 0;
      if (allowed > 0 && Math.abs(g.length - e.length) <= allowed && levenshtein(g, e) <= allowed) return true;
    } else if (/^[\d\s]+$/.test(g)) return false; // two different numbers are never "close"

    const exp = answerTokens(alt);
    const giv = answerTokens(given);
    if (!exp.length || !giv.length) return false;
    const denies = /\b(not|no|never|neither|nor|without|except)\b|n['’]t\b/.test(rawGiven) && !/\b(not|no|never|neither|nor|without|except)\b|n['’]t\b/.test(rawAlt);
    const hedges = /\b(or|maybe|perhaps|either|probably|guess)\b/.test(rawGiven) && !/\b(or|maybe|perhaps|either)\b/.test(rawAlt);
    if (denies || hedges) return false;

    const { missing, spare, matched } = alignTokens(exp, giv);
    if (missing.length === 0) {
      // everything expected is there; allow a few harmless extra words, but not extra numbers or a second answer
      if (spare.length > 4) return false;
      if (exp.some(isNumeric) && spare.some(isNumeric)) return false;
      return true;
    }
    // the distinctive part of a longer name is enough: "Pacific" for "Pacific Ocean", "Severn" for "River Severn"
    if (exp.length >= 2 && spare.length === 0 && missing.every((w) => GENERIC.has(w))) {
      return exp.some((w) => !isNumeric(w) && !GENERIC.has(w) && w.length >= 4) && matched >= 1;
    }
    return false;
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

function mergeAnswers(a, alts) {
  let out = a;
  const seen = new Set(acceptedAnswers(a).map(normalise));
  for (const x of alts) {
    const c = clean(x);
    if (!c || c.includes(";")) continue;
    const k = normalise(c);
    if (!k || seen.has(k)) continue;
    if ((out + "; " + c).length > 300) break;
    out += "; " + c;
    seen.add(k);
  }
  return out;
}

function toItem(parts, alts = [], src = "", marks = 0) {
  const cells = parts.map(clean);
  const q = cells[0];
  const a = cells[1];
  if (!q || !a) return null;
  const m = Math.round(Number(marks));
  const exam = Number.isFinite(m) && m >= 1;
  const choices = exam ? [] : [...new Set(cells.slice(2).filter(Boolean))].filter((c) => normalise(c) !== normalise(a)).slice(0, 5);
  const source = clean(src).slice(0, 80);
  if (exam) return { q: q.slice(0, 800), a: a.slice(0, 1200), choices: [], exam: true, marks: Math.min(12, m), ...(source ? { src: source } : {}) };
  return { q: q.slice(0, 500), a: mergeAnswers(a.slice(0, 300), alts), choices: choices.map((c) => c.slice(0, 200)), ...(source ? { src: source } : {}) };
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
      let alts = row.alt ?? row.alts ?? row.alternatives ?? row.also ?? row.accept ?? [];
      if (typeof alts === "string") alts = alts.split(/\s*[;|]\s*/);
      item = toItem([q, a, ...(Array.isArray(wrong) ? wrong : [])], Array.isArray(alts) ? alts : [], typeof (row.src ?? row.source) === "string" ? (row.src ?? row.source) : "", row.marks ?? row.mark ?? 0);
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
export const BOARDS = ["Any exam board", "AQA", "Edexcel", "OCR", "WJEC / Eduqas", "CCEA", "SQA"];

export function buildAiPrompt({ topic, level = "GCSE", count = 15, style = "mixed", paper = false, board = "", mode = "quick" } = {}) {
  const t = clean(topic).slice(0, 120) || "[type your topic here]";
  const n = Math.max(1, Math.min(50, Math.round(Number(count)) || 15));
  const lvl = clean(level) || "GCSE";
  const tailor = boardLine(board, lvl);
  if (mode === "exam") {
    return `Write ${Math.min(n, 20)} complete exam questions about "${t}" at ${lvl} level.${tailor}

Reply with ONLY a JSON array, in exactly this shape:
[{"q": "the full question as it would be printed on the paper", "marks": 4, "a": "mark scheme: each marking point separated by  ;  (one point per mark)"}]

Rules:
- Each question is worth between 2 and 6 marks (a mix), and has about one marking point per mark.
- Use real exam command words (state, describe, explain, calculate, compare, evaluate) and the layout real papers use.
- Marking points must be factually correct and short. No markdown, no numbering, no text outside the JSON.${paperLines(paper, board, lvl)}`;
  }
  const styleLine = {
    typed: "Do not include wrong options — every question is answered by typing.",
    choice: "Give 3 wrong options for every question (so each one is multiple choice).",
    mixed: "Give 3 wrong options for about half the questions and none for the rest.",
  }[style] || "";
  return `Write ${n} revision questions about "${t}" at ${lvl} level.${tailor}

Reply with ONLY the questions, one per line, in exactly this format:
question | answer | wrong option 1 | wrong option 2 | wrong option 3

Rules:
- ${styleLine}
- One line per question. No numbering, headings, bullet points, bold text or intro/outro text.
- Keep every answer short (1–6 words) so it can be typed, and make sure it is factually correct.
- Don't use the "|" character inside a question or answer.
- If an answer could correctly be worded another way (a synonym, abbreviation or alternative), add the alternatives to the answer separated by semicolons, like  CO2; carbon dioxide
- Cover a range of subtopics and don't repeat questions.${paperLines(paper, board, lvl)}`;
}
export const boardLine = (board, level) => {
  const b = BOARDS.includes(board) && board !== "Any exam board" ? board : "";
  return b ? `\nFollow the ${b} specification for ${clean(level) || "GCSE"}: use its topic names, terminology and the way its questions are worded.` : "";
};
function paperLines(paper, board, level) {
  if (!paper) return "";
  const b = BOARDS.includes(board) && board !== "Any exam board" ? board : "the main UK exam boards";
  return `
- Write them like real exam past-paper questions for ${b} at ${clean(level) || "GCSE"} level: the same topics, wording and command words (state, name, describe, explain, calculate, give one reason) that real papers use, turned into questions with a short answer that can be checked.
- If you can see or reliably remember genuine past-paper questions on this topic, base the questions on them. Never make up a past-paper reference, and do not claim a question is from a real paper unless you are certain.`;
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
    settings: { dailyGoal: DEFAULT_GOAL, board: "" },
    buddy: { name: "Pip" },
    chests: 0,
    lastParade: "",
    owned: [],
    equipped: { palette: "", font: "", hat: "" },
    claims: {},
    exams: [],
    plan: { perDay: 2, minutes: 30, offDays: [], exclude: [], done: {} },
    stats: {
      points: 0, spent: 0, answered: 0, correct: 0, streak: 0, bestStreak: 0, lastDay: "",
      perfectRounds: 0, goalDays: 0, created: 0, chestsOpened: 0, questsDone: 0, secrets: 0, days: {}, badges: {},
    },
  };
}

const validDate = (d) => DATE_RE.test(d) && dateStr(new Date(`${d}T12:00:00`)) === d;
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
    const isExam = q.exam === true && Number.isFinite(q.marks) && q.marks >= 1;
    const text = str(q.q, isExam ? 800 : 500);
    const answer = str(q.a, isExam ? 1200 : 300);
    const subjectId = str(q.subjectId, 40);
    if (!id || !text || !answer || !subjectIds.has(subjectId) || questionIds.has(id)) continue;
    questionIds.add(id);
    out.questions.push({
      id, subjectId, q: text, a: answer,
      choices: (Array.isArray(q.choices) ? q.choices : []).map((c) => str(c, 200)).filter(Boolean).slice(0, 5),
      ...(str(q.src, 80) ? { src: str(q.src, 80) } : {}),
      ...(isExam ? { exam: true, marks: Math.min(12, Math.round(q.marks)) } : {}),
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
  out.settings.board = raw.settings && BOARDS.includes(raw.settings.board) && raw.settings.board !== "Any exam board" ? raw.settings.board : "";
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

  const examIds = new Set();
  for (const e of (Array.isArray(raw.exams) ? raw.exams : []).slice(0, 150)) {
    const id = str(e && e.id, 40);
    const subject = str(e && e.subject, 60);
    if (!id || !subject || examIds.has(id) || typeof e.date !== "string" || !validDate(e.date)) continue;
    examIds.add(id);
    out.exams.push({ id, subject, kind: KINDS.includes(e.kind) ? e.kind : "Other", board: BOARDS.includes(e.board) && e.board !== "Any exam board" ? e.board : "", date: e.date, paper: str(e.paper, 40), time: str(e.time, 20) });
  }
  const pl = raw.plan && typeof raw.plan === "object" ? raw.plan : {};
  out.plan.perDay = Math.round(num(pl.perDay, 1, 6, 2));
  out.plan.minutes = Math.round(num(pl.minutes, 10, 180, 30));
  out.plan.offDays = [...new Set((Array.isArray(pl.offDays) ? pl.offDays : []).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort();
  out.plan.exclude = [...new Set((Array.isArray(pl.exclude) ? pl.exclude : []).map((x) => str(x, 60)).filter(Boolean))].slice(0, 100);
  if (pl.done && typeof pl.done === "object") {
    for (const k of Object.keys(pl.done).filter((k) => /^\d{4}-\d{2}-\d{2}\|[^|]{1,60}\|\d$/.test(k)).sort().slice(-600)) {
      if (pl.done[k] === true) out.plan.done[k] = true;
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


// ---------- exam timetable and revision plan ----------
export const KINDS = ["Mock", "GCSE", "A-level", "AS-level", "Other"];
export const subjectKey = (name) => normalise(name) || basic(name);
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const ymd = (y, m, d) => {
  const s = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return validDate(s) ? s : "";
};

/** Finds a date written the way people write them in the UK. Returns { date, rest } where rest is the text without the date. */
export function findDate(text, today) {
  const src = String(text ?? "");
  const withYear = (m, d, y) => {
    if (y) return ymd(y.length === 2 ? 2000 + Number(y) : Number(y), m, d);
    const thisYear = Number(today.slice(0, 4));
    const first = ymd(thisYear, m, d);
    return first && first >= today ? first : ymd(thisYear + 1, m, d);
  };
  let m;
  if ((m = src.match(/(\d{4})-(\d{1,2})-(\d{1,2})/))) { const date = ymd(Number(m[1]), Number(m[2]), Number(m[3])); if (date) return { date, rest: src.replace(m[0], " ") }; }
  if ((m = src.match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4}|\d{2})\b/))) { const date = withYear(Number(m[2]), Number(m[1]), m[3]); if (date) return { date, rest: src.replace(m[0], " ") }; }
  if ((m = src.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([A-Za-z]{3,9})\.?(?:,?\s+(\d{4}))?/)) && MONTHS[m[2].slice(0, m[2].toLowerCase().startsWith("sept") ? 4 : 3).toLowerCase()]) {
    const date = withYear(MONTHS[m[2].slice(0, m[2].toLowerCase().startsWith("sept") ? 4 : 3).toLowerCase()], Number(m[1]), m[3]);
    if (date) return { date, rest: src.replace(m[0], " ") };
  }
  if ((m = src.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/)) && MONTHS[m[1].slice(0, m[1].toLowerCase().startsWith("sept") ? 4 : 3).toLowerCase()]) {
    const date = withYear(MONTHS[m[1].slice(0, m[1].toLowerCase().startsWith("sept") ? 4 : 3).toLowerCase()], Number(m[2]), m[3]);
    if (date) return { date, rest: src.replace(m[0], " ") };
  }
  return { date: "", rest: src };
}

const PAPER_RE = /\b(paper\s*\d+[a-z]?|unit\s*\d+[a-z]?|component\s*\d+|p\d\b)/i;
const TIME_RE = /\b(\d{1,2}[:.]\d{2}\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm))\b/i;

/**
 * Reads a pasted exam timetable, one exam per line, e.g.
 *   Maths Paper 1 | 14 May 2027 | GCSE | 9:00
 *   Biology, 21/05/2027, mock
 */
export function parseExamList(text, today) {
  const exams = [];
  let skipped = 0;
  for (const raw of String(text ?? "").split(/\r?\n/).slice(0, 300)) {
    const line = raw.trim();
    if (!line || /^[|\s:-]+$/.test(line)) continue;
    const { date, rest } = findDate(line, today);
    if (!date) { skipped++; continue; }
    let remaining = rest.replace(/^\||\|$/g, " ");
    let time = "";
    const tm = remaining.match(TIME_RE);
    if (tm) { time = tm[1].replace(/\s+/g, "").replace(".", ":"); remaining = remaining.replace(tm[0], " "); }
    const parts = remaining.split(/\||\t|;|\s[–—-]\s|,/).map((p) => clean(p)).filter(Boolean);
    let kind = "Other";
    let board = "";
    const kept = [];
    for (const p of parts) {
      const bm = /^(aqa|edexcel|pearson(?:\s+edexcel)?|ocr|wjec(?:\s*\/\s*eduqas)?|eduqas|ccea|sqa)$/i.exec(p);
      if (bm) { const w = bm[1].toLowerCase(); board = w.startsWith("wjec") || w === "eduqas" ? "WJEC / Eduqas" : w.includes("edexcel") || w.startsWith("pearson") ? "Edexcel" : w.toUpperCase(); continue; }
      const k = /^(mock|gcse|a[\s-]?level|as[\s-]?level|other)s?(\s+exams?)?$/i.exec(p);
      if (k) { const w = k[1].toLowerCase().replace(/[\s-]/g, ""); kind = w === "mock" ? "Mock" : w === "gcse" ? "GCSE" : w === "alevel" ? "A-level" : w === "aslevel" ? "AS-level" : "Other"; }
      else kept.push(p);
    }
    let subject = kept[0] || "";
    let paper = "";
    const pm = subject.match(PAPER_RE) || kept.slice(1).join(" ").match(PAPER_RE);
    if (pm) { paper = pm[1].replace(/\s+/g, " "); subject = subject.replace(pm[0], " "); }
    subject = clean(subject.replace(/\b(mock|gcse|a[\s-]?level|as[\s-]?level)\b/gi, " ").replace(/^[-:]+|[-:]+$/g, "")).slice(0, 60);
    if (!subject) { skipped++; continue; }
    exams.push({ subject, kind, board, date, paper: paper.slice(0, 40), time: time.slice(0, 20) });
  }
  return { exams: exams.slice(0, 150), skipped };
}

export const phaseFor = (daysLeft) => (daysLeft <= 3 ? "Final push" : daysLeft <= 14 ? "Practise" : "Learn it");

/**
 * Spreads revision over the days before each exam. Subjects with sooner exams get more sessions, no subject is
 * set on its own exam day, days off are left empty, and subjects take turns so none is forgotten.
 * Returns [{ date, weekday, off, exams, sessions: [{ subject, key, daysLeft, phase, minutes, id }] }].
 */
export function buildTimetable(exams, plan, today, maxDays = 60) {
  const coming = exams.filter((e) => e.date >= today);
  if (!coming.length) return [];
  const last = coming.reduce((m, e) => (e.date > m ? e.date : m), today);
  const span = Math.min(maxDays, daysBetween(today, last) + 1);
  const subjects = new Map();
  const left_out = new Set(((plan && plan.exclude) || []).map(subjectKey)); // subjects the person doesn't want revision set for
  for (const e of coming) {
    const key = subjectKey(e.subject);
    if (left_out.has(key)) continue;
    if (!subjects.has(key)) subjects.set(key, { key, name: e.subject, dates: [] });
    subjects.get(key).dates.push(e.date);
  }
  const perDay = Math.max(1, Math.min(6, Math.round(Number(plan && plan.perDay)) || 2));
  const minutes = Math.max(10, Math.min(180, Math.round(Number(plan && plan.minutes)) || 30));
  const off = new Set((plan && plan.offDays) || []);
  const load = new Map();
  const days = [];
  for (let i = 0; i < span; i++) {
    const date = addDays(today, i);
    const dayExams = coming.filter((e) => e.date === date);
    const isOff = off.has(weekday(date));
    const sessions = [];
    if (!isOff) {
      const slots = dayExams.length ? 1 : perDay; // exam days stay light
      for (let slot = 0; slot < slots; slot++) {
        let best = null;
        for (const sub of subjects.values()) {
          const next = sub.dates.filter((d) => d > date).sort()[0];
          if (!next) continue;
          const left = daysBetween(date, next);
          const already = sessions.some((x) => x.key === sub.key);
          // share sessions in proportion to urgency: each session a subject already has makes the next one less likely
          const score = (1 / (left + 2)) / ((load.get(sub.key) || 0) + 1) * (left <= 3 ? 1.5 : 1) * (already ? 0.5 : 1);
          if (!best || score > best.score + 1e-9 || (Math.abs(score - best.score) <= 1e-9 && (left < best.left || (left === best.left && sub.name < best.sub.name)))) best = { sub, left, score };
        }
        if (!best) break;
        load.set(best.sub.key, (load.get(best.sub.key) || 0) + 1);
        sessions.push({ subject: best.sub.name, key: best.sub.key, daysLeft: best.left, phase: phaseFor(best.left), minutes, id: `${date}|${best.sub.key.slice(0, 50)}|${slot}` });
      }
    }
    days.push({ date, weekday: weekday(date), off: isOff, exams: dayExams, sessions });
  }
  return days;
}

// ---------- marking complete exam answers ----------
const MARK_STOP = new Set(["for", "to", "with", "from", "they", "their", "them", "can", "which", "when", "that", "then", "has", "have", "had", "will", "also", "into", "onto", "because", "so", "if", "or", "but"]);
export const schemePoints = (scheme) => String(scheme ?? "").split(/\s*[;•\n]\s*/).map(clean).filter(Boolean);

/**
 * A simple marker that works offline: each marking point scores if most of its key words appear in the answer.
 * Returns { awarded, total, points: [{ text, met }] }.
 */
export function markLocally(answer, scheme, marks) {
  const points = schemePoints(scheme);
  const given = answerTokens(answer);
  const results = points.map((text) => {
    const exp = answerTokens(text).filter((w) => (w.length > 2 || isNumeric(w)) && !MARK_STOP.has(w));
    if (!exp.length) return { text, met: false };
    const { matched } = alignTokens(exp, given);
    return { text, met: matched >= Math.max(1, Math.ceil(exp.length * 0.5)) };
  });
  const total = Math.max(1, Math.min(12, Math.round(Number(marks)) || points.length || 1));
  return { awarded: Math.min(total, results.filter((r) => r.met).length), total, points: results };
}
