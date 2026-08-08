# Project Brief: Zenoot Catalog Site

Dokumen ini buat di-paste ke awal chat baru (di akun Claude manapun) supaya Claude langsung punya konteks penuh dan nggak perlu dijelasin ulang dari nol. Selalu lampirkan juga **zip repo terbaru** di pesan pertama — dokumen ini kasih konteks, tapi kode aktualnya harus dibaca langsung dari file.

---

## 1. Ringkasan Proyek

- Brand: **Zenoot** (knitwear pria & wanita). ⚠️ **KOREKSI BELUM DIKERJAKAN**: nama resmi brand pakai double-O "**Zenoot**", tapi wordmark di kode (index.html, dsb) masih tertulis "**ZENOT**". Kalau ada task nyentuh wordmark/teks brand, benerin ke "Zenoot".
- Owner juga jualan di **Shopee** sebagai seller.
- Website: katalog online + Seller Center (admin dashboard) buat kelola produk, dibangun vanilla HTML/CSS/JS (bukan framework), backend **Supabase**.
- Hosting: **GitHub Pages**. Repo: `zenoot89/zenot-shop`. Live di `https://zenoot89.github.io/zenot-shop/index.html`.
- Supabase project: `zenot-shop` (ref `xvaxwxnvjzrazxgdxsrt`). RLS aktif di semua tabel + storage bucket `product-photos`.
- Nomor WA toko: `628136664023` (checkout & beberapa program pakai WA, bukan payment gateway).

## 2. Struktur File

- `index.html` — halaman toko (buyer-facing): katalog, drawer menu, cart, wishlist, riwayat pesanan, login Google.
- `seller.html` — Seller Center (admin dashboard): sidebar, semua tab admin (Produk, Promosi, Kategori, Ulasan, Pelanggan, dst).
- `admin-products.js` — logic CRUD produk + varian + list produk admin (dipisah dari seller.html biar nggak kepanjangan).

## 3. Skema Database (Supabase) — per Agustus 2026

**products**
`id, name, category (text, legacy/leaf name buat kompatibilitas filter toko lama), category_id (uuid → categories.id), gender (text: 'pria'|'wanita'), supplier (text, admin-only, TIDAK ditampilkan ke buyer), description, is_active (bool), created_at, image_url, image_urls (array)`

**categories** (hierarki 3 level, self-referencing)
`id, name, parent_id (uuid → categories.id, NULL = level 1)`
- Level 1 = Pria/Wanita/dst (custom, admin nambah sendiri lewat tombol +)
- Level 2 & 3 = sub-kategori, custom, level 3 opsional
- Unique index: nama unik per level 1 (parent_id IS NULL), dan unik per induk (parent_id, name) buat level 2/3 — jadi nama boleh sama asal beda induk (mis. "Cardigan" muncul di bawah Pria DAN Wanita)

**variants**
`id, product_id (→ products.id), color_name, color_hex, size, price (harga NET/aktif saat ini), original_price (harga JUAL/normal sebelum diskon, null kalau nggak ada diskon), stock, image_url (foto khusus warna itu)`

**orders**
`user_id (→ customers.id), items (jsonb array: [{productId, variantId, name, price, color, size, qty, image, stock}]), subtotal, discount, total, voucher_code, created_at`
- ⚠️ Order langsung ke-insert begitu buyer klik "Checkout WA" — BELUM ada status Pending/Selesai. Jadi angka "Terjual" di admin dihitung dari SEMUA order yang masuk, bukan cuma yang closing.

**vouchers**
`code, discount_type ('percent'|nominal), discount_value, min_order, max_uses, used_count, expires_at`
Voucher aktif: `ZENOOT10` (10% min 100rb), `ZENOOT15` (15% min 200rb)

**customers**
`id, role ('admin'|'buyer'), nama, WA, alamat, city, province, postal_code`
- Insert dikunci role='buyer' (RLS), update role dikunci trigger `prevent_role_change` — celah role escalation sudah ditutup.

**wishlists** — `user_id, product_id`
**reviews** — `product_id, buyer_name, rating, comment`

## 4. Status Fitur

**Selesai & terverifikasi:**
- Multi-foto produk, foto per varian warna, form varian ala Shopee (tag warna/ukuran)
- Kategori hierarki 3 level custom (picker modal ala Shopee di form produk, tree manager di tab Kategori)
- Filter + search + sort + bulk action (aktif/nonaktif/hapus massal) di list produk admin
- Badge "Stok Menipis" (threshold ≤5 unit per varian, gampang diubah di `LOW_STOCK_THRESHOLD` — `admin-products.js`)
- Breakdown stok per varian (expand di list produk)
- Harga Jual vs Harga Net ditampilkan kalau ada diskon aktif
- Kolom Supplier (admin-only, nggak tampil di toko)
- Voucher klaim otomatis, diskon produk & flash sale
- Wishlist, Riwayat Pembelian (dari tabel orders)
- Drawer menu: Semua Produk, Pria (expand), Wanita (expand), Wishlist, Keranjang, Akun
- Footer gelap ala gomuda.id (kolom Terhubung, Bantuan, copyright — sebagian link masih placeholder)
- Login/Daftar buyer via Google OAuth (Client ID/Secret sudah dipasang di Supabase, app masih status "testing" — cuma Test User yang terdaftar di Google Cloud Console yang bisa login sementara)
- Login admin, Tab Pelanggan (Admin Terdaftar + Data Pelanggan buyer + Export CSV)

**Belum/kandidat next steps:**
- Wordmark "ZENOT" → "Zenoot" (koreksi brand, belum dikerjain)
- Status order (Pending/Selesai) biar angka "Terjual" akurat
- Filter kategori di halaman toko (index.html drawer/search) masih pakai sistem lama (flat per gender) — BELUM ikut struktur hierarki 3-level yang baru dibangun di admin
- BUG AKTIF (per 7 Agustus 2026, belum dikonfirmasi kelar): setelah login Google, redirect balik ke "localhost". Root cause: Site URL di Supabase Authentication > URL Configuration masih default localhost. Fix: ganti ke `https://zenoot89.github.io/zenot-shop/index.html` + tambah Redirect URL `https://zenoot89.github.io/zenot-shop/**`
- Scope Program Bundling belum dibahas detail
- Program Reseller: harga khusus (bukan retail), verifikasi keanggotaan kirim PDF, transaksi lewat WA
- Program Dropshipper: beli minimal 12 pcs/paket, harga grosir diatur admin

## 5. Cara Kerja yang WAJIB Diikuti (preferensi user, sering ditegur soal ini)

1. **Root cause dulu, jangan nebak.** Kalau ada bug/error, telusuri kodenya sampai ketemu akar masalahnya sebelum kasih fix. Kalau nggak yakin, minta user jalanin query/screenshot buat mastiin, jangan asal tembak fix.
2. **Konfirmasi struktur sebelum ubah hal besar** (skema DB, arsitektur) — tanya dulu kalau ambigu, biar nggak bolak-balik revisi.
3. **SQL migration selalu ditulis LANGSUNG di chat** (bukan sebagai file terpisah) — biar gampang di-copy-paste ke Supabase SQL Editor.
4. **User maunya fitur dikerjain sekaligus/lengkap**, bukan dicicil kelewat pelan — tapi tetap validasi sintaks & konsistensi tiap perubahan sebelum dikasih ke user.
5. Selalu kasih **ringkasan asumsi yang diambil sendiri** (kalau ada keputusan yang Claude tentuin sepihak karena user nggak spesifik) di akhir jawaban.
6. Setelah kasih fix, selalu kasih **langkah konkret**: file mana yang harus di-replace di repo, SQL apa yang harus dijalanin duluan, urutannya gimana.

## 6. Cara Pakai Dokumen Ini (multi-akun)

Karena kerja dipecah ke beberapa akun Claude biar paralel:
- **Update bagian "Status Fitur" & "Skema Database" di dokumen ini tiap kali ada perubahan besar**, terus kirim ulang versi terbaru ke chat lain biar semua akun sinkron.
- Kalau dua akun ngerjain bagian yang saling terkait (misal satu ngerjain admin, satu ngerjain toko/index.html), kasih tau eksplisit ke masing-masing chat biar nggak ada perubahan yang saling menimpa/konflik pas digabung ke repo.
- Setelah selesai satu sesi kerja, minta Claude di sesi itu nulis ringkasan singkat "apa yang berubah" biar gampang di-paste ke chat lain sebagai update.
