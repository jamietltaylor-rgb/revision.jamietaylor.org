// Runs the real app code against a pretend web page and a pretend Supabase, so crashes show up before deploying.
// Usage: node tests/smoke.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeSupabase } from "./fake-supabase.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, "..", "public");

// ---------- a very small fake browser page ----------
class Node_ { constructor(t) { this.nodeType = t; this.parent = null; } }
class Text_ extends Node_ { constructor(s) { super(3); this.data = String(s); } get textContent() { return this.data; } }
class El extends Node_ {
  constructor(tag) { super(1); this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.listeners = {}; this.className = ""; this.value = ""; this.checked = false; this.files = null; this.id = ""; this.style = { props: {}, setProperty(k, v) { this.props[k] = v; }, removeProperty(k) { delete this.props[k]; } }; }
  get textContent() { return this.children.map((c) => c.textContent).join(""); }
  set textContent(v) { this.children = [new Text_(v)]; }
  append(...kids) { for (const k of kids) { assert.ok(k && k.nodeType, "append() was given something that isn't a node: " + String(k)); k.parent = this; this.children.push(k); } }
  replaceChildren(...kids) { this.children = []; this.append(...kids); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === "id") this.id = String(v); }
  getAttribute(k) { return this.attrs[k]; }
  removeAttribute(k) { delete this.attrs[k]; }
  addEventListener(t, f) { (this.listeners[t] ??= []).push(f); }
  focus() {} click() { fire(this, "click"); }
}
const fire = (el, type, extra = {}) => { for (const f of el.listeners[type] ?? []) f({ target: el, ...extra }); };
const all = (root, pred, out = []) => { if (root.nodeType === 1) { if (pred(root)) out.push(root); root.children.forEach((c) => all(c, pred, out)); } return out; };

function makeWorld({ config, fetchFn, label }) {
  const world = { label, timers: [], windowListeners: {}, docListeners: {} };
  world.reset = () => {
    world.app = new El("main"); world.nav = new El("nav"); world.user = new El("div"); world.toasts = new El("div");
    world.html = new El("html"); world.head = new El("head");
    world.toastLog = [];
    const log = world.toastLog, plain = world.toasts.append.bind(world.toasts);
    world.toasts.append = (...k) => { k.forEach((x) => log.push(x.textContent)); plain(...k); };
  };
  world.reset();
  const store = new Map();
  world.store = store;
  world.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  world.install = () => {
    globalThis.document = {
      createElement: (t) => new El(t), createTextNode: (s) => new Text_(s), body: new El("body"), head: world.head, documentElement: world.html,
      visibilityState: "visible", addEventListener: (t, f) => { (world.docListeners[t] ??= []).push(f); },
      getElementById: (id) => ({ app: world.app, nav: world.nav, user: world.user, toasts: world.toasts }[id] ?? all(world.head, (e) => e.id === id)[0] ?? all(world.user, (e) => e.id === id)[0] ?? null),
    };
    globalThis.window = { addEventListener: (t, f) => { (world.windowListeners[t] ??= []).push(f); }, scrollTo() {} };
    globalThis.location = { hash: "" };
    globalThis.localStorage = world.localStorage;
    globalThis.confirm = () => true;
    globalThis.setTimeout = (fn, ms) => { world.timers.push(fn); return world.timers.length; };
    globalThis.clearTimeout = () => {};
    globalThis.fetch = fetchFn;
    URL.createObjectURL = () => "blob:x"; URL.revokeObjectURL = () => {};
  };
  world.install();
  // helpers
  const w = world;
  w.say = (text) => assert.ok(w.app.textContent.includes(text), `[${label}] expected "${text}" on screen, got:\n${w.app.textContent.slice(0, 600)}`);
  w.notSay = (text) => assert.ok(!w.app.textContent.includes(text), `[${label}] did not expect "${text}" on screen`);
  w.buttons = (text, root = w.app) => all(root, (e) => e.tagName === "BUTTON" && e.textContent === text);
  w.btn = (text, nth = 0) => { const f = w.buttons(text); assert.ok(f[nth], `[${label}] no button "${text}" on screen:\n${w.app.textContent.slice(0, 500)}`); return f[nth]; };
  w.typeInto = (el, v) => { el.value = v; fire(el, "input"); };
  w.input = (pred) => { const f = all(w.app, (e) => (e.tagName === "INPUT" || e.tagName === "TEXTAREA") && pred(e)); assert.ok(f[0], `[${label}] input not found`); return f[0]; };
  w.byLabel = (aria) => w.input((e) => e.attrs["aria-label"] === aria);
  w.byPlaceholder = (ph) => w.input((e) => e.attrs.placeholder === ph);
  w.tab = (i) => { fire(w.nav.children[i], "click"); };
  w.flush = async () => { for (let i = 0; i < 12; i++) { const t = w.timers.splice(0); t.forEach((f) => f()); await new Promise((r) => setImmediate(r)); } };
  w.start = () => { all(w.app, (e) => e.tagName === "SELECT").forEach((sel) => { sel.value = sel.attrs.id === "length" ? "10" : "all"; }); w.btn("Start").click(); };
  w.shopItem = (name) => all(w.app, (e) => e.className === "shop-item" && e.children[0].textContent.includes(name))[0];
  return world;
}
const dirCopy = (config) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "revise-smoke-"));
  fs.cpSync(publicDir, path.join(dir, "public"), { recursive: true });
  if (config) fs.writeFileSync(path.join(dir, "public", "config.js"), `export const CONFIG = ${JSON.stringify(config)};`);
  return pathToFileURL(path.join(dir, "public", "app.js")).href;
};
let runNo = 0;
const boot = async (world, url) => { world.reset(); world.install(); world.timers.length = 0; await import(`${url}?run=${++runNo}`); await world.flush(); };

const ANSWERS = { "What is the capital of France?": "Paris", "Which is the longest river in the UK?": "River Severn", "What is the largest ocean on Earth?": "Pacific", "How many continents are there?": "seven", "What is the capital of Australia?": "Canberra" };
async function playRound(w, { wrongFirst = false } = {}) {
  w.tab(1); w.say("Start a round"); w.start();
  let wrongOnce = !wrongFirst;
  for (let guard = 0; guard < 40 && !w.app.textContent.includes("right first time"); guard++) {
    const qEl = all(w.app, (e) => e.className === "quiz-q")[0];
    assert.ok(qEl, "no question on screen: " + w.app.textContent.slice(0, 300));
    const right = ANSWERS[qEl.textContent]; assert.ok(right, "unknown question " + qEl.textContent);
    const input = all(w.app, (e) => e.tagName === "INPUT" && e.attrs.id === "answer")[0];
    const choice = (pred) => all(w.app, (e) => e.tagName === "BUTTON" && e.parent?.className === "choices" && pred(e.textContent))[0];
    if (!wrongOnce && !input) { choice((t) => t !== right).click(); w.say("Not quite"); wrongOnce = true; w.btn("Next →").click(); continue; }
    if (input) { input.value = right; fire(input, "keydown", { key: "Enter" }); } else choice((t) => t === right).click();
    w.say("Correct!"); (w.buttons("Finish").length ? w.btn("Finish") : w.btn("Next →")).click();
  }
  w.say("right first time");
}

// ======================= A: no accounts set up (works on its own) =======================
{
  const w = makeWorld({ label: "local", fetchFn: async () => { throw new Error("no network expected"); } });
  await boot(w, dirCopy(null));
  w.say("Ready to revise?"); w.say("Pip the Egg"); assert.equal(w.nav.children.length, 4); assert.equal(w.user.children.length, 0, "no account bar without logins");
  await playRound(w, { wrongFirst: true });
  let saved = JSON.parse(w.store.get("revise-app-v1"));
  assert.equal(saved.v, 2); assert.equal(saved.stats.answered, 5); assert.ok(saved.stats.points >= 40);
  w.btn("Back home").click();
  w.tab(2); w.say("Make questions on a topic");
  assert.equal(w.buttons("✨ Make questions for me").length, 0, "no AI button without an account");
  w.typeInto(w.byPlaceholder("e.g. Photosynthesis, or The causes of World War 1"), "Photosynthesis");
  await w.btn("Copy a prompt for another AI").listeners.click[0]();
  w.say("Prompt to copy"); assert.ok(all(w.app, (e) => e.tagName === "TEXTAREA" && e.textContent.includes('"Photosynthesis"')).length === 1);
  w.typeInto(w.byLabel("Questions to add"), "What is 7 x 8? | 56\nCapital of Italy | Rome | Milan | Turin\nWhat is the capital of France? | Paris\nnonsense line");
  w.btn("Check the list").click(); w.say("Check these before adding (3)"); w.say("already in this subject");
  assert.equal(all(w.app, (e) => e.tagName === "INPUT" && e.attrs.type === "checkbox" && e.checked).length, 2, "duplicates start unticked");
  w.say("1 line couldn't be read");
  w.btn("Add 2 questions").click();
  saved = JSON.parse(w.store.get("revise-app-v1")); assert.equal(saved.questions.length, 7);
  assert.deepEqual(saved.questions.find((q) => q.a === "Rome").choices, ["Milan", "Turin"]);
  // rewards screen
  w.tab(3); w.say("Weekly quests"); w.say("Chests"); w.say("Shop"); w.say("Real-life rewards"); w.say("Watch an episode (80)");
  w.btn("＋ Watch an episode (80)").click(); w.say("80 points");
  fire(w.nav.children[3], "click");
  console.log("A: local mode ok");
}

// ======================= B: with accounts =======================
{
  const fake = fakeSupabase();
  const aiCalls = [];
  let aiMode = "ok";
  const fetchFn = async (url, init) => {
    if (String(url).startsWith("/api/generate")) {
      aiCalls.push(JSON.parse(init.body));
      assert.ok(init.headers.Authorization.startsWith("Bearer "), "AI call must carry the login token");
      if (aiMode === "missing") return new Response("not found", { status: 404 });
      return new Response(JSON.stringify({ questions: [{ q: "Which gas do plants take in?", a: "Carbon dioxide", choices: ["Oxygen", "Helium", "Argon"] }, { q: "Where does photosynthesis happen?", a: "Chloroplasts", choices: [] }, { q: "What colour is chlorophyll?", a: "Green", choices: [] }] }), { status: 200 });
    }
    return fake.fetch(url, init);
  };
  const config = { supabaseUrl: "https://x.supabase.co", supabaseKey: "sb_publishable_test", usernameDomain: "revise.test", aiEndpoint: "/api/generate" };
  const url = dirCopy(config);
  const w = makeWorld({ label: "cloud", fetchFn });
  await boot(w, url);

  // sign-up screen
  w.say("Sign in to keep your questions"); assert.equal(w.nav.children.length, 0, "no tabs before signing in");
  w.btn("Create account", 0).click(); w.say("Repeat password"); w.say("No email needed");
  w.typeInto(w.input((e) => e.attrs.autocomplete === "username"), "Jamie_T");
  const pw = () => all(w.app, (e) => e.attrs.type === "password");
  w.typeInto(pw()[0], "secret1"); w.typeInto(pw()[1], "different");
  w.btn("Create account", 1).click(); await w.flush(); w.say("don't match");
  w.typeInto(pw()[1], "secret1"); w.typeInto(pw()[0], "123"); w.typeInto(pw()[1], "123");
  w.btn("Create account", 1).click(); await w.flush(); w.say("at least 6 characters");
  w.typeInto(pw()[0], "secret1"); w.typeInto(pw()[1], "secret1");
  w.btn("Create account", 1).click(); await w.flush();
  w.say("Ready to revise?"); assert.equal(w.nav.children.length, 4); assert.ok(w.user.textContent.includes("jamie_t"), "shows the username, not the fake email");
  assert.equal(fake.rows.size, 1, "first save reached the cloud"); assert.ok(w.user.textContent.includes("Saved"));
  const userId = [...fake.users.values()][0].id;

  // a round, the daily-goal chest, opening it
  w.tab(3); const goal = w.byLabel("Daily goal in questions"); goal.value = "3"; fire(goal, "change");
  await playRound(w, { wrongFirst: true }); w.say("You earned a chest");
  await w.flush();
  let cloud = fake.rows.get(userId).data;
  assert.equal(cloud.stats.answered, 5); assert.equal(cloud.chests, 1, "the chest was saved to the account"); assert.equal(cloud.stats.goalDays, 1);
  w.btn("Open chest").click(); w.say("You have 1 chest waiting"); w.btn("Open a chest").click(); w.say("You found"); await w.flush();
  cloud = fake.rows.get(userId).data; assert.equal(cloud.chests, 0); assert.equal(cloud.stats.chestsOpened, 1); assert.ok([20, 35, 50, 80, 150].some((n) => cloud.stats.points >= n));
  w.say("No chests yet");

  // shop: unlock a hat, use a free theme
  w.say("Weekly quests"); assert.ok(w.buttons("In progress").length === 3 && w.buttons("In progress").every((b) => b.attrs.disabled !== undefined), "quests start unfinished");
  const cap = w.btn("Unlock · 50 pts", 0); assert.equal(cap.attrs.disabled, undefined, "enough points for the cheapest hat");
  cap.click(); await w.flush(); w.say("Use");
  const hatUse = w.buttons("Use", w.shopItem("Cap")); hatUse[0].click(); await w.flush();
  cloud = fake.rows.get(userId).data; assert.equal(cloud.equipped.hat, "hat:Cap"); assert.deepEqual(cloud.owned, ["hat:Cap"]);
  w.tab(0); w.say("🧢");
  w.tab(3); w.buttons("Use", w.shopItem("Night"))[0].click(); await w.flush();
  assert.equal(w.html.attrs["data-palette"], "night"); assert.equal(w.html.style.props["--pal-bg"], "#141414");
  assert.ok(w.buttons("Unlock · 100 pts", w.shopItem("Linen")).length === 1);
  w.btn("Use original colours").click(); assert.equal(w.html.attrs["data-palette"], undefined);
  // fonts load only when the shop is opened
  assert.ok(all(w.head, (e) => e.id === "look-previews").length === 1);

  // AI questions: preview, untick, add
  w.tab(2); w.typeInto(w.byPlaceholder("e.g. Photosynthesis, or The causes of World War 1"), "Photosynthesis");
  w.btn("✨ Make questions for me").click(); await w.flush();
  assert.equal(aiCalls.length, 1); assert.deepEqual([aiCalls[0].topic, aiCalls[0].level, aiCalls[0].count, aiCalls[0].style], ["Photosynthesis", "GCSE", 10, "mixed"]);
  w.say("Check these before adding (3)"); w.say("Made by AI");
  const boxes = all(w.app, (e) => e.tagName === "INPUT" && e.attrs.type === "checkbox");
  boxes[2].checked = false; fire(boxes[2], "change");
  w.btn("Add 2 questions").click(); await w.flush();
  assert.equal(fake.rows.get(userId).data.questions.length, 7);
  aiMode = "missing"; w.btn("✨ Make questions for me").click(); await w.flush(); w.say("README step 4");

  // pick a brand-new subject named after the topic
  const sel = all(w.app, (e) => e.attrs.id === "form-subject")[0]; sel.value = "__new"; fire(sel, "change");
  aiMode = "ok"; w.btn("✨ Make questions for me").click(); await w.flush(); w.btn("Add 3 questions").click(); await w.flush();
  assert.ok(fake.rows.get(userId).data.subjects.some((s) => s.name === "Photosynthesis"), "subject named after the topic");

  // offline edits sync later
  fake.offline = true;
  w.typeInto(w.byPlaceholder("Mitochondria").parent ? w.byPlaceholder("Mitochondria") : null, "Water"); w.typeInto(w.input((e) => e.attrs.id === "new-q"), "What is H2O?");
  w.btn("Add question").click(); await w.flush(); assert.ok(w.user.textContent.includes("Offline"), "shows offline status");
  const before = fake.rows.get(userId).data.questions.length;
  fake.offline = false; for (const f of w.windowListeners.online ?? []) f(); await w.flush();
  assert.equal(fake.rows.get(userId).data.questions.length, before + 1, "queued change was uploaded when back online"); assert.ok(w.user.textContent.includes("Saved"));

  // changes made on another device show up when you come back to the page
  const row = fake.rows.get(userId); const bumped = structuredClone(row.data); bumped.stats.points += 500; bumped.savedAt = new Date(Date.now() + 60000).toISOString(); fake.rows.set(userId, { data: bumped, updated_at: bumped.savedAt });
  for (const f of w.docListeners.visibilitychange ?? []) f(); await w.flush(); assert.ok(w.toastLog.join("|").includes("Updated from your other device")); w.tab(0); w.say(`${bumped.stats.points} points`); w.tab(3);

  // sign out, wrong password, sign back in with NO local copy: data comes from the account
  w.buttons("Sign out", w.user)[0].click(); await w.flush(); w.say("Sign in to keep your questions");
  w.store.delete(`revise-app-v2-${userId}`);
  w.typeInto(w.input((e) => e.attrs.autocomplete === "username"), "jamie_t"); w.typeInto(pw()[0], "nope");
  w.btn("Sign in", 1).click(); await w.flush(); w.say("Wrong username or password.");
  w.typeInto(pw()[0], "secret1"); w.btn("Sign in", 1).click(); await w.flush();
  w.say("Ready to revise?"); w.tab(2); w.say(`Your questions (${fake.rows.get(userId).data.questions.length})`);
  assert.equal(JSON.parse(w.store.get(`revise-app-v2-${userId}`)).stats.points, fake.rows.get(userId).data.stats.points);

  // a revoked session drops you back to the sign-in page without crashing
  fake.revokeAll(); fake.expireAll();
  w.typeInto(w.input((e) => e.attrs.id === "new-q"), "Another?"); w.typeInto(w.byPlaceholder("Mitochondria"), "Yes"); w.btn("Add question").click(); await w.flush();
  w.say("Your session ended"); assert.equal(w.nav.children.length, 0);
  console.log("B: accounts ok");

  // ---------- C: opening the page again later; and old progress from before accounts existed ----------
  const fake2 = fakeSupabase(); const w2 = makeWorld({ label: "legacy", fetchFn: (u, i) => fake2.fetch(u, i) });
  const legacy = { v: 1, subjects: [{ id: "s1", name: "Old subject" }], questions: [{ id: "q1", subjectId: "s1", q: "Old question?", a: "yes", box: 3, due: "2026-11-01" }], stats: { points: 321 }, treats: [{ id: "t1", name: "Old treat", cost: 100 }] };
  w2.store.set("revise-app-v1", JSON.stringify(legacy));
  await boot(w2, url);
  w2.btn("Create account", 0).click();
  w2.typeInto(w2.input((e) => e.attrs.autocomplete === "username"), "newkid");
  const pw2 = () => all(w2.app, (e) => e.attrs.type === "password"); w2.typeInto(pw2()[0], "abcdef"); w2.typeInto(pw2()[1], "abcdef");
  w2.btn("Create account", 1).click(); await w2.flush();
  assert.ok(w2.toastLog.join("|").includes("moved into your account")); w2.say("321 points");
  const id2 = [...fake2.users.values()][0].id; assert.equal(fake2.rows.get(id2).data.stats.points, 321); assert.equal(fake2.rows.get(id2).data.treats[0].name, "Old treat");
  // reload: restores the saved login straight into the app
  await boot(w2, url); w2.say("Ready to revise?"); w2.say("321 points");
  // a project with email confirmation still on says how to fix it
  const fake3 = fakeSupabase({ confirmEmail: true }); const w3 = makeWorld({ label: "confirm", fetchFn: (u, i) => fake3.fetch(u, i) });
  await boot(w3, url); w3.btn("Create account", 0).click(); w3.typeInto(w3.input((e) => e.attrs.autocomplete === "username"), "someone");
  const pw3 = () => all(w3.app, (e) => e.attrs.type === "password"); w3.typeInto(pw3()[0], "abcdef"); w3.typeInto(pw3()[1], "abcdef"); w3.btn("Create account", 1).click(); await w3.flush();
  w3.say("Confirm email");
  console.log("C: restore, legacy adoption and confirm-email message ok");
}
console.log("SMOKE TEST PASSED");
