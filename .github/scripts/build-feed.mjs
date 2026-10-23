// Susun feed.tsv (satu baris per varian) untuk Meta Commerce Manager dan Google Merchant Center.
// Dipanggil oleh .github/workflows/feed.yml. Hanya membaca produk aktif dari Supabase (kunci anon, sama seperti sitemap).
// Pakai: node .github/scripts/build-feed.mjs [nama-file-keluaran]
import { writeFileSync } from 'node:fs';

// ====== PENGATURAN ======
const SITE = 'https://zenoot.web.id';
const BRAND = 'Zenoot';
const CURRENCY = 'IDR';
const GOOGLE_CATEGORY = '212'; // Apparel & Accessories > Clothing > Shirts & Tops
const OUT = process.argv[2] || 'feed.tsv';
// ========================

const COLUMNS = [
  'id', 'item_group_id', 'title', 'description', 'availability', 'condition',
  'price', 'sale_price', 'link', 'image_link', 'additional_image_link', 'brand',
  'identifier_exists', 'google_product_category', 'gender', 'age_group',
  'color', 'size', 'material', 'pattern', 'product_type',
];

// Satu baris TSV = satu produk: buang tab, baris baru, HTML.
function clean(value, max = 0) {
  let s = String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\t\r\n]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (max && s.length > max) s = s.slice(0, max - 1).trimEnd() + '…';
  return s;
}

function mapGender(raw) {
  const g = String(raw ?? '').toLowerCase();
  if (/anak|kid|bocah/.test(g)) return { gender: 'unisex', ageGroup: 'kids' };
  if (/wanita|perempuan|cewek|female|women/.test(g)) return { gender: 'female', ageGroup: 'adult' };
  if (/pria|laki|cowok|male|men/.test(g)) return { gender: 'male', ageGroup: 'adult' };
  return { gender: 'unisex', ageGroup: 'adult' };
}

const money = (n) => `${Math.round(n)} ${CURRENCY}`;

// ID item yang STABIL: dibentuk dari produk + warna + ukuran, bukan dari ID varian.
// Alasan: admin menghapus lalu membuat ulang semua varian setiap produk disimpan, jadi ID varian
// berubah terus. Kalau ID item ikut berubah, tag produk di Instagram putus dan peninjauan Google mengulang.
const slug = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export function buildFeed(products) {
  const lines = [COLUMNS.join('\t')];
  const skipped = { noImage: 0, noPrice: 0 };

  for (const p of products) {
    if (p.is_active === false || !p.name) continue;
    const usedIds = new Set();
    const stableId = (v) => {
      const base = [p.id, slug(v.color_name), slug(v.size)].filter(Boolean).join('-').slice(0, 95);
      let id = base;
      for (let n = 2; usedIds.has(id); n++) id = `${base}-${n}`; // warna+ukuran kembar dalam satu produk
      usedIds.add(id);
      return id;
    };
    const variants = (p.variants || [])
      .filter((v) => v.is_active !== false)
      .map((v) => ({ ...v, _key: [slug(v.color_name), slug(v.size), String(v.price)].join('|') }))
      .sort((a, b) => a._key.localeCompare(b._key)); // urutan tetap -> file tidak berubah kalau datanya sama

    for (const v of variants) {
      const price = Number(v.price);
      if (!Number.isFinite(price) || price <= 0) { skipped.noPrice++; continue; }

      const images = [v.image_url, p.image_url, ...(p.image_urls ?? [])].filter(
        (u) => typeof u === 'string' && /^https?:\/\//.test(u),
      );
      const main = images[0];
      if (!main) { skipped.noImage++; continue; } // Meta dan Google menolak produk tanpa gambar
      const extra = [...new Set(images.slice(1))].filter((u) => u !== main).slice(0, 10);

      // Sama seperti web: original_price = harga coret, price = harga jual.
      const original = Number(v.original_price);
      const onSale = Number.isFinite(original) && original > price;

      const color = clean(v.color_name);
      const size = clean(v.size);
      const { gender, ageGroup } = mapGender(p.gender);
      const desc =
        clean(p.description, 5000) ||
        clean([p.name, p.bahan ? `Bahan ${p.bahan}` : ''].filter(Boolean).join('. '), 5000);

      const row = {
        id: stableId(v),
        item_group_id: p.id,
        title: clean([p.name, color].filter(Boolean).join(' - '), 150),
        description: desc,
        availability: Number(v.stock) > 0 ? 'in stock' : 'out of stock',
        condition: 'new',
        price: money(onSale ? original : price),
        sale_price: onSale ? money(price) : '',
        link: `${SITE}/?p=${p.id}`,
        image_link: main,
        additional_image_link: extra.join(','),
        brand: BRAND,
        identifier_exists: 'no',
        google_product_category: GOOGLE_CATEGORY,
        gender,
        age_group: ageGroup,
        color,
        size,
        material: clean(p.bahan),
        pattern: clean(p.motif),
        product_type: clean(p.category),
      };
      lines.push(COLUMNS.map((c) => clean(row[c])).join('\t'));
    }
  }
  return { text: lines.join('\n') + '\n', rows: lines.length - 1, skipped };
}

async function fetchProducts() {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!base || !key) throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY belum diisi');
  const select =
    'id,name,description,category,is_active,image_url,image_urls,gender,bahan,motif,' +
    'variants(id,color_name,size,price,original_price,stock,image_url,is_active)';
  const pageSize = 500;
  const all = [];
  for (let offset = 0; ; offset += pageSize) {
    const url = `${base}/rest/v1/products?select=${encodeURIComponent(select)}&is_active=eq.true&order=created_at.asc,id.asc&limit=${pageSize}&offset=${offset}`;
    const res = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`Supabase HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const page = await res.json();
    if (!Array.isArray(page)) throw new Error('Respons Supabase bukan daftar');
    all.push(...page);
    if (page.length < pageSize) break;
  }
  return all;
}

// Jalankan hanya kalau dipanggil langsung (bukan saat di-import untuk uji).
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const products = await fetchProducts();
    const { text, rows, skipped } = buildFeed(products);
    if (rows === 0) {
      console.error('Tidak ada baris produk yang valid, feed lama TIDAK diubah (pengaman).');
      process.exit(1);
    }
    writeFileSync(OUT, text);
    console.log(`Produk: ${products.length} | baris feed (varian): ${rows} | dilewati tanpa gambar: ${skipped.noImage}, tanpa harga: ${skipped.noPrice}`);
  } catch (err) {
    console.error('Gagal menyusun feed, feed lama TIDAK diubah:', err.message);
    process.exit(1);
  }
}
