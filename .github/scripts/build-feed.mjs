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
const OUT_XML = process.argv[3] || ''; // contoh: feed-meta.xml (workflow sudah mengirim argumen ini)
const MAX_ID = 50; // batas panjang atribut id di Google Merchant Center (Meta lebih longgar)
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

// ID item yang STABIL: dibentuk dari 8 karakter pertama ID produk + warna + ukuran, bukan dari ID varian.
// Maksimal 50 karakter (batas Google), jadi UUID produk penuh tidak dipakai di sini.
// Alasan: admin menghapus lalu membuat ulang semua varian setiap produk disimpan, jadi ID varian
// berubah terus. Kalau ID item ikut berubah, tag produk di Instagram putus dan peninjauan Google mengulang.
const slug = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');


const RAPIKAN_TSV = false; // false = deskripsi di feed SAMA dengan di web (diatur hanya di admin web)
// ====== PERAPIAN DESKRIPSI (opsional, tidak dipakai kalau RAPIKAN_TSV = false) ======
// Sumber teks deskripsi di admin berisi judul HURUF BESAR, bullet, dan blok promo reseller. Meta/IG/WA/Google membuang
// baris baru, jadi semuanya menyatu jadi satu paragraf. Fungsi ini menyusunnya jadi kalimat berlabel ("Spesifikasi: ...")
// yang tetap enak dibaca walaupun jadi satu paragraf.
const HAPUS_PROMO_RESELLER = false; // blok "OPEN RESELLER & DROPSHIP" tidak ditampilkan di katalog
const BUKAN_JUDUL = new Set(['XXL', 'XL', 'ALL SIZE', 'SLIM FIT', 'HAPPY SHOPING', 'HAPPY SHOPPING', 'SIZE']);
const BULLET = /^[•✔✅✓▪●·*-]\s*/u;

function judulKapital(t) {
  return t
    .toLowerCase()
    .replace(/(^|[\s(])(\p{L})/gu, (m, a, b) => a + b.toUpperCase())
    .replace(/\bDan\b/g, 'dan')
    .replace(/\bXxl\b/g, 'XXL')
    .replace(/\bXl\b/g, 'XL');
}

export function rapikanDeskripsi(raw) {
  let t = String(raw ?? '')
    .replace(/<\s*br\s*\/?>|<\/p>|<\/li>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[\t\u00a0]+/g, ' ')
    .replace(/[-=_*~]{4,}/g, ' ')
    .replace(/\bKahaki\b/gi, 'Khaki');
  if (HAPUS_PROMO_RESELLER) {
    t = t.replace(/OPEN RESELLER[\s\S]*?Trusted seller\s*(?:HAPPY SHOP+ING)?/i, ' ');
  }
  // Judul HURUF BESAR di tengah kalimat -> baris sendiri; bullet di tengah baris -> baris sendiri.
  t = t.replace(
    /(?<![\p{L}])([A-Z]{3,}(?:\s+(?:DAN|[A-Z]{3,}))*(?:\s*\([^)]*\))?\??)(?![\p{L}])(?=\s*[•✔✅\p{Lu}])/gu,
    (m, h) => (BUKAN_JUDUL.has(h.replace(/\s*\(.*$/, '').trim()) ? m : `\n${h}\n`),
  );
  t = t.replace(/\s+([•✔✅])\s*/gu, '\n$1 ');

  const lines = t.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const out = [];
  let items = [];
  let label = '';
  const flush = () => {
    if (!items.length) return;
    const isi = items.map((i) => i.replace(/[.;,\s]+$/, '')).join('; ');
    const body = /[!?]$/.test(isi) ? isi : isi + '.';
    out.push(label ? (label.endsWith('?') ? `${label} ${body}` : `${label}: ${body}`) : body);
    items = [];
    label = '';
  };
  const titik = (s) => (/[.!?:]$/.test(s) ? s : s + '.');

  for (const line of lines) {
    const tanpaKurung = line.replace(/\s*\([^)]*\)/g, '');
    const noLower = !/\p{Ll}/u.test(tanpaKurung);
    const inti = line.replace(/\s*\(.*$/, '').replace(/[?:]$/, '').trim();
    if (noLower && /\p{Lu}{3,}/u.test(tanpaKurung) && !BUKAN_JUDUL.has(inti)) {
      flush();
      label = judulKapital(line.replace(/:$/, ''));
      continue;
    }
    if (BULLET.test(line)) {
      items.push(line.replace(BULLET, ''));
      continue;
    }
    flush();
    if (label) {
      out.push(label.endsWith('?') ? `${label} ${titik(line)}` : `${label}: ${titik(line)}`);
      label = '';
    } else {
      out.push(titik(line));
    }
  }
  flush();
  if (label) out.push(label.endsWith('?') ? label : `${label}.`);
  return out.join(' ').replace(/\s{2,}/g, ' ').trim();
}
// ================================


// Deskripsi persis seperti di web: baris baru & bullet dipertahankan (hanya HTML dibuang). Dipakai untuk feed XML.
export function deskripsiAsli(raw, max = 5000) {
  let s = String(raw ?? '')
    .replace(/<\s*br\s*\/?>|<\/p>|<\/li>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\t\u00a0]+/g, ' ')
    .split('\n')
    .map((l) => l.replace(/ {2,}/g, ' ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (s.length > max) s = s.slice(0, max - 1).trimEnd() + '…';
  return s;
}

const xmlEsc = (v) =>
  String(v ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

// Feed XML (RSS 2.0 + namespace g:) untuk Meta dan Google. Berbeda dengan TSV, XML boleh berisi baris baru.
export function buildXml(items) {
  const tag = (n, v) => (v === '' || v == null ? '' : `      <g:${n}>${xmlEsc(v)}</g:${n}>\n`);
  const body = items
    .map((r) => {
      const extra = String(r.additional_image_link || '').split(',').filter(Boolean);
      return (
        '    <item>\n' +
        tag('id', r.id) + tag('item_group_id', r.item_group_id) + tag('title', r.title) +
        tag('description', r.description) + tag('availability', r.availability) +
        tag('condition', r.condition) + tag('price', r.price) + tag('sale_price', r.sale_price) +
        tag('link', r.link) + tag('image_link', r.image_link) +
        extra.map((u) => tag('additional_image_link', u)).join('') +
        tag('brand', r.brand) + tag('identifier_exists', r.identifier_exists) +
        tag('google_product_category', r.google_product_category) + tag('gender', r.gender) +
        tag('age_group', r.age_group) + tag('color', r.color) + tag('size', r.size) +
        tag('material', r.material) + tag('pattern', r.pattern) + tag('product_type', r.product_type) +
        '    </item>\n'
      );
    })
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">\n  <channel>\n' +
    `    <title>${xmlEsc(BRAND)}</title>\n    <link>${xmlEsc(SITE)}</link>\n` +
    `    <description>Feed produk ${xmlEsc(BRAND)}</description>\n` + body + '  </channel>\n</rss>\n'
  );
}

export function buildFeed(products) {
  const lines = [COLUMNS.join('\t')];
  const skipped = { noImage: 0, noPrice: 0 };
  const xmlItems = [];
  const usedIds = new Set(); // berlaku untuk seluruh feed, supaya dua produk tidak pernah berbagi ID

  for (const p of products) {
    if (p.is_active === false || !p.name) continue;
    const stableId = (v) => {
      const code = String(p.id ?? '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toLowerCase();
      const base = [code, slug(v.color_name), slug(v.size)].filter(Boolean).join('-').slice(0, MAX_ID);
      let id = base;
      for (let n = 2; usedIds.has(id); n++) {
        const suffix = `-${n}`;
        id = base.slice(0, MAX_ID - suffix.length) + suffix; // warna+ukuran kembar dalam satu produk
      }
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
        clean(RAPIKAN_TSV ? rapikanDeskripsi(p.description) : p.description, 5000) ||
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
      xmlItems.push({ ...row, description: deskripsiAsli(p.description) || row.description });
    }
  }
  return { text: lines.join('\n') + '\n', rows: lines.length - 1, skipped, xml: buildXml(xmlItems) };
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
    const { text, rows, skipped, xml } = buildFeed(products);
    if (rows === 0) {
      console.error('Tidak ada baris produk yang valid, feed lama TIDAK diubah (pengaman).');
      process.exit(1);
    }
    writeFileSync(OUT, text);
    if (OUT_XML) writeFileSync(OUT_XML, xml);
    console.log(`Produk: ${products.length} | baris feed (varian): ${rows} | dilewati tanpa gambar: ${skipped.noImage}, tanpa harga: ${skipped.noPrice}`);
  } catch (err) {
    console.error('Gagal menyusun feed, feed lama TIDAK diubah:', err.message);
    process.exit(1);
  }
}
