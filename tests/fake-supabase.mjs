// A tiny pretend Supabase used by the tests. Mimics the real error shapes for logins and saved data.
export function fakeSupabase({ confirmEmail = false, ttl = 3600 } = {}) {
  const users = new Map(); // email -> {id, password}
  const rows = new Map();  // user_id -> {data, updated_at}
  const tokens = new Map(); // access token -> user_id
  const refresh = new Map(); // refresh token -> user_id
  const log = [];
  let n = 0;
  let clock = Date.now();
  const api = { users, rows, log, expireAll() { tokens.clear(); }, revokeAll() { tokens.clear(); refresh.clear(); }, advance(ms) { clock += ms; }, get clock() { return clock; }, offline: false };
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const issue = (id, email) => {
    const access_token = "at" + ++n, refresh_token = "rt" + ++n;
    tokens.set(access_token, id); refresh.set(refresh_token, id);
    return { access_token, refresh_token, expires_in: ttl, expires_at: Math.floor(clock / 1000) + ttl, user: { id, email } };
  };
  api.fetch = async (url, init = {}) => {
    if (api.offline) throw new TypeError("Failed to fetch");
    const u = new URL(url, "https://x.supabase.co");
    const body = init.body ? JSON.parse(init.body) : undefined;
    const h = new Headers(init.headers);
    log.push(`${init.method || "GET"} ${u.pathname}${u.search}`);
    if (!h.get("apikey")) return json(401, { message: "No API key found in request" });
    if (u.pathname === "/auth/v1/signup") {
      if (users.has(body.email)) return json(422, { code: 422, error_code: "user_already_exists", msg: "User already registered" });
      if (body.password.length < 6) return json(422, { code: 422, error_code: "weak_password", msg: "Password should be at least 6 characters." });
      const id = "u" + ++n; users.set(body.email, { id, password: body.password });
      return confirmEmail ? json(200, { id, email: body.email }) : json(200, issue(id, body.email));
    }
    if (u.pathname === "/auth/v1/token" && u.searchParams.get("grant_type") === "password") {
      const user = users.get(body.email);
      if (!user || user.password !== body.password) return json(400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
      return json(200, issue(user.id, body.email));
    }
    if (u.pathname === "/auth/v1/token" && u.searchParams.get("grant_type") === "refresh_token") {
      const id = refresh.get(body.refresh_token);
      if (!id) return json(400, { code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token: Refresh Token Not Found" });
      refresh.delete(body.refresh_token);
      const email = [...users].find(([, v]) => v.id === id)[0];
      return json(200, issue(id, email));
    }
    if (u.pathname === "/auth/v1/logout") return json(204, null);
    if (u.pathname === "/rest/v1/revise_data") {
      const uid = tokens.get((h.get("authorization") || "").replace("Bearer ", ""));
      if (!uid) return json(401, { code: "PGRST301", message: "JWT expired" });
      if ((init.method || "GET") === "GET") {
        const want = u.searchParams.get("user_id").replace("eq.", "");
        return json(200, want === uid && rows.has(uid) ? [rows.get(uid)] : []);
      }
      if (body.user_id !== uid) return json(403, { code: "42501", message: "new row violates row-level security policy" });
      rows.set(uid, { data: body.data, updated_at: body.updated_at });
      return new Response(null, { status: 201 });
    }
    return json(404, { message: "not found" });
  };
  return api;
}
