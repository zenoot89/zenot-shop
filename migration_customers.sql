-- ================================================================
-- MIGRATION: Akun Buyer (Fase 1)
-- Jalankan ini di Supabase Dashboard > SQL Editor > New Query > Run
-- ================================================================

-- 1. Tabel profil pelanggan, terhubung ke akun auth Supabase
create table if not exists public.customers (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  whatsapp text,
  address text,
  role text not null default 'buyer' check (role in ('buyer','admin')),
  created_at timestamptz default now()
);

alter table public.customers enable row level security;

-- 2. RLS: pembeli cuma bisa baca & ubah datanya sendiri
create policy "customers_select_own" on public.customers
  for select using (auth.uid() = id);

create policy "customers_insert_own" on public.customers
  for insert with check (auth.uid() = id);

create policy "customers_update_own" on public.customers
  for update using (auth.uid() = id);

-- 3. PENTING: tandai akun admin kamu (zenootid@gmail.com) sebagai role admin
--    supaya nanti tetap bisa login ke seller.html.
--    Kalau email admin kamu beda, ganti di baris WHERE di bawah.
insert into public.customers (id, email, role)
select id, email, 'admin' from auth.users where email = 'zenootid@gmail.com'
on conflict (id) do update set role = 'admin';
