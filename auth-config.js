/* auth-config.js — authentication config.
   Set enabled:true and paste your Supabase project URL + anon (public) key to
   turn on login. While enabled:false, the app stays open (no login) so nothing
   breaks before setup. See SETUP-AUTH.md for the 5-minute Supabase setup.
   The anon key is safe to expose publicly (security is enforced by Supabase RLS). */
window.PERFORMITY_AUTH = {
  enabled: true,
  url: "https://yxxqjvnireflmwfiqxfv.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl4eHFqdm5pcmVmbG13ZmlxeGZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3ODk0MjcsImV4cCI6MjA5NzM2NTQyN30.Mk4aO24H06NJKqNG7Z6uOXMbAORVcg9GwsCe-KpOnu4",
  // these emails become admins automatically on first login (bootstrap)
  adminEmails: ["rakesh.s@catalys.co", "arpit@catalys.co"],
};
