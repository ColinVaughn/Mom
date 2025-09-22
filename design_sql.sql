-- Gas Receipt Tracking System – SQL Schema & Policies
-- Requires: pgcrypto extension

create extension if not exists pgcrypto;

-- 1) USERS TABLE mirrors auth.users
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null check (role in ('officer','manager')),
  email text not null unique,
  created_at timestamptz not null default now()
);

-- 2) RECEIPTS TABLE
create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  date date not null,
  total numeric(10,2) not null check (total >= 0),
  -- store storage path like `${user_id}/<uuid>.jpg`; may be null when status = 'missing'
  image_url text,
  status text not null default 'uploaded' check (status in ('uploaded','verified','missing')),
  created_at timestamptz not null default now(),
  constraint receipts_image_presence_chk
    check ((status = 'missing' and image_url is null) or (status in ('uploaded','verified') and image_url is not null))
);

-- Indexes
create index if not exists receipts_user_id_idx on public.receipts(user_id);
create index if not exists receipts_date_idx on public.receipts(date);
create index if not exists receipts_status_idx on public.receipts(status);

-- 2b) WEX transactions captured via webhook or polling
create table if not exists public.wex_transactions (
  id uuid primary key default gen_random_uuid(),
  external_id text unique not null, -- WEX provided id
  user_id uuid references public.users(id) on delete set null, -- optional mapping to officer
  card_last4 text,
  amount numeric(10,2) not null,
  transacted_at date not null,
  merchant text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists wex_transactions_user_id_idx on public.wex_transactions(user_id);
create index if not exists wex_transactions_date_idx on public.wex_transactions(transacted_at);
create index if not exists wex_transactions_amount_idx on public.wex_transactions(amount);

-- Optional mapping: map card last4 to users for reconciliation
create table if not exists public.wex_cards (
  card_last4 text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists wex_cards_user_id_idx on public.wex_cards(user_id);

-- Upsert helper for wex transaction
create or replace function public.upsert_wex_transaction(
  p_external_id text,
  p_amount numeric,
  p_transacted_at date,
  p_card_last4 text,
  p_merchant text,
  p_raw jsonb
) returns uuid language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
  v_user uuid;
begin
  select user_id into v_user from public.wex_cards where card_last4 = p_card_last4;
  insert into public.wex_transactions(external_id, amount, transacted_at, card_last4, merchant, user_id, raw)
  values (p_external_id, p_amount, p_transacted_at, p_card_last4, p_merchant, v_user, coalesce(p_raw,'{}'::jsonb))
  on conflict (external_id) do update set
    amount = excluded.amount,
    transacted_at = excluded.transacted_at,
    card_last4 = excluded.card_last4,
    merchant = excluded.merchant,
    user_id = excluded.user_id,
    raw = excluded.raw
  returning id into v_id;
  return v_id;
end $$;

-- 3) Helper function: detect manager
create or replace function public.is_manager(uid uuid)
returns boolean language sql stable
set search_path = public
as $$
  select exists (
    select 1 from public.users u where u.id = uid and u.role = 'manager'
  );
$$;

-- 4) Seed trigger to auto-create public.users on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce((new.raw_user_meta_data->>'name'), split_part(new.email,'@',1)),
    'officer'
  )
  on conflict (id) do nothing;
  return new;
end; $$;

-- Create trigger if not exists
do $$ begin
  if not exists (
    select 1 from pg_trigger where tgname = 'on_auth_user_created'
  ) then
    create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();
  end if;
end $$;

-- 5) RLS Policies
alter table public.users enable row level security;
alter table public.receipts enable row level security;
alter table public.wex_transactions enable row level security;
alter table public.wex_cards enable row level security;

-- USERS policies
-- Users can view their own user row
drop policy if exists users_select_self on public.users;
create policy users_select_self on public.users
for select
using (auth.uid() = id or public.is_manager(auth.uid()));

-- Only managers can view all users (covered by is_manager above)
-- Only managers can update role/name/email for any user
drop policy if exists users_update_manager on public.users;
create policy users_update_manager on public.users
for update
using (public.is_manager(auth.uid()));

-- Prevent inserts by clients; handled by trigger/admin
drop policy if exists users_insert_admin_only on public.users;
create policy users_insert_admin_only on public.users
for insert
with check (false);

-- Prevent deletes by clients; handled by admin function
drop policy if exists users_delete_admin_only on public.users;
create policy users_delete_admin_only on public.users
for delete
using (false);

-- RECEIPTS policies
-- Officers: CRUD their own receipts
drop policy if exists receipts_select_own on public.receipts;
create policy receipts_select_own on public.receipts
for select
using (auth.uid() = user_id or public.is_manager(auth.uid()));

drop policy if exists receipts_insert_own on public.receipts;
create policy receipts_insert_own on public.receipts
for insert
with check (auth.uid() = user_id or public.is_manager(auth.uid()));

drop policy if exists receipts_update_own on public.receipts;
create policy receipts_update_own on public.receipts
for update
using (auth.uid() = user_id or public.is_manager(auth.uid()));

drop policy if exists receipts_delete_own on public.receipts;
create policy receipts_delete_own on public.receipts
for delete
using (auth.uid() = user_id or public.is_manager(auth.uid()));

-- WEX transactions policies: officers can see their mapped transactions; managers can see all
drop policy if exists wex_select_own_or_manager on public.wex_transactions;
create policy wex_select_own_or_manager on public.wex_transactions
for select to authenticated
using (public.is_manager(auth.uid()) or user_id = auth.uid());

-- 6) Storage: bucket and policies for receipts images
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

-- Storage policies act on storage.objects table
-- Officers can insert into their own folder `${auth.uid()}/*`
drop policy if exists storage_receipts_insert_own on storage.objects;
create policy storage_receipts_insert_own on storage.objects
for insert to authenticated
with check (
  bucket_id = 'receipts' and
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Officers can select/list their own folder; Managers can select all
drop policy if exists storage_receipts_select_own_or_manager on storage.objects;
create policy storage_receipts_select_own_or_manager on storage.objects
for select to authenticated
using (
  bucket_id = 'receipts' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_manager(auth.uid())
  )
);

-- Officers can update/delete objects in their folder; Managers all
drop policy if exists storage_receipts_update_own_or_manager on storage.objects;
create policy storage_receipts_update_own_or_manager on storage.objects
for update to authenticated using (
  bucket_id = 'receipts' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_manager(auth.uid())
  )
);

drop policy if exists storage_receipts_delete_own_or_manager on storage.objects;
create policy storage_receipts_delete_own_or_manager on storage.objects
for delete to authenticated using (
  bucket_id = 'receipts' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_manager(auth.uid())
  )
);

-- 7) Helpful views
create or replace view public.receipts_with_user as
select r.*, u.name as user_name, u.email as user_email
from public.receipts r
join public.users u on u.id = r.user_id;
alter view public.receipts_with_user set (security_invoker = true, security_barrier = true);

-- 8) Policies for wex_cards (manager-only access)
drop policy if exists wex_cards_select_manager on public.wex_cards;
create policy wex_cards_select_manager on public.wex_cards
for select
using (public.is_manager(auth.uid()));

drop policy if exists wex_cards_modify_manager on public.wex_cards;
create policy wex_cards_modify_manager on public.wex_cards
for all
using (public.is_manager(auth.uid()))
with check (public.is_manager(auth.uid()));
