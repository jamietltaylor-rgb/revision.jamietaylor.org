import * as L from "./logic.js";
import * as Shop from "./shop.js";
import { CONFIG } from "./config.js";
import { createCloud, displayName } from "./cloud.js";

const LOCAL_KEY = "revise-app-v1"; // used when logins aren't switched on, and for progress made before accounts existed
const TABS = [["home", "🏠", "Home"], ["revise", "📝", "Revise"], ["questions", "✏️", "Questions"], ["rewards", "🏆", "Rewards"], ["farm", "🌾", "Farm"], ["plan", "📅", "Plan"]];
const TAB_IDS = TABS.map((t) => t[0]);
const CATALOGUE = new Set(Shop.ITEMS.map((i) => i.id));

const cloud = createCloud(CONFIG, { storage: safeStorage() });
// Anonymous feature counters for the owner's admin panel (stats.js). Counting must never break the app.
const track = (name, value) => { try { if (window.jtEvent) window.jtEvent(name, value); } catch { /* ignore */ } };
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
  topic: "", level: "GCSE", count: "10", style: "gapfill", styles: ["gapfill"], busy: false, progress: "", aiError: "", prompt: "", paper: false, board: "Any exam board", boardInit: false, mode: "quick", kinds: null, allKinds: false,
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

// ======================= PLAN (calendar of exams + revision timetable) =======================
const planUI = { month: "", selected: "", subject: "", board: "Any exam board", kind: "GCSE", paper: "", time: "", paste: "", preview: null, pasteOpen: false, prompt: "", shown: 14 };
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const longDate = (date) => new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const monthTitle = (m) => new Date(`${m}-01T12:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
const findSubject = (name) => state.subjects.find((x) => L.subjectKey(x.name) === L.subjectKey(name));
const daysAway = (date) => L.daysBetween(today(), date);
const inDays = (n) => (n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`);
const shiftMonth = (m, n) => { const d = new Date(`${m}-01T12:00:00`); d.setMonth(d.getMonth() + n); return L.dateStr(d).slice(0, 7); };
const subjectHue = (name) => { let n = 0; for (const c of L.subjectKey(name)) n = (n * 31 + c.charCodeAt(0)) % 360; return n; };

/** Makes sure the subject exists in the Questions tab, so questions can be added to it straight away. */
function ensureSubjectNamed(name) {
  const existing = findSubject(name);
  if (existing) return { subject: existing, created: false };
  if (state.subjects.length >= 100) return { subject: null, created: false };
  const subject = { id: L.uid(), name: name.slice(0, 60) };
  state.subjects.push(subject);
  return { subject, created: true };
}
const sortExams = () => state.exams.sort((a, b) => a.date.localeCompare(b.date) || a.subject.localeCompare(b.subject));

function addExam(date) {
  const subject = planUI.subject.trim();
  if (!subject) return toast("Type the subject first.");
  if (!date || date < today()) return toast("Pick a day that hasn't passed yet.");
  state.exams.push({ id: L.uid(), subject: subject.slice(0, 60), kind: planUI.kind, board: planUI.board === "Any exam board" ? "" : planUI.board, date, paper: planUI.paper.trim().slice(0, 40), time: planUI.time.trim().slice(0, 20) });
  sortExams();
  track("exam_added");
  const { created } = ensureSubjectNamed(subject);
  planUI.subject = ""; planUI.paper = ""; planUI.time = "";
  save();
  toast(created ? `Exam added ✓ — and “${subject}” is now a subject in Questions` : "Exam added ✓");
  render();
}
function checkExams() {
  const r = L.parseExamList(planUI.paste, today());
  if (!r.exams.length) return toast("I couldn't find any dates in that. Try one exam per line, like:  Maths Paper 1 | 14 May 2027 | GCSE");
  const have = new Set(state.exams.map((e) => `${L.subjectKey(e.subject)}|${e.date}|${e.paper}`));
  planUI.pasteOpen = true;
  planUI.preview = { skipped: r.skipped, items: r.exams.map((e) => {
    const k = `${L.subjectKey(e.subject)}|${e.date}|${e.paper}`;
    const note = have.has(k) ? "already in your list" : e.date < today() ? "date has passed" : "";
    have.add(k);
    return { ...e, note, keep: !note };
  }) };
  render();
}
async function copyTimetablePrompt() {
  planUI.pasteOpen = true;
  planUI.prompt = L.buildTimetablePrompt(today());
  let copied = false;
  try { await navigator.clipboard.writeText(planUI.prompt); copied = true; } catch { copied = false; }
  toast(copied ? "Prompt copied — paste it into another AI and attach your photo ✓" : "Copy the prompt from the box below.");
  render();
}
function confirmExams() {
  const keep = planUI.preview.items.filter((e) => e.keep);
  if (!keep.length) return toast("Tick at least one exam to add.");
  let made = 0;
  for (const { keep: _k, note: _n, ...e } of keep) {
    state.exams.push({ id: L.uid(), ...e });
    if (ensureSubjectNamed(e.subject).created) made++;
  }
  sortExams();
  planUI.preview = null; planUI.paste = "";
  const nextExam = state.exams.find((e) => e.date >= today());
  if (nextExam) { planUI.month = nextExam.date.slice(0, 7); planUI.selected = nextExam.date; }
  save();
  toast(`Added ${plural(keep.length, "exam")} ✓${made ? ` and ${plural(made, "new subject")}` : ""}`);
  render();
}
function deleteExam(id) {
  state.exams = state.exams.filter((e) => e.id !== id);
  save();
  render();
}
function clearPastExams() {
  state.exams = state.exams.filter((e) => e.date >= today());
  save();
  render();
}
function setPlan(patch) {
  Object.assign(state.plan, patch);
  save();
  render();
}
function toggleExclude(name) {
  const key = L.subjectKey(name);
  const has = state.plan.exclude.some((x) => L.subjectKey(x) === key);
  setPlan({ exclude: has ? state.plan.exclude.filter((x) => L.subjectKey(x) !== key) : [...state.plan.exclude, name] });
}
const isLeftOut = (name) => state.plan.exclude.some((x) => L.subjectKey(x) === L.subjectKey(name));

function toggleDone(id) {
  if (state.plan.done[id]) delete state.plan.done[id]; else state.plan.done[id] = true;
  save();
  render();
}
function practise(name) {
  const sub = findSubject(name);
  if (sub && state.questions.some((q) => q.subjectId === sub.id)) {
    startSession(sub.id, "10");
    if (session) go("revise");
  } else {
    makeQuestionsFor(name, "", "");
    toast("No questions for that subject yet — make some here first.");
  }
}
function makeQuestionsFor(name, kind, board) {
  const sub = ensureSubjectNamed(name).subject;
  draft.topic = name;
  draft.level = kind === "A-level" || kind === "AS-level" ? "A-level" : "GCSE";
  draft.paper = true;
  draft.boardInit = true;
  draft.board = board && L.BOARDS.includes(board) ? board : (state.settings.board || "Any exam board");
  draft.preview = null;
  draft.subjectId = sub ? sub.id : "__new";
  if (!sub) draft.newSubject = name;
  save();
  go("questions");
}

function todaysPlan() {
  const t = today();
  const day = L.buildTimetable(state.exams, state.plan, t, 1)[0];
  return day || { date: t, sessions: [], exams: [], off: false };
}

// ---------- "add to your home screen" help ----------
const installUI = { open: false, event: null };
if (typeof window !== "undefined" && window.addEventListener) {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installUI.event = e; if (tab === "home" && state && !session) render(); });
  window.addEventListener("appinstalled", () => { installUI.event = null; if (tab === "home" && state) render(); });
}
const isInstalled = () => {
  try { return Boolean((window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || (typeof navigator !== "undefined" && navigator.standalone)); } catch { return false; }
};
const myDevice = () => {
  const ua = (typeof navigator !== "undefined" && navigator.userAgent) || "";
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && typeof navigator !== "undefined" && navigator.maxTouchPoints > 1)) return "apple";
  if (/Android/i.test(ua)) return "android";
  return "";
};
async function installNow() {
  const ev = installUI.event;
  if (!ev) return;
  installUI.event = null;
  try { await ev.prompt(); } catch { /* the browser said no */ }
  render();
}
function installCard() {
  if (isInstalled()) return null;
  const site = (typeof location !== "undefined" && location.host) || "revision.jamietaylor.org";
  const mine = myDevice();
  const steps = (title, items, note) => h("div", { style: "margin:.7rem 0" },
    h("h3", {}, title),
    h("ol", { style: "margin:.3rem 0 .3rem 1.2rem;padding:0" }, items.map((x) => h("li", { style: "margin:.2rem 0" }, x))),
    note && h("p", { class: "small muted", style: "margin:.2rem 0 0" }, note));
  const apple = steps("🍎 iPhone or iPad", [
    `Open ${site} in Safari.`,
    "Tap the Share button (the square with an arrow pointing up) — at the bottom of the screen on an iPhone, or at the top on an iPad.",
    "Scroll down the list and tap “Add to Home Screen”.",
    "Tap “Add” in the top corner. The Revise icon now appears on your home screen.",
  ], "If you don't see “Add to Home Screen”, you're probably not in Safari — open the link in Safari and try again.");
  const android = steps("🤖 Android phone or tablet", [
    `Open ${site} in Chrome.`,
    "Tap the three dots in the top-right corner.",
    "Tap “Install app” (or “Add to Home screen”).",
    "Tap “Install” or “Add”, then confirm. The Revise icon appears on your home screen.",
  ], "Using Samsung Internet? Tap the menu (three lines), then “Add page to”, then “Home screen”.");
  const computer = steps("💻 Computer", [
    "In Chrome or Edge, click the small install icon at the right-hand end of the address bar (or open the menu and choose “Install Revise”).",
  ]);
  return h("section", { class: "card" },
    h("details", { open: installUI.open, ontoggle: (e) => { installUI.open = e.target.open; } },
      h("summary", { style: "cursor:pointer;font-weight:700;font-size:1.05rem" }, "📲 Add Revise to your home screen"),
      h("p", { class: "muted small", style: "margin:.5rem 0" }, "Put the icon on your phone's home screen so it opens like an app, full screen, with one tap."),
      installUI.event && h("button", { class: "primary", style: "margin:.3rem 0", onclick: installNow }, "Install now"),
      ...(mine === "android" ? [android, apple, computer] : mine === "apple" ? [apple, android, computer] : [apple, android, computer])));
}

function planHomeCard() {
  const t = today();
  const upcoming = state.exams.filter((e) => e.date >= t).sort((a, b) => a.date.localeCompare(b.date));
  if (!upcoming.length) return null;
  const next = upcoming[0];
  const day = todaysPlan();
  return h("section", { class: "card" },
    h("div", { class: "row space" }, h("h2", {}, "📅 Coming up"), h("button", { class: "ghost small", onclick: () => go("plan") }, "Open plan")),
    h("p", { style: "margin:0 0 .5rem" }, h("b", {}, `${next.subject}${next.paper ? " " + next.paper : ""}`), ` ${next.board ? next.board + " " : ""}${next.kind === "Other" ? "exam" : next.kind + " exam"} ${inDays(daysAway(next.date))} · ${longDate(next.date)}`),
    day.exams.length > 0 && h("p", { class: "banner", style: "margin:.4rem 0" }, `Exam today: ${day.exams.map((e) => e.subject).join(", ")} — good luck! 🍀`),
    day.sessions.length > 0
      ? h("div", {}, h("div", { class: "small muted", style: "margin:.4rem 0" }, "Today's revision"),
          day.sessions.map((x) => h("div", { class: "row space", style: "padding:.3rem 0;border-top:1px solid var(--border)" },
            h("span", {}, state.plan.done[x.id] ? "✅ " : "⬜ ", h("b", {}, x.subject), h("span", { class: "muted small" }, `  ${x.minutes} min · ${x.phase}`)),
            h("button", { class: "small", onclick: () => practise(x.subject) }, "Practise"))))
      : h("p", { class: "small muted", style: "margin:.2rem 0 0" }, day.off ? "Today is a rest day 😴" : "Nothing planned for today."));
}

function viewPlan() {
  const t = today();
  if (!planUI.month) planUI.month = t.slice(0, 7);
  if (!planUI.selected) planUI.selected = t;
  const opt = (value, label, current) => h("option", { value, selected: String(value) === String(current) }, label);
  const upcoming = state.exams.filter((e) => e.date >= t);
  const past = state.exams.length - upcoming.length;
  const names = [...new Set([...state.subjects.map((x) => x.name), ...state.exams.map((e) => e.subject)])];
  const table = L.buildTimetable(state.exams, state.plan, t);
  const planByDate = new Map(table.map((d) => [d.date, d]));
  const examSubjects = [...new Map(upcoming.map((e) => [L.subjectKey(e.subject), e.subject])).values()];

  // ----- the calendar -----
  const first = new Date(`${planUI.month}-01T12:00:00`);
  const lead = (first.getDay() + 6) % 7; // Monday first
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(h("div", { class: "cal-pad" }));
  for (let n = 1; n <= daysInMonth; n++) {
    const date = `${planUI.month}-${String(n).padStart(2, "0")}`;
    const exams = state.exams.filter((e) => e.date === date);
    const plan = planByDate.get(date);
    const sessions = plan ? plan.sessions.length : 0;
    const cls = "cal-day" + (date === t ? " today" : "") + (date === planUI.selected ? " selected" : "") + (date < t ? " past" : "") + (plan && plan.off ? " rest" : "");
    cells.push(h("button", { type: "button", class: cls, "aria-label": `${longDate(date)}${exams.length ? ", " + exams.map((e) => e.subject + " exam").join(", ") : ""}`, "aria-pressed": date === planUI.selected ? "true" : "false", onclick: () => { planUI.selected = date; render(); setTimeout(() => { const el = document.getElementById("plan-day"); if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" }); }, 0); } },
      h("span", { class: "cal-num" }, String(n)),
      ...exams.slice(0, 3).map((e) => h("span", { class: "cal-chip", style: `background:hsl(${subjectHue(e.subject)} 62% 40%)` }, e.subject)),
      exams.length > 3 && h("span", { class: "cal-more" }, `+${exams.length - 3}`),
      sessions > 0 && !exams.length && h("span", { class: "cal-dots", "aria-hidden": "true" }, "•".repeat(Math.min(sessions, 4)))));
  }
  const calCard = h("section", { class: "card" },
    h("h1", {}, "Exam calendar"),
    h("p", { class: "muted small" }, "Tap the day of an exam, then fill in the subject and exam board. Dots show days with revision planned."),
    h("div", { class: "row space", style: "margin:.4rem 0" },
      h("button", { class: "small", "aria-label": "Previous month", onclick: () => { planUI.month = shiftMonth(planUI.month, -1); render(); } }, "‹"),
      h("b", { style: "font-size:1.1rem" }, monthTitle(planUI.month)),
      h("span", { class: "row", style: "gap:.3rem" },
        planUI.month !== t.slice(0, 7) && h("button", { class: "small", onclick: () => { planUI.month = t.slice(0, 7); planUI.selected = t; render(); } }, "Today"),
        h("button", { class: "small", "aria-label": "Next month", onclick: () => { planUI.month = shiftMonth(planUI.month, 1); render(); } }, "›"))),
    h("div", { class: "cal", role: "group", "aria-label": monthTitle(planUI.month) },
      DAY_NAMES.map((n) => h("div", { class: "cal-head" }, n)),
      cells));

  // ----- the chosen day -----
  const sel = planUI.selected;
  const dayExams = state.exams.filter((e) => e.date === sel);
  const dayPlan = planByDate.get(sel);
  const dayCard = h("section", { class: "card", id: "plan-day" },
    h("h2", {}, sel === t ? `Today · ${longDate(sel)}` : longDate(sel)),
    dayExams.map((e) => h("div", { class: "item" },
      h("div", { class: "txt" },
        h("div", {}, h("b", {}, e.subject), e.paper ? ` · ${e.paper}` : "", h("span", { class: "tag", style: "margin-left:.4rem" }, e.kind), e.board && h("span", { class: "tag", style: "margin-left:.3rem" }, e.board)),
        h("div", { class: "small muted" }, `${e.time ? e.time + " · " : ""}${inDays(daysAway(e.date)) === "today" ? "today" : sel < t ? "finished" : inDays(daysAway(e.date))}`),
        h("div", { class: "row", style: "margin-top:.35rem;gap:.4rem" },
          h("button", { class: "small", onclick: () => practise(e.subject) }, "Practise"),
          h("button", { class: "small", onclick: () => makeQuestionsFor(e.subject, e.kind, e.board) }, "✨ Make past-paper style questions"),
          h("button", { class: "small", "aria-pressed": isLeftOut(e.subject) ? "true" : "false", onclick: () => toggleExclude(e.subject) }, isLeftOut(e.subject) ? "Add back to timetable" : "Leave out of timetable"))),
      h("button", { class: "ghost small danger", "aria-label": `Delete exam: ${e.subject}`, onclick: () => deleteExam(e.id) }, "✕"))),
    dayPlan && dayPlan.sessions.length > 0 && h("div", { style: "margin:.6rem 0" },
      h("div", { class: "small muted" }, "Revision planned"),
      dayPlan.sessions.map((x) => h("div", { class: "row space", style: "padding:.25rem 0" },
        h("label", { class: "row", style: "gap:.5rem;margin:0;font-weight:400;flex:1 1 12rem" },
          h("input", { type: "checkbox", style: "width:auto;min-height:0;margin:0", checked: !!state.plan.done[x.id], "aria-label": `Done: ${x.subject}`, onchange: () => toggleDone(x.id) }),
          h("span", {}, h("b", {}, x.subject), h("span", { class: "muted small" }, `  ${x.minutes} min · ${x.phase}`))),
        h("button", { class: "small", onclick: () => practise(x.subject) }, "Practise")))),
    dayPlan && dayPlan.off && h("p", { class: "muted" }, "😴 Rest day — no revision set."),
    sel < t
      ? h("p", { class: "muted small" }, "This day has passed.")
      : h("div", { style: "margin-top:.8rem;border-top:1px solid var(--border);padding-top:.8rem" },
          h("h3", {}, "Add an exam on this day"),
          h("label", {}, "Subject", h("input", { type: "text", id: "exam-subject", list: "plan-subjects", maxlength: 60, placeholder: "e.g. Maths", value: planUI.subject, oninput: (e) => { planUI.subject = e.target.value; },
            onkeydown: (e) => { if (e.key === "Enter") addExam(sel); } })),
          h("datalist", { id: "plan-subjects" }, names.map((n) => h("option", { value: n }))),
          h("div", { class: "grid2" },
            h("label", {}, "Exam board", h("select", { "aria-label": "Exam board", onchange: (e) => { planUI.board = e.target.value; } }, L.BOARDS.map((x) => opt(x, x, planUI.board)))),
            h("label", {}, "Type", h("select", { "aria-label": "Exam type", onchange: (e) => { planUI.kind = e.target.value; } }, L.KINDS.map((k) => opt(k, k, planUI.kind)))),
            h("label", {}, "Paper (optional)", h("input", { type: "text", maxlength: 40, placeholder: "e.g. Paper 1", value: planUI.paper, oninput: (e) => { planUI.paper = e.target.value; } })),
            h("label", {}, "Time (optional)", h("input", { type: "text", maxlength: 20, placeholder: "e.g. 9:00", value: planUI.time, oninput: (e) => { planUI.time = e.target.value; } }))),
          h("button", { class: "primary", onclick: () => addExam(sel) }, "Add exam"),
          h("p", { class: "small muted", style: "margin:.6rem 0 0" }, "A new subject with this name is added to the Questions tab automatically, so you can start adding questions to it.")));

  // ----- settings -----
  const setCard = h("section", { class: "card" },
    h("h2", {}, "How much can you revise?"),
    h("div", { class: "grid2" },
      h("label", {}, "Sessions a day", h("select", { "aria-label": "Sessions a day", onchange: (e) => setPlan({ perDay: Number(e.target.value) }) }, [1, 2, 3, 4, 5, 6].map((n) => opt(n, String(n), state.plan.perDay)))),
      h("label", {}, "Minutes each", h("select", { "aria-label": "Minutes each", onchange: (e) => setPlan({ minutes: Number(e.target.value) }) }, [15, 20, 25, 30, 45, 60, 90].map((n) => opt(n, `${n} min`, state.plan.minutes))))),
    examSubjects.length > 0 && h("div", { style: "margin:.6rem 0" },
      h("div", { class: "small muted", style: "margin-bottom:.2rem" }, "Subjects in your revision timetable (untick to leave one out — its exams still show on the calendar):"),
      examSubjects.map((name) => h("label", { class: "row", style: "gap:.5rem;margin:0;padding:.2rem 0;font-weight:400" },
        h("input", { type: "checkbox", style: "width:auto;min-height:0;margin:0", checked: !isLeftOut(name), "aria-label": `Include ${name} in the revision timetable`, onchange: () => toggleExclude(name) }),
        h("span", {}, name, isLeftOut(name) && h("span", { class: "muted small" }, "  · left out"))))),
    h("div", { class: "small muted", style: "margin:.4rem 0" }, "Rest days (no revision set):"),
    h("div", { class: "row", style: "gap:.4rem" }, DAY_NAMES.map((n, i) => {
      const off = state.plan.offDays.includes(i);
      return h("button", { type: "button", class: "small" + (off ? " primary" : ""), "aria-pressed": off ? "true" : "false", onclick: () => setPlan({ offDays: off ? state.plan.offDays.filter((x) => x !== i) : [...state.plan.offDays, i].sort() }) }, n);
    })));

  // ----- list view, paste import -----
  const shown = table.slice(0, planUI.shown);
  const listCard = h("section", { class: "card" },
    h("details", { open: planUI.pasteOpen || !!planUI.preview, ontoggle: (e) => { planUI.pasteOpen = e.target.open; } },
      h("summary", { style: "cursor:pointer;font-weight:700" }, `Paste a whole timetable, or see everything as a list (${upcoming.length} exam${upcoming.length === 1 ? "" : "s"})`),
      h("p", { class: "muted small", style: "margin:.6rem 0" }, "One exam per line — subject, date, and optionally the exam board, type, paper and time. Dates like 14 May 2027, 14/05/2027 or 2027-05-14 all work."),
      h("textarea", { "aria-label": "Exam timetable to paste", style: "min-height:7rem", placeholder: "Maths Paper 1 | 14 May 2027 | GCSE | AQA | 9:00\nBiology | 21/05/2027 | Mock\nEnglish Literature, 3 June 2027", oninput: (e) => { planUI.paste = e.target.value; } }, planUI.paste),
      h("div", { class: "row", style: "margin:.6rem 0" },
        h("button", { onclick: checkExams }, "Check the list"),
        h("button", { onclick: copyTimetablePrompt }, "📷 Copy a prompt to turn a photo into a list")),
      planUI.prompt && h("label", { style: "margin-bottom:.8rem" }, "Give this to another AI along with your photo, then paste its reply above",
        h("textarea", { readonly: true, style: "min-height:11rem", onfocus: (e) => e.target.select?.() }, planUI.prompt)),
      planUI.preview && h("div", { style: "border:1px solid var(--border);border-radius:12px;padding:.7rem;margin-bottom:1rem" },
        h("b", {}, `Check these before adding (${planUI.preview.items.length})`),
        h("p", { class: "small muted", style: "margin:.2rem 0 .4rem" }, "Untick anything you don't want in your timetable."),
        planUI.preview.skipped > 0 && h("p", { class: "small muted" }, `${planUI.preview.skipped} line${planUI.preview.skipped === 1 ? "" : "s"} had no date and ${planUI.preview.skipped === 1 ? "was" : "were"} skipped.`),
        ...planUI.preview.items.map((e) => h("label", { class: "pick" },
          h("input", { type: "checkbox", style: "width:auto;min-height:0;margin:.2rem 0 0", checked: e.keep, "aria-label": `Add ${e.subject} on ${e.date}`, onchange: (ev) => { e.keep = ev.target.checked; render(); } }),
          h("span", {}, h("b", {}, e.subject), e.paper ? ` · ${e.paper}` : "", h("span", { class: "a" }, `${longDate(e.date)} · ${e.kind}${e.board ? " · " + e.board : ""}${e.time ? " · " + e.time : ""}${e.note ? " · " + e.note : ""}`)))),
        h("div", { class: "row", style: "margin-top:.6rem" },
          h("button", { class: "primary", onclick: confirmExams }, `Add ${plural(planUI.preview.items.filter((e) => e.keep).length, "exam")}`),
          h("button", { onclick: () => { planUI.preview = null; render(); } }, "Cancel"))),
      h("div", { class: "row space" }, h("h3", {}, "All your exams"), past > 0 && h("button", { class: "ghost small", onclick: clearPastExams }, `Clear ${past} finished`)),
      upcoming.length === 0 && h("p", { class: "muted" }, "No exams coming up yet."),
      upcoming.map((e) => h("div", { class: "item" },
        h("div", { class: "txt" },
          h("div", {}, h("b", {}, e.subject), e.paper ? ` · ${e.paper}` : "", h("span", { class: "tag", style: "margin-left:.4rem" }, e.kind), e.board && h("span", { class: "tag", style: "margin-left:.3rem" }, e.board)),
          h("div", { class: "small muted" }, `${longDate(e.date)}${e.time ? " · " + e.time : ""} · ${inDays(daysAway(e.date))}`)),
        h("button", { class: "small", onclick: () => { planUI.selected = e.date; planUI.month = e.date.slice(0, 7); render(); window.scrollTo(0, 0); } }, "Show"),
        h("button", { class: "ghost small danger", "aria-label": `Delete exam: ${e.subject} ${e.date}`, onclick: () => deleteExam(e.id) }, "✕"))),
      table.length > 0 && h("h3", { style: "margin-top:1rem" }, "Revision timetable"),
      shown.map((d) => h("div", { style: "padding:.4rem 0;border-top:1px solid var(--border)" },
        h("div", { class: "row space" }, h("b", {}, d.date === t ? `Today · ${longDate(d.date)}` : longDate(d.date)), d.off && h("span", { class: "tag" }, "😴 Rest day")),
        d.exams.map((e) => h("div", { class: "banner", style: "margin:.3rem 0" }, `📝 EXAM: ${e.subject}${e.paper ? " " + e.paper : ""} (${e.kind})`)),
        d.sessions.map((x) => h("div", { class: "small", style: "padding:.1rem 0" }, `${state.plan.done[x.id] ? "✅" : "⬜"} ${x.subject} · ${x.minutes} min · ${x.phase}`)))),
      table.length > shown.length && h("button", { style: "margin-top:.6rem", onclick: () => { planUI.shown += 14; render(); } }, `Show 14 more days (${table.length - shown.length} left)`)));

  return h("div", {}, calCard, dayCard, setCard, listCard);
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
  else view = { home: viewHome, revise: viewRevise, questions: viewQuestions, rewards: viewRewards, farm: viewFarm, plan: viewPlan }[tab]();
  app.replaceChildren(...[
    inApp && !storageOk && h("div", { class: "banner", role: "alert" }, "This browser isn't letting the app save on this device. " + (cloud.signedIn ? "Your account copy is still saved." : "Your progress will be lost when you close the page — try turning off private browsing.")),
    view,
    inApp && h("p", { class: "muted", style: "text-align:center;margin:1.2rem 0 0" },
      h("button", { type: "button", class: "small ghost jt-fb-link", style: "display:none", onclick: () => { if (window.jtFeedback) window.jtFeedback(); } }, "💬 Send feedback")),
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
    planHomeCard(),
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
      h("div", { class: "badges" }, earned.map((b) => h("div", { class: "badge" }, h("span", { class: "ico", "aria-hidden": "true" }, b.icon), h("b", {}, b.name), h("span", { class: "small muted" }, niceDate(s.badges[b.id])))))),
    installCard());
}

// ======================= REVISE =======================
function viewRevise() {
  if (!session) return viewSetup();
  if (session.finished) return viewSummary();
  return viewQuestion();
}

let reviseMode = "quick"; // "quick" = short answers, "exam" = complete exam questions
let reviseKind = "all"; // which exam questions to practise: all, mc (1–2 mark multiple choice), short (outline / explain) or long (6 and 9 markers)
const KIND_GROUPS = {
  all: ["All kinds of question", () => true],
  mc: ["Multiple choice (1 and 2 marks)", (q) => Boolean(q.opts)],
  short: ["Outline and Explain (2 and 3 marks)", (q) => !q.opts && q.marks <= 5],
  long: ["Extended answers (6 and 9 marks)", (q) => !q.opts && q.marks >= 6],
};
const inKindGroup = (q, group) => (KIND_GROUPS[group] || KIND_GROUPS.all)[1](q);
const ofMode = (mode) => state.questions.filter((q) => (mode === "exam") === Boolean(q.exam));

function viewSetup() {
  const t = today();
  if (!state.questions.length) {
    return h("section", { class: "card" }, h("h1", {}, "Nothing to revise yet"), h("p", { class: "muted" }, "Add some questions first — it only takes a minute."),
      h("button", { class: "primary", onclick: () => go("questions") }, "Add questions"));
  }
  const pool = ofMode(reviseMode);
  const dueIn = (id, mode = reviseMode) => ofMode(mode).filter((q) => (id === "all" || q.subjectId === id) && q.due <= t).length;
  const modeTab = (mode, label) => h("button", { type: "button", class: "mode-tab" + (reviseMode === mode ? " active" : ""), "aria-pressed": reviseMode === mode ? "true" : "false",
    onclick: () => { reviseMode = mode; render(); } }, label, h("span", { class: "small" }, ` ${ofMode(mode).length ? dueIn("all", mode) + " due" : "none yet"}`));
  const switcher = h("div", { class: "mode-tabs", role: "group", "aria-label": "Type of questions" },
    modeTab("quick", "⚡ Quick questions"), modeTab("exam", "📝 Exam questions"));

  if (!pool.length) {
    return h("div", {}, h("section", { class: "card" }, switcher,
      h("h2", { style: "margin-top:1rem" }, reviseMode === "exam" ? "No exam questions yet" : "No quick questions yet"),
      h("p", { class: "muted" }, reviseMode === "exam"
        ? "Exam questions are full questions with marks that the app marks for you. Make some in the Questions tab by choosing “Complete exam questions”."
        : "Quick questions have short answers. Add some in the Questions tab."),
      h("button", { class: "primary", onclick: () => { draft.mode = reviseMode; go("questions"); } }, "Go to Questions")));
  }
  const subjectSel = h("select", { id: "subject" },
    h("option", { value: "all" }, `All subjects (${dueIn("all")} due)`),
    state.subjects.filter((s) => pool.some((q) => q.subjectId === s.id)).map((s) => h("option", { value: s.id }, `${s.name} (${dueIn(s.id)} due)`)));
  const lengthSel = h("select", { id: "length" },
    reviseMode === "exam"
      ? [h("option", { value: "5" }, "Normal — 5 questions"), h("option", { value: "3" }, "Quick — 3 questions"), h("option", { value: "10" }, "Long — 10 questions")]
      : [h("option", { value: "10" }, "Normal — 10 questions"), h("option", { value: "5" }, "Quick — 5 questions"), h("option", { value: "20" }, "Long — 20 questions")],
    h("option", { value: "due" }, "Everything that's due today"),
    h("option", { value: "all" }, "Every question"));
  return h("section", { class: "card" },
    switcher,
    h("h1", { style: "margin-top:1rem" }, reviseMode === "exam" ? "Exam questions" : "Start a round"),
    h("p", { class: "muted" }, reviseMode === "exam"
      ? "Full questions with marks. Write your answer and the app marks it against the mark scheme."
      : "Questions you're due to see come first, and the ones you find hardest come back more often."),
    h("label", {}, "Subject", subjectSel),
    reviseMode === "exam" && h("label", {}, "Which kind of question?",
      h("select", { id: "kind", onchange: (e) => { reviseKind = e.target.value; } }, Object.entries(KIND_GROUPS).map(([v, [label]]) => h("option", { value: v, selected: v === reviseKind }, `${label}${v === "all" ? "" : ` (${pool.filter((q) => inKindGroup(q, v)).length})`}`)))),
    h("label", {}, "How many?", lengthSel),
    h("button", { class: "primary big", onclick: () => startSession(subjectSel.value, lengthSel.value, reviseMode, reviseMode === "exam" ? reviseKind : "all") }, "Start"));
}

function startSession(subjectId, length, mode = null, kindGroup = "all") {
  const t = today();
  const pool = (mode ? ofMode(mode) : state.questions).filter((q) => inKindGroup(q, kindGroup));
  const dueCount = pool.filter((q) => (subjectId === "all" || q.subjectId === subjectId) && q.due <= t).length;
  const count = length === "due" ? Math.max(dueCount, 1) : length === "all" ? Infinity : Number(length) || 10;
  const { picked } = L.pickQuestions(pool, { subjectId, count, today: t });
  if (!picked.length) return toast(kindGroup !== "all" ? "There are no questions of that kind in that subject yet." : "There are no questions in that subject yet.");
  session = {
    queue: picked.map((q) => ({ id: q.id, retry: false })), index: 0, combo: 0, results: [], pointsEarned: 0, chests: 0,
    stage: "ask", verdict: false, given: "", dontKnow: false, finished: false, newBadges: [], shown: null,
  };
  track("quiz_started");
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

const LETTERS = "ABCDE";
/** A graph, chart or table from an exam question. */
function figureView(fig) {
  if (!fig) return null;
  if (fig.type === "table") {
    return h("figure", { class: "figure" },
      fig.title && h("figcaption", {}, fig.title),
      h("div", { class: "fig-scroll" }, h("table", { class: "fig-table" },
        h("thead", {}, h("tr", {}, fig.head.map((c) => h("th", { scope: "col" }, c)))),
        h("tbody", {}, fig.rows.map((r) => h("tr", {}, r.map((c) => h("td", {}, c))))))));
  }
  const box = h("div", { class: "fig-chart" });
  box.innerHTML = L.figureSvg(fig); // the SVG text is built from escaped, checked data only
  return h("figure", { class: "figure" }, box);
}
const optLabel = (q, text) => { const i = q.opts ? q.opts.indexOf(text) : -1; return i === -1 ? text : `${LETTERS[i]}. ${text}`; };
const markWord = (n) => `${n} mark${n === 1 ? "" : "s"}`;
/** The correct option(s) of an exam multiple-choice question, with their letters. */
const correctLabels = (q) => (q.answers && q.answers.length ? q.answers : [q.a]).map((a) => optLabel(q, a)).join("  +  ");
/** A short name for what kind of exam question this is, e.g. "Outline one" or "Justify". */
const KIND_TAG = { mc1: "Multiple choice", mc2: "Select two", outline: "Outline one", three: "Explain one", six: "Analyse / Discuss", nine: "Justify" };
const kindTag = (q, subjectName = "") => { const k = L.examKindOf(q); return k === "other" || !k ? "" : subjectName ? L.kindLabel(k, L.examProfile(subjectName)) : KIND_TAG[k] || ""; };
/** The short business or scenario extract a case-study question is set around. */
const isEnglishLang = (name = "") => /\b(english|language)\b/i.test(name) && !/literature/i.test(name);
const ctxView = (q, name = "") => (q.ctx ? h("blockquote", { class: "case" }, h("span", { class: "case-label" }, isEnglishLang(name) ? "Extract" : "Case study"), q.ctx) : null);
const kindPlaceholder = (q, name = "") => (isEnglishLang(name) && L.examKindOf(q) === "nine" ? "Write your answer in full: think about your audience and purpose, use paragraphs, and check your spelling and punctuation" : isEnglishLang(name) && L.examKindOf(q) === "six" ? "Pick 2–3 methods the writer uses. For each: quote a short phrase, name the method, and explain its effect on the reader" : {
  outline: "Write one point, then link it to a second (because… / so… / which means…)",
  three: "Identify one point, then develop it: explain why or how, and what that leads to",
  six: "Make 2–3 points. For each one, explain it in the context of the question (because… which means… so…)",
  nine: "Make 2–3 developed points on each side, then finish with a clear, justified judgement (overall… because…)",
}[L.examKindOf(q)] || "Write your answer here (or think it through), then check the mark scheme");

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
    h("div", { class: "row", style: "margin-top:.8rem" }, h("span", { class: "tag" }, subject ? subject.name : "Question"), q.exam && h("span", { class: "tag" }, `📝 ${markWord(q.marks)}`), q.exam && kindTag(q, subject && subject.name) && h("span", { class: "tag" }, kindTag(q, subject && subject.name)), q.src && h("span", { class: "tag" }, `📄 ${q.src}`), item.retry && h("span", { class: "tag" }, "Second chance — no points")),
    ctxView(q, subject && subject.name),
    h("p", { class: "quiz-q" }, q.q),
    q.opts && q.opts.length && q.answers && h("p", { class: "small muted", style: "margin:-.4rem 0 .6rem" }, "Select two answers."),
    q.fig && figureView(q.fig));

  if (q.exam) {
    if (q.opts) { // exam multiple choice: fixed order, marked automatically
      const two = Boolean(q.answers);
      if (session.stage === "ask") {
        if (two) { // "select two answers": tap two options, then check
          const picks = session.picks || (session.picks = []);
          const toggle = (o) => { const i = picks.indexOf(o); if (i !== -1) picks.splice(i, 1); else { if (picks.length >= 2) picks.shift(); picks.push(o); } render(); };
          body.append(h("div", { class: "choices" }, q.opts.map((o, i) => h("button", { class: picks.includes(o) ? "chosen" : "", "aria-pressed": picks.includes(o) ? "true" : "false", onclick: () => toggle(o) }, `${LETTERS[i]}. ${o}`))),
            h("div", { class: "row", style: "margin-top:.6rem" },
              h("button", { class: "primary", disabled: picks.length !== 2, onclick: () => submitMc2(picks.slice()) }, picks.length === 2 ? "Check my answers" : `Choose ${2 - picks.length} more`),
              h("button", { class: "ghost", onclick: () => submitMc2([]) }, "I don't know")));
        } else {
          body.append(h("div", { class: "choices" }, q.opts.map((o, i) => h("button", { onclick: () => submitMc(o) }, `${LETTERS[i]}. ${o}`))),
            h("div", { style: "margin-top:.6rem" }, h("button", { class: "ghost", onclick: () => submitMc("") }, "I don't know")));
        }
      } else if (two) {
        const got = session.result ? session.result.awarded : 0;
        const ok = got === 2;
        body.append(h("div", { class: "verdict " + (ok ? "good" : "bad"), role: "status" },
          ok ? "✅ Correct! 2 out of 2 marks" : session.dontKnow ? "No problem — here are the answers:" : `${got ? "➖" : "❌"} ${got} out of 2 marks`,
          session.picked && session.picked.length ? h("span", { class: "ans" }, `You chose: ${session.picked.map((o) => optLabel(q, o)).join("  +  ")}`) : null,
          !ok && h("span", { class: "ans" }, `Correct answers: ${correctLabels(q)}`)),
          h("div", { class: "row" }, h("button", { class: "primary", onclick: () => commit(ok) }, "Next →")));
      } else {
        const ok = session.verdict;
        body.append(h("div", { class: "verdict " + (ok ? "good" : "bad"), role: "status" },
          ok ? "✅ Correct! 1 out of 1 mark" : session.dontKnow ? "No problem — here's the answer:" : "❌ Not quite — 0 out of 1 mark",
          session.given && h("span", { class: "ans" }, `You chose: ${optLabel(q, session.given)}`),
          !ok && h("span", { class: "ans" }, `Correct answer: ${optLabel(q, q.a)}`)),
          h("div", { class: "row" }, h("button", { class: "primary", onclick: () => commit(ok) }, "Next →")));
      }
      return h("section", { class: "card" }, head, body);
    }
    if (session.stage === "ask") {
      const long = q.marks >= 6;
      const box = h("textarea", { id: "answer", maxlength: 4000, style: `min-height:${long ? 15 : q.marks >= 3 ? 9 : 6}rem`, placeholder: kindPlaceholder(q, subject && subject.name), "aria-label": "Your answer" });
      const words = h("span", { class: "small muted" }, "0 words");
      box.addEventListener("input", () => { const n = (box.value.match(/\S+/g) || []).length; words.textContent = `${n} word${n === 1 ? "" : "s"}`; });
      body.append(box, long && h("div", { class: "row", style: "margin-top:.3rem" }, words,
        h("span", { class: "small muted" }, q.marks >= 9 ? (isEnglishLang(subject && subject.name) ? "Marked in levels — content, organisation and accurate spelling, punctuation and grammar." : "Marked in levels — explain your points and finish with a justified judgement.") : "Marked in levels — explain each point, don't just list.")),
        h("div", { class: "row", style: "margin-top:.7rem" },
        h("button", { class: "primary", onclick: () => submitExam(box.value) }, "Mark my answer"),
        h("button", { class: "ghost", onclick: () => submitExam("") }, "I don't know")));
      setTimeout(() => box.focus(), 0);
    } else if (session.stage === "marking") {
      body.append(h("p", { class: "verdict", role: "status" }, "⏳ Marking your answer…"));
    } else {
      const r = session.result || L.markLocally(session.given, q.a, q.marks, q.kind);
      const passed = r.total > 0 && r.awarded / r.total >= 0.5;
      const levelled = L.isExtended(q);
      const bands = levelled ? L.levelBands(q.marks) : null;
      body.append(h("div", { class: "verdict " + (passed ? "good" : "bad"), role: "status" },
        `${passed ? "✅" : "❌"} ${r.awarded} out of ${r.total} mark${r.total === 1 ? "" : "s"}`,
        levelled && session.given && h("span", { class: "ans" }, r.level ? `Level ${r.level} of 3 (${bands[r.level - 1][0]}–${bands[r.level - 1][1]} marks)` : "Level 0 — nothing rewardable yet"),
        session.given && h("span", { class: "ans" }, `You wrote: ${session.given}`)),
        levelled && h("p", { class: "small", style: "margin:.6rem 0 .2rem" }, h("b", {}, session.given ? "What a good answer could include:" : "What a good answer could include:")),
        h("ul", { style: "list-style:none;margin:.6rem 0;padding:0" }, r.points.map((x) => h("li", { style: "padding:.15rem 0" }, `${x.met ? "✅" : levelled ? "⬜" : "❌"} ${x.text}`))),
        levelled && h("p", { class: "small muted", style: "margin:0 0 .5rem" }, `Marked in levels: Level 1 (${bands[0][0]}–${bands[0][1]}) simple points; Level 2 (${bands[1][0]}–${bands[1][1]}) applied to the question, with some reasoning; Level 3 (${bands[2][0]}–${bands[2][1]}) developed, logical chains of reasoning${q.marks >= 9 ? " and a justified judgement" : ""}.`),
        ...(r.feedback ? [h("p", {}, r.feedback)] : []),
        h("p", { class: "small muted" }, r.source === "ai" ? "Marked by AI — it's a good guide but not perfect." : r.source === "local" ? "Marked by matching key words (the AI marker wasn't available), so it can miss answers worded differently." : "Here is the mark scheme."),
        h("div", { class: "row" },
          h("button", { class: "primary", onclick: () => commit(passed) }, "Next →"),
          session.given && h("button", { class: "ghost small", onclick: () => commit(!passed) }, passed ? "I disagree — count it as not yet" : "I disagree — count it as right")));
    }
    return h("section", { class: "card" }, head, body);
  }

  if (session.stage === "checking") {
    body.append(h("p", { class: "verdict", role: "status" }, "⏳ Checking your answer…"));
    return h("section", { class: "card" }, head, body);
  }

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
      ok ? (session.aiAccepted ? "✅ Counts as correct!" : "✅ Correct!") : session.dontKnow ? "No problem — here's the answer:" : "❌ Not quite",
      session.given && !session.shown.options && h("span", { class: "ans" }, `You wrote: ${session.given}`),
      !ok || session.shown.options || session.aiAccepted || !sameAsAnswer(session.given, q.a) ? h("span", { class: "ans" }, `${ok && !session.shown.options ? "Exact answer" : "Answer"}: ${right}`) : null));
    const last = session.index >= total - 1 && !(!ok && !item.retry);
    const next = h("button", { class: "primary", onclick: () => commit(ok) }, last ? "Finish" : "Next →");
    body.append(h("div", { class: "row" }, next,
      !ok && !session.dontKnow && !session.shown.options && session.given && h("button", { onclick: () => { acceptMine(q); commit(true); } }, "I was right ✔")),
      ...(!ok && !session.dontKnow && !session.shown.options && session.given ? [h("p", { class: "small muted", style: "margin:.5rem 0 0" }, "Pressing “I was right” counts it and remembers your wording for next time.")] : []));
    setTimeout(() => next.focus(), 0);
  }
  return h("section", { class: "card" }, head, body);
}

function submitMc(chosen) {
  const q = currentQuestion();
  if (!q || !session || !q.opts) return;
  session.given = String(chosen || "");
  session.dontKnow = !chosen;
  session.verdict = Boolean(chosen) && chosen === q.a;
  session.stage = "feedback";
  render();
}

/** "Select two answers": 1 mark for each correct option chosen. */
function submitMc2(picked) {
  const q = currentQuestion();
  if (!q || !session || !q.opts || !q.answers) return;
  const got = picked.filter((o) => q.answers.includes(o)).length;
  session.picked = picked;
  session.picks = [];
  session.given = picked.join("; ");
  session.dontKnow = picked.length === 0;
  session.verdict = got === 2;
  session.result = { awarded: got, total: 2, points: [], feedback: "", source: "none" };
  session.stage = "feedback";
  render();
}

async function submitExam(written) {
  const q = currentQuestion();
  if (!q || !session) return;
  const given = String(written || "").trim();
  session.verdict = false;
  session.given = given;
  session.dontKnow = !given;
  if (!given) {
    session.result = { awarded: 0, total: q.marks, points: L.schemePoints(q.a).map((text) => ({ text, met: false })), feedback: "", source: "none" };
    session.stage = "feedback";
    return render();
  }
  session.stage = "marking";
  render();
  const at = session.index;
  let result;
  try {
    if (!cloud.signedIn) throw new Error("local");
    result = { ...(await cloud.markAnswer({ q: q.q, a: q.a, marks: q.marks, answer: given, kind: L.examKindOf(q), subject: ((state.subjects.find((s) => s.id === q.subjectId) || {}).name) || "", board: state.settings.board || "", ...(q.ctx ? { ctx: q.ctx } : {}) })), source: "ai" };
  } catch {
    result = { ...L.markLocally(given, q.a, q.marks, L.examKindOf(q)), feedback: "", source: "local" };
  }
  if (!session || session.index !== at || session.stage !== "marking") return;
  track("exam_taken");
  if (result.source === "ai") track("ai_marked");
  session.result = result;
  session.stage = "feedback";
  render();
}

function sameAsAnswer(given, expected) {
  const norm = (x) => String(x || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return L.acceptedAnswers(expected).some((a) => norm(a) === norm(given));
}

function acceptMine(q) {
  const mine = String(session.given || "").trim();
  if (!mine || L.isCorrect(mine, q.a)) return;
  const next = `${q.a}; ${mine}`;
  if (next.length <= 300 && !mine.includes(";")) { q.a = next; toast("Remembered — that wording will count next time ✓"); }
}

function check(given, dontKnow = false) {
  const q = currentQuestion();
  if (!q) return;
  session.given = dontKnow ? "" : String(given).trim();
  session.dontKnow = dontKnow;
  session.aiAccepted = false;
  session.verdict = !dontKnow && L.isCorrect(given, q.a);
  const typed = !session.shown.options;
  // Our own matching said no: let the AI decide if it's a typo, a synonym or another right answer.
  if (!session.verdict && !dontKnow && typed && session.given && cloud.signedIn) return askAiToCheck(q);
  session.stage = "feedback";
  render();
}

async function askAiToCheck(q) {
  const at = session.index;
  const given = session.given;
  session.stage = "checking";
  render();
  try {
    const r = await cloud.checkAnswer({ q: q.q, a: q.a, answer: given });
    if (r.correct) { session.verdict = true; session.aiAccepted = true; }
  } catch { /* the AI is unavailable: the normal "not quite" result stands */ }
  if (!session || session.index !== at || session.stage !== "checking") return;
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
  session.result = null;
  session.picks = [];
  session.picked = null;
  if (session.index >= session.queue.length) finishSession();
  save();
  render();
}

function finishSession() {
  if (session.finished) return;
  session.finished = true;
  track("quiz_finished");
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
const makeQuestion = (subjectId, q, a, choices = [], src = "", exam = null) => ({ id: L.uid(), subjectId, q, a, choices, ...(src ? { src: String(src).slice(0, 80) } : {}), ...(exam ? { exam: true, marks: exam.marks, ...(exam.kind ? { kind: exam.kind } : {}), ...(exam.ctx ? { ctx: exam.ctx } : {}), ...(exam.opts ? { opts: exam.opts } : {}), ...(exam.answers ? { answers: exam.answers, pick: 2 } : {}), ...(exam.fig ? { fig: exam.fig } : {}) } : {}), box: 1, due: today(), right: 0, wrong: 0 });

function addQuestion() {
  const q = draft.q.trim();
  const a = draft.a.trim();
  if (!q || !a) return toast("Add both a question and an answer.");
  const subjectId = ensureSubject();
  if (!subjectId) return;
  const wrong = [...new Set(draft.wrong.split(/\r?\n/).map((x) => x.trim()).filter(Boolean))].slice(0, 5);
  state.questions.push(makeQuestion(subjectId, q.slice(0, 500), a.slice(0, 300), wrong));
  state.stats.created++;
  track("question_added");
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
/** The subject the questions are going into (without " – Exam questions"), so the maker knows which question types the real exam has. */
function chosenSubjectName() {
  const chosen = state.subjects.find((x) => x.id === draft.subjectId);
  return (chosen ? chosen.name : draft.newSubject).replace(/ – Exam questions$/, "").replace(/^Example: /, "").replace(/\s*\(delete me\)$/i, "").trim().slice(0, 60);
}
/** The kinds of exam question ticked in the maker (or, until the person chooses, the ones this subject's real exam has). */
const examKinds = () => (Array.isArray(draft.kinds) ? draft.kinds.filter((k) => L.EXAM_KIND_IDS.includes(k)) : L.defaultExamKinds(chosenSubjectName(), draft.topic));
const MAX_COUNT = 50;
const maxCount = () => (draft.mode === "exam" ? 20 : MAX_COUNT);
function wantedCount() { return Math.max(1, Math.min(maxCount(), Math.round(Number(draft.count)) || (draft.mode === "exam" ? 5 : 10))); }
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
    // The AI writes up to 15 quick questions (or 5 full exam questions) at a time, so bigger amounts are asked for in rounds.
    const chunk = draft.mode === "exam" ? 4 : 15;
    const kinds = draft.mode === "exam" ? examKinds() : [];
    if (draft.mode === "exam" && !kinds.length) throw new Error("Tick at least one type of exam question.");
    const remaining = draft.mode === "exam" ? L.examPlan(total, kinds) : null; // which kind each question should be, in paper order
    for (let guard = 0; items.length < total && guard < Math.ceil(total / chunk) + 2; guard++) {
      if (total > chunk) { draft.progress = `Writing… ${items.length} of ${total}`; render(); }
      const part = remaining ? remaining.slice(0, chunk) : null;
      const ask = part ? part.length : Math.min(chunk, total - items.length);
      if (!ask) break;
      const r = await cloud.generate({ topic, subject: chosenSubjectName(), level: draft.level, count: ask, style: draft.style, styles: draft.styles, paper: draft.paper, board: draft.board, mode: draft.mode, ...(part ? { kinds, plan: part } : {}), avoid: items.slice(-30).map((x) => x.q) });
      const got = (Array.isArray(r && r.questions) ? r.questions : []).filter((x) => x && x.q && x.a);
      let fresh = 0;
      for (const x of got) {
        const k = L.normalise(x.q);
        if (seen.has(k) || items.length >= total) continue;
        seen.add(k); items.push(x); fresh++;
        if (remaining) { const i = remaining.indexOf(L.examKindOf(x)); if (i !== -1) remaining.splice(i, 1); }
      }
      if (!fresh) break;
    }
  } catch (e) {
    failure = e.message || "Something went wrong.";
    if (!cloud.signedIn) { draft.busy = false; draft.progress = ""; return sessionEnded(); }
  }
  draft.busy = false; draft.progress = "";
  if (items.length) {
    track("ai_questions");
    setPreview("ai", items);
    if (items.length < total) draft.aiError = `I managed ${items.length} of the ${total} you asked for${failure ? " (" + failure + ")" : ""}. You can press the button again for more.`;
  } else {
    draft.aiError = failure || "Nothing came back — try again.";
  }
  render();
}
async function checkMaker() {
  try {
    const res = await fetch(CONFIG.aiEndpoint || "/api/generate");
    let info = null;
    try { info = await res.json(); } catch { info = null; }
    if (!info || typeof info.ok !== "boolean") return toast("Not installed: the functions folder hasn't been deployed. Check GitHub has functions/api/generate.js, then redeploy.");
    if (!info.login) return toast("Almost: Cloudflare is missing the SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY variables.");
    if (!info.ai) return toast("Almost: Cloudflare is missing the Workers AI binding named AI.");
    toast(cloud.signedIn ? "The question maker is set up and ready ✓" : "The server side is ready ✓ — sign in to use it.");
  } catch {
    toast("Couldn't reach the server — check your internet connection.");
  }
}
async function copyPrompt() {
  draft.prompt = L.buildAiPrompt({ topic: draft.topic, level: draft.level, count: wantedCount(), style: draft.style, styles: draft.styles, paper: draft.paper, board: draft.board, mode: draft.mode, subject: chosenSubjectName(), ...(draft.mode === "exam" ? { kinds: examKinds() } : {}) });
  let copied = false;
  try { await navigator.clipboard.writeText(draft.prompt); copied = true; } catch { copied = false; }
  toast(copied ? "Prompt copied — paste it into another AI ✓" : "Copy the prompt from the box below.");
  render();
}
function addPreview() {
  const keep = draft.preview.items.filter((it) => it.keep);
  if (!keep.length) return toast("Tick at least one question to add.");
  let subjectId = null, examSubjectId = null, examSubjectName = "";
  if (keep.some((it) => !it.exam)) { subjectId = ensureSubject(draft.topic); if (!subjectId) return; }
  if (keep.some((it) => it.exam)) {
    // complete exam questions live in their own topic, e.g. "Biology – Exam questions"
    const chosen = state.subjects.find((x) => x.id === draft.subjectId);
    const base = (chosen ? chosen.name : draft.newSubject.trim() || draft.topic.trim()).replace(/ – Exam questions$/, "").slice(0, 40);
    if (!base) return toast("Give the subject a name first.");
    examSubjectName = `${base} – Exam questions`;
    const made = ensureSubjectNamed(examSubjectName).subject;
    if (!made) return toast("You have too many subjects already — delete one first.");
    examSubjectId = made.id;
  }
  for (const it of keep) state.questions.push(it.exam ? makeQuestion(examSubjectId, it.q, it.a, [], it.src || "", { marks: it.marks, opts: it.opts, answers: it.answers, kind: it.kind, ctx: it.ctx, fig: it.fig }) : makeQuestion(subjectId, it.q, it.a, it.choices || [], it.src || ""));
  state.stats.created += keep.length;
  draft.preview = null; draft.paste = ""; draft.prompt = "";
  checkBadges();
  save();
  toast(examSubjectName ? `Added ${plural(keep.length, "question")} to “${examSubjectName}” ✓` : `Added ${plural(keep.length, "question")} ✓`);
  render();
}
function deleteQuestion(id) {
  state.questions = state.questions.filter((q) => q.id !== id);
  save();
  render();
}
/** An in-app "are you sure?" box (instead of the browser's pop-up). Resolves true if confirmed. */
function askConfirm({ title, message, confirmLabel = "Yes", danger = true }) {
  return new Promise((resolve) => {
    const previous = document.activeElement;
    let box;
    const done = (value) => {
      document.removeEventListener?.("keydown", onKey, true);
      box.remove();
      try { previous && previous.focus && previous.focus(); } catch { /* ignore */ }
      resolve(value);
    };
    const cancel = h("button", { type: "button", onclick: () => done(false) }, "Cancel");
    const ok = h("button", { type: "button", class: danger ? "danger-solid" : "primary", onclick: () => done(true) }, confirmLabel);
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); done(false); }
      else if (e.key === "Tab") { e.preventDefault(); (document.activeElement === cancel ? ok : cancel).focus(); }
    };
    box = h("div", { class: "modal-back", onclick: (e) => { if (e.target === box) done(false); } },
      h("div", { class: "modal", role: "alertdialog", "aria-modal": "true", "aria-labelledby": "modal-title", "aria-describedby": "modal-msg" },
        h("h2", { id: "modal-title" }, title),
        h("p", { id: "modal-msg" }, message),
        h("div", { class: "row", style: "justify-content:flex-end;margin-top:1rem" }, cancel, ok)));
    document.body.append(box);
    document.addEventListener?.("keydown", onKey, true);
    setTimeout(() => cancel.focus(), 0);
  });
}

async function clearSubjectQuestions(id) {
  const s = state.subjects.find((x) => x.id === id);
  if (!s) return;
  const n = state.questions.filter((q) => q.subjectId === id).length;
  if (!n) return toast("There are no questions in that topic.");
  if (!(await askConfirm({ title: `Erase the questions in “${s.name}”?`, message: `All ${plural(n, "question")} will be erased. The topic stays, ready for new questions. This can't be undone.`, confirmLabel: "Erase questions" }))) return;
  if (!state.subjects.some((x) => x.id === id)) return;
  state.questions = state.questions.filter((q) => q.subjectId !== id);
  session = null;
  save();
  toast(`Erased ${plural(n, "question")} from “${s.name}” ✓`);
  render();
}
async function deleteSubject(id) {
  const s = state.subjects.find((x) => x.id === id);
  if (!s) return;
  const n = state.questions.filter((q) => q.subjectId === id).length;
  if (!(await askConfirm({ title: `Delete “${s.name}”?`, message: `The topic and its ${plural(n, "question")} will be deleted. This can't be undone.`, confirmLabel: "Delete topic" }))) return;
  if (!state.subjects.some((x) => x.id === id)) return;
  state.subjects = state.subjects.filter((x) => x.id !== id);
  state.questions = state.questions.filter((q) => q.subjectId !== id);
  draft.filter = "all";
  draft.subjectId = "";
  session = null;
  save();
  render();
}

function viewQuestions() {
  if (!draft.boardInit) { draft.boardInit = true; if (state.settings.board) draft.board = state.settings.board; }
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
      h("input", { type: "text", maxlength: 60, placeholder: "e.g. Biology (leave blank to use the topic below)", value: draft.newSubject, oninput: (e) => { draft.newSubject = e.target.value; }, onchange: () => { if (draft.mode === "exam") render(); } })));

  const opt = (value, label, current) => h("option", { value, selected: value === current }, label);
  const makeCard = h("section", { class: "card" },
    h("h2", {}, "Make questions on a topic"),
    h("p", { class: "muted small" }, "Type what you're revising and the app can write the questions for you — or copy a ready-made prompt for any other AI."),
    h("label", {}, "Topic", h("input", { type: "text", maxlength: 120, placeholder: "e.g. Photosynthesis, or The causes of World War 1", value: draft.topic, oninput: (e) => { draft.topic = e.target.value; }, onchange: () => { if (draft.mode === "exam") render(); },
      onkeydown: (e) => { if (e.key === "Enter" && cloud.enabled) makeWithAi(); } })),
    h("div", { class: "grid2" },
      h("label", {}, "Level", h("select", { onchange: (e) => { draft.level = e.target.value; } }, L.LEVELS.map((x) => opt(x, x, draft.level)))),
      h("label", {}, `How many (1–${maxCount()})`, h("input", { type: "number", inputmode: "numeric", min: "1", max: String(maxCount()), step: "1", value: draft.count, "aria-label": "How many questions",
        oninput: (e) => { draft.count = e.target.value; }, onblur: (e) => { draft.count = String(wantedCount()); e.target.value = draft.count; } }),
        h("span", { class: "row", style: "gap:.35rem;margin-top:.35rem" }, (draft.mode === "exam" ? [3, 5, 10, 15, 20] : [5, 10, 15, 25, 40]).map((n) => h("button", { type: "button", class: "small" + (String(n) === String(draft.count) ? " primary" : ""), onclick: () => { draft.count = String(n); render(); } }, String(n))))),
      draft.mode === "quick" && h("div", { style: "margin:0 0 .7rem" },
        h("div", { class: "small", style: "font-weight:700;margin-bottom:.35rem" }, "Style (tick one or more for a mix)"),
        h("div", { class: "chips", role: "group", "aria-label": "Question style" }, [["gapfill", "Gap fill"], ["typed", "Type the answer"], ["choice", "Multiple choice"]].map(([v, l]) => h("button", { type: "button", class: "chip" + (draft.styles.includes(v) ? " on" : ""), "aria-pressed": draft.styles.includes(v) ? "true" : "false", onclick: () => {
          if (draft.styles.includes(v)) { if (draft.styles.length === 1) return toast("Keep at least one style ticked."); draft.styles = draft.styles.filter((x) => x !== v); } else draft.styles = ["gapfill", "typed", "choice"].filter((x) => x === v || draft.styles.includes(x));
          draft.style = draft.styles[0];
          render();
        } }, l)))),
      h("label", {}, "Exam board", h("select", { "aria-label": "Exam board", onchange: (e) => { draft.board = e.target.value; state.settings.board = e.target.value === "Any exam board" ? "" : e.target.value; save(); render(); } }, L.BOARDS.map((x) => opt(x, x, draft.board))))),
    h("label", {}, "Type of questions", h("select", { "aria-label": "Type of questions", onchange: (e) => { draft.mode = e.target.value; if (draft.mode === "exam" && Number(draft.count) > 20) draft.count = "5"; render(); } },
      [["quick", "Quick questions (short answers)"], ["exam", "Complete exam questions (marks + mark scheme)"]].map(([v, l]) => opt(v, l, draft.mode)))),
    draft.mode === "exam" && h("p", { class: "small muted", style: "margin:0 0 .6rem" }, "Questions set the way real papers set them, with a mark scheme. You write your answer and the app marks it for you (6 and 9 markers are marked in levels, like the real thing). They're saved as their own topic, like “Biology – Exam questions”, so they stay separate from your quick questions."),
    draft.mode === "exam" && (() => {
      const chosen = examKinds();
      const prof = L.examProfile(chosenSubjectName(), draft.topic);
      const shown = L.EXAM_KIND_IDS.filter((k) => draft.allKinds || prof.offer.includes(k) || chosen.includes(k));
      const hidden = L.EXAM_KIND_IDS.length - shown.length;
      const toggle = (k) => {
        const now = new Set(chosen);
        if (now.has(k)) { if (now.size === 1) return toast("Keep at least one type ticked."); now.delete(k); } else now.add(k);
        draft.kinds = L.EXAM_KIND_IDS.filter((x) => now.has(x));
        render();
      };
      const plan = L.examPlan(wantedCount(), chosen);
      const mix = L.EXAM_KIND_IDS.filter((k) => plan.includes(k)).map((k) => `${plan.filter((x) => x === k).length} × ${L.kindLabel(k, prof).toLowerCase()} (${L.EXAM_KINDS[k].marks})`).join(", ");
      const f = L.examFormats(chosenSubjectName(), draft.topic);
      return h("div", { style: "margin:0 0 .7rem" },
        h("div", { class: "small", style: "font-weight:700;margin-bottom:.35rem" }, `Which kinds of ${chosenSubjectName() || draft.topic ? "question for this subject" : "question"}?`),
        prof.note && h("p", { class: "small muted", style: "margin:0 0 .4rem" }, prof.note),
        h("div", { class: "chips", role: "group", "aria-label": "Kinds of exam question" }, shown.map((k) => h("button", { type: "button", class: "chip" + (chosen.includes(k) ? " on" : ""), "aria-pressed": chosen.includes(k) ? "true" : "false", onclick: () => toggle(k) },
          `${L.kindLabel(k, prof)} (${L.EXAM_KINDS[k].marks})`))),
        hidden > 0 && h("p", { class: "small", style: "margin:.4rem 0 0" }, h("button", { type: "button", class: "ghost", style: "min-height:34px;padding:.2rem .7rem", onclick: () => { draft.allKinds = true; render(); } }, `Show ${hidden} more kind${hidden === 1 ? "" : "s"} (not usual in this subject)`)),
        h("p", { class: "small muted", style: "margin:.45rem 0 0" }, `You’ll get a paper-style mix: ${mix}.`),
        L.isBusinessSubject(chosenSubjectName(), draft.topic) && h("p", { class: "small muted", style: "margin:.25rem 0 0" }, "The “Outline one”, “Analyse” and “Justify” questions are set around a made-up business with a short case-study extract, like the Edexcel papers."),
        f.figures.length > 0 && h("p", { class: "small muted", style: "margin:.25rem 0 0" }, `Some questions may also come with a ${f.figures.map((x) => (x === "table" ? "table" : x + " chart")).join(", ").replace(/line chart/, "line graph").replace(/scatter chart/, "scatter graph")}.`));
    })(),
    h("p", { class: "small muted", style: "margin:0 0 .4rem" }, draft.board !== "Any exam board" ? `Questions will follow the ${draft.board} specification. Your board is remembered.` : "Pick your exam board and the questions will follow its specification. It's remembered for next time."),
    h("label", { class: "row", style: "gap:.6rem;font-weight:600;margin:.3rem 0 .4rem" },
      h("input", { type: "checkbox", style: "width:auto;min-height:0;margin:0", checked: draft.paper, onchange: (e) => { draft.paper = e.target.checked; render(); } }),
      h("span", {}, "📄 Past-paper style questions")),
    draft.paper && h("div", {},
      h("p", { class: "small muted", style: "margin:0 0 .7rem" },
        "Questions are written to match real exam papers (same topics, wording and command words) and are tagged “past-paper style”. Real papers are copyrighted and an AI can't reliably quote them, so for the genuine ones use the board's own site: ",
        ...[["AQA", "https://www.aqa.org.uk/find-past-papers-and-mark-schemes"], ["Edexcel", "https://qualifications.pearson.com/en/support/support-topics/exams/past-papers.html"], ["OCR", "https://www.ocr.org.uk/qualifications/past-paper-finder/"], ["WJEC", "https://www.wjec.co.uk/students/past-papers/"]]
          .flatMap(([n, u], i) => [i ? " · " : "", h("a", { href: u, target: "_blank", rel: "noopener noreferrer" }, n)]),
        ". Paste any real question into “Add one question” or the list box below.")),
    draft.aiError && h("div", { class: "banner", role: "alert" }, draft.aiError),
    h("div", { class: "row" },
      cloud.enabled && h("button", { class: "primary", disabled: draft.busy, onclick: makeWithAi }, draft.busy ? (draft.progress || "Writing questions…") : "✨ Make questions for me"),
      h("button", { onclick: copyPrompt }, "Copy a prompt for another AI"),
      cloud.enabled && h("button", { class: "ghost small", onclick: checkMaker }, "Check it's set up")),
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
        h("span", {}, h("b", {}, it.q),
          it.fig && figureView(it.fig),
          it.opts && h("span", { class: "a" }, it.opts.map((o, i) => `${LETTERS[i]}. ${o}`).join("    ")),
          it.ctx && h("span", { class: "a" }, `Case study: ${it.ctx}`),
          h("span", { class: "a" }, `${it.opts ? (it.answers ? "Correct answers" : "Correct answer") : it.exam ? `Mark scheme (${markWord(it.marks)})` : "Answer"}: ${it.opts ? correctLabels(it) : it.a}${it.choices && it.choices.length ? `  ·  wrong options: ${it.choices.join(", ")}` : ""}`),
          it.exam && h("span", { class: "tag" }, `${it.opts ? "🔠 " : "📝 "}${kindTag(it, chosenSubjectName()) ? kindTag(it, chosenSubjectName()) + " · " : ""}${markWord(it.marks)}`), it.fig && h("span", { class: "tag" }, `📊 ${it.fig.type === "table" ? "table" : it.fig.type + " chart"}`),
          it.duplicate && h("span", { class: "tag" }, "already in this subject")))),
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
        h("div", { class: "txt" }, h("div", {}, q.q), q.exam && h("div", { class: "small muted" }, `📝 ${kindTag(q, ((state.subjects.find((s) => s.id === q.subjectId) || {}).name) || "") ? kindTag(q, ((state.subjects.find((s) => s.id === q.subjectId) || {}).name) || "") + " · " : ""}${markWord(q.marks)}`),
          q.ctx && h("div", { class: "a" }, `Case study: ${q.ctx}`),
          h("div", { class: "a" }, q.opts ? `Multiple choice — correct: ${correctLabels(q)}` : q.exam ? `Mark scheme (${markWord(q.marks)}): ${q.a}` : `Answer: ${q.a}${q.choices.length ? "  ·  multiple choice" : ""}`),
          q.fig && h("div", { class: "small muted" }, `📊 Includes a ${q.fig.type === "table" ? "table" : q.fig.type + " chart"}${q.fig.title ? ": " + q.fig.title : ""}`),
          h("div", { class: "small muted" }, `${q.src ? "📄 " + q.src + " · " : ""}${names.get(q.subjectId) || ""} · box ${q.box}/5 · next ${q.due <= today() ? "now" : niceDate(q.due)}`)),
        h("button", { class: "ghost small danger", "aria-label": `Delete question: ${q.q}`, onclick: () => deleteQuestion(q.id) }, "✕"))),
      shown.length > 150 && h("p", { class: "muted small" }, `Showing the first 150 of ${shown.length}. Use the search box to narrow it down.`),
    ].filter(Boolean));
  };
  const list = h("section", { class: "card" },
    h("div", { class: "row space" }, h("h2", {}, `Your questions (${state.questions.length})`),
      draft.filter !== "all" && h("span", { class: "row", style: "gap:.4rem" },
        h("button", { class: "ghost small danger", onclick: () => clearSubjectQuestions(draft.filter) }, "Erase its questions"),
        h("button", { class: "ghost small danger", onclick: () => deleteSubject(draft.filter) }, "Delete this subject"))),
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
        h("span", { class: "row", style: "gap:.4rem" },
          h("button", { class: "small danger", disabled: n === 0, "aria-label": `Erase all questions in ${sub.name}`, onclick: () => clearSubjectQuestions(sub.id) }, "🧹 Erase questions"),
          h("button", { class: "small danger", "aria-label": `Delete topic ${sub.name}`, onclick: () => deleteSubject(sub.id) }, "🗑 Delete topic")));
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
    if (!(await askConfirm({ title: "Load this backup?", message: `Everything you have now will be replaced with the backup (${plural(next.questions.length, "question")}, ${next.stats.points} points).`, confirmLabel: "Replace everything" }))) return;
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
async function resetAll() {
  if (!(await askConfirm({ title: "Erase everything?", message: "All your questions, points, badges and unlocked items will be erased. This can't be undone.", confirmLabel: "Erase everything" }))) return;
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
