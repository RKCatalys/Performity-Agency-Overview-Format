/* auth.js — Supabase-backed authentication + allowlist/roles for Performity.
   Pure browser JS. Security is enforced server-side by Supabase Row-Level Security;
   this file is just the client wrapper. Exposes window.PerfAuth. */
(function () {
  let client = null, session = null, member = null, cfg = null, ready = false;

  function init() {
    cfg = window.PERFORMITY_AUTH || {};
    if (!cfg.enabled) return false;
    if (!window.supabase || !cfg.url || !cfg.anonKey) {
      console.warn("[auth] enabled but Supabase SDK / url / anonKey missing — staying open.");
      return false;
    }
    client = window.supabase.createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
    ready = true;
    return true;
  }

  // load the current session and the matching allowlist member (with role)
  async function load() {
    if (!ready) return null;
    const { data } = await client.auth.getSession();
    session = data.session || null;
    member = null;
    if (session) await loadMember();
    return session;
  }

  async function loadMember() {
    if (!session) { member = null; return null; }
    const email = (session.user.email || "").toLowerCase();
    const bootAdmin = (cfg.adminEmails || []).map(e => e.toLowerCase()).includes(email);
    let row = null;
    try {
      const { data } = await client.from("members").select("email,role,brands").eq("email", email).maybeSingle();
      row = data;
    } catch (e) { /* table may not exist yet */ }
    if (row) member = { email, role: row.role || "viewer", brands: row.brands || null };
    else if (bootAdmin) {
      // first-run: auto-provision the configured admin
      try { await client.from("members").insert({ email, role: "admin" }); } catch (e) {}
      member = { email, role: "admin", brands: null };
    } else member = null; // signed in but not on the allowlist
    return member;
  }

  function signIn(email, password) { return client.auth.signInWithPassword({ email: email.trim(), password }); }
  function signUp(email, password) { return client.auth.signUp({ email: email.trim(), password }); }
  function signInMagic(email) { return client.auth.signInWithOtp({ email: email.trim() }); }
  function signOut() { return client.auth.signOut(); }

  // ---- admin: manage the allowlist ----
  async function listMembers() {
    const { data, error } = await client.from("members").select("email,role,brands").order("email");
    if (error) throw error; return data || [];
  }
  function addMember(email, role) { return client.from("members").upsert({ email: email.trim().toLowerCase(), role: role || "viewer" }, { onConflict: "email" }); }
  function updateRole(email, role) { return client.from("members").update({ role }).eq("email", email.toLowerCase()); }
  function removeMember(email) { return client.from("members").delete().eq("email", email.toLowerCase()); }

  window.PerfAuth = {
    init, load,
    get session() { return session; },
    get member() { return member; },
    enabled: () => !!(cfg && cfg.enabled && ready),
    isAdmin: () => !!(member && member.role === "admin"),
    signIn, signUp, signInMagic, signOut,
    listMembers, addMember, updateRole, removeMember,
  };
})();
