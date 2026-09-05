-- Matthew Verse Mapper schema
-- Run this entire file in the Supabase SQL Editor.

create table if not exists public.verse_groups (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  reference_text text not null,
  sentence_keys text[] not null check (cardinality(sentence_keys) > 0),
  parent_group_id bigint,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.category_columns (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  parent_column_id bigint,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  unique (id, user_id),
  constraint category_columns_not_own_parent check (parent_column_id is null or parent_column_id <> id)
);

alter table public.verse_groups add column if not exists parent_group_id bigint;
alter table public.verse_groups add column if not exists completed boolean not null default false;
alter table public.category_columns add column if not exists parent_column_id bigint;

alter table public.verse_groups drop constraint if exists verse_groups_parent_owner_fkey;
alter table public.verse_groups add constraint verse_groups_parent_owner_fkey
  foreign key (parent_group_id, user_id) references public.verse_groups(id, user_id) on delete cascade;

alter table public.category_columns drop constraint if exists category_columns_parent_owner_fkey;
alter table public.category_columns add constraint category_columns_parent_owner_fkey
  foreign key (parent_column_id, user_id) references public.category_columns(id, user_id) on delete cascade;

alter table public.category_columns drop constraint if exists category_columns_not_own_parent;
alter table public.category_columns add constraint category_columns_not_own_parent
  check (parent_column_id is null or parent_column_id <> id);

create table if not exists public.group_category_cells (
  group_id bigint not null,
  column_id bigint not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, column_id),
  constraint group_category_cells_group_owner_fkey
    foreign key (group_id, user_id) references public.verse_groups(id, user_id) on delete cascade,
  constraint group_category_cells_column_owner_fkey
    foreign key (column_id, user_id) references public.category_columns(id, user_id) on delete cascade
);

create index if not exists verse_groups_user_id_idx on public.verse_groups(user_id);
create index if not exists verse_groups_parent_idx on public.verse_groups(user_id, parent_group_id, created_at);
create index if not exists category_columns_user_sort_idx on public.category_columns(user_id, sort_order, created_at);
create index if not exists category_columns_parent_idx on public.category_columns(user_id, parent_column_id, sort_order, created_at);
create index if not exists group_category_cells_user_id_idx on public.group_category_cells(user_id);
create index if not exists group_category_cells_column_id_idx on public.group_category_cells(column_id);

alter table public.verse_groups enable row level security;
alter table public.category_columns enable row level security;
alter table public.group_category_cells enable row level security;

drop policy if exists "Users read own verse groups" on public.verse_groups;
drop policy if exists "Users create own verse groups" on public.verse_groups;
drop policy if exists "Users update own verse groups" on public.verse_groups;
drop policy if exists "Users delete own verse groups" on public.verse_groups;
create policy "Users read own verse groups" on public.verse_groups for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users create own verse groups" on public.verse_groups for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update own verse groups" on public.verse_groups for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete own verse groups" on public.verse_groups for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users read own category columns" on public.category_columns;
drop policy if exists "Users create own category columns" on public.category_columns;
drop policy if exists "Users update own category columns" on public.category_columns;
drop policy if exists "Users delete own category columns" on public.category_columns;
create policy "Users read own category columns" on public.category_columns for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users create own category columns" on public.category_columns for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update own category columns" on public.category_columns for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete own category columns" on public.category_columns for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users read own matrix cells" on public.group_category_cells;
drop policy if exists "Users create own matrix cells" on public.group_category_cells;
drop policy if exists "Users update own matrix cells" on public.group_category_cells;
drop policy if exists "Users delete own matrix cells" on public.group_category_cells;
create policy "Users read own matrix cells" on public.group_category_cells for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users create own matrix cells" on public.group_category_cells for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update own matrix cells" on public.group_category_cells for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete own matrix cells" on public.group_category_cells for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.verse_groups, public.category_columns, public.group_category_cells from anon;
grant select, insert, update, delete on public.verse_groups, public.category_columns, public.group_category_cells to authenticated;
grant usage, select on sequence public.verse_groups_id_seq, public.category_columns_id_seq to authenticated;
