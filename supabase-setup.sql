-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run.
-- It makes one private "save slot" per person. Row-level security means you can only ever read or change your own row.

create table if not exists public.revise_data (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.revise_data enable row level security;

drop policy if exists "read own data"   on public.revise_data;
drop policy if exists "add own data"    on public.revise_data;
drop policy if exists "change own data" on public.revise_data;
drop policy if exists "delete own data" on public.revise_data;

create policy "read own data"   on public.revise_data for select to authenticated using ((select auth.uid()) = user_id);
create policy "add own data"    on public.revise_data for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "change own data" on public.revise_data for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "delete own data" on public.revise_data for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.revise_data to authenticated;
