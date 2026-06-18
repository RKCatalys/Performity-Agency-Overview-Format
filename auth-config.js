/* auth-config.js — authentication config.
   Set enabled:true and paste your Supabase project URL + anon (public) key to
   turn on login. While enabled:false, the app stays open (no login) so nothing
   breaks before setup. See SETUP-AUTH.md for the 5-minute Supabase setup.
   The anon key is safe to expose publicly (security is enforced by Supabase RLS). */
window.PERFORMITY_AUTH = {
  enabled: false,
  url: "",          // e.g. "https://xxxx.supabase.co"
  anonKey: "",      // your Supabase anon/public key
  // these emails become admins automatically on first login (bootstrap)
  adminEmails: ["rakesh.s@catalys.co"],
};
