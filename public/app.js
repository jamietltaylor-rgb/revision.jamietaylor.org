import * as L from "./logic.js";

const KEY = "revise-app-v1";
const TABS = [["home", "🏠", "Home"], ["revise", "📝", "Revise"], ["questions", "✏️", "Questions"], ["rewards", "🏆", "Rewards"]];
const TAB_IDS = TABS.map((t) => t[0]);

let state;
let tab = "home";
let session = null;
let storageOk = true;
const draft = { subjectId: "", newSubject: "", q: "", a: "", wrong: "", bulk: "", filter: "all", search: "", treatName: "", treatCost: "" };

// ---------- tiny helper for building page elements (text is always set as text, never as HTML) ----------
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "value") el.value = v;
    else if (k === "checked") el.checked = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(typeof kid === "object" ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
const bar = (rawPct, label) => {
  const pct = Number.isFinite(rawPct) ? Math.max(0, Math.min(100, rawPct)) : 0;
  return h("div", { class: "bar", role: "progressbar", "aria-valuenow": pct, "aria-valuemin": 0, "aria-valuemax": 100, "aria-label": label },
    h("div", { class: "bar-fill", style: `width:${pct}%` }));
};
const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const today = () => L.dateStr();
const dayName = (date) => new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short" });
const niceDate = (date) => (date ? new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "");

function toast(message) {
  const box = document.getElementById("toasts");
  if (!box) return;
  const el = h("div", { class: "toast" }, message);
  box.append(el);
  setTimeout(() => el.remove(), 4200);
}

// ---------- saving ----------
function load() {
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
    if (raw) return L.sanitiseState(JSON.parse(raw));
  } catch (e) {
    console.warn("Couldn't read saved data", e);
    try { if (raw) localStorage.setItem(KEY + "-damaged", raw); } catch { /* nothing more we can do */ }
  }
  return L.starterState(today());
}
function save() {
  const days = state.stats.days;
  for (const k of Object.keys(days).sort().slice(0, -200)) delete days[k];
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    storageOk = true;
  } catch (e) {
    console.warn("Couldn't save", e);
    storageOk = false;
  }
}
function checkBadges() {
  for (const id of L.newBadges(state)) {
    const b = L.BADGES.find((x) => x.id === id);
    state.stats.badges[id] = today();
    toast(`${b.icon} Badge unlocked: ${b.name}`);
    if (session) session.newBadges.push(id);
  }
}

// ---------- navigation ----------
function go(id) {
  tab = id;
  if (location.hash !== "#" + id) location.hash = id;
  render();
  window.scrollTo(0, 0);
}
function render() {
  const nav = document.getElementById("nav");
  const app = document.getElementById("app");
  nav.replaceChildren(...TABS.map(([id, icon, label]) =>
    h("button", { type: "button", class: "tab" + (tab === id ? " active" : ""), "aria-current": tab === id ? "page" : undefined, onclick: () => go(id) },
      h("span", { "aria-hidden": "true" }, icon), h("span", {}, label))));
  const views = { home: viewHome, revise: viewRevise, questions: viewQuestions, rewards: viewRewards };
  app.replaceChildren(...[
    !storageOk && h("div", { class: "banner", role: "alert" }, "This browser isn't letting the app save. Your progress will be lost when you close the page — try turning off private browsing."),
    views[tab](),
  ].filter(Boolean));
}

// ======================= HOME =======================
function viewHome() {
  const t = today();
  const s = state.stats;
  const lvl = L.levelFor(s.points);
  const goal = state.settings.dailyGoal;
  const day = s.days[t] || { n: 0, c: 0, p: 0 };
  const due = state.questions.filter((q) => q.due <= t).length;
  const streak = L.currentStreak(s, t);
  const week = L.lastDays(s, 7, t);
  const weekMax = Math.max(goal, ...week.map((d) => d.n));
  const progress = L.subjectProgress(state, t);
  const earned = L.BADGES.filter((b) => s.badges[b.id]).sort((a, b) => s.badges[b.id].localeCompare(s.badges[a.id])).slice(0, 4);

  const cta = !state.questions.length
    ? h("button", { class: "primary big", onclick: () => go("questions") }, "Add your first questions")
    : h("button", { class: "primary big", onclick: () => go("revise") }, due ? `Start revising — ${plural(due, "question")} due` : "Nothing due — practise anyway");

  return h("div", {},
    h("section", { class: "card" },
      h("h1", {}, streak >= 2 ? `🔥 ${streak} day streak!` : "Ready to revise?"),
      h("div", { class: "grid2" },
        h("div", { class: "stat" }, h("b", {}, `Level ${lvl.level}`), h("span", {}, `${s.points} points`)),
        h("div", { class: "stat" }, h("b", {}, streak), h("span", {}, "day streak")),
        h("div", { class: "stat" }, h("b", {}, s.answered ? `${Math.round((s.correct / s.answered) * 100)}%` : "–"), h("span", {}, "answered right"))),
      h("p", { class: "small muted", style: "margin-top:.75rem" }, `${lvl.next - s.points} points to level ${lvl.level + 1}`),
      bar(lvl.pct, "Progress to next level")),
    h("section", { class: "card" },
      h("div", { class: "row space" }, h("h2", {}, "Today"), h("span", { class: "muted small" }, `${day.n} of ${goal} questions`)),
      bar(Math.round((day.n / goal) * 100), "Today's goal"),
      h("p", { class: "small muted", style: "margin:.5rem 0 1rem" }, day.n >= goal ? `Goal reached! 🎉 You've earned ${day.p} points today.` : `${goal - day.n} more to reach your daily goal (+${L.GOAL_BONUS} bonus points).`),
      cta),
    h("section", { class: "card" },
      h("h2", {}, "This week"),
      h("div", { class: "week" }, week.map((d) =>
        h("div", { class: "col", title: `${niceDate(d.date)}: ${plural(d.n, "question")}` },
          h("span", {}, d.n || ""),
          h("div", { class: "fill", style: `height:${Math.max(3, Math.round((d.n / weekMax) * 64))}px` }),
          h("span", {}, dayName(d.date)))))),
    h("section", { class: "card" },
      h("h2", {}, "Last 12 weeks"),
      h("div", { class: "heat", role: "img", "aria-label": "Calendar of the days you revised" },
        L.heatmap(s, t, 12, goal).map((c) => h("i", { class: `l${c.level}${c.future ? " future" : ""}`, title: c.future ? "" : `${niceDate(c.date)}: ${plural(c.n, "question")}` }))),
      h("p", { class: "small muted", style: "margin:.5rem 0 0" }, "Darker squares are days when you answered more questions.")),
    h("section", { class: "card" },
      h("h2", {}, "Your subjects"),
      progress.length === 0 && h("p", { class: "muted" }, "No subjects yet. Add some questions and they'll show up here."),
      progress.map((p) => {
        const pct = p.total ? Math.round((p.mastered / p.total) * 100) : 0;
        return h("div", { style: "margin-bottom:.9rem" },
          h("div", { class: "row space" }, h("b", {}, p.name), h("span", { class: "small muted" }, `${p.mastered}/${p.total} mastered · ${p.due} due`)),
          bar(pct, `${p.name} mastered`));
      })),
    earned.length > 0 && h("section", { class: "card" },
      h("div", { class: "row space" }, h("h2", {}, "Latest badges"), h("button", { class: "ghost small", onclick: () => go("rewards") }, "See all")),
      h("div", { class: "badges" }, earned.map((b) => h("div", { class: "badge" }, h("span", { class: "ico", "aria-hidden": "true" }, b.icon), h("b", {}, b.name), h("span", { class: "small muted" }, niceDate(s.badges[b.id])))))));
}

// ======================= REVISE =======================
function viewRevise() {
  if (!session) return viewSetup();
  if (session.finished) return viewSummary();
  return viewQuestion();
}

function viewSetup() {
  const t = today();
  if (!state.questions.length) {
    return h("section", { class: "card" }, h("h1", {}, "Nothing to revise yet"), h("p", { class: "muted" }, "Add some questions first — it only takes a minute."),
      h("button", { class: "primary", onclick: () => go("questions") }, "Add questions"));
  }
  const dueIn = (id) => state.questions.filter((q) => (id === "all" || q.subjectId === id) && q.due <= t).length;
  const subjectSel = h("select", { id: "subject" },
    h("option", { value: "all" }, `All subjects (${dueIn("all")} due)`),
    state.subjects.map((s) => h("option", { value: s.id }, `${s.name} (${dueIn(s.id)} due)`)));
  const lengthSel = h("select", { id: "length" },
    h("option", { value: "10" }, "Normal — 10 questions"),
    h("option", { value: "5" }, "Quick — 5 questions"),
    h("option", { value: "20" }, "Long — 20 questions"),
    h("option", { value: "due" }, "Everything that's due today"),
    h("option", { value: "all" }, "Every question"));
  return h("section", { class: "card" },
    h("h1", {}, "Start a round"),
    h("p", { class: "muted" }, "Questions you're due to see come first, and the ones you find hardest come back more often."),
    h("label", {}, "Subject", subjectSel),
    h("label", {}, "How many?", lengthSel),
    h("button", { class: "primary big", onclick: () => startSession(subjectSel.value, lengthSel.value) }, "Start"));
}

function startSession(subjectId, length) {
  const t = today();
  const dueCount = state.questions.filter((q) => (subjectId === "all" || q.subjectId === subjectId) && q.due <= t).length;
  const count = length === "due" ? Math.max(dueCount, 1) : length === "all" ? Infinity : Number(length) || 10;
  const { picked } = L.pickQuestions(state.questions, { subjectId, count, today: t });
  if (!picked.length) return toast("There are no questions in that subject yet.");
  session = {
    queue: picked.map((q) => ({ id: q.id, retry: false })), index: 0, combo: 0, results: [], pointsEarned: 0, bonus: 0,
    stage: "ask", verdict: false, given: "", dontKnow: false, finished: false, newBadges: [], shown: null,
  };
  render();
}

function currentQuestion() {
  while (session.index < session.queue.length) {
    const q = state.questions.find((x) => x.id === session.queue[session.index].id);
    if (q) return q;
    session.index++; // it was deleted part-way through the round
  }
  return null;
}

function viewQuestion() {
  const q = currentQuestion();
  if (!q) { finishSession(); return viewSummary(); }
  const item = session.queue[session.index];
  const subject = state.subjects.find((s) => s.id === q.subjectId);
  const total = session.queue.length;

  if (!session.shown || session.shown.id !== q.id || session.shown.index !== session.index) {
    const correctLabel = L.acceptedAnswers(q.a)[0] || q.a;
    session.shown = { id: q.id, index: session.index, options: q.choices.length ? L.shuffle([correctLabel, ...q.choices]) : null };
  }

  const head = h("div", {},
    h("div", { class: "row space" },
      h("span", { class: "small muted" }, `Question ${Math.min(session.index + 1, total)} of ${total}`),
      session.combo >= 2 && h("span", { class: "tag" }, `🔥 ${session.combo} in a row`)),
    bar(Math.round((session.index / total) * 100), "Round progress"));

  const body = h("div", {}, 
    h("div", { class: "row", style: "margin-top:.8rem" }, h("span", { class: "tag" }, subject ? subject.name : "Question"), item.retry && h("span", { class: "tag" }, "Second chance — no points")),
    h("p", { class: "quiz-q" }, q.q));

  if (session.stage === "ask") {
    const dontKnow = h("button", { class: "ghost", onclick: () => check("", true) }, "I don't know");
    if (session.shown.options) {
      body.append(h("div", { class: "choices" }, session.shown.options.map((opt) => h("button", { onclick: () => check(opt) }, opt))), h("div", { style: "margin-top:.6rem" }, dontKnow));
    } else {
      const input = h("input", { type: "text", id: "answer", autocomplete: "off", autocapitalize: "off", spellcheck: "false", placeholder: "Type your answer", "aria-label": "Your answer",
        onkeydown: (e) => { if (e.key === "Enter") check(input.value); } });
      body.append(input, h("div", { class: "row", style: "margin-top:.7rem" }, h("button", { class: "primary", onclick: () => check(input.value) }, "Check"), dontKnow));
      setTimeout(() => input.focus(), 0);
    }
  } else {
    const ok = session.verdict;
    const right = L.acceptedAnswers(q.a).join("  /  ") || q.a;
    body.append(h("div", { class: "verdict " + (ok ? "good" : "bad"), role: "status" },
      ok ? "✅ Correct!" : session.dontKnow ? "No problem — here's the answer:" : "❌ Not quite",
      session.given && !session.shown.options && h("span", { class: "ans" }, `You wrote: ${session.given}`),
      !ok || session.shown.options ? h("span", { class: "ans" }, `Answer: ${right}`) : null));
    const last = session.index >= total - 1 && !(!ok && !item.retry);
    const next = h("button", { class: "primary", onclick: () => commit(ok) }, last ? "Finish" : "Next →");
    body.append(h("div", { class: "row" }, next,
      !ok && !session.dontKnow && !session.shown.options && session.given && h("button", { onclick: () => commit(true) }, "I was right ✔")));
    setTimeout(() => next.focus(), 0);
  }
  return h("section", { class: "card" }, head, body);
}

function check(given, dontKnow = false) {
  const q = currentQuestion();
  if (!q) return;
  session.verdict = !dontKnow && L.isCorrect(given, q.a);
  session.given = dontKnow ? "" : String(given).trim();
  session.dontKnow = dontKnow;
  session.stage = "feedback";
  render();
}

function commit(correct) {
  const q = currentQuestion();
  if (!q) return;
  const item = session.queue[session.index];
  const t = today();
  const s = state.stats;
  if (!item.retry) {
    const next = L.schedule(q, correct, t);
    q.box = next.box;
    q.due = next.due;
    if (correct) q.right++; else q.wrong++;
    s.answered++;
    if (correct) s.correct++;
    Object.assign(s, L.updateStreak(s, t));
    if (!s.days[t]) s.days[t] = { n: 0, c: 0, p: 0 };
    const d = s.days[t];
    d.n++;
    if (correct) {
      const pts = L.pointsFor(session.combo);
      s.points += pts; d.p += pts; session.pointsEarned += pts; session.combo++;
    } else {
      session.combo = 0;
    }
    if (d.n === state.settings.dailyGoal) {
      s.points += L.GOAL_BONUS; d.p += L.GOAL_BONUS; s.goalDays++; session.bonus += L.GOAL_BONUS;
      toast(`🎯 Daily goal reached! +${L.GOAL_BONUS} bonus points`);
    }
    session.results.push(correct);
    if (!correct) session.queue.splice(Math.min(session.queue.length, session.index + 4), 0, { id: q.id, retry: true }); // see it again shortly
  }
  checkBadges();
  session.index++;
  session.stage = "ask";
  session.verdict = false;
  session.given = "";
  session.dontKnow = false;
  if (session.index >= session.queue.length) finishSession();
  save();
  render();
}

function finishSession() {
  if (session.finished) return;
  session.finished = true;
  if (session.results.length >= 5 && session.results.every(Boolean)) {
    state.stats.perfectRounds++;
    toast("🎯 A perfect round!");
  }
  checkBadges();
  save();
}

function viewSummary() {
  const right = session.results.filter(Boolean).length;
  const total = session.results.length;
  const pct = total ? Math.round((right / total) * 100) : 0;
  const badges = session.newBadges.map((id) => L.BADGES.find((b) => b.id === id)).filter(Boolean);
  return h("section", { class: "card" },
    h("h1", {}, pct === 100 && total >= 5 ? "Perfect round! 🎯" : pct >= 70 ? "Nice work! 🎉" : "Round complete 💪"),
    h("div", { class: "grid2" },
      h("div", { class: "stat" }, h("b", {}, `${right}/${total}`), h("span", {}, "right first time")),
      h("div", { class: "stat" }, h("b", {}, `+${session.pointsEarned + session.bonus}`), h("span", {}, "points")),
      h("div", { class: "stat" }, h("b", {}, L.currentStreak(state.stats, today())), h("span", {}, "day streak"))),
    badges.length > 0 && h("div", { style: "margin-top:1rem" }, h("h3", {}, "New badges"),
      h("div", { class: "badges" }, badges.map((b) => h("div", { class: "badge" }, h("span", { class: "ico", "aria-hidden": "true" }, b.icon), h("b", {}, b.name), h("span", { class: "small muted" }, b.text))))),
    total - right > 0 && h("p", { class: "muted", style: "margin-top:1rem" }, `The ${plural(total - right, "question")} you missed will come back soon.`),
    h("div", { class: "row", style: "margin-top:1rem" },
      h("button", { class: "primary", onclick: () => { session = null; render(); } }, "Another round"),
      h("button", { onclick: () => { session = null; go("home"); } }, "Back home")));
}

// ======================= QUESTIONS =======================
function ensureSubject() {
  if (draft.subjectId === "__new" || !state.subjects.length) {
    const name = draft.newSubject.trim().slice(0, 60);
    if (!name) { toast("Give the new subject a name first."); return null; }
    const existing = state.subjects.find((s) => s.name.toLowerCase() === name.toLowerCase());
    if (existing) { draft.subjectId = existing.id; return existing.id; }
    const subject = { id: L.uid(), name };
    state.subjects.push(subject);
    draft.subjectId = subject.id;
    draft.newSubject = "";
    return subject.id;
  }
  return draft.subjectId;
}
function makeQuestion(subjectId, q, a, choices = []) {
  return { id: L.uid(), subjectId, q, a, choices, box: 1, due: today(), right: 0, wrong: 0 };
}
function addQuestion() {
  const q = draft.q.trim();
  const a = draft.a.trim();
  if (!q || !a) return toast("Add both a question and an answer.");
  const subjectId = ensureSubject();
  if (!subjectId) return;
  const wrong = [...new Set(draft.wrong.split(/\r?\n/).map((x) => x.trim()).filter(Boolean))].slice(0, 5);
  state.questions.push(makeQuestion(subjectId, q.slice(0, 500), a.slice(0, 300), wrong));
  state.stats.created++;
  draft.q = ""; draft.a = ""; draft.wrong = "";
  checkBadges();
  save();
  toast("Question added ✓");
  render();
  setTimeout(() => document.getElementById("new-q")?.focus(), 0);
}
function addBulk() {
  const { items, skipped } = L.parseBulk(draft.bulk);
  if (!items.length) return toast("Nothing to add — write each one as: question | answer");
  const subjectId = ensureSubject();
  if (!subjectId) return;
  for (const it of items) state.questions.push(makeQuestion(subjectId, it.q, it.a));
  state.stats.created += items.length;
  draft.bulk = "";
  checkBadges();
  save();
  toast(`Added ${plural(items.length, "question")}${skipped ? ` (${skipped} skipped)` : ""} ✓`);
  render();
}
function deleteQuestion(id) {
  state.questions = state.questions.filter((q) => q.id !== id);
  save();
  render();
}
function deleteSubject(id) {
  const s = state.subjects.find((x) => x.id === id);
  if (!s) return;
  const n = state.questions.filter((q) => q.subjectId === id).length;
  if (!confirm(`Delete "${s.name}" and its ${plural(n, "question")}? This can't be undone.`)) return;
  state.subjects = state.subjects.filter((x) => x.id !== id);
  state.questions = state.questions.filter((q) => q.subjectId !== id);
  draft.filter = "all";
  draft.subjectId = "";
  session = null;
  save();
  render();
}

function viewQuestions() {
  if (draft.subjectId !== "__new" && !state.subjects.some((s) => s.id === draft.subjectId)) draft.subjectId = state.subjects[0] ? state.subjects[0].id : "__new";
  if (draft.filter !== "all" && !state.subjects.some((s) => s.id === draft.filter)) draft.filter = "all";

  const subjectPicker = h("div", {},
    state.subjects.length > 0 && h("label", {}, "Subject",
      h("select", { id: "form-subject", onchange: (e) => { draft.subjectId = e.target.value; render(); } },
        state.subjects.map((s) => h("option", { value: s.id, selected: s.id === draft.subjectId }, s.name)),
        h("option", { value: "__new", selected: draft.subjectId === "__new" }, "＋ New subject…"))),
    (draft.subjectId === "__new" || !state.subjects.length) && h("label", {}, "New subject name",
      h("input", { type: "text", maxlength: 60, placeholder: "e.g. Biology", value: draft.newSubject, oninput: (e) => { draft.newSubject = e.target.value; } })));

  const form = h("section", { class: "card" },
    h("h2", {}, "Add a question"),
    subjectPicker,
    h("label", {}, "Question", h("textarea", { id: "new-q", maxlength: 500, placeholder: "What is the powerhouse of the cell?", oninput: (e) => { draft.q = e.target.value; } }, draft.q)),
    h("label", {}, "Answer", h("input", { type: "text", maxlength: 300, placeholder: "Mitochondria", value: draft.a, oninput: (e) => { draft.a = e.target.value; },
      onkeydown: (e) => { if (e.key === "Enter") addQuestion(); } }),
      h("span", { class: "small muted" }, "Tip: write several accepted answers with a semicolon, like  7; seven")),
    h("label", {}, "Wrong options (optional)", h("textarea", { maxlength: 1000, placeholder: "One per line. Fill these in to make it multiple choice.", oninput: (e) => { draft.wrong = e.target.value; } }, draft.wrong)),
    h("button", { class: "primary", onclick: addQuestion }, "Add question"));

  const bulk = h("section", { class: "card" },
    h("h2", {}, "Add lots at once"),
    h("p", { class: "muted small" }, "Paste one per line, like  Capital of Spain | Madrid  (uses the subject chosen above). Handy for pasting from a spreadsheet, too."),
    h("textarea", { "aria-label": "Questions to add", style: "min-height:8rem", placeholder: "What is 7 x 8? | 56\nCapital of Italy | Rome", oninput: (e) => { draft.bulk = e.target.value; } }, draft.bulk),
    h("button", { style: "margin-top:.6rem", onclick: addBulk }, "Add all"));

  const listBox = h("div", {});
  const fillList = () => {
    const needle = draft.search.trim().toLowerCase();
    const shown = state.questions.filter((q) => (draft.filter === "all" || q.subjectId === draft.filter) && (!needle || q.q.toLowerCase().includes(needle) || q.a.toLowerCase().includes(needle)));
    const names = new Map(state.subjects.map((s) => [s.id, s.name]));
    listBox.replaceChildren(...[
      shown.length === 0 && h("p", { class: "muted" }, state.questions.length ? "No questions match." : "No questions yet."),
      ...shown.slice(0, 150).map((q) => h("div", { class: "item" },
        h("div", { class: "txt" }, h("div", {}, q.q), h("div", { class: "a" }, `Answer: ${q.a}${q.choices.length ? "  ·  multiple choice" : ""}`),
          h("div", { class: "small muted" }, `${names.get(q.subjectId) || ""} · box ${q.box}/5 · next ${q.due <= today() ? "now" : niceDate(q.due)}`)),
        h("button", { class: "ghost small danger", "aria-label": `Delete question: ${q.q}`, onclick: () => deleteQuestion(q.id) }, "✕"))),
      shown.length > 150 && h("p", { class: "muted small" }, `Showing the first 150 of ${shown.length}. Use the search box to narrow it down.`),
    ].filter(Boolean));
  };
  const list = h("section", { class: "card" },
    h("div", { class: "row space" }, h("h2", {}, `Your questions (${state.questions.length})`),
      draft.filter !== "all" && h("button", { class: "ghost small danger", onclick: () => deleteSubject(draft.filter) }, "Delete this subject")),
    h("div", { class: "row" },
      h("select", { class: "grow", "aria-label": "Show subject", onchange: (e) => { draft.filter = e.target.value; render(); } },
        h("option", { value: "all", selected: draft.filter === "all" }, "All subjects"),
        state.subjects.map((s) => h("option", { value: s.id, selected: s.id === draft.filter }, s.name))),
      h("input", { class: "grow", type: "search", placeholder: "Search…", "aria-label": "Search questions", value: draft.search, oninput: (e) => { draft.search = e.target.value; fillList(); } })),
    listBox);
  fillList();

  const importInput = h("input", { type: "file", accept: "application/json,.json", hidden: true, onchange: importData });
  const data = h("section", { class: "card" },
    h("h2", {}, "Backup"),
    h("p", { class: "muted small" }, "Everything is saved in this browser on this device. Download a backup now and then — you can load it on another device or after clearing your browser."),
    h("div", { class: "row" },
      h("button", { onclick: exportData }, "Download backup"),
      h("button", { onclick: () => importInput.click() }, "Load a backup"),
      h("button", { class: "danger", onclick: resetAll }, "Erase everything"),
      importInput));

  return h("div", {}, form, bulk, list, data);
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = h("a", { href: url, download: `revision-backup-${today()}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
async function importData(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const next = L.sanitiseState(JSON.parse(await file.text()));
    if (!confirm(`Replace everything with this backup (${plural(next.questions.length, "question")}, ${next.stats.points} points)?`)) return;
    state = next;
    session = null;
    save();
    toast("Backup loaded ✓");
    render();
  } catch (err) {
    toast(err instanceof SyntaxError ? "That file couldn't be read." : err.message);
  }
}
function resetAll() {
  if (!confirm("Erase all your questions, points and badges? This can't be undone.")) return;
  state = L.emptyState();
  session = null;
  save();
  render();
}

// ======================= REWARDS =======================
function viewRewards() {
  const s = state.stats;
  const t = today();
  const lvl = L.levelFor(s.points);
  const balance = s.points - s.spent;
  const streak = L.currentStreak(s, t);

  const goalInput = h("input", { type: "number", min: 1, max: 200, value: state.settings.dailyGoal, "aria-label": "Daily goal in questions",
    onchange: (e) => {
      const n = Math.round(Number(e.target.value));
      state.settings.dailyGoal = Number.isFinite(n) ? Math.min(200, Math.max(1, n)) : L.DEFAULT_GOAL;
      save();
      render();
    } });

  const addTreat = () => {
    const name = draft.treatName.trim().slice(0, 60);
    const cost = Math.round(Number(draft.treatCost));
    if (!name || !Number.isFinite(cost) || cost < 1) return toast("Give the reward a name and a points cost.");
    if (state.treats.length >= 30) return toast("That's plenty of rewards — remove one first.");
    state.treats.push({ id: L.uid(), name, cost: Math.min(100000, cost) });
    draft.treatName = ""; draft.treatCost = "";
    save();
    render();
  };
  const redeem = (tr) => {
    if (s.points - s.spent < tr.cost) return;
    s.spent += tr.cost;
    state.redeemed.unshift({ name: tr.name, cost: tr.cost, date: t });
    state.redeemed.length = Math.min(state.redeemed.length, 50);
    save();
    toast(`Enjoy: ${tr.name} 🎉`);
    render();
  };

  return h("div", {},
    h("section", { class: "card" },
      h("h1", {}, `Level ${lvl.level}`),
      bar(lvl.pct, "Progress to next level"),
      h("p", { class: "small muted", style: "margin:.4rem 0 1rem" }, `${lvl.next - s.points} points to level ${lvl.level + 1}`),
      h("div", { class: "grid2" },
        h("div", { class: "stat" }, h("b", {}, s.points), h("span", {}, "points earned")),
        h("div", { class: "stat" }, h("b", {}, balance), h("span", {}, "points to spend")),
        h("div", { class: "stat" }, h("b", {}, streak), h("span", {}, "day streak")),
        h("div", { class: "stat" }, h("b", {}, s.bestStreak), h("span", {}, "best streak")))),
    h("section", { class: "card" },
      h("h2", {}, "Your rewards"),
      h("p", { class: "muted small" }, "Make a list of treats you'd like to earn and spend your points on them. Spending points doesn't lower your level."),
      state.treats.map((tr) => h("div", { class: "item" },
        h("div", { class: "txt" }, h("b", {}, tr.name), h("div", { class: "a" }, `${tr.cost} points`)),
        h("div", { class: "row" },
          h("button", { class: "primary small", disabled: balance < tr.cost, onclick: () => redeem(tr) }, "Redeem"),
          h("button", { class: "ghost small danger", "aria-label": `Remove reward ${tr.name}`, onclick: () => { state.treats = state.treats.filter((x) => x.id !== tr.id); save(); render(); } }, "✕")))),
      h("div", { class: "row", style: "margin-top:.8rem" },
        h("input", { class: "grow", type: "text", maxlength: 60, placeholder: "New reward, e.g. Watch an episode", "aria-label": "Reward name", value: draft.treatName, oninput: (e) => { draft.treatName = e.target.value; } }),
        h("input", { style: "max-width:8rem", type: "number", min: 1, placeholder: "Points", "aria-label": "Points cost", value: draft.treatCost, oninput: (e) => { draft.treatCost = e.target.value; } }),
        h("button", { onclick: addTreat }, "Add")),
      state.redeemed.length > 0 && h("div", { style: "margin-top:1rem" }, h("h3", {}, "Recently enjoyed"),
        state.redeemed.slice(0, 5).map((r) => h("p", { class: "small muted", style: "margin:0" }, `${niceDate(r.date)} — ${r.name} (${r.cost} points)`)))),
    h("section", { class: "card" },
      h("h2", {}, "Badges"),
      h("p", { class: "muted small" }, `${L.BADGES.filter((b) => s.badges[b.id]).length} of ${L.BADGES.length} unlocked`),
      h("div", { class: "badges" }, L.BADGES.map((b) => {
        const when = s.badges[b.id];
        return h("div", { class: "badge" + (when ? "" : " locked") },
          h("span", { class: "ico", "aria-hidden": "true" }, b.icon), h("b", {}, b.name),
          h("span", { class: "small muted" }, when ? `Unlocked ${niceDate(when)}` : b.text));
      }))),
    h("section", { class: "card" },
      h("h2", {}, "Daily goal"),
      h("p", { class: "muted small" }, `Answer this many questions a day to earn ${L.GOAL_BONUS} bonus points.`),
      h("label", {}, "Questions per day", goalInput)));
}

// ======================= START =======================
function init() {
  state = load();
  const fromHash = location.hash.slice(1);
  if (TAB_IDS.includes(fromHash)) tab = fromHash;
  window.addEventListener("hashchange", () => {
    const id = location.hash.slice(1);
    if (TAB_IDS.includes(id) && id !== tab) { tab = id; render(); }
  });
  render();
}
init();
