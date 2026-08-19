-- Migration: tambah kolom status pesanan, metode pembayaran, dan resi pengiriman
-- Jalankan di Supabase SQL Editor

alter table orders add column if not exists status text default 'menunggu_pembayaran';
alter table orders add column if not exists payment_method text default 'wa_manual';
alter table orders add column if not exists payment_status text default 'pending';
alter table orders add column if not exists resi text;
alter table orders add column if not exists courier text;

-- Nilai yang valid untuk referensi (tidak di-enforce sebagai constraint, biar fleksibel ke depan):
-- status: 'menunggu_pembayaran' | 'diproses' | 'dikirim' | 'selesai' | 'dibatalkan'
-- payment_method: 'wa_manual' | 'qris' | 'transfer_va'
-- payment_status: 'pending' | 'paid' | 'failed' | 'expired'
