import test from "node:test";
import assert from "node:assert/strict";
import { createCloud, usernameToEmail, displayName, CloudError } from "../public/cloud.js";
import { fakeSupabase } from "./fake-supabase.mjs";

const CONFIG = { supabaseUrl: "https://x.supabase.co", supabaseKey: "sb_publishable_test", usernameDomain: "revision.example.org", aiEndpoint: "/api/generate" };
const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), m }; };
const make = (fake, storage = memory()) => ({ cloud: createCloud(CONFIG, { fetchFn: fake.fetch, storage, now: () => fake.clock }), storage });
const fails = async (p, code) => { try { await p; } catch (e) { assert.ok(e instanceof CloudError, String(e)); if (code) assert.equal(e.code, code); return e; } assert.fail("should have thrown"); };

test("usernames", () => {
  assert.equal(usernameToEmail("  Jamie_T ", "d.org"), "jamie_t@d.org");
  assert.equal(usernameToEmail("me@mail.com", "d.org"), "me@mail.com");
  assert.equal(usernameToEmail("ab", "d.org"), null);
  assert.equal(usernameToEmail("has space", "d.org"), null);
  assert.equal(usernameToEmail("a".repeat(31), "d.org"), null);
  assert.equal(displayName("jamie@d.org", "d.org"), "jamie");
  assert.equal(displayName("me@mail.com", "d.org"), "me@mail.com");
});

test("sign up needs no email confirmation, then sign in and out", async () => {
  const fake = fakeSupabase(); const { cloud, storage } = make(fake);
  assert.ok(cloud.enabled);
  await cloud.signUp("Jamie", "secret1");
  assert.ok(cloud.signedIn && fake.users.has("jamie@revision.example.org"));
  assert.ok(storage.m.get("revise-session"));
  await cloud.signOut();
  assert.ok(!cloud.signedIn && !storage.m.get("revise-session"));
  await cloud.signIn("jamie", "secret1");
  assert.equal(cloud.user.email, "jamie@revision.example.org");
});

test("friendly errors", async () => {
  const fake = fakeSupabase(); const { cloud } = make(fake);
  await cloud.signUp("jamie", "secret1"); await cloud.signOut();
  assert.equal((await fails(cloud.signUp("jamie", "another1"), "user_already_exists")).message, "That username is already taken — try another.");
  assert.equal((await fails(cloud.signIn("jamie", "wrong"), "invalid_credentials")).message, "Wrong username or password.");
  assert.equal((await fails(cloud.signIn("nobody", "secret1"), "invalid_credentials")).message, "Wrong username or password.");
  await fails(cloud.signUp("x", "secret1"), "bad_username");
  await fails(cloud.signUp("valid_name", "123"), "weak_password");
  fake.offline = true;
  assert.ok((await fails(cloud.signIn("jamie", "secret1"), "offline")).message.includes("internet"));
});

test("if email confirmation is still on, the sign-up explains how to fix it", async () => {
  const fake = fakeSupabase({ confirmEmail: true }); const { cloud } = make(fake);
  const e = await fails(cloud.signUp("jamie", "secret1"), "email_not_confirmed");
  assert.ok(e.message.includes("Confirm email"));
  assert.ok(!cloud.signedIn);
});

test("saving and loading, and each user only sees their own data", async () => {
  const fake = fakeSupabase(); const { cloud } = make(fake);
  await cloud.signUp("alice", "secret1");
  assert.equal(await cloud.loadData(), null);
  await cloud.saveData({ points: 5 });
  await cloud.saveData({ points: 9 });
  assert.equal(fake.rows.size, 1);
  assert.deepEqual((await cloud.loadData()).data, { points: 9 });
  const other = make(fake).cloud; await other.signUp("bob", "secret1");
  assert.equal(await other.loadData(), null);
  assert.ok(fake.log.some((l) => l.includes("on_conflict=user_id")));
});

test("the session is restored after a reload, and refreshed when it is about to expire", async () => {
  const fake = fakeSupabase({ ttl: 600 }); const storage = memory();
  const first = make(fake, storage).cloud; await first.signUp("jamie", "secret1"); await first.saveData({ a: 1 });
  const again = make(fake, storage).cloud;
  assert.ok(await again.restore());
  assert.deepEqual((await again.loadData()).data, { a: 1 });
  fake.advance(560 * 1000); // under a minute left
  fake.log.length = 0;
  await again.loadData();
  assert.ok(fake.log.some((l) => l.includes("grant_type=refresh_token")), "refreshed first");
  fake.advance(5 * 1000);
  assert.ok((await again.loadData()).data);
});

test("a rejected token is refreshed once and retried", async () => {
  const fake = fakeSupabase(); const { cloud } = make(fake);
  await cloud.signUp("jamie", "secret1"); await cloud.saveData({ a: 1 });
  fake.expireAll();
  // expireAll also drops refresh-ability? no: refresh tokens still work
  await cloud.saveData({ a: 2 });
  assert.deepEqual((await cloud.loadData()).data, { a: 2 });
});

test("a dead session signs you out; being offline keeps you signed in", async () => {
  const fake = fakeSupabase({ ttl: 600 }); const storage = memory();
  const c1 = make(fake, storage).cloud; await c1.signUp("jamie", "secret1");
  fake.advance(590 * 1000);
  fake.offline = true;
  const c2 = make(fake, storage).cloud;
  assert.ok(await c2.restore(), "offline at start-up still shows the saved login");
  fake.offline = false;
  const c3 = make(fake, memory()).cloud;
  assert.equal(await c3.restore(), null, "no saved login");
  const bad = memory(); bad.setItem("revise-session", JSON.stringify({ access_token: "x", refresh_token: "nope", expires_at: 1, user: { id: "u9", email: "a@b.co" } }));
  const c4 = make(fake, bad).cloud;
  assert.equal(await c4.restore(), null);
  assert.equal(bad.getItem("revise-session"), null, "dead session is forgotten");
  const junk = memory(); junk.setItem("revise-session", "{not json");
  assert.equal(await make(fake, junk).cloud.restore(), null);
});

test("not configured = disabled", async () => {
  const c = createCloud({ supabaseUrl: "", supabaseKey: "" });
  assert.equal(c.enabled, false);
  assert.equal(await c.restore(), null);
});

test("generate sends the login token and explains problems", async () => {
  const fake = fakeSupabase(); const { cloud } = make(fake);
  await cloud.signUp("jamie", "secret1");
  let seen;
  const mk = (res) => createCloud(CONFIG, { fetchFn: async (url, init) => { if (url.startsWith("/api")) { seen = { url, init }; return res; } return fake.fetch(url, init); }, storage: memory(), now: () => fake.clock });
  const ok = mk(new Response(JSON.stringify({ questions: [{ q: "a", a: "b", choices: [] }] }), { status: 200 })); await ok.signUp("jamie2", "secret1");
  const r = await ok.generate({ topic: "x" });
  assert.equal(r.questions.length, 1); assert.ok(seen.init.headers.Authorization.startsWith("Bearer ")); assert.equal(JSON.parse(seen.init.body).topic, "x");
  const missing = mk(new Response("nope", { status: 404 })); await missing.signUp("jamie3", "secret1");
  assert.ok((await fails(missing.generate({}), "not_installed")).message.includes("README step 4"));
  const busy = mk(new Response(JSON.stringify({ error: "Busy, try later" }), { status: 502 })); await busy.signUp("jamie4", "secret1");
  assert.equal((await fails(busy.generate({}))).message, "Busy, try later");
});
