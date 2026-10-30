import * as L from "./logic.js";
import * as Shop from "./shop.js";
import { CONFIG } from "./config.js";
import { createCloud, displayName } from "./cloud.js";

const LOCAL_KEY = "revise-app-v1"; // used when logins aren't switched on, and for progress made before accounts existed
const TABS = [["home", "🏠", "Home"], ["revise", "📝", "Revise"], ["questions", "✏️", "Questions"], ["rewards", "🏆", "Rewards"], ["farm", "🌾", "Farm"]];
const TAB_IDS = TABS.map((t) => t[0]);
const CATALOGUE = new Set(Shop.ITEMS.map((i) => i.id));

const cloud = createCloud(CONFIG, { storage: safeStorage() });
let state = null;
let storeKey = LOCAL_KEY;
let tab = "home";
let session = null;
let storageOk = true;
let booting = true;
let sync = "idle"; // idle | saving | saved | offline | error
let syncNote = "";
let pushTimer = null;
let retryTimer = null;
let retryDelay = 15000;
let lastChest = null;
const auth = { mode: "in", username: "", password: "", confirm: "", error: "", busy: false };
const draft = {
  subjectId: "", newSubject: "", q: "", a: "", wrong: "",
  topic: "", level: "GCSE", count: "10", style: "mixed", busy: false, progress: "", aiError: "", prompt: "",
  pet: "buddy", paste: "", preview: null, filter: "all", search: "", treatName: "", treatCost: "",
};

function safeStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

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

// ---------- looks you've unlocked ----------
function ensureLink(id, href) {
  let link = document.getElementById(id);
  if (!link) { link = document.createElement("link"); link.id = id; link.setAttribute("rel", "stylesheet"); document.head.append(link); }
  if (link.getAttribute("href") !== href) link.setAttribute("href", href);
}
function applyLook() {
  const root = document.documentElement;
  const eq = state ? state.equipped : { palette: "", font: "", hat: "" };
  const pal = Shop.itemById(eq.palette);
  if (pal) {
    root.setAttribute("data-palette", pal.name.toLowerCase().replace(/\s+/g, "-"));
    root.style.setProperty("--pal-bg", pal.bg);
    root.style.setProperty("--pal-ink", pal.ink);
  } else {
    root.removeAttribute("data-palette");
    root.style.removeProperty("--pal-bg");
    root.style.removeProperty("--pal-ink");
  }
  const font = Shop.itemById(eq.font);
  if (font) {
    ensureLink("look-font", `https://fonts.googleapis.com/css2?family=${font.family}&display=swap`);
    root.style.setProperty("--font-display", font.css);
  } else {
    root.style.removeProperty("--font-display");
  }
}
function loadFontPreviews() {
  const families = Shop.itemsOfKind("font").map((f) => `family=${f.family}`).join("&");
  ensureLink("look-previews", `https://fonts.googleapis.com/css2?${families}&display=swap`);
}

// ---------- saving ----------
function readLocal(key) {
  const store = safeStorage();
  if (!store) return null;
  let raw = null;
  try {
    raw = store.getItem(key);
    if (raw) return L.sanitiseState(JSON.parse(raw), CATALOGUE);
  } catch (e) {
    console.warn("Couldn't read saved data", e);
    try { if (raw) store.setItem(key + "-damaged", raw); } catch { /* nothing more we can do */ }
  }
  return null;
}
function writeLocal() {
  try {
    safeStorage().setItem(storeKey, JSON.stringify(state));
    storageOk = true;
  } catch (e) {
    console.warn("Couldn't save", e);
    storageOk = false;
  }
}
function save() {
  if (!state) return;
  const days = state.stats.days;
  for (const k of Object.keys(days).sort().slice(0, -200)) delete days[k];
  for (const k of Object.keys(state.claims).sort().slice(0, -60)) delete state.claims[k];
  state.savedAt = new Date().toISOString();
  writeLocal();
  if (cloud.signedIn) schedulePush(1500);
}
function showSync() {
  const el = document.getElementById("sync");
  if (!el) return;
  const text = { saving: "☁ Saving…", saved: "☁ Saved", offline: "☁ Offline — will retry", error: "☁ Not saved — will retry", idle: "" }[sync] || "";
  el.textContent = text;
  el.setAttribute("title", syncNote);
  el.className = "sync" + (sync === "offline" || sync === "error" ? " warn" : "");
}
function schedulePush(delay) {
  sync = "saving";
  clearTimeout(pushTimer);
  clearTimeout(retryTimer);
  pushTimer = setTimeout(push, delay);
  showSync();
}
async function push() {
  pushTimer = null;
  if (!cloud.signedIn || !state) return;
  const stamp = state.savedAt;
  try {
    await cloud.saveData(state);
    retryDelay = 15000;
    if (state && state.savedAt === stamp && !pushTimer) { sync = "saved"; syncNote = ""; }
  } catch (e) {
    if (!cloud.signedIn) { sessionEnded(); return; }
    sync = e.code === "offline" ? "offline" : "error";
    syncNote = e.message;
    clearTimeout(retryTimer);
    retryTimer = setTimeout(push, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 120000);
  }
  showSync();
}
function sessionEnded() {
  state = null; session = null; sync = "idle";
  auth.error = "Your session ended — please sign in again.";
  applyLook();
  render();
}
async function pullIfNewer() {
  if (!cloud.signedIn || !state || session || pushTimer || sync === "saving") return;
  try {
    const row = await cloud.loadData();
    if (!row || !state || session) return;
    const remote = L.sanitiseState(row.data, CATALOGUE);
    if (remote.savedAt > state.savedAt) {
      state = remote;
      writeLocal();
      applyLook();
      toast("Updated from your other device ✓");
      render();
    }
  } catch { /* try again next time */ }
}

// ---------- signing in ----------
async function enterApp() {
  storeKey = `revise-app-v2-${cloud.user.id}`;
  const cached = readLocal(storeKey);
  let remote = null;
  let note = "";
  try {
    const row = await cloud.loadData();
    if (row) remote = L.sanitiseState(row.data, CATALOGUE);
    sync = "saved";
  } catch (e) {
    if (!cloud.signedIn) { sessionEnded(); return; }
    sync = e.code === "offline" ? "offline" : "error";
    syncNote = note = e.message;
  }
  const old = readLocal(LOCAL_KEY); // progress made on this device before accounts existed
  let adopted = false;
  if (remote && cached) state = cached.savedAt > remote.savedAt ? cached : remote;
  else state = remote || cached;
  const needPush = !remote || state !== remote;
  if (!state) { state = old || L.starterState(today()); adopted = Boolean(old); }
  booting = false;
  tab = TAB_IDS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "home";
  auth.password = ""; auth.confirm = ""; auth.error = "";
  applyLook();
  if (needPush || adopted) save(); else writeLocal();
  if (adopted) toast("Progress from this device was moved into your account ✓");
  render();
  if (note) toast(note);
}
async function submitAuth() {
  if (auth.busy) return;
  const username = auth.username.trim();
  auth.error = "";
  if (!username || !auth.password) { auth.error = "Enter a username and password."; return render(); }
  if (auth.mode === "up" && auth.password !== auth.confirm) { auth.error = "The two passwords don't match."; return render(); }
  auth.busy = true; render();
  try {
    if (auth.mode === "up") await cloud.signUp(username, auth.password); else await cloud.signIn(username, auth.password);
    auth.busy = false;
    await enterApp();
  } catch (e) {
    auth.busy = false;
    auth.error = e.message || "Something went wrong.";
    render();
  }
}
async function signOut() {
  if (pushTimer) { clearTimeout(pushTimer); await push(); }
  clearTimeout(retryTimer);
  await cloud.signOut();
  auth.mode = "in"; auth.password = ""; auth.confirm = ""; auth.error = "";
  state = null; session = null; sync = "idle";
  applyLook();
  render();
}

function checkBadges() {
  for (const id of L.newBadges(state)) {
    const b = L.BADGES.find((x) => x.id === id);
    state.stats.badges[id] = today();
    toast(`${b.icon} Badge unlocked: ${b.name}`);
    if (session) session.newBadges.push(id);
  }
}

// ---------- navigation and page frame ----------
function go(id) {
  if (id !== tab) lastChest = null;
  tab = id;
  if (location.hash !== "#" + id) location.hash = id;
  render();
  window.scrollTo(0, 0);
}
function render() {
  const nav = document.getElementById("nav");
  const user = document.getElementById("user");
  const app = document.getElementById("app");
  const inApp = Boolean(state) && !booting;
  nav.replaceChildren(...(inApp ? TABS.map(([id, icon, label]) =>
    h("button", { type: "button", class: "tab" + (tab === id ? " active" : ""), "aria-current": tab === id ? "page" : undefined, onclick: () => go(id) },
      h("span", { "aria-hidden": "true" }, icon), h("span", {}, label))) : []));
  user.replaceChildren(...(inApp && cloud.signedIn ? [
    h("span", { id: "sync", class: "sync" }),
    h("span", { class: "who" }, `👤 ${displayName(cloud.user.email, CONFIG.usernameDomain)}`),
    h("button", { class: "small ghost", onclick: signOut }, "Sign out"),
  ] : []));
  let view;
  if (booting) view = h("p", { class: "muted" }, "Loading…");
  else if (!state) view = viewAuth();
  else view = { home: viewHome, revise: viewRevise, questions: viewQuestions, rewards: viewRewards, farm: viewFarm }[tab]();
  app.replaceChildren(...[
    inApp && !storageOk && h("div", { class: "banner", role: "alert" }, "This browser isn't letting the app save on this device. " + (cloud.signedIn ? "Your account copy is still saved." : "Your progress will be lost when you close the page — try turning off private browsing.")),
    view,
  ].filter(Boolean));
  showSync();
}

// ======================= SIGN IN =======================
function viewAuth() {
  const up = auth.mode === "up";
  const field = (label, key, type, extra = {}) =>
    h("label", {}, label, h("input", { type, value: auth[key], maxlength: 60, autocapitalize: "off", spellcheck: "false", ...extra,
      oninput: (e) => { auth[key] = e.target.value; },
      onkeydown: (e) => { if (e.key === "Enter") submitAuth(); } }));
  return h("section", { class: "card auth" },
    h("h1", {}, "📝 Revise"),
    h("p", { class: "muted" }, "Sign in to keep your questions, points and streak safe on every device."),
    h("div", { class: "row", role: "tablist" },
      h("button", { class: up ? "" : "primary", onclick: () => { auth.mode = "in"; auth.error = ""; render(); } }, "Sign in"),
      h("button", { class: up ? "primary" : "", onclick: () => { auth.mode = "up"; auth.error = ""; render(); } }, "Create account")),
    h("div", { style: "margin-top:1rem" },
      field("Username", "username", "text", { autocomplete: "username", placeholder: "e.g. jamie_t" }),
      field("Password", "password", "password", { autocomplete: up ? "new-password" : "current-password" }),
      up && field("Repeat password", "confirm", "password", { autocomplete: "new-password" })),
    auth.error && h("div", { class: "banner", role: "alert" }, auth.error),
    h("button", { class: "primary big", disabled: auth.busy, onclick: submitAuth }, auth.busy ? "One moment…" : up ? "Create account" : "Sign in"),
    up && h("p", { class: "small muted", style: "margin-top:.75rem" }, "No email needed. Because of that there's no “forgot password”, so choose one you'll remember. Use 3–30 letters, numbers, dots, dashes or underscores for your username."));
}

// ======================= HOME =======================
function buddyEl() {
  const lvl = L.levelFor(state.stats.points);
  const b = L.buddyFor(lvl.level);
  const hat = Shop.itemById(state.equipped.hat);
  return h("div", { class: "buddy", "aria-hidden": "true" }, hat && h("span", { class: "hat" }, hat.emoji), h("span", { class: "pet" }, b.emoji));
}
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
  const buddy = L.buddyFor(lvl.level);
  const claimable = L.weeklyQuests(state, t).filter((q) => q.done && !q.claimed).length;

  const cta = !state.questions.length
    ? h("button", { class: "primary big", onclick: () => go("questions") }, "Add your first questions")
    : h("button", { class: "primary big", onclick: () => go("revise") }, due ? `Start revising — ${plural(due, "question")} due` : "Nothing due — practise anyway");

  return h("div", {},
    h("section", { class: "card" },
      h("div", { class: "row" },
        buddyEl(),
        h("div", { class: "grow" },
          h("h1", {}, streak >= 2 ? `🔥 ${streak} day streak!` : "Ready to revise?"),
          h("p", { class: "muted", style: "margin:0" }, `${state.buddy.name} the ${buddy.title} ${L.buddyMood(state, t)}`))),
      h("div", { class: "grid2", style: "margin-top:.9rem" },
        h("div", { class: "stat" }, h("b", {}, `Level ${lvl.level}`), h("span", {}, `${s.points} points`)),
        h("div", { class: "stat" }, h("b", {}, streak), h("span", {}, "day streak")),
        h("div", { class: "stat" }, h("b", {}, s.answered ? `${Math.round((s.correct / s.answered) * 100)}%` : "–"), h("span", {}, "answered right"))),
      h("p", { class: "small muted", style: "margin-top:.75rem" }, `${lvl.next - s.points} points to level ${lvl.level + 1}`),
      bar(lvl.pct, "Progress to next level")),
    (state.chests > 0 || claimable > 0) && h("section", { class: "card prize" },
      h("div", { class: "row space" },
        h("div", {}, state.chests > 0 && h("b", {}, `🎁 You have ${plural(state.chests, "chest")} to open!`), state.chests > 0 && claimable > 0 && h("br"), claimable > 0 && h("b", {}, `📜 ${plural(claimable, "quest reward")} ready to claim`)),
        h("button", { class: "primary", onclick: () => go("rewards") }, "Go to rewards"))),
    h("section", { class: "card" },
      h("div", { class: "row space" }, h("h2", {}, "Today"), h("span", { class: "muted small" }, `${day.n} of ${goal} questions`)),
      bar(Math.round((day.n / goal) * 100), "Today's goal"),
      h("p", { class: "small muted", style: "margin:.5rem 0 1rem" }, day.g || day.n >= goal ? "Goal reached! 🎉 Today's chest is yours." : `${goal - day.n} more to reach your daily goal and earn a chest 🎁.`),
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
    queue: picked.map((q) => ({ id: q.id, retry: false })), index: 0, combo: 0, results: [], pointsEarned: 0, chests: 0,
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
    const subject = state.subjects.find((x) => x.id === q.subjectId);
    const stageBefore = subject ? L.petFor(state, subject, t).stage : 0;
    const next = L.schedule(q, correct, t);
    q.box = next.box;
    q.due = next.due;
    if (correct) q.right++; else q.wrong++;
    if (correct && subject) {
      subject.xp = (subject.xp || 0) + 1;
      const pet = L.petFor(state, subject, t);
      if (pet.stage > stageBefore) toast(`🌟 ${pet.name} grew into a ${pet.title.toLowerCase()} ${pet.emoji}`);
    }
    s.answered++;
    if (correct) s.correct++;
    Object.assign(s, L.updateStreak(s, t));
    if (!s.days[t]) s.days[t] = { n: 0, c: 0, p: 0 };
    const d = s.days[t];
    d.n++;
    if (correct) {
      d.c++;
      const pts = L.pointsFor(session.combo);
      s.points += pts; d.p += pts; session.pointsEarned += pts; session.combo++;
    } else {
      session.combo = 0;
    }
    if (d.n >= state.settings.dailyGoal && !d.g) {
      d.g = true; state.chests++; s.goalDays++; session.chests++;
      toast("🎁 Daily goal reached! You earned a chest");
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
      h("div", { class: "stat" }, h("b", {}, `+${session.pointsEarned}`), h("span", {}, "points")),
      h("div", { class: "stat" }, h("b", {}, L.currentStreak(state.stats, today())), h("span", {}, "day streak"))),
    session.chests > 0 && h("p", { class: "verdict good", style: "margin-top:1rem" }, "🎁 You earned a chest for reaching your daily goal — open it in Rewards!"),
    badges.length > 0 && h("div", { style: "margin-top:1rem" }, h("h3", {}, "New badges"),
      h("div", { class: "badges" }, badges.map((b) => h("div", { class: "badge" }, h("span", { class: "ico", "aria-hidden": "true" }, b.icon), h("b", {}, b.name), h("span", { class: "small muted" }, b.text))))),
    total - right > 0 && h("p", { class: "muted", style: "margin-top:1rem" }, `The ${plural(total - right, "question")} you missed will come back soon.`),
    h("div", { class: "row", style: "margin-top:1rem" },
      h("button", { class: "primary", onclick: () => { session = null; render(); } }, "Another round"),
      session.chests > 0 && h("button", { onclick: () => { session = null; go("rewards"); } }, "Open chest"),
      h("button", { onclick: () => { session = null; go("home"); } }, "Back home")));
}

// ======================= QUESTIONS =======================
function ensureSubject(fallbackName = "") {
  if (draft.subjectId === "__new" || !state.subjects.length) {
    const name = (draft.newSubject.trim() || fallbackName.trim()).slice(0, 60);
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
const makeQuestion = (subjectId, q, a, choices = []) => ({ id: L.uid(), subjectId, q, a, choices, box: 1, due: today(), right: 0, wrong: 0 });

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

function setPreview(source, items, skipped = 0) {
  const real = state.subjects.some((s) => s.id === draft.subjectId) ? draft.subjectId : "";
  const marked = L.markDuplicates(items, state.questions, real);
  draft.preview = { source, skipped, items: marked.map((it) => ({ ...it, keep: !it.duplicate })) };
}
function checkPaste() {
  const r = L.parseQuestionList(draft.paste);
  if (!r.items.length) return toast("I couldn't find any questions in that. Try one per line like:  question | answer");
  setPreview("paste", r.items, r.skipped);
  render();
}
const MAX_COUNT = 50;
function wantedCount() { return Math.max(1, Math.min(MAX_COUNT, Math.round(Number(draft.count)) || 10)); }
async function makeWithAi() {
  const topic = draft.topic.trim();
  if (!topic) return toast("Type a topic first.");
  const total = wantedCount();
  draft.count = String(total);
  draft.busy = true; draft.aiError = ""; draft.progress = ""; render();
  const items = [];
  const seen = new Set();
  let failure = "";
  try {
    // The AI writes up to 15 at a time, so bigger amounts are asked for in rounds.
    for (let guard = 0; items.length < total && guard < 6; guard++) {
      if (total > 15) { draft.progress = `Writing… ${items.length} of ${total}`; render(); }
      const ask = Math.min(15, total - items.length);
      const r = await cloud.generate({ topic, level: draft.level, count: ask, style: draft.style, avoid: items.slice(-30).map((x) => x.q) });
      const got = (Array.isArray(r && r.questions) ? r.questions : []).filter((x) => x && x.q && x.a);
      let fresh = 0;
      for (const x of got) {
        const k = L.normalise(x.q);
        if (seen.has(k) || items.length >= total) continue;
        seen.add(k); items.push(x); fresh++;
      }
      if (!fresh) break;
    }
  } catch (e) {
    failure = e.message || "Something went wrong.";
    if (!cloud.signedIn) { draft.busy = false; draft.progress = ""; return sessionEnded(); }
  }
  draft.busy = false; draft.progress = "";
  if (items.length) {
    setPreview("ai", items);
    if (items.length < total) draft.aiError = `I managed ${items.length} of the ${total} you asked for${failure ? " (" + failure + ")" : ""}. You can press the button again for more.`;
  } else {
    draft.aiError = failure || "Nothing came back — try again.";
  }
  render();
}
async function copyPrompt() {
  draft.prompt = L.buildAiPrompt({ topic: draft.topic, level: draft.level, count: wantedCount(), style: draft.style });
  let copied = false;
  try { await navigator.clipboard.writeText(draft.prompt); copied = true; } catch { copied = false; }
  toast(copied ? "Prompt copied — paste it into another AI ✓" : "Copy the prompt from the box below.");
  render();
}
function addPreview() {
  const keep = draft.preview.items.filter((it) => it.keep);
  if (!keep.length) return toast("Tick at least one question to add.");
  const subjectId = ensureSubject(draft.topic);
  if (!subjectId) return;
  for (const it of keep) state.questions.push(makeQuestion(subjectId, it.q, it.a, it.choices || []));
  state.stats.created += keep.length;
  draft.preview = null; draft.paste = ""; draft.prompt = "";
  checkBadges();
  save();
  toast(`Added ${plural(keep.length, "question")} ✓`);
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

  const subjectCard = h("section", { class: "card" },
    h("h2", {}, "Which subject?"),
    h("p", { class: "muted small" }, "New questions go into this subject."),
    state.subjects.length > 0 && h("label", {}, "Add to",
      h("select", { id: "form-subject", onchange: (e) => { draft.subjectId = e.target.value; render(); } },
        state.subjects.map((s) => h("option", { value: s.id, selected: s.id === draft.subjectId }, s.name)),
        h("option", { value: "__new", selected: draft.subjectId === "__new" }, "＋ New subject…"))),
    (draft.subjectId === "__new" || !state.subjects.length) && h("label", {}, "New subject name",
      h("input", { type: "text", maxlength: 60, placeholder: "e.g. Biology (leave blank to use the topic below)", value: draft.newSubject, oninput: (e) => { draft.newSubject = e.target.value; } })));

  const opt = (value, label, current) => h("option", { value, selected: value === current }, label);
  const makeCard = h("section", { class: "card" },
    h("h2", {}, "Make questions on a topic"),
    h("p", { class: "muted small" }, "Type what you're revising and the app can write the questions for you — or copy a ready-made prompt for any other AI."),
    h("label", {}, "Topic", h("input", { type: "text", maxlength: 120, placeholder: "e.g. Photosynthesis, or The causes of World War 1", value: draft.topic, oninput: (e) => { draft.topic = e.target.value; },
      onkeydown: (e) => { if (e.key === "Enter" && cloud.enabled) makeWithAi(); } })),
    h("div", { class: "grid2" },
      h("label", {}, "Level", h("select", { onchange: (e) => { draft.level = e.target.value; } }, L.LEVELS.map((x) => opt(x, x, draft.level)))),
      h("label", {}, `How many (1–${MAX_COUNT})`, h("input", { type: "number", inputmode: "numeric", min: "1", max: String(MAX_COUNT), step: "1", value: draft.count, "aria-label": "How many questions",
        oninput: (e) => { draft.count = e.target.value; }, onblur: (e) => { draft.count = String(wantedCount()); e.target.value = draft.count; } }),
        h("span", { class: "row", style: "gap:.35rem;margin-top:.35rem" }, [5, 10, 15, 25, 40].map((n) => h("button", { type: "button", class: "small" + (String(n) === String(draft.count) ? " primary" : ""), onclick: () => { draft.count = String(n); render(); } }, String(n))))),
      h("label", {}, "Style", h("select", { onchange: (e) => { draft.style = e.target.value; } }, [["mixed", "Mix of both"], ["typed", "Type the answer"], ["choice", "Multiple choice"]].map(([v, l]) => opt(v, l, draft.style))))),
    draft.aiError && h("div", { class: "banner", role: "alert" }, draft.aiError),
    h("div", { class: "row" },
      cloud.enabled && h("button", { class: "primary", disabled: draft.busy, onclick: makeWithAi }, draft.busy ? (draft.progress || "Writing questions…") : "✨ Make questions for me"),
      h("button", { onclick: copyPrompt }, "Copy a prompt for another AI")),
    !cloud.enabled && h("p", { class: "small muted", style: "margin:.6rem 0 0" }, "Making questions inside the app needs sign-in to be switched on (see README). Until then, copy the prompt, paste it into another AI, and paste its answer below."),
    cloud.enabled && h("p", { class: "small muted", style: "margin:.6rem 0 0" }, "AI can make mistakes — check the answers against your notes before adding them."),
    draft.prompt && h("label", { style: "margin-top:.8rem" }, "Prompt to copy",
      h("textarea", { readonly: true, style: "min-height:11rem", onfocus: (e) => e.target.select?.() }, draft.prompt)));

  const pasteCard = h("section", { class: "card" },
    h("h2", {}, "Paste a list of questions"),
    h("p", { class: "muted small" }, "Paste what another AI wrote, or rows from a spreadsheet. One per line, like  Capital of Spain | Madrid | Paris | Rome | Lisbon  (the last three are optional wrong options). Tables, Q:/A: lists and JSON work too."),
    h("textarea", { "aria-label": "Questions to add", style: "min-height:8rem", placeholder: "What is 7 x 8? | 56\nCapital of Italy | Rome | Milan | Turin | Pisa", oninput: (e) => { draft.paste = e.target.value; } }, draft.paste),
    h("button", { style: "margin-top:.6rem", onclick: checkPaste }, "Check the list"));

  let previewCard = null;
  if (draft.preview) {
    const p = draft.preview;
    const picked = p.items.filter((it) => it.keep).length;
    previewCard = h("section", { class: "card prize" },
      h("h2", {}, `Check these before adding (${p.items.length})`),
      p.source === "ai" && h("p", { class: "small muted" }, "Made by AI — untick anything that looks wrong."),
      p.skipped > 0 && h("p", { class: "small muted" }, `${plural(p.skipped, "line")} couldn't be read and ${p.skipped === 1 ? "was" : "were"} skipped.`),
      p.items.map((it) => h("label", { class: "pick" },
        h("input", { type: "checkbox", checked: it.keep, onchange: (e) => { it.keep = e.target.checked; render(); } }),
        h("span", {}, h("b", {}, it.q), h("span", { class: "a" }, `Answer: ${it.a}${it.choices && it.choices.length ? `  ·  wrong options: ${it.choices.join(", ")}` : ""}`), it.duplicate && h("span", { class: "tag" }, "already in this subject")))),
      h("div", { class: "row", style: "margin-top:.8rem" },
        h("button", { class: "primary", onclick: addPreview }, `Add ${plural(picked, "question")}`),
        h("button", { onclick: () => { draft.preview = null; render(); } }, "Cancel")));
  }

  const oneCard = h("section", { class: "card" },
    h("h2", {}, "Add one question"),
    h("label", {}, "Question", h("textarea", { id: "new-q", maxlength: 500, placeholder: "What is the powerhouse of the cell?", oninput: (e) => { draft.q = e.target.value; } }, draft.q)),
    h("label", {}, "Answer", h("input", { type: "text", maxlength: 300, placeholder: "Mitochondria", value: draft.a, oninput: (e) => { draft.a = e.target.value; },
      onkeydown: (e) => { if (e.key === "Enter") addQuestion(); } }),
      h("span", { class: "small muted" }, "Tip: write several accepted answers with a semicolon, like  7; seven")),
    h("label", {}, "Wrong options (optional)", h("textarea", { maxlength: 1000, placeholder: "One per line. Fill these in to make it multiple choice.", oninput: (e) => { draft.wrong = e.target.value; } }, draft.wrong)),
    h("button", { class: "primary", onclick: addQuestion }, "Add question"));

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
    h("p", { class: "muted small" }, cloud.signedIn ? "Your account saves everything automatically. You can also keep a file copy." : "Everything is saved in this browser on this device. Download a backup now and then."),
    h("div", { class: "row" },
      h("button", { onclick: exportData }, "Download backup"),
      h("button", { onclick: () => importInput.click() }, "Load a backup"),
      h("button", { class: "danger", onclick: resetAll }, "Erase everything"),
      importInput));

  const topicsCard = state.subjects.length > 0 && h("section", { class: "card" },
    h("h2", {}, "Your topics"),
    ...state.subjects.map((sub) => {
      const n = state.questions.filter((q) => q.subjectId === sub.id).length;
      return h("div", { class: "row space", style: "padding:.35rem 0;border-top:1px solid var(--border)" },
        h("span", {}, h("b", {}, sub.name), h("span", { class: "muted small" }, `  ·  ${plural(n, "question")}`)),
        h("button", { class: "small danger", "aria-label": `Delete topic ${sub.name}`, onclick: () => deleteSubject(sub.id) }, "🗑 Delete topic"));
    }));

  return h("div", {}, subjectCard, makeCard, pasteCard, previewCard, oneCard, topicsCard, list, data);
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
    const next = L.sanitiseState(JSON.parse(await file.text()), CATALOGUE);
    if (!confirm(`Replace everything with this backup (${plural(next.questions.length, "question")}, ${next.stats.points} points)?`)) return;
    state = next;
    session = null;
    save();
    applyLook();
    toast("Backup loaded ✓");
    render();
  } catch (err) {
    toast(err instanceof SyntaxError ? "That file couldn't be read." : err.message);
  }
}
function resetAll() {
  if (!confirm("Erase all your questions, points, badges and unlocked items? This can't be undone.")) return;
  state = L.emptyState();
  session = null;
  save();
  applyLook();
  render();
}

// ======================= REWARDS =======================
function viewRewards() {
  const s = state.stats;
  const t = today();
  const lvl = L.levelFor(s.points);
  const balance = s.points - s.spent;
  const streak = L.currentStreak(s, t);
  const buddy = L.buddyFor(lvl.level);
  loadFontPreviews();

  const nameInput = h("input", { type: "text", maxlength: 20, value: state.buddy.name, "aria-label": "Your buddy's name",
    onchange: (e) => { state.buddy.name = e.target.value.trim().slice(0, 20) || "Pip"; save(); render(); } });
  const buddyCard = h("section", { class: "card" },
    h("div", { class: "row" },
      buddyEl(),
      h("div", { class: "grow" },
        h("h1", {}, `${state.buddy.name} the ${buddy.title}`),
        h("p", { class: "muted", style: "margin:0" }, `Level ${lvl.level}${buddy.nextLevel ? ` · evolves at level ${buddy.nextLevel}` : " · fully grown!"}`))),
    bar(lvl.pct, "Progress to next level"),
    h("p", { class: "small muted", style: "margin:.4rem 0 1rem" }, `${lvl.next - s.points} points to level ${lvl.level + 1}`),
    h("div", { class: "grid2" },
      h("div", { class: "stat" }, h("b", {}, balance), h("span", {}, "points to spend")),
      h("div", { class: "stat" }, h("b", {}, s.points), h("span", {}, "points earned")),
      h("div", { class: "stat" }, h("b", {}, streak), h("span", {}, "day streak")),
      h("div", { class: "stat" }, h("b", {}, s.bestStreak), h("span", {}, "best streak"))),
    h("label", { style: "margin-top:1rem" }, "Rename your buddy", nameInput));

  const openChest = () => {
    const pts = L.openChest(state);
    if (pts === null) return;
    lastChest = pts;
    checkBadges();
    save();
    render();
  };
  const chestCard = h("section", { class: "card prize" },
    h("h2", {}, "🎁 Chests"),
    lastChest !== null && h("p", { class: "verdict good", role: "status" }, `You found ${lastChest} points! 🎉`),
    state.chests > 0
      ? h("div", { class: "row space" }, h("span", {}, `You have ${plural(state.chests, "chest")} waiting.`), h("button", { class: "primary", onclick: openChest }, "Open a chest"))
      : h("p", { class: "muted", style: "margin:0" }, `No chests yet. Answer ${state.settings.dailyGoal} questions in a day — or finish all three weekly quests — to earn one. Each holds 20–150 points.`));

  const claim = (q) => {
    const r = L.claimQuest(state, q.id, t);
    if (!r.ok) return;
    toast(`+${r.points} points!${r.chest ? " 🎁 Bonus chest for finishing every quest!" : ""}`);
    checkBadges();
    save();
    render();
  };
  const quests = L.weeklyQuests(state, t);
  const questCard = h("section", { class: "card" },
    h("div", { class: "row space" }, h("h2", {}, "📜 Weekly quests"), h("span", { class: "small muted" }, `Resets Monday`)),
    quests.map((q) => h("div", { class: "item" },
      h("div", { class: "txt grow" },
        h("b", {}, q.text), h("div", { class: "small muted" }, `${Math.min(q.progress, q.target)} / ${q.target} · ${q.reward} points`),
        bar(Math.round((q.progress / q.target) * 100), q.text)),
      q.claimed ? h("span", { class: "tag" }, "Claimed ✓")
        : h("button", { class: "primary small", disabled: !q.done, onclick: () => claim(q) }, q.done ? "Claim" : "In progress"))),
    h("p", { class: "small muted", style: "margin:.6rem 0 0" }, "Claim all three this week for a bonus chest."));

  const owned = (id) => Shop.isOwned(state, id);
  const use = (kind, id) => { Shop.equipItem(state, kind, id); save(); applyLook(); render(); };
  const buy = (id) => {
    const r = Shop.buyItem(state, id);
    toast(r.message);
    if (r.ok) { save(); render(); }
  };
  const shopButton = (item) => {
    const on = state.equipped[item.kind] === item.id;
    if (owned(item.id)) return h("button", { class: on ? "primary small" : "small", "aria-pressed": on, onclick: () => use(item.kind, item.id) }, on ? "In use ✓" : "Use");
    return h("button", { class: "small", disabled: balance < item.price, onclick: () => buy(item.id) }, `Unlock · ${item.price} pts`);
  };
  const originalBtn = (kind, label) => h("button", { class: "small ghost", disabled: !state.equipped[kind], onclick: () => use(kind, "") }, label);
  const shopCard = h("section", { class: "card" },
    h("h2", {}, "🛍️ Shop"),
    h("p", { class: "muted small" }, `Spend points on looks for the whole app. You have ${balance} points. Spending doesn't lower your level.`),
    h("div", { class: "row space" }, h("h3", {}, "Colour themes"), originalBtn("palette", "Use original colours")),
    h("div", { class: "shop" }, Shop.itemsOfKind("palette").map((p) => h("div", { class: "shop-item" },
      h("div", { class: "swatch", style: `background:${p.bg};color:${p.ink};border-color:${p.ink}` }, p.name),
      shopButton(p)))),
    h("div", { class: "row space", style: "margin-top:1.2rem" }, h("h3", {}, "Headline fonts"), originalBtn("font", "Use original font")),
    h("div", { class: "shop" }, Shop.itemsOfKind("font").map((f) => h("div", { class: "shop-item" },
      h("div", { class: "swatch fontsw", style: `font-family:${f.css}` }, f.name),
      shopButton(f)))),
    h("div", { class: "row space", style: "margin-top:1.2rem" }, h("h3", {}, `Hats for ${state.buddy.name}`), originalBtn("hat", "Take hat off")),
    h("div", { class: "shop" }, Shop.itemsOfKind("hat").map((x) => h("div", { class: "shop-item" },
      h("div", { class: "swatch hatsw" }, h("span", { "aria-hidden": "true" }, x.emoji), h("span", { class: "small" }, x.name)),
      shopButton(x)))));

  const addTreat = (name, cost) => {
    name = String(name).trim().slice(0, 60);
    cost = Math.round(Number(cost));
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
  const treatCard = h("section", { class: "card" },
    h("h2", {}, "🎉 Real-life rewards"),
    h("p", { class: "muted small" }, "Treats you give yourself in real life — you decide the price, then redeem when you've saved up."),
    state.treats.length === 0 && h("p", { class: "muted" }, "None yet. Tap an idea or add your own:"),
    state.treats.map((tr) => h("div", { class: "item" },
      h("div", { class: "txt" }, h("b", {}, tr.name), h("div", { class: "a" }, `${tr.cost} points`)),
      h("div", { class: "row" },
        h("button", { class: "primary small", disabled: balance < tr.cost, onclick: () => redeem(tr) }, "Redeem"),
        h("button", { class: "ghost small danger", "aria-label": `Remove reward ${tr.name}`, onclick: () => { state.treats = state.treats.filter((x) => x.id !== tr.id); save(); render(); } }, "✕")))),
    h("div", { class: "row", style: "margin:.6rem 0" }, L.TREAT_IDEAS.filter((i) => !state.treats.some((x) => x.name === i.name)).map((i) => h("button", { class: "small", onclick: () => addTreat(i.name, i.cost) }, `＋ ${i.name} (${i.cost})`))),
    h("div", { class: "row" },
      h("input", { class: "grow", type: "text", maxlength: 60, placeholder: "Your own reward, e.g. Buy a new book", "aria-label": "Reward name", value: draft.treatName, oninput: (e) => { draft.treatName = e.target.value; } }),
      h("input", { style: "max-width:8rem", type: "number", min: 1, placeholder: "Points", "aria-label": "Points cost", value: draft.treatCost, oninput: (e) => { draft.treatCost = e.target.value; } }),
      h("button", { onclick: () => addTreat(draft.treatName, draft.treatCost) }, "Add")),
    state.redeemed.length > 0 && h("div", { style: "margin-top:1rem" }, h("h3", {}, "Recently enjoyed"),
      state.redeemed.slice(0, 5).map((r) => h("p", { class: "small muted", style: "margin:0" }, `${niceDate(r.date)} — ${r.name} (${r.cost} points)`))));

  const badgeCard = h("section", { class: "card" },
    h("h2", {}, "Badges"),
    h("p", { class: "muted small" }, `${L.BADGES.filter((b) => s.badges[b.id]).length} of ${L.BADGES.length} unlocked`),
    h("div", { class: "badges" }, L.BADGES.map((b) => {
      const when = s.badges[b.id];
      return h("div", { class: "badge" + (when ? "" : " locked") },
        h("span", { class: "ico", "aria-hidden": "true" }, b.icon), h("b", {}, b.name),
        h("span", { class: "small muted" }, when ? `Unlocked ${niceDate(when)}` : b.text));
    })));

  const goalInput = h("input", { type: "number", min: L.MIN_GOAL, max: 200, value: state.settings.dailyGoal, "aria-label": "Daily goal in questions",
    onchange: (e) => {
      const n = Math.round(Number(e.target.value));
      state.settings.dailyGoal = Number.isFinite(n) ? Math.min(200, Math.max(L.MIN_GOAL, n)) : L.DEFAULT_GOAL;
      save();
      render();
    } });
  const goalCard = h("section", { class: "card" },
    h("h2", {}, "Daily goal"),
    h("p", { class: "muted small" }, `Answer this many questions a day to earn a chest (at least ${L.MIN_GOAL}). Weekly quests scale with it.`),
    h("label", {}, "Questions per day", goalInput));

  return h("div", {}, buddyCard, chestCard, questCard, shopCard, treatCard, badgeCard, goalCard);
}


// ======================= FARM =======================
const PARADE_MESSAGES = [
  "🎉 Your pets are throwing a party for all your hard work!",
  "🐾 The whole farm is cheering for you!",
  "🌟 Your pets say: you've got this!",
  "🎺 Pet parade! Keep revising and they'll keep growing.",
];
function parade() {
  if (!state) return toast("Sign in to meet your pets! 🐣");
  const t = today();
  const lvl = L.levelFor(state.stats.points);
  const emojis = [L.buddyFor(lvl.level).emoji, ...L.farmPets(state, t).map((p) => p.emoji)];
  const bonus = L.findSecret(state, t);
  checkBadges();
  save();
  const message = PARADE_MESSAGES[Math.floor(Math.random() * PARADE_MESSAGES.length)];
  toast(bonus ? `${message}  +${bonus} secret points 🔍` : message);
  const calm = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!calm) {
    const runners = Array.from({ length: Math.min(24, Math.max(8, emojis.length * 3)) }, (_, i) =>
      h("span", { class: "runner", style: `--y:${(8 + Math.random() * 78).toFixed(1)}%;--d:${(Math.random() * 2.5).toFixed(2)}s;--s:${(1.8 + Math.random() * 1.8).toFixed(2)}rem` }, emojis[i % emojis.length]));
    const layer = h("div", { class: "parade", "aria-hidden": "true" }, runners);
    document.body.append(layer);
    setTimeout(() => layer.remove(), 9000);
  }
  render();
}

function feed(subjectId) {
  go("revise");
  startSession(subjectId, "10");
}

function viewFarm() {
  const t = today();
  const lvl = L.levelFor(state.stats.points);
  const buddy = L.buddyFor(lvl.level);
  const pets = L.farmPets(state, t);
  if (draft.pet !== "buddy" && !pets.some((p) => p.subjectId === draft.pet)) draft.pet = "buddy";
  const hat = Shop.itemById(state.equipped.hat);

  const card = (key, emoji, name, title, due, i, wearing) =>
    h("button", { class: "pet-card" + (draft.pet === key ? " on" : ""), "aria-pressed": draft.pet === key, "aria-label": `${name}, ${title}${due ? `, ${due} due` : ""}`, onclick: () => { draft.pet = key; render(); } },
      h("span", { class: "pet-emoji", "aria-hidden": "true", style: `animation-delay:${(i * 0.37).toFixed(2)}s` }, wearing && h("span", { class: "hat" }, wearing), emoji),
      h("span", { class: "pet-name" }, name),
      h("span", { class: "small muted" }, title),
      due > 0 && h("span", { class: "tag" }, `${due} due`));

  const field = h("div", { class: "farm" },
    h("div", { class: "farm-grid" },
      card("buddy", buddy.emoji, state.buddy.name, `${buddy.title} · companion`, 0, 0, hat && hat.emoji),
      pets.map((p, i) => card(p.subjectId, p.emoji, p.name, `${p.title} · ${p.subjectName}`, p.due, i + 1, null))));

  let detail;
  if (draft.pet === "buddy") {
    detail = h("section", { class: "card" },
      h("h2", {}, `${state.buddy.name} the ${buddy.title}`),
      h("p", { class: "muted" }, `Your companion grows as you level up (level ${lvl.level}).${buddy.nextLevel ? ` Evolves at level ${buddy.nextLevel}.` : " Fully grown!"} Hats are in the Rewards shop.`),
      bar(lvl.pct, "Progress to next level"),
      h("label", { style: "margin-top:1rem" }, "Name", h("input", { type: "text", maxlength: 20, value: state.buddy.name, "aria-label": "Pet name",
        onchange: (e) => { state.buddy.name = e.target.value.trim().slice(0, 20) || "Pip"; save(); render(); } })));
  } else {
    const p = pets.find((x) => x.subjectId === draft.pet);
    const subject = state.subjects.find((x) => x.id === p.subjectId);
    detail = h("section", { class: "card" },
      h("h2", {}, `${p.name} the ${p.title}`),
      h("p", { class: "muted" }, `${p.subjectName} · ${plural(p.xp, "right answer")} so far. ${p.due ? `${p.name} is hungry — ${plural(p.due, "question")} due!` : `${p.name} is happy and well fed.`}`),
      bar(p.progress, `${p.name}'s growth`),
      h("p", { class: "small muted", style: "margin:.4rem 0 1rem" }, p.nextAt === null ? "Fully grown! 🌟" : `${p.nextAt - p.xp} more right ${p.nextAt - p.xp === 1 ? "answer" : "answers"} to become a ${L.PET_STAGE_TITLES[p.stage + 1].toLowerCase()}.`),
      h("label", {}, "Name", h("input", { type: "text", maxlength: 20, placeholder: "Give your pet a name", value: p.name, "aria-label": "Pet name",
        onchange: (e) => { const v = e.target.value.trim().slice(0, 20); if (v) subject.petName = v; else delete subject.petName; save(); render(); } })),
      h("button", { class: "primary", disabled: p.total === 0, onclick: () => feed(p.subjectId) }, `🍽️ Feed ${p.name} — revise ${p.subjectName}`));
  }

  return h("div", {},
    h("section", { class: "card" },
      h("h1", {}, "🌾 Your farm"),
      h("p", { class: "muted", style: "margin:0" }, pets.length
        ? `${plural(pets.length + 1, "animal")} live here. Every subject has its own pet — answer its questions right and it grows.`
        : "Every subject you revise hatches its own pet. Add some questions and your first egg will appear!")),
    field,
    pets.length === 0 && h("div", { class: "row", style: "margin-bottom:1rem" }, h("button", { class: "primary", onclick: () => go("questions") }, "Add questions")),
    detail);
}

// ======================= START =======================
async function init() {
  const fromHash = location.hash.slice(1);
  if (TAB_IDS.includes(fromHash)) tab = fromHash;
  window.addEventListener("hashchange", () => {
    const id = location.hash.slice(1);
    if (state && TAB_IDS.includes(id) && id !== tab) { tab = id; lastChest = null; render(); }
  });
  window.addEventListener("online", () => { if (sync === "offline" || sync === "error") push(); });
  if (document.addEventListener) document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") pullIfNewer(); });
  const brand = document.getElementById("brand");
  if (brand) {
    let timer = null, held = false;
    brand.addEventListener("pointerdown", () => { held = false; clearTimeout(timer); timer = setTimeout(() => { held = true; parade(); }, 800); });
    for (const type of ["pointerup", "pointerleave", "pointercancel"]) brand.addEventListener(type, () => clearTimeout(timer));
    brand.addEventListener("click", (e) => { if (held) { e.preventDefault(); held = false; } });
    brand.addEventListener("contextmenu", (e) => e.preventDefault());
  }
  if (!cloud.enabled) {
    state = readLocal(LOCAL_KEY) || L.starterState(today());
    booting = false;
    applyLook();
    render();
    return;
  }
  render();
  const restored = await cloud.restore();
  if (restored) await enterApp();
  else { booting = false; render(); }
}
init();
