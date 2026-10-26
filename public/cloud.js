// Talks to Supabase (logins + saving your progress) using plain fetch — no libraries needed.

export class CloudError extends Error {
  constructor(message, code = "error") { super(message); this.name = "CloudError"; this.code = code; }
}

const USERNAME_RE = /^[a-z0-9._-]{3,30}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Turns what someone types into the "email" Supabase wants. Returns null if it isn't allowed. */
export function usernameToEmail(input, domain) {
  const v = String(input ?? "").trim().toLowerCase();
  if (EMAIL_RE.test(v)) return v;
  return USERNAME_RE.test(v) ? `${v}@${domain}` : null;
}
export function displayName(email, domain) {
  const e = String(email ?? "");
  return domain && e.endsWith(`@${domain}`) ? e.slice(0, -(domain.length + 1)) : e;
}

export function friendlyError(status, body) {
  const code = (body && (body.error_code || body.code)) || "";
  const msg = (body && (body.msg || body.message || body.error_description || body.error)) || "";
  if (code === "invalid_credentials") return "Wrong username or password.";
  if (code === "user_already_exists" || code === "email_exists") return "That username is already taken — try another.";
  if (code === "weak_password") return /at least/i.test(msg) ? msg : "That password is too weak — use at least 6 characters.";
  if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit" || status === 429) return "Too many tries — wait a minute and try again.";
  if (code === "signup_disabled") return "New accounts are switched off for this app.";
  if (code === "email_address_invalid" || code === "validation_failed") return "That username isn't allowed. Use 3–30 letters, numbers, dots, dashes or underscores.";
  if (code === "email_not_confirmed") return "This project still asks for email confirmation. Turn off “Confirm email” in Supabase (README step 2).";
  if (code === "PGRST205" || code === "42P01") return "Saving isn't set up yet — run supabase-setup.sql in Supabase (README step 2).";
  if (code === "refresh_token_not_found" || code === "refresh_token_already_used" || code === "session_expired") return "Your session ended — please sign in again.";
  if (status === 401 || status === 403) return "You're not signed in any more — please sign in again.";
  if (status >= 500) return "The server had a problem. Try again in a moment.";
  return msg ? String(msg).slice(0, 200) : "Something went wrong.";
}

export function createCloud(config, { fetchFn = (...a) => globalThis.fetch(...a), storage = null, now = () => Date.now() } = {}) {
  const base = String(config.supabaseUrl || "").replace(/\/+$/, "");
  const key = String(config.supabaseKey || "");
  const enabled = Boolean(base && key);
  const SESSION_KEY = "revise-session";
  let session = null;
  let refreshing = null;

  const readStore = () => { try { return storage ? storage.getItem(SESSION_KEY) : null; } catch { return null; } };
  const writeStore = (v) => { try { if (!storage) return; if (v) storage.setItem(SESSION_KEY, JSON.stringify(v)); else storage.removeItem(SESSION_KEY); } catch { /* ignore */ } };

  function adopt(body) {
    if (!body || !body.access_token || !body.refresh_token) return null;
    const expires = body.expires_at || Math.floor(now() / 1000) + (Number(body.expires_in) || 3600);
    session = { access_token: body.access_token, refresh_token: body.refresh_token, expires_at: expires, user: { id: body.user && body.user.id, email: body.user && body.user.email } };
    writeStore(session);
    return session;
  }
  function clear() { session = null; writeStore(null); }

  async function send(path, { method = "GET", body, token, headers = {} } = {}) {
    let res;
    try {
      res = await fetchFn(base + path, {
        method,
        headers: { apikey: key, "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new CloudError("Can't reach the server — check your internet connection.", "offline");
    }
    let json = null;
    const text = await res.text();
    if (text) { try { json = JSON.parse(text); } catch { json = null; } }
    if (!res.ok) throw new CloudError(friendlyError(res.status, json), (json && (json.error_code || json.code)) || String(res.status));
    return json;
  }

  async function refresh() {
    if (!session) throw new CloudError("Please sign in.", "no_session");
    if (!refreshing) {
      const token = session.refresh_token;
      refreshing = send("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: token } })
        .then((body) => { if (!adopt(body)) throw new CloudError("Your session ended — please sign in again.", "session_expired"); return session; })
        .catch((e) => { if (e.code !== "offline") clear(); throw e; })
        .finally(() => { refreshing = null; });
    }
    return refreshing;
  }
  async function freshToken() {
    if (!session) throw new CloudError("Please sign in.", "no_session");
    if (session.expires_at * 1000 - now() < 60000) await refresh();
    return session.access_token;
  }
  async function authed(path, opts = {}) {
    const token = await freshToken();
    try {
      return await send(path, { ...opts, token });
    } catch (e) {
      if (e.code === "PGRST301" || e.code === "401" || e.code === "bad_jwt") { await refresh(); return send(path, { ...opts, token: session.access_token }); }
      throw e;
    }
  }

  async function signUp(username, password) {
    const email = usernameToEmail(username, config.usernameDomain);
    if (!email) throw new CloudError("Usernames need 3–30 letters, numbers, dots, dashes or underscores.", "bad_username");
    if (String(password).length < 6) throw new CloudError("Passwords need at least 6 characters.", "weak_password");
    const body = await send("/auth/v1/signup", { method: "POST", body: { email, password } });
    if (!adopt(body)) throw new CloudError("This project still asks for email confirmation. Turn off “Confirm email” in Supabase (README step 2), then try again.", "email_not_confirmed");
    return session;
  }
  async function signIn(username, password) {
    const email = usernameToEmail(username, config.usernameDomain);
    if (!email) throw new CloudError("Wrong username or password.", "invalid_credentials");
    const body = await send("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } });
    if (!adopt(body)) throw new CloudError("Wrong username or password.", "invalid_credentials");
    return session;
  }
  async function signOut() {
    const token = session && session.access_token;
    clear();
    if (token) { try { await send("/auth/v1/logout", { method: "POST", token }); } catch { /* signing out locally is enough */ } }
  }
  /** Picks up a saved login (if any) when the page opens. Returns the session or null. */
  async function restore() {
    if (!enabled) return null;
    try { const saved = JSON.parse(readStore() || "null"); if (saved && saved.access_token && saved.refresh_token && saved.user && saved.user.id) session = saved; } catch { session = null; }
    if (!session) return null;
    try { await freshToken(); } catch (e) { if (e.code === "offline") return session; return null; }
    return session;
  }

  async function loadData() {
    const rows = await authed(`/rest/v1/revise_data?select=data,updated_at&user_id=eq.${encodeURIComponent(session.user.id)}`);
    return Array.isArray(rows) && rows[0] ? { data: rows[0].data, updatedAt: rows[0].updated_at } : null;
  }
  async function saveData(data) {
    await authed("/rest/v1/revise_data?on_conflict=user_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: { user_id: session.user.id, data, updated_at: new Date(now()).toISOString() },
    });
  }

  /** Asks the Cloudflare Function to write questions. */
  async function generate(request) {
    const token = await freshToken();
    let res;
    try {
      res = await fetchFn(config.aiEndpoint || "/api/generate", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(request) });
    } catch {
      throw new CloudError("Can't reach the server — check your internet connection.", "offline");
    }
    let json = null;
    try { json = await res.json(); } catch { json = null; }
    if (res.status === 404 || res.status === 405) throw new CloudError("Making questions isn't switched on yet — see README step 4. You can still paste in a list.", "not_installed");
    if (!res.ok) throw new CloudError((json && json.error) || "The question maker had a problem. Try again.", String(res.status));
    return json;
  }

  return {
    enabled,
    get user() { return session ? session.user : null; },
    get signedIn() { return Boolean(session); },
    signUp, signIn, signOut, restore, loadData, saveData, generate,
  };
}
