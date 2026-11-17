// Cloudflare Pages Function: POST /api/speak  { text, speaker }
// Reads a short piece of text (a quote) aloud with a natural-sounding AI voice and returns an MP3.
// Uses Workers AI (Deepgram Aura). Needs a sign-in, like the other AI features. The app keeps each clip on the
// device after the first time, so a quote only costs AI allowance once per device.

const MODEL = "@cf/deepgram/aura-1";
export const SPEAKERS = ["athena", "helios", "luna", "orion", "asteria", "arcas", "angus", "orpheus", "zeus", "perseus", "hera", "stella"];
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

async function signedIn(request, env) {
  const base = String(env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = env.SUPABASE_PUBLISHABLE_KEY;
  const auth = request.headers.get("authorization") || "";
  if (!base || !key) return { error: json(503, { error: "Logins aren't set up on the server yet (README step 4)." }) };
  if (!/^Bearer\s+\S+/.test(auth)) return { error: json(401, { error: "Please sign in first." }) };
  try {
    const res = await fetch(`${base}/auth/v1/user`, { headers: { apikey: key, Authorization: auth } });
    if (!res.ok) return { error: json(401, { error: "Your login has expired — sign in again." }) };
    return { user: await res.json() };
  } catch {
    return { error: json(502, { error: "Couldn't check your login. Try again." }) };
  }
}

export function readRequest(body) {
  const text = String((body && body.text) || "").replace(/\s+/g, " ").trim().slice(0, 400);
  const speaker = SPEAKERS.includes(body && body.speaker) ? body.speaker : "athena";
  if (!text) return { error: "There was nothing to read out." };
  return { text, speaker };
}

/** Turns whatever the AI binding returns (a Response, bytes, a stream or base64 JSON) into something we can send back. */
export async function toAudioBody(out) {
  if (!out) return null;
  if (typeof Response !== "undefined" && out instanceof Response) return out.ok ? out.body : null;
  if (out instanceof ArrayBuffer || ArrayBuffer.isView(out)) return out;
  if (typeof ReadableStream !== "undefined" && out instanceof ReadableStream) return out;
  if (typeof out === "object" && typeof out.audio === "string") {
    const bin = atob(out.audio);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  return null;
}

export async function onRequestPost({ request, env }) {
  const who = await signedIn(request, env);
  if (who.error) return who.error;
  if (!env.AI) return json(503, { error: "The voice isn't connected yet (README step 4: add the AI binding)." });

  let body;
  try { body = await request.json(); } catch { return json(400, { error: "That request wasn't valid." }); }
  const req = readRequest(body);
  if (req.error) return json(400, { error: req.error });

  try {
    const out = await env.AI.run(MODEL, { text: req.text, speaker: req.speaker, encoding: "mp3" }, { returnRawResponse: true });
    const audio = await toAudioBody(out);
    if (!audio) return json(502, { error: "The voice had a problem." });
    return new Response(audio, { status: 200, headers: { "content-type": "audio/mpeg", "cache-control": "no-store" } });
  } catch (e) {
    const msg = String(e && e.message);
    if (/limit|quota|capacity|neurons/i.test(msg)) return json(502, { error: "The free daily AI allowance is used up." });
    if (/paid|payment|402|not available|access/i.test(msg)) return json(502, { error: "The AI voice isn't available on the free plan." });
    return json(502, { error: "The voice had a problem." });
  }
}

export async function onRequest() {
  return json(405, { error: "Use POST." });
}
