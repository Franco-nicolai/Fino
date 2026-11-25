-- Supabase schema for Fino's private JSON snapshot store.
-- Run this in the Supabase SQL editor before importing the existing Neon row.
create table if not exists public.spaces (
  user_id uuid not null references auth.users(id) on delete cascade,
  space text not null check (space in ('personal', 'demo')),
  revision integer not null check (revision > 0),
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  updated_at timestamptz not null default now(),
  primary key (user_id, space)
);

alter table public.spaces enable row level security;

grant select, insert, update, delete on public.spaces to authenticated;

drop policy if exists "Users can read their Fino spaces" on public.spaces;
create policy "Users can read their Fino spaces" on public.spaces
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Users can create their Fino spaces" on public.spaces;
create policy "Users can create their Fino spaces" on public.spaces
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "Users can update their Fino spaces" on public.spaces;
create policy "Users can update their Fino spaces" on public.spaces
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete their Fino spaces" on public.spaces;
create policy "Users can delete their Fino spaces" on public.spaces
  for delete to authenticated using (auth.uid() = user_id);

create index if not exists spaces_updated_at_idx on public.spaces (updated_at desc);
