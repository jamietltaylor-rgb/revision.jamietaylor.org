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


// ---------- exam question formats: multiple choice and figures (graphs, charts, tables) ----------
export const FIG_TYPES = ["table", "bar", "line", "scatter", "pie"];
const FORMAT_RULES = [
  [/\b(maths?|mathematics|statistics|algebra|geometry|trigonometry|calculus)\b/i, false, ["line", "scatter", "bar", "pie", "table"]],
  [/\b(computer science|computing|ict|information technology)\b/i, true, ["table"]],
  [/\b(biology|chemistry|physics|geology|astronomy|(combined|triple|applied|natural|environmental|earth|forensic)?\s*science)\b/i, true, ["table", "line", "bar", "scatter"]],
  [/\bgeography\b/i, true, ["table", "bar", "line", "pie", "scatter"]],
  [/\b(economics|business)\b/i, true, ["table", "line", "bar", "pie"]],
  [/\bpsychology\b/i, true, ["table", "bar", "scatter"]],
  [/\bsociology\b/i, true, ["table", "bar", "pie"]],
  [/\b(pe|p\.e\.|physical education|sport)\b/i, true, ["table", "bar", "line"]],
  [/\b(design (and|&) technology|d&t|food (technology|preparation)|engineering)\b/i, true, ["table"]],
];
/**
 * Which special question types does the real exam for this subject usually have? Multiple choice and graphs/charts/tables
 * are only offered for subjects whose papers really use them. Pass the subject name first, then (as a fallback) the topic.
 */
export function examFormats(...names) {
  for (const n of names) {
    const text = String(n ?? "");
    if (!text.trim()) continue;
    for (const [re, mc, figures] of FORMAT_RULES) if (re.test(text)) return { mc, figures: [...figures] };
  }
  return { mc: false, figures: [] };
}

// ---------- exam-style question kinds (the way real papers set them) ----------
/**
 * The kinds of question on a real paper, in the order a paper usually runs. `marks` is what each is worth.
 *   mc1      Multiple choice, pick one (1)           mc2   Multiple choice, "select two answers" (2)
 *   outline  "Outline one …" — identify + a linked point (2)
 *   three    "Explain one …" — 1 mark identify + 2 develop (3)
 *   six      "Analyse … / Discuss …" extended answer, marked in levels (6)
 *   nine     "Justify … / Evaluate …" extended answer with a judgement, marked in levels (9)
 */
export const EXAM_KINDS = {
  mc1: { label: "Multiple choice", marks: 1, hint: "pick one" },
  mc2: { label: "Select two", marks: 2, hint: "multiple choice, pick two" },
  outline: { label: "Outline", marks: 2, hint: "“Outline one…”" },
  three: { label: "Explain", marks: 3, hint: "“Explain one…”" },
  six: { label: "Analyse / Discuss", marks: 6, hint: "extended answer" },
  nine: { label: "Justify", marks: 9, hint: "extended answer + judgement" },
};
export const EXAM_KIND_IDS = Object.keys(EXAM_KINDS);
const KIND_ALIASES = {
  mc: "mc1", mcq: "mc1", multiplechoice: "mc1", onemark: "mc1", "1": "mc1", "1mark": "mc1",
  selecttwo: "mc2", choosetwo: "mc2", twoanswers: "mc2", mc2marks: "mc2", multiplechoice2: "mc2",
  outlineone: "outline", outlinetwo: "outline", "2mark": "outline",
  explain: "three", explainone: "three", "3": "three", "3mark": "three", threemark: "three",
  analyse: "six", analyze: "six", discuss: "six", "6": "six", "6mark": "six", sixmark: "six",
  justify: "nine", evaluate: "nine", "9": "nine", "9mark": "nine", ninemark: "nine",
};
/** Turns whatever a model or a paste calls a kind ("MC", "select two", "6 mark") into one of the ids above, or "". */
export function kindId(v) {
  const t = String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!t) return "";
  return EXAM_KINDS[t] ? t : (KIND_ALIASES[t] || "");
}
/** Which kind an exam item is: its stored kind, or worked out from its options/marks. "other" when it fits none (e.g. an old 4-mark question). */
export function examKindOf(it) {
  if (!it || !it.exam) return "";
  if (it.opts) return it.pick === 2 || (Array.isArray(it.answers) && it.answers.length === 2) ? "mc2" : "mc1";
  const k = kindId(it.kind);
  if (k && k !== "mc1" && k !== "mc2") return k;
  const m = Number(it.marks) || 0;
  if (m >= 9) return "nine";
  if (m >= 6) return "six";
  if (m === 3) return "three";
  if (m === 2 && /^\s*outline\b/i.test(String(it.q ?? ""))) return "outline";
  return "other";
}
/** Extended-response questions (6 and 9 markers) are marked in levels, not point by point. */
export const isExtended = (it) => Boolean(it && it.exam && !it.opts && Number(it.marks) >= 6);

const PAPER_ORDER = ["mc1", "mc2", "outline", "three", "six", "nine"];
const KIND_WEIGHT = { mc1: 3, mc2: 1, outline: 2, three: 3, six: 2, nine: 1 };
/**
 * A realistic mix: which kind each of `count` questions should be, in the order a paper runs.
 * Every chosen kind appears at least once when there is room; the rest follow real-paper proportions.
 */
export function examPlan(count, kinds = EXAM_KIND_IDS) {
  const chosen = PAPER_ORDER.filter((k) => (Array.isArray(kinds) ? kinds : []).map(kindId).includes(k));
  const n = Math.max(0, Math.min(50, Math.round(Number(count)) || 0));
  if (!chosen.length || !n) return [];
  const total = chosen.reduce((s, k) => s + KIND_WEIGHT[k], 0);
  const quota = Object.fromEntries(chosen.map((k) => [k, 0]));
  if (n >= chosen.length) for (const k of chosen) quota[k] = 1;
  let left = n - Object.values(quota).reduce((s, v) => s + v, 0);
  // hand out what's left by weight, largest shortfall first (deterministic)
  while (left > 0) {
    let best = null, bestGap = -Infinity;
    for (const k of chosen) {
      const gap = (n * KIND_WEIGHT[k]) / total - quota[k];
      if (gap > bestGap + 1e-9) { best = k; bestGap = gap; }
    }
    quota[best]++; left--;
  }
  return chosen.flatMap((k) => Array(quota[k]).fill(k));
}

/** The kinds offered by default for a subject: everything, with multiple choice only where that subject's papers use it. */
const ALL_K = ["mc1", "mc2", "outline", "three", "six", "nine"];
const WRITTEN_K = ["outline", "three", "six", "nine"];
/**
 * Different subjects ask different kinds of question, so each gets its own profile: which kinds to offer, which are ticked
 * to begin with, what each is called, and the command words to ask the question maker for. First match wins (subject name, then topic).
 */
const KIND_PROFILES = [
  { re: /\b(maths?|mathematics|statistics|algebra|geometry|trigonometry|calculus)\b/i, offer: ["outline", "three"], on: ["outline", "three"],
    labels: { outline: "Calculate", three: "Show that / Work out" },
    words: { outline: "a short calculation (“Work out…”, “Calculate…”, “Simplify…”, “Solve…”). The mark scheme points are the method mark(s) and the final answer mark, e.g. “M1 for 3 × 4.5 ; A1 for 13.5”. No essay-style questions.",
             three: "a multi-step question (“Show that…”, “Work out the area/probability/value…”). Three points: two method marks then the accuracy (answer) mark." },
    note: "Maths: calculation questions, marked on method and answer." },
  { re: /\b(english|literature|lit|drama|poetry|shakespeare)\b/i, offer: WRITTEN_K, on: WRITTEN_K,
    labels: { outline: "Identify / Quote", three: "Explain one effect", six: "Analyse the writer's methods", nine: "Evaluate / How far" },
    words: { outline: "“Identify one word or phrase that shows… and say what it suggests” (point + linked comment)", three: "“Explain one effect of the writer's use of…” (identify the method, quote or refer to it, explain the effect)", six: "“Analyse how the writer uses language/structure to…” (points on methods, with short quotations and their effects)", nine: "“How far do you agree that…?” or “Evaluate the writer's presentation of…” with a supported judgement" },
    note: "English: analysis of methods and effects. Multiple choice isn't used." },
  { re: /\b(history|religious|r\.?e\.?|philosophy|ethics|politics|citizenship|classics|theology)\b/i, offer: WRITTEN_K, on: WRITTEN_K,
    labels: { outline: "Describe one", three: "Explain one", six: "Explain why", nine: "How far do you agree" },
    words: { outline: "“Describe one feature of…” / “Outline one…” (a fact plus a linked detail)", three: "“Explain one reason why / one way in which…” (identify, then develop with accurate detail)", six: "“Explain why…” or “Explain the importance of…” with specific, accurate knowledge and linked reasons", nine: "“How far do you agree that…?” / “Evaluate the view that…” weighing both sides to a supported judgement" },
    note: "Essay-style subject: no multiple choice by default." },
  { re: /\b(biology|chemistry|physics|geology|astronomy|(combined|triple|applied|natural|environmental|earth|forensic)?\s*science)\b/i, offer: ALL_K, on: ["mc1", "mc2", "outline", "three", "six"],
    labels: { outline: "State / Describe one", three: "Explain / Calculate", six: "Describe and explain", nine: "Evaluate" },
    words: { outline: "“State one…”, “Name…”, “Describe one…” (a short factual point plus a linked detail)", three: "“Explain one…” or a short calculation with units (identify, then develop; or two method marks and an answer mark)", six: "“Describe and explain…” or “Evaluate…” extended answer, using correct scientific terms in a logical sequence", nine: "“Evaluate…” a 9-mark extended answer weighing evidence to a conclusion (uncommon in sciences)" },
    note: "Sciences: lots of short questions, calculations and a 6-mark extended answer." },
  { re: /\bgeography\b/i, offer: ALL_K, on: ALL_K,
    labels: { outline: "Describe one", three: "Explain one", six: "Explain / Assess", nine: "Evaluate" },
    words: { outline: "“Describe one…” / “Suggest one…” (a point plus a linked detail, using the case study or data if given)", three: "“Explain one way/reason…” (identify, then develop)", six: "“Explain…” / “Assess…” with place-specific detail and linked reasons", nine: "“To what extent…?” / “Evaluate…” with a justified conclusion" },
    note: "Geography: tables and graphs often come with the questions." },
  { re: /\b(economics|business)\b/i, offer: ALL_K, on: ALL_K,
    labels: { outline: "Outline one", three: "Explain one", six: "Analyse / Discuss", nine: "Justify" },
    words: {}, note: "Business and Economics: case-study questions set around a made-up business." },
  { re: /\b(psychology|sociology)\b/i, offer: ALL_K, on: ALL_K,
    labels: { outline: "Outline one", three: "Explain one", six: "Discuss", nine: "Evaluate" },
    words: { outline: "“Outline one…” (a point plus a linked detail, naming the study, theory or concept)", three: "“Explain one…” (identify, then develop, with the study/theory)", six: "“Discuss…” with accurate studies or theories and reasoning", nine: "“Evaluate…” with strengths, limitations and a conclusion" },
    note: "Psychology and Sociology: studies, theories and evaluation." },
  { re: /\b(computer science|computing|ict|information technology)\b/i, offer: ALL_K, on: ["mc1", "mc2", "outline", "three", "six"],
    labels: { outline: "State / Describe", three: "Explain / Trace", six: "Discuss", nine: "Evaluate" },
    words: { outline: "“State…”, “Describe one…” (a fact plus a linked detail)", three: "“Explain one…”, or trace or complete a short piece of pseudocode (3 points)", six: "“Discuss…” the benefits, drawbacks or impact, with technical detail", nine: "“Evaluate…” to a justified conclusion" },
    note: "Computer science: multiple choice, short technical answers and a discuss question." },
  { re: /\b(pe|p\.e\.|physical education|sport|design (and|&) technology|d&t|food (technology|preparation)|engineering)\b/i, offer: ALL_K, on: ["mc1", "mc2", "outline", "three", "six"],
    labels: {}, words: {}, note: "" },
];
const DEFAULT_PROFILE = { offer: WRITTEN_K, on: WRITTEN_K, labels: {}, words: {}, note: "" };
/** The question-kind profile for a subject (pass the subject name, then the topic as a fallback). */
export function examProfile(...names) {
  for (const n of names) {
    const text = String(n ?? "");
    if (!text.trim()) continue;
    for (const p of KIND_PROFILES) if (p.re.test(text)) return { offer: p.offer, on: p.on, labels: p.labels, words: p.words, note: p.note };
  }
  return { ...DEFAULT_PROFILE };
}
/** What this subject calls a kind of question, e.g. "Calculate" in Maths or "Justify" in Business. */
export const kindLabel = (kind, profile) => (profile && profile.labels && profile.labels[kind]) || (EXAM_KINDS[kind] ? EXAM_KINDS[kind].label : "");
/** The kinds ticked by default for a subject: the ones its real papers use. */
export function defaultExamKinds(...names) {
  return examProfile(...names).on.slice();
}

/** True for Business subjects, whose long questions are set around a made-up business (as on the Edexcel papers). */
export const isBusinessSubject = (...names) => names.some((n) => /\bbusiness\b/i.test(String(n ?? "")));

/**
 * What to tell a question-writing AI about each kind: the JSON shape and the rules real papers follow.
 * Used by both the built-in question maker (server) and the "copy a prompt for another AI" text.
 */
export function examKindGuide(kind, { business = false, words = {} } = {}) {
  const ctxNote = business
    ? ` Set it in ONE made-up business that you introduce in "ctx" (2–4 sentences: its name, what it sells or does, and one or two facts — e.g. size, location, a recent change, a figure) and name that business in the question.`
    : ` If the question needs a scenario, add it as a short "ctx" (1–3 sentences); otherwise leave "ctx" out.`;
  const levelNote = (top) => ` The mark scheme is the indicative content: ${top === 9 ? "5–7" : "4–6"} short points separated by ; — what a good answer could include, in this order: knowledge/application points, then chains of reasoning ("this means… which leads to…")${top === 9 ? ", then the possible justified judgements (either side can score if it is justified)" : ""}. Marked in levels, so they do not need every point.`;
  const guides = {
    mc1: {
      shape: `{"kind":"mc1","q":"the question stem","marks":1,"opts":["option","option","option","option"],"a":"the correct option written out exactly as it appears in opts"}`,
      rules: `1-mark multiple choice, "select one answer". Exactly 4 options: one clearly correct, three plausible wrong ones, no "all of the above", no letters in the options.`,
    },
    mc2: {
      shape: `{"kind":"mc2","q":"Which TWO of the following …?","marks":2,"opts":["option","option","option","option","option"],"a":"first correct option ; second correct option (each written out exactly as it appears in opts)"}`,
      rules: `2-mark multiple choice, "select two answers": the stem asks for TWO answers, there are exactly 5 options, exactly two are correct (1 mark each) and three plausible wrong ones. No letters in the options.`,
    },
    outline: {
      shape: `{"kind":"outline","q":"Outline one …","marks":2,"a":"the point ; the linked development of that point"${business ? ',"ctx":"the business"' : ""}}`,
      rules: `2-mark "Outline one …" question: 1 mark for a valid point and 1 mark for a linked point that develops it (because… / so… / which means…). The mark scheme has exactly two points separated by ; (the second builds on the first). Short and tightly worded: ${business ? "ask for something appropriate for the business, e.g. “Outline one way … could …”" : "the question asks for one thing only"}.${business ? ctxNote : ""}`,
    },
    three: {
      shape: `{"kind":"three","q":"Explain one …","marks":3,"a":"identification ; development ; further development"}`,
      rules: `3-mark "Explain one benefit/drawback/reason/way …" question: 1 mark for identifying a valid point, plus 2 marks for development — explaining why or how, each step extending the last. The mark scheme has exactly three points separated by ; in that order. Real papers say "Explain ONE …" so a student cannot get marks for a list.`,
    },
    six: {
      shape: `{"kind":"six","q":"${business ? "Analyse the impact on [the business] of …" : "Analyse / Discuss / Explain …"}","marks":6,"a":"indicative content points separated by ;"${business ? ',"ctx":"the business"' : ""}}`,
      rules: `6-mark extended-response question (${business ? "command words: Analyse the impact on … of …, or Discuss whether …" : "command words: Analyse, Discuss, Explain why, Compare"}).${levelNote(6)}${business ? ctxNote : ""}`,
    },
    nine: {
      shape: `{"kind":"nine","q":"${business ? "Justify which ONE of the following … / Justify whether or not [the business] should …" : "Evaluate … / Justify whether … / To what extent …"}","marks":9,"a":"indicative content points separated by ;"${business ? ',"ctx":"the business"' : ""}}`,
      rules: `9-mark extended-response question that ends in a justified judgement (${business ? "command words: Justify which one of …, or Justify whether or not …" : "command words: Evaluate, Justify, To what extent, Assess"}).${levelNote(9)}${business ? ctxNote : ""}`,
    },
  };
  const g = guides[kindId(kind)];
  if (!g) return null;
  const w = words && words[kindId(kind)];
  return w ? { shape: g.shape, rules: `${g.rules} In THIS subject write it as: ${w}` } : g;
}

const asNum = (v) => { const n = typeof v === "string" ? Number(v.replace(/,/g, "").trim()) : v; return typeof n === "number" && Number.isFinite(n) && Math.abs(n) < 1e9 ? Math.round(n * 1e6) / 1e6 : null; };
const cellText = (v, n) => clean(typeof v === "number" ? String(v) : v).slice(0, n);
function figType(t) {
  const x = String(t ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (x.includes("pie")) return "pie";
  if (x.includes("scatter")) return "scatter";
  if (x.includes("line")) return "line";
  if (x.includes("bar") || x.includes("histogram") || x.includes("column")) return "bar";
  if (x.includes("table")) return "table";
  return "";
}

/** Checks and tidies a figure (table, bar/line chart, scatter graph or pie chart). Returns null if it isn't usable. */
export function cleanFigure(fig, allowed = FIG_TYPES) {
  if (!fig || typeof fig !== "object" || Array.isArray(fig)) return null;
  const type = figType(fig.type);
  if (!type || !allowed.includes(type)) return null;
  const base = { type, title: cellText(fig.title, 80) };
  const xLabel = cellText(fig.xLabel ?? fig.xlabel ?? fig.xAxis ?? fig.x_axis ?? fig.x_label, 40);
  const yLabel = cellText(fig.yLabel ?? fig.ylabel ?? fig.yAxis ?? fig.y_axis ?? fig.y_label, 40);
  if (type === "table") {
    const head = (Array.isArray(fig.head ?? fig.headers ?? fig.columns) ? (fig.head ?? fig.headers ?? fig.columns) : []).map((c) => cellText(c, 30)).slice(0, 8);
    const rows = (Array.isArray(fig.rows) ? fig.rows : []).filter(Array.isArray).slice(0, 15).map((r) => head.map((_, i) => cellText(r[i] ?? "", 30)));
    if (head.length < 2 || head.some((c) => !c) || rows.length < 1 || rows.every((r) => r.every((c) => !c))) return null;
    return { ...base, head, rows };
  }
  if (type === "scatter") {
    const points = [];
    for (const pt of Array.isArray(fig.points) ? fig.points : []) {
      const x = asNum(Array.isArray(pt) ? pt[0] : pt && pt.x), y = asNum(Array.isArray(pt) ? pt[1] : pt && pt.y);
      if (x === null || y === null) return null;
      points.push([x, y]);
    }
    if (points.length < 3 || points.length > 40) return null;
    return { ...base, xLabel, yLabel, points };
  }
  const labels = (Array.isArray(fig.labels ?? fig.categories ?? fig.x) ? (fig.labels ?? fig.categories ?? fig.x) : []).map((l) => cellText(l, 20));
  if (type === "pie") {
    const values = (Array.isArray(fig.values ?? fig.data) ? (fig.values ?? fig.data) : []).map(asNum);
    if (labels.length < 2 || labels.length > 8 || values.length !== labels.length || values.some((v) => v === null || v <= 0) || labels.some((l) => !l)) return null;
    return { ...base, labels, values };
  }
  // bar and line
  let series = Array.isArray(fig.series) ? fig.series : (Array.isArray(fig.values ?? fig.data) ? [{ name: "", values: fig.values ?? fig.data }] : []);
  series = series.slice(0, 3).map((sr) => ({ name: cellText(sr && sr.name, 30), values: (Array.isArray(sr && sr.values) ? sr.values : []).map(asNum) }));
  if (labels.length < 2 || labels.length > 14 || labels.some((l) => !l) || !series.length || series.some((sr) => sr.values.length !== labels.length || sr.values.some((v) => v === null))) return null;
  return { ...base, xLabel, yLabel, labels, series };
}

function optionList(opts, min, max) {
  if (!Array.isArray(opts)) return null;
  const list = opts.map((o) => clean(o && typeof o === "object" ? (o.text ?? o.option ?? "") : o).replace(/^\(?[A-Fa-f][.):]\s+/, "").slice(0, 200));
  if (list.length < min || list.length > max || list.some((o) => !o)) return null;
  const keys = list.map((o) => normalise(o) || o.toLowerCase());
  if (new Set(keys).size !== keys.length) return null;
  return { list, keys };
}

/**
 * The "Select two answers" kind of multiple choice (worth 2 marks): 4–6 options, exactly two correct.
 * `answer` can be an array, "C, E", "C and E", or the two options written out and separated by ";".
 * Returns { opts, answers: [two option texts] } or null.
 */
export function cleanOptsMulti(opts, answer, n = 2) {
  const ol = optionList(opts, 4, 6);
  if (!ol) return null;
  const { list, keys } = ol;
  const indexOf = (piece) => {
    const s = clean(piece);
    const letter = /^\(?([A-Fa-f])\)?[.:]?$/.exec(s);
    if (letter) { const i = letter[1].toUpperCase().charCodeAt(0) - 65; return i < list.length ? i : -1; }
    const stripped = s.replace(/^\(?[A-Fa-f][.):]\s+/, "");
    return keys.indexOf(normalise(stripped) || stripped.toLowerCase());
  };
  let picks = [];
  if (Array.isArray(answer)) picks = answer.map(indexOf);
  else {
    const raw = clean(answer);
    const parts = raw.split(/\s*[;|]\s*/).filter(Boolean);
    if (parts.length === n) picks = parts.map(indexOf);
    if (picks.length !== n || picks.some((i) => i < 0)) {
      picks = [];
      if (/^\(?[A-Fa-f]\)?(?:\s*(?:,|and|&)\s*\(?[A-Fa-f]\)?)+$/i.test(raw)) picks = raw.split(/\s*(?:,|and|&)\s*/i).map(indexOf);
      else { const commas = raw.split(/\s*,\s*/).filter(Boolean); if (commas.length === n) picks = commas.map(indexOf); }
    }
    if (picks.length !== n || picks.some((i) => i < 0)) { // last resort: which option texts appear in the answer
      const hay = normalise(raw) || raw.toLowerCase();
      picks = keys.map((k, i) => (k && hay.includes(k) ? i : -1)).filter((i) => i >= 0);
    }
  }
  const uniq = [...new Set(picks)];
  if (uniq.length !== n || uniq.some((i) => i < 0)) return null;
  uniq.sort((x, y) => x - y);
  return { opts: list, answers: uniq.map((i) => list[i]) };
}

/** Checks and tidies the options of an exam multiple-choice question and finds which one is correct. Returns { opts, a } or null. */
export function cleanOpts(opts, answer) {
  const ol = optionList(opts, 3, 5);
  if (!ol) return null;
  const { list, keys } = ol;
  const a = clean(answer);
  let m = /^\(?([A-Ea-e])\)?[.:]?$/.exec(a) || /^\(?([A-Ea-e])[.):]\s+/.exec(a);
  if (m) { const i = m[1].toUpperCase().charCodeAt(0) - 65; if (i < list.length) return { opts: list, a: list[i] }; }
  const stripped = a.replace(/^\(?[A-Ea-e][.):]\s+/, "");
  const i = keys.indexOf(normalise(stripped) || stripped.toLowerCase());
  return i === -1 ? null : { opts: list, a: list[i] };
}

/** True when a written question points at a diagram, graph or table that isn't actually there. */
export function refersToMissingFigure(q) {
  const t = String(q ?? "");
  return /\b(figure|fig\.?|table|graph|chart|diagram|map|photograph|photo|image|picture)\s*\d\b/i.test(t)
    || /\b(shown|given|displayed|drawn|illustrated)\s+(above|below)\b/i.test(t)
    || /\b(use|using|from|look at|refer to|study|complete)\s+(the|this)\s+(graph|table|chart|figure|diagram|map|photograph|picture|image)\b/i.test(t)
    || /\b(the|this)\s+(diagram|photograph|picture|image)\s+(above|below|shows)\b/i.test(t);
}

/** Round-number axis for charts: { min, max, step, ticks }. */
export function niceScale(min, max, count = 5) {
  let lo = Number(min), hi = Number(max);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) { lo = 0; hi = 1; }
  if (lo === hi) { if (lo === 0) hi = 1; else { lo = Math.min(lo, 0); hi = Math.max(hi, 0); } }
  const raw = (hi - lo) / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
  const nmin = Math.floor(lo / step + 1e-9) * step, nmax = Math.ceil(hi / step - 1e-9) * step;
  const dp = Math.max(0, -Math.floor(Math.log10(step)));
  const ticks = [];
  for (let v = nmin, i = 0; v <= nmax + step / 2 && i < 50; v += step, i++) ticks.push(Number(v.toFixed(dp)));
  return { min: Number(nmin.toFixed(dp)), max: Number(nmax.toFixed(dp)), step, ticks };
}

const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const numFmt = (n) => String(Math.round(n * 1000) / 1000);
const SERIES_COLOURS = ["var(--fig-1,#2563eb)", "var(--fig-2,#e11d48)", "var(--fig-3,#16a34a)"];
const PIE_COLOURS = ["#2563eb", "#e11d48", "#16a34a", "#f59e0b", "#7c3aed", "#0891b2", "#db2777", "#65a30d"];
const trunc = (t, n) => (t.length > n ? t.slice(0, n - 1) + "…" : t);

/** A short text description of a figure, for screen readers. */
export function figureAlt(fig) {
  if (!fig) return "";
  const name = { table: "Table", bar: "Bar chart", line: "Line graph", scatter: "Scatter graph", pie: "Pie chart" }[fig.type] || "Figure";
  let data = "";
  if (fig.type === "pie") data = fig.labels.map((l, i) => `${l} ${numFmt(fig.values[i])}`).join(", ");
  else if (fig.type === "scatter") data = fig.points.map(([x, y]) => `(${numFmt(x)}, ${numFmt(y)})`).join(" ");
  else if (fig.series) data = fig.series.map((sr) => `${sr.name ? sr.name + ": " : ""}${fig.labels.map((l, i) => `${l} ${numFmt(sr.values[i])}`).join(", ")}`).join(". ");
  return `${name}${fig.title ? ": " + fig.title : ""}.${fig.xLabel ? " x-axis: " + fig.xLabel + "." : ""}${fig.yLabel ? " y-axis: " + fig.yLabel + "." : ""} ${data}`.slice(0, 600).trim();
}

/** Draws a bar chart, line graph, scatter graph or pie chart as SVG text (all text is escaped). Tables are drawn by the page. */
export function figureSvg(fig) {
  if (!fig || fig.type === "table") return "";
  const W = 520, H = 320;
  const out = [];
  const title = fig.title ? `<text x="${W / 2}" y="18" text-anchor="middle" font-size="15" font-weight="700" fill="currentColor">${esc(trunc(fig.title, 70))}</text>` : "";
  const open = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(figureAlt(fig))}" style="width:100%;height:auto;max-width:560px;color:inherit" font-family="system-ui,sans-serif">`;
  out.push(title);

  if (fig.type === "pie") {
    const total = fig.values.reduce((a, b) => a + b, 0);
    const cx = 150, cy = 175, r = 110;
    let angle = -Math.PI / 2;
    fig.values.forEach((v, i) => {
      const frac = v / total;
      const colour = PIE_COLOURS[i % PIE_COLOURS.length];
      if (frac >= 0.9999) out.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${colour}"/>`);
      else {
        const a2 = angle + frac * 2 * Math.PI;
        const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle), x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
        out.push(`<path d="M${cx} ${cy} L${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 ${frac > 0.5 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z" fill="${colour}" stroke="#fff" stroke-width="1.5"/>`);
        angle = a2;
      }
      out.push(`<rect x="300" y="${70 + i * 24}" width="12" height="12" rx="2" fill="${colour}"/><text x="320" y="${80 + i * 24}" font-size="14" fill="currentColor">${esc(trunc(fig.labels[i], 18))} — ${numFmt(Math.round((v / total) * 1000) / 10)}%</text>`);
    });
    return open + out.join("") + "</svg>";
  }

  const multi = fig.type !== "scatter" && fig.series.length > 1;
  const rotate = fig.type !== "scatter" && fig.labels.length > 6;
  const left = 64, right = W - 14;
  const top = (fig.title ? 36 : 14) + (multi ? 20 : 0);
  const bottom = H - (fig.xLabel ? 28 : 8) - (rotate ? 54 : 30);
  const mid = (a, b) => (a + b) / 2;
  const plotW = right - left, plotH = bottom - top;

  let ys, xs = null, numericX = false;
  if (fig.type === "scatter") {
    const px = fig.points.map((q) => q[0]), py = fig.points.map((q) => q[1]);
    const span = (arr) => { const lo = Math.min(...arr), hi = Math.max(...arr), pad = (hi - lo) * 0.06; return lo >= 0 && lo < hi * 0.6 ? niceScale(0, hi + pad) : niceScale(lo - pad, hi + pad); };
    xs = span(px); ys = span(py);
  } else {
    const all = fig.series.flatMap((sr) => sr.values);
    const lo = Math.min(...all), hi = Math.max(...all);
    const yLo = lo >= 0 ? (fig.type === "bar" || lo < hi * 0.6 ? 0 : lo) : lo;
    ys = niceScale(yLo, hi <= 0 ? 0 : hi);
    const nums = fig.labels.map((l) => (l.trim() !== "" ? Number(l) : NaN));
    if (fig.type === "line" && nums.every(Number.isFinite) && new Set(nums).size === nums.length) { const lo = Math.min(...nums), hi = Math.max(...nums); numericX = true; xs = niceScale(lo >= 0 && lo < hi * 0.6 ? 0 : lo, hi); }
  }
  const Y = (v) => bottom - ((v - ys.min) / (ys.max - ys.min || 1)) * plotH;
  const Xn = (v) => left + ((v - xs.min) / (xs.max - xs.min || 1)) * plotW;
  const slot = plotW / (fig.labels ? fig.labels.length : 1);
  const Xc = (i) => left + slot * (i + 0.5);

  // gridlines and y axis
  for (const t of ys.ticks) {
    out.push(`<line x1="${left}" x2="${right}" y1="${Y(t).toFixed(1)}" y2="${Y(t).toFixed(1)}" stroke="currentColor" stroke-opacity=".14"/>`);
    out.push(`<text x="${left - 6}" y="${(Y(t) + 4).toFixed(1)}" text-anchor="end" font-size="13" fill="currentColor">${numFmt(t)}</text>`);
  }
  out.push(`<line x1="${left}" x2="${left}" y1="${top}" y2="${bottom}" stroke="currentColor" stroke-opacity=".6"/><line x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}" stroke="currentColor" stroke-opacity=".6"/>`);
  if (fig.yLabel) out.push(`<text transform="rotate(-90 15 ${mid(top, bottom)})" x="15" y="${mid(top, bottom)}" text-anchor="middle" font-size="13" fill="currentColor">${esc(trunc(fig.yLabel, 40))}</text>`);
  if (fig.xLabel) out.push(`<text x="${mid(left, right)}" y="${H - 7}" text-anchor="middle" font-size="13" fill="currentColor">${esc(trunc(fig.xLabel, 50))}</text>`);

  // x axis ticks / category labels
  if (xs) {
    for (const t of xs.ticks) {
      out.push(`<line x1="${Xn(t).toFixed(1)}" x2="${Xn(t).toFixed(1)}" y1="${bottom}" y2="${bottom + 4}" stroke="currentColor" stroke-opacity=".6"/>`);
      out.push(`<text x="${Xn(t).toFixed(1)}" y="${bottom + 17}" text-anchor="middle" font-size="13" fill="currentColor">${numFmt(t)}</text>`);
    }
  } else {
    fig.labels.forEach((l, i) => {
      const x = Xc(i);
      out.push(rotate
        ? `<text transform="rotate(-40 ${x.toFixed(1)} ${bottom + 14})" x="${x.toFixed(1)}" y="${bottom + 14}" text-anchor="end" font-size="12" fill="currentColor">${esc(trunc(l, 14))}</text>`
        : `<text x="${x.toFixed(1)}" y="${bottom + 16}" text-anchor="middle" font-size="13" fill="currentColor">${esc(trunc(l, 14))}</text>`);
    });
  }

  if (fig.type === "bar") {
    const n = fig.series.length;
    const bw = (slot * 0.72) / n;
    fig.series.forEach((sr, si) => sr.values.forEach((v, i) => {
      const x = Xc(i) - (slot * 0.72) / 2 + si * bw;
      const y0 = Y(Math.max(ys.min, 0)), y1 = Y(v);
      out.push(`<rect x="${x.toFixed(1)}" y="${Math.min(y0, y1).toFixed(1)}" width="${(bw - 1).toFixed(1)}" height="${Math.abs(y0 - y1).toFixed(1)}" style="fill:${SERIES_COLOURS[si]}"/>`);
    }));
  } else if (fig.type === "line") {
    fig.series.forEach((sr, si) => {
      const pts = sr.values.map((v, i) => [numericX ? Xn(Number(fig.labels[i])) : Xc(i), Y(v)]);
      const order = numericX ? pts.map((p, i) => [p, Number(fig.labels[i])]).sort((a, b) => a[1] - b[1]).map((e) => e[0]) : pts;
      out.push(`<polyline fill="none" stroke-width="2.2" points="${order.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ")}" style="stroke:${SERIES_COLOURS[si]}"/>`);
      for (const p of pts) out.push(`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.2" style="fill:${SERIES_COLOURS[si]}"/>`);
    });
  } else {
    for (const [x, y] of fig.points) out.push(`<circle cx="${Xn(x).toFixed(1)}" cy="${Y(y).toFixed(1)}" r="3.6" style="fill:${SERIES_COLOURS[0]}"/>`);
  }

  if (multi) {
    let lx = left;
    fig.series.forEach((sr, si) => {
      const label = trunc(sr.name || `Series ${si + 1}`, 22);
      out.push(`<rect x="${lx}" y="${top - 17}" width="12" height="12" rx="2" style="fill:${SERIES_COLOURS[si]}"/><text x="${lx + 17}" y="${top - 6}" font-size="13" fill="currentColor">${esc(label)}</text>`);
      lx += 28 + label.length * 7.2;
    });
  }
  return open + out.join("") + "</svg>";
}

function toItem(parts, alts = [], src = "", marks = 0, extra = {}) {
  const cells = parts.map(clean);
  const q = cells[0];
  const a = cells[1];
  if (!q || !a) return null;
  const m = Math.round(Number(marks));
  const exam = Number.isFinite(m) && m >= 1;
  const choices = exam ? [] : [...new Set(cells.slice(2).filter(Boolean))].filter((c) => normalise(c) !== normalise(a)).slice(0, 5);
  const source = clean(src).slice(0, 80);
  if (exam) {
    const item = { q: q.slice(0, 800), a: a.slice(0, 1200), choices: [], exam: true, marks: Math.min(12, m), ...(source ? { src: source } : {}) };
    const kind = kindId(extra.kind);
    const hasOpts = extra.opts !== undefined && extra.opts !== null;
    if (hasOpts) { // exam multiple choice: options in a fixed order — pick one (1 mark) or "select two" (2 marks)
      let done = false;
      if (kind === "mc2" || (kind !== "mc1" && m === 2)) {
        const o = cleanOptsMulti(extra.opts, extra.answers ?? a);
        if (o) { item.opts = o.opts; item.answers = o.answers; item.a = o.answers.join("; "); item.pick = 2; item.marks = 2; item.kind = "mc2"; done = true; }
        else if (kind === "mc2") return null;
      }
      if (!done) {
        const o = cleanOpts(extra.opts, a);
        if (!o) return null;
        item.opts = o.opts; item.a = o.a; item.marks = 1; item.kind = "mc1";
      }
    } else if (kind && kind !== "mc1" && kind !== "mc2") { // a written kind: its mark total is fixed ("Outline two" is the only 4-mark one)
      item.kind = kind;
      item.marks = kind === "outline" ? (m === 4 ? 4 : 2) : EXAM_KINDS[kind].marks;
    }
    const ctx = clean(extra.ctx).slice(0, 700);
    if (ctx && !item.opts) item.ctx = ctx; // the short business/scenario extract a case-study question is set around
    if (extra.fig !== undefined && extra.fig !== null) { // a graph, chart or table the question refers to
      const f = cleanFigure(extra.fig);
      if (!f) return null;
      item.fig = f;
    }
    return item;
  }
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
      let a = row.a ?? row.answer ?? row.back;
      if (Array.isArray(a)) a = a.join("; ");
      else if ((a === undefined || a === null || a === "") && Array.isArray(row.answers)) a = row.answers.join("; ");
      const wrong = row.wrong ?? row.choices ?? row.options ?? row.distractors ?? [];
      let alts = row.alt ?? row.alts ?? row.alternatives ?? row.also ?? row.accept ?? [];
      if (typeof alts === "string") alts = alts.split(/\s*[;|]\s*/);
      item = toItem([q, a, ...(Array.isArray(wrong) ? wrong : [])], Array.isArray(alts) ? alts : [], typeof (row.src ?? row.source) === "string" ? (row.src ?? row.source) : "", row.marks ?? row.mark ?? 0, { opts: row.opts ?? row.options ?? row.mc, fig: row.fig ?? row.figure, kind: row.kind ?? row.type, ctx: row.ctx ?? row.context ?? row.extract ?? row.scenario, answers: row.answers });
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

export function buildAiPrompt({ topic, level = "GCSE", count = 15, style = "mixed", paper = false, board = "", mode = "quick", kinds, subject = "" } = {}) {
  const t = clean(topic).slice(0, 120) || "[type your topic here]";
  const n = Math.max(1, Math.min(50, Math.round(Number(count)) || 15));
  const lvl = clean(level) || "GCSE";
  const tailor = boardLine(board, lvl);
  if (mode === "exam") {
    const business = isBusinessSubject(subject, topic);
    const want = (Array.isArray(kinds) && kinds.length ? kinds : defaultExamKinds(subject, topic)).map(kindId).filter(Boolean);
    const plan = examPlan(Math.min(n, 20), want.length ? want : EXAM_KIND_IDS);
    const used = PAPER_ORDER.filter((k) => plan.includes(k));
    const counts = used.map((k) => `${plan.filter((x) => x === k).length} × ${EXAM_KINDS[k].marks}-mark ${EXAM_KINDS[k].label.toLowerCase()}`).join(", ");
    const prof = examProfile(subject, topic);
    const guides = used.map((k) => examKindGuide(k, { business, words: prof.words }));
    return `Write ${plan.length} exam-style questions about "${t}"${clean(subject) ? ` (subject: ${clean(subject)})` : ""} at ${lvl} level, laid out like a real exam paper: ${counts}.${tailor}

Reply with ONLY a JSON array, in the order a paper would run (shortest first). Use these shapes:
${used.map((k, i) => `${i + 1}. ${guides[i].shape}`).join("\n")}

Rules:
${used.map((k, i) => `- ${k}: ${guides[i].rules}`).join("\n")}
- Do not put the number of marks in the question text — the app shows it. Real command words only. Marking points must be factually correct and short.
- No markdown, no numbering, no text outside the JSON.${business ? "\n- This is modelled on the Edexcel GCSE Business papers: questions about a made-up business, with 'Outline one…', 'Explain one…', 'Analyse the impact on…' and 'Justify…' command words." : ""}${paperLines(paper, board, lvl)}`;
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
    let answer = str(q.a, isExam ? 1200 : 300);
    let opts = null, fig = null, answers = null, kind = "", ctx = "";
    if (isExam && q.opts !== undefined && q.opts !== null) {
      const two = q.pick === 2 || (Array.isArray(q.answers) && q.answers.length === 2) || kindId(q.kind) === "mc2";
      const multi = two ? cleanOptsMulti(q.opts, Array.isArray(q.answers) ? q.answers : answer) : null;
      if (multi) { opts = multi.opts; answers = multi.answers; answer = multi.answers.join("; "); kind = "mc2"; }
      else { const o = cleanOpts(q.opts, answer); if (!o) continue; opts = o.opts; answer = o.a; kind = "mc1"; }
    } else if (isExam) {
      const k = kindId(q.kind);
      if (k && k !== "mc1" && k !== "mc2") kind = k;
      ctx = str(q.ctx, 700);
    }
    if (isExam && q.fig !== undefined && q.fig !== null) { fig = cleanFigure(q.fig); if (!fig) continue; }
    const subjectId = str(q.subjectId, 40);
    if (!id || !text || !answer || !subjectIds.has(subjectId) || questionIds.has(id)) continue;
    questionIds.add(id);
    out.questions.push({
      id, subjectId, q: text, a: answer,
      choices: (Array.isArray(q.choices) ? q.choices : []).map((c) => str(c, 200)).filter(Boolean).slice(0, 5),
      ...(str(q.src, 80) ? { src: str(q.src, 80) } : {}),
      ...(isExam ? { exam: true, marks: opts ? (answers ? 2 : 1) : Math.min(12, Math.round(q.marks)) } : {}),
      ...(kind ? { kind } : {}),
      ...(ctx ? { ctx } : {}),
      ...(opts ? { opts } : {}),
      ...(answers ? { answers, pick: 2 } : {}),
      ...(fig ? { fig } : {}),
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

const NOT_A_SUBJECT = /^(week\s*[a-z0-9]+|day\s*\d+|am|pm|morning|afternoon|session|exam|exams|date|time|subject|paper|room|hall)$/i;
const NOT_AN_EXAM_LINE = /^(good luck|please|bring|note|notes|remember|break|lunch|registration|equipment|calculators?|you must|students|all |page \d|©)/i;

/** Turns one line (with its date) into an exam, or null when there's no subject on it. */
function examFromLine(line, date, today, session = "") {
  const { rest } = findDate(line, today);
  let remaining = rest.replace(/\b(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:day|sday|nesday|rsday|urday)?\b\.?/gi, " ").replace(/^\||\|$/g, " ");
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
    else if (!NOT_A_SUBJECT.test(p)) kept.push(p);
  }
  let subject = kept[0] || "";
  let paper = "";
  const pm = subject.match(PAPER_RE) || kept.slice(1).join(" ").match(PAPER_RE);
  if (pm) { paper = pm[1].replace(/\s+/g, " "); subject = subject.replace(pm[0], " "); }
  subject = clean(subject.replace(/\b(mock|gcse|a[\s-]?level|as[\s-]?level)\b/gi, " ").replace(/\(\s*\)|\[\s*\]/g, " ").replace(/^[-:(\[\s]+|[-:(\[\s]+$/g, "")).slice(0, 60);
  if (!subject) return null;
  return { subject, kind, board, date, paper: paper.slice(0, 40), time: (time || session).slice(0, 20) };
}

/**
 * Reads a pasted exam timetable. Two layouts work:
 *   one exam per line:   Maths Paper 1 | 14 May 2027 | GCSE | 9:00     or   Biology, 21/05/2027, mock
 *   dates as headings:   Monday 9th November
 *                        AM  Maths Paper 1 (9:00)
 *                        PM  English Language Paper 1
 */
export function parseExamList(text, today) {
  const exams = [];
  let skipped = 0;
  let heading = ""; // the date from the latest "Monday 9th November" line that had no exam on it
  const cleaned = String(text ?? "").replace(/^```[a-z]*\s*$/gim, "");
  for (const raw of cleaned.split(/\r?\n/).slice(0, 400)) {
    const line = stripNumber(raw.trim());
    if (!line || /^[|\s:-]+$/.test(line)) continue;
    const { date } = findDate(line, today);
    if (date) {
      const exam = examFromLine(line, date, today);
      if (exam) exams.push(exam);
      else heading = date; // a date on its own: the exams that follow are on this day
      continue;
    }
    if (heading && line.length <= 90 && !NOT_AN_EXAM_LINE.test(line)) {
      const sm = /^(am|pm|morning|afternoon)\b\s*[:\-–—]?\s*/i.exec(line);
      const session = sm ? (/^(am|morning)/i.test(sm[1]) ? "AM" : "PM") : "";
      const exam = examFromLine(sm ? line.slice(sm[0].length) : line, heading, today, session);
      if (exam) { exams.push(exam); continue; }
    }
    skipped++;
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

/** The three levels an extended answer is marked in: [[lo, hi] for level 1, level 2, level 3]. 6 marks → 1–2, 3–4, 5–6; 9 marks → 1–3, 4–6, 7–9. */
export function levelBands(marks) {
  const m = Math.max(3, Math.round(Number(marks)) || 6), b = m / 3;
  return [0, 1, 2].map((k) => [Math.floor(b * k + 1e-9) + 1, Math.min(m, Math.round(b * (k + 1)))]);
}

const CHAIN_WORDS = /\b(because|therefore|which means|this means|so that|leads? to|led to|as a result|resulting|consequently|since|due to|meaning|allows?|so the|so they|which could|which would)\b/gi;
const JUDGE_WORDS = /\b(overall|on balance|in conclusion|i would|i think|i believe|should|best|most important|most suitable|justif\w*|recommend\w*|the better|more likely|outweigh\w*)\b/i;

/**
 * A simple marker that works offline: each marking point scores if most of its key words appear in the answer.
 * 6- and 9-mark answers are placed in a level (1–3) from how many ideas they cover, whether they explain them with
 * chains of reasoning and, for 9 markers, whether they reach a judgement — then given a mark inside that level.
 * Returns { awarded, total, points: [{ text, met }], level? }.
 */
export function markLocally(answer, scheme, marks, kind = "") {
  const points = schemePoints(scheme);
  const given = answerTokens(answer);
  const results = points.map((text) => {
    const exp = answerTokens(text).filter((w) => (w.length > 2 || isNumeric(w)) && !MARK_STOP.has(w));
    if (!exp.length) return { text, met: false };
    const { matched } = alignTokens(exp, given);
    return { text, met: matched >= Math.max(1, Math.ceil(exp.length * 0.5)) };
  });
  const total = Math.max(1, Math.min(12, Math.round(Number(marks)) || points.length || 1));
  const k = kindId(kind);
  if (total >= 6 || k === "six" || k === "nine") {
    const text = String(answer ?? "");
    const words = (text.match(/\S+/g) || []).length;
    const metCount = results.filter((r) => r.met).length;
    const frac = results.length ? metCount / results.length : 0;
    const chains = (text.match(CHAIN_WORDS) || []).length;
    const judged = JUDGE_WORDS.test(text);
    const long = total >= 9 ? 90 : 50;
    let level = 0;
    if (metCount >= 1 || words >= 20) level = 1;
    if (level && frac >= 0.34 && chains >= 1 && words >= long / 2) level = 2;
    if (level === 2 && frac >= 0.6 && chains >= 2 && words >= long) level = 3;
    if (level === 3 && total >= 9 && !judged) level = 2;
    const [lo, hi] = level ? levelBands(total)[level - 1] : [0, 0];
    const awarded = level ? Math.max(lo, Math.min(hi, lo + Math.round((hi - lo) * Math.min(1, frac * 1.2)))) : 0;
    return { awarded: Math.min(total, awarded), total, points: results, level };
  }
  return { awarded: Math.min(total, results.filter((r) => r.met).length), total, points: results };
}

/** The text people give to another AI, together with a photo of their exam timetable, to get a list this app can read. */
export function buildTimetablePrompt(today) {
  const year = String(today || dateStr()).slice(0, 4);
  return `I'm attaching a photo of my exam timetable. Read it and turn it into a plain list with one exam per line, in exactly this format:

Subject | date | type | exam board | paper | time

Rules:
- Write the date like 14 May ${year} (day, month name, year). Today is ${today || dateStr()}; if the photo has no year, use the next time that date comes round.
- Type is Mock, GCSE, A-level or AS-level if you can tell from the photo, otherwise leave it out.
- Exam board is AQA, Edexcel, OCR, WJEC, Eduqas, CCEA or SQA only if the photo says so, otherwise leave it out. Paper is something like Paper 1 or Component 2, and time is the start time. Leave out anything you can't see. Never guess.
- Do not use the "|" character inside a subject name. Don't put the day of the week in.
- If a subject has several exams (Paper 1, Paper 2…), write one line for each.
- Only list actual exams. Skip breaks, lunches, registration and instructions.
- Reply with ONLY the lines, no heading, no table, no numbering, no explanation.`;
}
