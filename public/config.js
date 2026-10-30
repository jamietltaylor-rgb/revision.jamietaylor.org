// Your own settings. Fill in the two Supabase values (see README.md, step 2) to switch on logins.
// Leave them empty and the app still works on its own, saving only in this browser.
export const CONFIG = {
  supabaseUrl: "",          // e.g. "https://abcdefgh.supabase.co"
  supabaseKey: "",          // the "publishable" key, e.g. "sb_publishable_..."  (safe to be public)
  usernameDomain: "revise.invalid", // usernames are turned into fake addresses like jamie@revise.invalid
  aiEndpoint: "/api/generate",      // the Cloudflare Function that makes questions (see README.md, step 4)
};
