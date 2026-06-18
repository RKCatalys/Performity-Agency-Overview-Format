# Performity — Login & Access Control setup (Supabase)

Auth is **off by default** so the app keeps working. Turn it on in ~5 minutes:

## 1. Create a free Supabase project
1. Go to https://supabase.com → New project (free tier is fine).
2. Project Settings → **API**: copy the **Project URL** and the **anon / public** key.
   (The anon key is safe to put in front-end code — security is enforced by the
   row-level-security policies below, not by hiding the key.)

## 2. Create the access-list table + policies
Supabase → **SQL Editor** → run this:

```sql
create table if not exists public.members (
  email text primary key,
  role  text not null default 'viewer' check (role in ('admin','viewer')),
  brands text[],
  created_at timestamptz default now()
);
alter table public.members enable row level security;

-- is the caller an admin?
create or replace function public.is_admin() returns boolean
  language sql security definer stable as $$
  select exists (select 1 from public.members m
    where m.email = lower(auth.jwt()->>'email') and m.role = 'admin');
$$;

-- authenticated users may read the list (to check their own access)
create policy "read members" on public.members
  for select to authenticated using (true);
-- admins manage everyone
create policy "admins insert" on public.members
  for insert to authenticated with check (public.is_admin());
create policy "admins update" on public.members
  for update to authenticated using (public.is_admin());
create policy "admins delete" on public.members
  for delete to authenticated using (public.is_admin());
-- bootstrap: the very first signed-in user can add themselves while no admin exists
create policy "bootstrap first admin" on public.members
  for insert to authenticated with check (
    email = lower(auth.jwt()->>'email')
    and not exists (select 1 from public.members where role = 'admin')
  );
```

Then seed yourself as the first admin (use your real email):

```sql
insert into public.members (email, role) values ('rakesh.s@catalys.co', 'admin')
on conflict (email) do update set role = 'admin';
```

## 3. Auth settings
Supabase → **Authentication → Providers → Email**: keep Email enabled.
- For quick password login, you can turn **Confirm email** off (Authentication → Settings).
- Or leave it on and use the **"Email link"** option on the login screen (magic link).
- Add your site URL (the Vercel URL) under **Authentication → URL Configuration → Site URL / Redirect URLs** so magic links return to your app.

## 4. Turn it on in the app
Edit **`auth-config.js`**:

```js
window.PERFORMITY_AUTH = {
  enabled: true,
  url: "https://YOUR-PROJECT.supabase.co",
  anonKey: "YOUR-ANON-KEY",
  adminEmails: ["rakesh.s@catalys.co"],
};
```

Commit + push → Vercel redeploys. Now the app requires sign-in.

## How it works
- **Login screen** (password or email link). Only emails on the `members` list get in;
  others see "Access pending".
- **Admin → Access control** (sidebar, admins only): add/remove emails and set
  **Admin** vs **Viewer**. Admins manage access & settings; viewers view dashboards.
- The **admin nav + access management** are hidden from viewers. Sign-out is the
  avatar button (top-right).

## Make it fully airtight (optional, later)
This gates the **app**. The Google Sheet is still link-readable if someone has the URL.
For end-to-end lockdown, move the data behind an authenticated Vercel function (service
account reads a *restricted* sheet, checks the user's Supabase JWT). Ask and I'll wire it.
