#!/usr/bin/env python3
"""Susun halaman statis produk (/produk/<slug>/), halaman kategori (/kategori/<slug>/) dan sitemap.xml.

Dipanggil oleh .github/workflows/sitemap.yml setelah products.json (dan opsional categories.json,
reviews.json, bio.json) diunduh dari Supabase dengan kunci anon.

Kenapa halaman statis: toko adalah satu index.html yang mengisi title, deskripsi, dan JSON-LD lewat
JavaScript. Halaman di sini sudah berisi semuanya di HTML awal, jadi Google tidak perlu menunggu render.

Pengaman: kalau data produk kosong atau tidak valid, tidak ada file yang diubah.
Hanya pustaka standar Python. Pakai: python3 .github/scripts/build-static.py
"""
import datetime
import html
import json
import os
import re
import sys
import unicodedata
import urllib.parse

SITE = 'https://zenoot.web.id'
BRAND = 'Zenoot'
MARK = '<!-- zenoot-static -->'
TODAY = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d')
ROOT = os.environ.get('STATIC_ROOT', '.')


# ---------------------------------------------------------------- helper teks
# Rumus slug, judul, dan deskripsi otomatis SAMA dengan yang ada di admin-products.js (Seller Center)
# dan index.html (toko). Kalau salah satu diubah, ubah semuanya.
def slugify(s):
    s = unicodedata.normalize('NFKD', str(s or '').lower())
    s = ''.join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r'[^a-z0-9]+', '-', s).strip('-')[:80]
    return s.rstrip('-')


def esc(v):
    return html.escape(str(v if v is not None else ''), quote=True)


def word_in(word, text):
    if not word:
        return False
    return re.search(r'(^|[^a-z0-9])' + re.escape(str(word)) + r'([^a-z0-9]|$)', text, re.I) is not None


def cut_words(s, n):
    if len(s) <= n:
        return s
    c = s[:n - 1]
    sp = c.rfind(' ')
    c = c[:sp] if sp > 40 else c
    return re.sub(r'[\s.,;:\-]+$', '', c) + '…'


def cut_sentence(s, n):
    if len(s) <= n:
        return s
    m = re.match(r'^[\s\S]*[.!?](?=\s|$)', s[:n])
    if m and len(m.group(0)) >= 80:
        return m.group(0).strip()
    return cut_words(s, n)


def rp(n):
    return 'Rp ' + format(int(round(float(n))), ',').replace(',', '.')


def num(v):
    try:
        f = float(v)
        return f if f == f else 0.0
    except (TypeError, ValueError):
        return 0.0


def num_text(v):
    f = num(v)
    return str(int(f)) if f == int(f) else str(f)


def text_of(v):
    s = re.sub(r'\[[^\]]*\]', '', str(v if v is not None else ''))
    return re.sub(r'\s+', ' ', s).strip()


def gender_label(g):
    g = str(g or '').lower()
    return 'Wanita' if g == 'wanita' else ('Pria' if g == 'pria' else '')


def plain_desc(raw):
    s = str(raw or '').replace('\r', '')
    s = re.sub(r'(^|\n)\s*#{1,6}\s*', r'\1', s)
    s = re.sub(r'\*\*|__|`', '', s)
    return s.strip()


# ---------------------------------------------------------------- slug unik
VALID_SLUG = re.compile(r'^[a-z0-9]+(-[a-z0-9]+)*$')


def assign_slugs(products):
    """slug dari kolom products.slug kalau ada; kalau tidak, dari nama. Bentrok -> tambah 8 karakter ID."""
    used, out = set(), {}
    for p in products:
        s = str(p.get('slug') or '').strip().lower()
        if s and VALID_SLUG.match(s) and s not in used:
            out[p['id']] = s
            used.add(s)
    rest = sorted((p for p in products if p['id'] not in out),
                  key=lambda p: (str(p.get('created_at') or ''), str(p['id'])))
    for p in rest:
        base = slugify(p.get('name')) or str(p['id'])[:8]
        s = base
        if s in used:
            s = base[:71].rstrip('-') + '-' + str(p['id'])[:8]
        used.add(s)
        out[p['id']] = s
    return out


# ---------------------------------------------------------------- data produk
def active_variants(p):
    return [v for v in (p.get('variants') or []) if v.get('is_active') is not False and num(v.get('price')) > 0]


def feed_id(p, v, used):
    """Sama dengan stableId() di build-feed.mjs, dipakai sebagai sku tiap penawaran."""
    code = re.sub(r'[^a-zA-Z0-9]', '', str(p.get('id') or ''))[:8].lower()
    base = '-'.join(x for x in (code, slugify(v.get('color_name')), slugify(v.get('size'))) if x)[:50]
    i = base
    n = 2
    while i in used:
        suf = '-%d' % n
        i = base[:50 - len(suf)] + suf
        n += 1
    used.add(i)
    return i


def product_context(p):
    name = text_of(p.get('name'))
    return {
        'name': name,
        'cat': text_of(p.get('category')),
        'gender': gender_label(p.get('gender')),
        'bahan': text_of(p.get('bahan')),
        'ketebalan': text_of(p.get('ketebalan')),
        'lengan': text_of(p.get('lengan')),
        'gramasi': int(num(p.get('gramasi_gsm'))),
    }


def auto_title(c):
    if not c['name']:
        return ''
    tail = ' '.join(x for x in (c['cat'], c['gender']) if x and not word_in(x, c['name']))
    t = '%s | %s | %s' % (c['name'], tail, BRAND) if tail else '%s | %s' % (c['name'], BRAND)
    return '%s | %s' % (c['name'], BRAND) if len(t) > 65 else t


def auto_desc(c, colors, min_price):
    if not c['name']:
        return ''
    lead = ' '.join(x for x in (
        c['name'],
        c['cat'] if c['cat'] and not word_in(c['cat'], c['name']) else '',
        c['gender'] if c['gender'] and not word_in(c['gender'], c['name']) else '') if x)
    parts = [lead + ' dari Zenoot Bandung.']
    spec = []
    if c['bahan']:
        spec.append('Bahan ' + c['bahan'])
    if c['gramasi']:
        spec.append('%d gr/m²' % c['gramasi'])
    if c['ketebalan']:
        spec.append('ketebalan ' + c['ketebalan'].lower())
    if c['lengan']:
        spec.append('lengan ' + c['lengan'].lower())
    if spec:
        parts.append(', '.join(spec) + '.')
    if colors:
        parts.append('%d pilihan warna%s.' % (len(colors), (': ' + ', '.join(colors)) if len(colors) <= 5 else ''))
    if min_price:
        parts.append('Harga mulai %s.' % rp(min_price))
    return cut_words(' '.join(parts), 158)


def image_list(p, vars_):
    main = p.get('image_urls') if isinstance(p.get('image_urls'), list) and p.get('image_urls') else (
        [p['image_url']] if p.get('image_url') else [])
    main = [u for u in main if isinstance(u, str) and u.startswith('http')]
    alts = p.get('image_alts') if isinstance(p.get('image_alts'), list) else []
    c = product_context(p)
    lead = ' '.join(x for x in (
        c['name'],
        c['cat'] if c['cat'] and not word_in(c['cat'], c['name']) else '',
        c['gender'] if c['gender'] and not word_in(c['gender'], c['name']) else '') if x)
    out, seen = [], set()
    for i, u in enumerate(main):
        if u in seen:
            continue
        seen.add(u)
        a = text_of(alts[i]) if i < len(alts) and alts[i] else ''
        out.append((u, a or (lead if i == 0 else '%s - foto %d' % (c['name'], i + 1))))
    for v in vars_:
        u = v.get('image_url')
        if isinstance(u, str) and u.startswith('http') and u not in seen:
            seen.add(u)
            out.append((u, '%s warna %s' % (c['name'], text_of(v.get('color_name')))))
    return out[:9]


# ---------------------------------------------------------------- deskripsi -> HTML
NOT_HEADING = {'XXL', 'XL', 'ALL SIZE', 'SLIM FIT', 'HAPPY SHOPING', 'HAPPY SHOPPING', 'SIZE'}
BULLET = re.compile(r'^\s*[•✔✅✓▪●·*\-]\s+')


def is_heading(t):
    core = re.sub(r'[?:]$', '', re.sub(r'\s*\(.*$', '', t)).strip()
    letters = re.sub(r'[^A-Za-zÀ-ÿ]', '', t)
    return (len(letters) >= 3 and len(t) <= 40 and not re.search(r'[a-zà-ÿ]', t) and core not in NOT_HEADING)


def render_desc(raw):
    out, para, ul = [], [], []

    def flush():
        nonlocal para, ul
        if para:
            out.append('<p>' + '<br>'.join(esc(x) for x in para) + '</p>')
        if ul:
            out.append('<ul>' + ''.join('<li>%s</li>' % esc(x) for x in ul) + '</ul>')
        para, ul = [], []

    for line in plain_desc(raw).split('\n'):
        t = line.strip()
        if not t:
            flush()
            continue
        if is_heading(t):
            flush()
            h = t.rstrip(':').lower()
            out.append('<h3>%s</h3>' % esc(h[:1].upper() + h[1:]))
        elif BULLET.match(t):
            if para:
                flush()
            ul.append(BULLET.sub('', t))
        else:
            if ul:
                flush()
            para.append(t)
    flush()
    return '\n'.join(out)


# ---------------------------------------------------------------- tampilan
CSS = """
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#F1F1F3;--surface:#fff;--border:rgba(17,17,20,.14);--text:#111114;--muted:rgba(17,17,20,.6);--sec:rgba(17,17,20,.82);--ink:#111114;--r:12px}
html{-webkit-text-size-adjust:100%}
body{font-family:'Inter',system-ui,sans-serif;font-weight:500;background:var(--bg);color:var(--text);line-height:1.6}
a{color:inherit}
img{max-width:100%;height:auto;display:block}
header{background:var(--surface);border-bottom:1px solid var(--border);position:sticky;top:0;z-index:20}
.hd{max-width:1100px;margin:0 auto;padding:0 20px;height:60px;display:flex;align-items:center;justify-content:space-between;gap:16px}
.logo{font-family:'Space Grotesk',sans-serif;font-size:20px;font-weight:700;letter-spacing:.14em;text-decoration:none}
.hd nav{display:flex;gap:18px;font-size:14px}
.hd nav a{text-decoration:none;color:var(--sec)}
.hd nav a:hover{color:var(--ink);text-decoration:underline}
.wrap{max-width:1100px;margin:0 auto;padding:20px 20px 48px}
.crumbs{font-size:12.5px;color:var(--muted);margin-bottom:16px}
.crumbs a{text-decoration:none}.crumbs a:hover{text-decoration:underline}
.crumbs span.sep{margin:0 6px}
.pdp{display:grid;grid-template-columns:1fr;gap:24px}
@media(min-width:860px){.pdp{grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:40px}}
.main-img{width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:var(--r);background:#e4e4e7}
.thumbs{display:flex;gap:8px;margin-top:10px;overflow-x:auto;padding-bottom:4px}
.thumbs button{flex:0 0 64px;border:2px solid transparent;border-radius:8px;padding:0;background:none;cursor:pointer;overflow:hidden}
.thumbs button[aria-current=true]{border-color:var(--ink)}
.thumbs img{width:64px;height:64px;object-fit:cover}
h1{font-family:'Source Serif 4',Georgia,serif;font-weight:600;font-size:clamp(24px,4vw,32px);line-height:1.2;margin-bottom:8px}
h2{font-family:'Source Serif 4',Georgia,serif;font-weight:600;font-size:21px;margin-bottom:12px}
h3{font-size:15px;font-weight:600;margin:16px 0 6px}
.rating{font-size:13px;color:var(--sec);margin-bottom:6px}
.price{font-family:'IBM Plex Mono',monospace;font-size:26px;font-weight:500;margin:6px 0 2px}
.price s{font-size:16px;color:var(--muted);margin-left:8px}
.note{font-size:13px;color:var(--muted)}
.sw{list-style:none;display:flex;flex-wrap:wrap;gap:8px;margin:14px 0}
.sw li{display:flex;align-items:center;gap:8px;border:1px solid var(--border);background:var(--surface);border-radius:999px;padding:6px 14px 6px 8px;font-size:13.5px}
.dot{width:16px;height:16px;border-radius:50%;border:1px solid rgba(0,0,0,.2);flex:none}
.btns{display:flex;flex-wrap:wrap;gap:10px;margin:18px 0}
.btn{display:inline-block;background:var(--ink);color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 26px;border-radius:999px}
.btn.alt{background:var(--surface);color:var(--ink);border:1.5px solid var(--ink)}
section.box{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:22px;margin-top:22px}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{text-align:left;padding:9px 8px;border-bottom:1px solid var(--border);vertical-align:top}
th{font-weight:600;color:var(--muted);width:38%}
.vt th{width:auto}
.desc p,.desc ul{margin:0 0 12px;font-weight:400;color:var(--sec)}
.desc ul{padding-left:20px}
.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}
@media(min-width:760px){.grid{grid-template-columns:repeat(4,1fr)}}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);overflow:hidden;text-decoration:none;display:block}
.card img{width:100%;aspect-ratio:1/1;object-fit:cover;background:#e4e4e7}
.card .t{padding:10px 12px 12px}
.card .n{font-size:13.5px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.card .p{font-family:'IBM Plex Mono',monospace;font-size:14px;margin-top:4px}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}
.chips a{border:1px solid var(--border);background:var(--surface);border-radius:999px;padding:6px 14px;font-size:13.5px;text-decoration:none}
footer{background:var(--surface);border-top:1px solid var(--border);margin-top:20px}
.ft{max-width:1100px;margin:0 auto;padding:28px 20px;display:grid;grid-template-columns:1fr;gap:20px;font-size:13.5px}
@media(min-width:760px){.ft{grid-template-columns:1.4fr 1fr 1fr 1.2fr}}
.ft h4{font-size:12px;letter-spacing:.1em;text-transform:uppercase;margin-bottom:10px}
.ft a{display:block;text-decoration:none;color:var(--sec);margin-bottom:6px}
.ft a:hover{text-decoration:underline}
.copy{max-width:1100px;margin:0 auto;padding:0 20px 24px;font-size:12px;color:var(--muted)}
"""

FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com"/>'
         '<link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@400;600&family=Space+Grotesk:wght@700'
         '&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet"/>')


def ld_dump(obj):
    # '<' jadi \\u003c: isi data tidak pernah bisa membentuk tag di dalam blok script (JSON tetap valid)
    return json.dumps(obj, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')


def shell(title, desc, canonical, body, ld, og_image='', og_alt='', og_type='website', extra_og=''):
    og_img = og_image or (SITE + '/icon-512.png')
    return ('<!doctype html>\n<html lang="id">\n<head>\n' + MARK + '\n<meta charset="utf-8"/>\n'
            '<meta name="viewport" content="width=device-width,initial-scale=1"/>\n'
            '<title>%s</title>\n<meta name="description" content="%s"/>\n'
            '<meta name="robots" content="index,follow,max-image-preview:large"/>\n'
            '<link rel="canonical" href="%s"/>\n<link rel="icon" href="/favicon.ico"/>\n'
            '<link rel="apple-touch-icon" href="/apple-touch-icon.png"/>\n'
            '<meta property="og:site_name" content="Zenoot"/>\n<meta property="og:locale" content="id_ID"/>\n'
            '<meta property="og:type" content="%s"/>\n<meta property="og:title" content="%s"/>\n'
            '<meta property="og:description" content="%s"/>\n<meta property="og:url" content="%s"/>\n'
            '<meta property="og:image" content="%s"/>\n%s'
            '<meta name="twitter:card" content="summary_large_image"/>\n'
            '%s\n<style>%s</style>\n<script type="application/ld+json">%s</script>\n</head>\n<body>\n%s\n</body>\n</html>\n'
            ) % (esc(title), esc(desc), esc(canonical), og_type, esc(title), esc(desc), esc(canonical), esc(og_img),
                 (('<meta property="og:image:alt" content="%s"/>\n' % esc(og_alt)) if og_alt else '') + extra_og,
                 FONTS, CSS, ld_dump(ld), body)


def site_header(nav_nodes):
    links = ''.join('<a href="/kategori/%s/">%s</a>' % (esc(n['slug']), esc(n['path'][-1])) for n in nav_nodes)
    return ('<header><div class="hd"><a class="logo" href="/">ZENOOT</a><nav aria-label="Menu utama">'
            '<a href="/">Beranda</a>%s</nav></div></header>') % links


def site_footer(foot_nodes):
    shop = ''.join('<a href="/kategori/%s/">%s</a>' % (esc(n['slug']), esc(' '.join(reversed(n['path']))))
                   for n in foot_nodes[:10])
    return ('<footer><div class="ft"><div><h4>Zenoot</h4><p>Rajutan yang tetap nyaman dipakai seharian, dari kerja '
            'sampai jalan-jalan.</p></div><div><h4>Belanja</h4><a href="/">Semua produk</a>%s</div>'
            '<div><h4>Informasi</h4><a href="/tentang-kami.html">Tentang Kami</a><a href="/kontak.html">Kontak</a>'
            '<a href="/kebijakan-pengiriman.html">Kebijakan Pengiriman</a>'
            '<a href="/kebijakan-pengembalian.html">Kebijakan Pengembalian</a>'
            '<a href="/syarat-ketentuan.html">Syarat &amp; Ketentuan</a><a href="/privacy.html">Kebijakan &amp; Privasi</a></div>'
            '<div><h4>Hubungi Kami</h4><p>Jl. Binong Jati No.63<br>Bandung, Jawa Barat 40275</p></div></div>'
            '<p class="copy">&copy; %s ZENOOT &middot; Produsen sweater rajut &amp; knitwear di Bandung, Jawa Barat</p></footer>'
            ) % (shop, TODAY[:4])


def card(p, slugs, imgs_cache):
    vs = active_variants(p)
    price = min(num(v['price']) for v in vs)
    imgs = imgs_cache[p['id']]
    im = ('<img src="%s" alt="%s" width="400" height="400" loading="lazy" decoding="async"/>' % (esc(imgs[0][0]), esc(imgs[0][1]))
          if imgs else '')
    return ('<a class="card" href="/produk/%s/">%s<div class="t"><div class="n">%s</div><div class="p">%s</div></div></a>'
            % (esc(slugs[p['id']]), im, esc(text_of(p.get('name'))), rp(price)))


# ---------------------------------------------------------------- kategori
def build_nodes(products, categories):
    cat_by_id = {c['id']: c for c in categories if isinstance(c, dict) and c.get('id')}

    def path_of(cid):
        names, seen = [], set()
        while cid and cid in cat_by_id and cid not in seen:
            seen.add(cid)
            names.append(text_of(cat_by_id[cid].get('name')))
            cid = cat_by_id[cid].get('parent_id')
        return tuple(reversed(names))

    nodes = {}
    prod_path = {}
    for p in products:
        path = path_of(p.get('category_id')) if p.get('category_id') else ()
        if not path:
            path = tuple(x for x in (gender_label(p.get('gender')), text_of(p.get('category'))) if x)
        prod_path[p['id']] = path
        for i in range(1, len(path) + 1):
            nodes.setdefault(path[:i], {'path': path[:i], 'products': []})['products'].append(p)
    used = set()
    for key in sorted(nodes, key=lambda k: (len(k), k)):
        n = nodes[key]
        base = slugify(' '.join(reversed(key))) or 'koleksi'
        s, i = base, 2
        while s in used:
            s = '%s-%d' % (base, i)
            i += 1
        used.add(s)
        n['slug'] = s
    return nodes, prod_path


def node_h1(n):
    return ('Koleksi Rajut ' + n['path'][0]) if len(n['path']) == 1 else ' '.join(reversed(n['path']))


# ---------------------------------------------------------------- halaman produk
def wa_link(bio, name):
    num_ = re.sub(r'\D', '', str((bio or {}).get('wa_number') or ''))
    if not num_:
        return ''
    if num_.startswith('0'):
        num_ = '62' + num_[1:]
    return 'https://wa.me/%s?text=%s' % (num_, urllib.parse.quote('Halo Zenoot, saya mau tanya produk %s' % name))


def product_page(p, ctx):
    slugs, nodes, prod_path, imgs_cache, ratings, bio = (ctx[k] for k in ('slugs', 'nodes', 'prod_path', 'imgs', 'ratings', 'bio'))
    c = product_context(p)
    name = c['name'] or 'Produk Zenoot'
    code = slugs[p['id']]
    url = '%s/produk/%s/' % (SITE, code)
    vs = active_variants(p)
    prices = [num(v['price']) for v in vs]
    minp, maxp = min(prices), max(prices)
    cheapest = sorted(vs, key=lambda v: num(v['price']))[0]
    orig = num(cheapest.get('original_price'))
    colors = []
    for v in vs:
        cn = text_of(v.get('color_name'))
        if cn and cn not in [x[0] for x in colors]:
            colors.append((cn, str(v.get('color_hex') or '')))
    color_names = [x[0] for x in colors]
    sizes = []
    for v in vs:
        s = text_of(v.get('size'))
        if s and s not in sizes:
            sizes.append(s)
    in_stock = any(num(v.get('stock')) > 0 for v in vs)
    imgs = imgs_cache[p['id']]
    title = text_of(p.get('seo_title')) or auto_title(c)
    desc = text_of(p.get('seo_description')) or auto_desc(c, color_names, minp)
    long_desc = cut_sentence(re.sub(r'\s+', ' ', re.sub(r'[•✔✅✓▪●·]\s*', '', plain_desc(p.get('description')))).strip(), 300) or desc
    path = prod_path[p['id']]
    rate = ratings.get(p['id'])

    # ---- JSON-LD
    used_ids = set()
    offers = []
    for v in vs:
        o = {'@type': 'Offer', 'sku': feed_id(p, v, used_ids),
             'name': ' - '.join(x for x in (name, text_of(v.get('color_name')), text_of(v.get('size'))) if x),
             'price': num_text(v['price']), 'priceCurrency': 'IDR', 'url': url,
             'availability': 'https://schema.org/InStock' if num(v.get('stock')) > 0 else 'https://schema.org/OutOfStock',
             'itemCondition': 'https://schema.org/NewCondition'}
        ov = num(v.get('original_price'))
        if ov > num(v['price']):
            o['priceSpecification'] = {'@type': 'UnitPriceSpecification', 'priceType': 'https://schema.org/StrikethroughPrice',
                                       'price': num_text(ov), 'priceCurrency': 'IDR'}
        offers.append(o)
    product = {'@type': 'Product', '@id': url + '#product', 'name': name, 'url': url, 'sku': str(p['id']),
               'brand': {'@type': 'Brand', 'name': BRAND}, 'description': long_desc,
               'image': [u for u, _ in imgs][:8],
               'offers': {'@type': 'AggregateOffer', 'priceCurrency': 'IDR', 'lowPrice': num_text(minp),
                          'highPrice': num_text(maxp), 'offerCount': len(offers),
                          'availability': 'https://schema.org/InStock' if in_stock else 'https://schema.org/OutOfStock',
                          'offers': offers}}
    if not product['image']:
        del product['image']
    if c['cat']:
        product['category'] = c['cat']
    if c['bahan']:
        product['material'] = c['bahan']
    if color_names:
        product['color'] = ', '.join(color_names)
    if c['gender']:
        product['audience'] = {'@type': 'PeopleAudience', 'suggestedGender': 'female' if c['gender'] == 'Wanita' else 'male'}
    props = []
    if c['lengan']:
        props.append({'@type': 'PropertyValue', 'name': 'Lengan', 'value': c['lengan']})
    if c['gramasi']:
        props.append({'@type': 'PropertyValue', 'name': 'Gramasi', 'value': c['gramasi'], 'unitText': 'gr/m²'})
    if num(p.get('lingkar_dada_cm')):
        props.append({'@type': 'PropertyValue', 'name': 'Lingkar dada', 'value': num(p['lingkar_dada_cm']), 'unitCode': 'CMT'})
    if num(p.get('panjang_cm')):
        props.append({'@type': 'PropertyValue', 'name': 'Panjang baju', 'value': num(p['panjang_cm']), 'unitCode': 'CMT'})
    if c['ketebalan']:
        props.append({'@type': 'PropertyValue', 'name': 'Ketebalan', 'value': c['ketebalan']})
    if text_of(p.get('motif')):
        props.append({'@type': 'PropertyValue', 'name': 'Motif', 'value': text_of(p.get('motif'))})
    if props:
        product['additionalProperty'] = props
    if rate:
        product['aggregateRating'] = {'@type': 'AggregateRating', 'ratingValue': rate[0], 'reviewCount': rate[1],
                                      'bestRating': 5, 'worstRating': 1}
    crumbs_ld = [{'@type': 'ListItem', 'position': 1, 'name': 'Beranda', 'item': SITE + '/'}]
    crumbs_html = ['<a href="/">Beranda</a>']
    for i in range(1, len(path) + 1):
        n = nodes[path[:i]]
        crumbs_ld.append({'@type': 'ListItem', 'position': len(crumbs_ld) + 1, 'name': n['path'][-1],
                          'item': '%s/kategori/%s/' % (SITE, n['slug'])})
        crumbs_html.append('<a href="/kategori/%s/">%s</a>' % (esc(n['slug']), esc(n['path'][-1])))
    crumbs_ld.append({'@type': 'ListItem', 'position': len(crumbs_ld) + 1, 'name': name, 'item': url})
    crumbs_html.append('<span>%s</span>' % esc(name))
    ld = {'@context': 'https://schema.org', '@graph': [
        product, {'@type': 'BreadcrumbList', 'itemListElement': crumbs_ld}]}

    # ---- isi halaman
    specs = [('Bahan', c['bahan']), ('Gramasi', ('%d gr/m²' % c['gramasi']) if c['gramasi'] else ''),
             ('Ketebalan', c['ketebalan']), ('Lengan', c['lengan']), ('Tipe cutting', text_of(p.get('tipe_cutting'))),
             ('Motif', text_of(p.get('motif'))), ('Ukuran', ', '.join(sizes)),
             ('Lingkar dada', ('%s cm' % num_text(p['lingkar_dada_cm'])) if num(p.get('lingkar_dada_cm')) else ''),
             ('Panjang baju', ('%s cm' % num_text(p['panjang_cm'])) if num(p.get('panjang_cm')) else ''),
             ('Dipakai model', text_of(p.get('dipakai_model'))), ('Perawatan', text_of(p.get('perawatan'))),
             ('Untuk', c['gender']), ('Kategori', c['cat'])]
    specs = [(k, v) for k, v in specs if v]
    spec_html = ('<section class="box"><h2>Spesifikasi %s</h2><table>%s</table>%s</section>' % (
        esc(name), ''.join('<tr><th>%s</th><td>%s</td></tr>' % (esc(k), esc(v)) for k, v in specs),
        '<p class="note" style="margin-top:10px">Lingkar dada dan panjang adalah ukuran produk, bukan ukuran badan.</p>'
        if num(p.get('lingkar_dada_cm')) or num(p.get('panjang_cm')) else '')) if specs else ''
    desc_body = render_desc(p.get('description'))
    desc_html = '<section class="box desc"><h2>Deskripsi %s</h2>%s</section>' % (esc(name), desc_body) if desc_body else ''
    var_rows = ''.join('<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>' % (
        esc(text_of(v.get('color_name'))), esc(text_of(v.get('size'))), rp(num(v['price'])),
        'Tersedia' if num(v.get('stock')) > 0 else 'Habis') for v in vs)
    var_html = ('<section class="box"><h2>Pilihan warna dan harga</h2><table class="vt"><thead><tr><th>Warna</th><th>Ukuran</th>'
                '<th>Harga</th><th>Stok</th></tr></thead><tbody>%s</tbody></table></section>') % var_rows

    related = [x for x in ctx['products'] if x['id'] != p['id'] and prod_path[x['id']] == path]
    if len(related) < 4:
        related += [x for x in ctx['products'] if x['id'] != p['id'] and x not in related
                    and gender_label(x.get('gender')) == c['gender']]
    related = related[:4]
    rel_html = ('<section class="box"><h2>Produk lainnya</h2><div class="grid">%s</div></section>' % ''.join(
        card(x, slugs, imgs_cache) for x in related)) if related else ''

    gallery = ''
    if imgs:
        thumbs = ''
        if len(imgs) > 1:
            thumbs = '<div class="thumbs">%s</div>' % ''.join(
                '<button type="button" data-src="%s" data-alt="%s"%s aria-label="Foto %d"><img src="%s" alt="%s" width="64" height="64" loading="lazy"/></button>'
                % (esc(u), esc(a), ' aria-current="true"' if i == 0 else '', i + 1, esc(u), esc(a)) for i, (u, a) in enumerate(imgs))
        gallery = ('<div><img id="main-img" class="main-img" src="%s" alt="%s" width="800" height="800" fetchpriority="high"/>%s</div>'
                   % (esc(imgs[0][0]), esc(imgs[0][1]), thumbs))
    rating_html = ('<p class="rating">★ %s dari 5 · %d ulasan pembeli</p>' % (rate[0], rate[1])) if rate else ''
    price_html = '<p class="price">%s%s</p>' % (rp(minp), ('<s>%s</s>' % rp(orig)) if orig > minp else '')
    price_note = '<p class="note">%s</p>' % ('Harga mulai dari varian termurah.' if maxp > minp else 'Harga per pcs.')
    sw = ('<ul class="sw" aria-label="Pilihan warna">%s</ul>' % ''.join(
        '<li><span class="dot" style="background:%s"></span>%s</li>' % (esc(h if re.match(r'^#[0-9a-fA-F]{3,8}$', h) else '#ccc'), esc(n))
        for n, h in colors)) if colors else ''
    wa = wa_link(bio, name)
    btns = '<div class="btns"><a class="btn" href="/?p=%s">Beli di Zenoot</a>%s</div>' % (
        esc(p['id']), ('<a class="btn alt" href="%s" rel="noopener">Tanya via WhatsApp</a>' % esc(wa)) if wa else '')
    body = (site_header(ctx['nav_nodes']) + '<main class="wrap"><nav class="crumbs" aria-label="Breadcrumb">%s</nav>'
            '<article class="pdp">%s<div><h1>%s</h1>%s%s%s%s<p class="note">Ukuran: %s</p>%s</div></article>%s%s%s%s</main>'
            % ('<span class="sep">›</span>'.join(crumbs_html), gallery, esc(name), rating_html, price_html, price_note, sw,
               esc(', '.join(sizes)), btns, spec_html, desc_html, var_html, rel_html)
            + site_footer(ctx['foot_nodes'])
            + '<script>(function(){var m=document.getElementById("main-img");if(!m)return;'
              'document.querySelectorAll(".thumbs button").forEach(function(b){b.addEventListener("click",function(){'
              'm.src=b.dataset.src;m.alt=b.dataset.alt;document.querySelectorAll(".thumbs button").forEach(function(x){'
              'x.removeAttribute("aria-current")});b.setAttribute("aria-current","true")})})})();</script>')
    page = shell(title, desc, url, body, ld, og_image=imgs[0][0] if imgs else '', og_alt=imgs[0][1] if imgs else '',
                 og_type='product')
    return url, page, [u for u, _ in imgs][:8]


def category_page(n, ctx):
    slugs, nodes, imgs_cache = ctx['slugs'], ctx['nodes'], ctx['imgs']
    h1 = node_h1(n)
    url = '%s/kategori/%s/' % (SITE, n['slug'])
    prods = sorted(n['products'], key=lambda p: str(p.get('created_at') or ''), reverse=True)
    prices = [min(num(v['price']) for v in active_variants(p)) for p in prods]
    title = '%s | Zenoot Bandung' % h1 if len(n['path']) == 1 else '%s | Koleksi Rajut Zenoot Bandung' % h1
    desc = cut_words('%s dari Zenoot Bandung: %d model rajut, mulai %s. Bahan nyaman dipakai seharian, dikirim ke seluruh Indonesia.'
                     % (h1, len(prods), rp(min(prices))), 158)
    children = [m for k, m in nodes.items() if len(k) == len(n['path']) + 1 and k[:len(n['path'])] == n['path']]
    siblings = [m for k, m in nodes.items() if len(k) == len(n['path']) and k != n['path'] and k[:-1] == n['path'][:-1]]
    chips = ''
    related = children or siblings
    if related:
        chips = '<div class="chips">%s</div>' % ''.join(
            '<a href="/kategori/%s/">%s</a>' % (esc(m['slug']), esc(node_h1(m))) for m in sorted(related, key=lambda m: m['path']))
    crumbs_ld = [{'@type': 'ListItem', 'position': 1, 'name': 'Beranda', 'item': SITE + '/'}]
    crumbs_html = ['<a href="/">Beranda</a>']
    for i in range(1, len(n['path']) + 1):
        m = nodes[n['path'][:i]]
        crumbs_ld.append({'@type': 'ListItem', 'position': len(crumbs_ld) + 1, 'name': m['path'][-1], 'item': '%s/kategori/%s/' % (SITE, m['slug'])})
        crumbs_html.append('<a href="/kategori/%s/">%s</a>' % (esc(m['slug']), esc(m['path'][-1])) if i < len(n['path']) else '<span>%s</span>' % esc(m['path'][-1]))
    ld = {'@context': 'https://schema.org', '@graph': [
        {'@type': 'CollectionPage', '@id': url + '#page', 'url': url, 'name': h1, 'description': desc,
         'isPartOf': {'@type': 'WebSite', 'name': BRAND, 'url': SITE + '/'}},
        {'@type': 'ItemList', 'itemListElement': [
            {'@type': 'ListItem', 'position': i + 1, 'url': '%s/produk/%s/' % (SITE, slugs[p['id']]), 'name': text_of(p.get('name'))}
            for i, p in enumerate(prods)]},
        {'@type': 'BreadcrumbList', 'itemListElement': crumbs_ld}]}
    first = imgs_cache[prods[0]['id']]
    intro = ('Pilih %d model %s dari Zenoot, brand rajut dari Bandung. Semua produk dikirim ke seluruh Indonesia.'
             % (len(prods), h1.replace('Koleksi Rajut ', 'rajut ').lower() if len(n['path']) == 1 else h1))
    body = (site_header(ctx['nav_nodes']) + '<main class="wrap"><nav class="crumbs" aria-label="Breadcrumb">%s</nav>'
            '<h1>%s</h1><p class="note" style="margin-bottom:6px">%s</p>%s<div class="grid" style="margin-top:14px">%s</div></main>'
            % ('<span class="sep">›</span>'.join(crumbs_html), esc(h1), esc(intro), chips,
               ''.join(card(p, slugs, imgs_cache) for p in prods)) + site_footer(ctx['foot_nodes']))
    page = shell(title, desc, url, body, ld, og_image=first[0][0] if first else '', og_alt=first[0][1] if first else '')
    return url, page


# ---------------------------------------------------------------- berkas + sitemap
def read(path):
    try:
        with open(os.path.join(ROOT, path), encoding='utf-8') as f:
            return f.read()
    except OSError:
        return None


def load_json(name, default):
    try:
        with open(os.path.join(ROOT, name), encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def write_if_changed(path, content):
    old = read(path)
    if old == content:
        return False
    full = os.path.join(ROOT, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, 'w', encoding='utf-8') as f:
        f.write(content)
    return True


def prune(folder, keep_slugs):
    base = os.path.join(ROOT, folder)
    if not os.path.isdir(base):
        return 0
    removed = 0
    for d in os.listdir(base):
        idx = os.path.join(base, d, 'index.html')
        if d not in keep_slugs and os.path.isfile(idx):
            with open(idx, encoding='utf-8') as f:
                if MARK not in f.read(2000):
                    continue  # bukan buatan skrip ini, jangan disentuh
            os.remove(idx)
            try:
                os.rmdir(os.path.join(base, d))
            except OSError:
                pass
            removed += 1
    return removed


def old_lastmods():
    out = {}
    x = read('sitemap.xml') or ''
    for m in re.finditer(r'<url>\s*<loc>([^<]+)</loc>(?:\s*<lastmod>([^<]+)</lastmod>)?', x):
        out[html.unescape(m.group(1).strip())] = (m.group(2) or '').strip()
    return out


# ---------------------------------------------------------------- peta slug + navigasi beranda
def slug_map_js(slugs):
    """slug-map.js dimuat toko (index.html) sebelum skrip utama: uuid -> slug halaman statis.
    Toko memakainya untuk canonical dan link kartu. Hanya produk yang halaman statisnya benar-benar dibuat."""
    body = json.dumps({k: slugs[k] for k in sorted(slugs)}, ensure_ascii=False, separators=(',', ':'), sort_keys=True)
    return '// Dibuat otomatis oleh .github/scripts/build-static.py, jangan diedit manual.\nwindow.ZSLUG=%s;\n' % body


NAV_RE = re.compile(r'<!--ZSEO-NAV-->.*?<!--/ZSEO-NAV-->', re.S)


def home_nav_html(nodes):
    items = sorted((n for n in nodes.values() if len(n['path']) >= 2), key=lambda n: (n['path'][0], n['path'][1:]))
    items = items or sorted((n for n in nodes.values() if len(n['path']) == 1), key=lambda n: n['path'])
    links = ''.join('<a href="/kategori/%s/">%s</a>' % (esc(n['slug']), esc(node_h1(n))) for n in items[:12])
    return '<!--ZSEO-NAV--><nav class="footer-seo" aria-label="Koleksi">%s</nav><!--/ZSEO-NAV-->' % links


def update_home_nav(nodes):
    """Isi blok penanda di index.html dengan link ke halaman kategori (HTML awal, bisa dibaca crawler tanpa JavaScript)."""
    cur = read('index.html')
    if cur is None or len(NAV_RE.findall(cur)) != 1:
        print('Penanda ZSEO-NAV tidak ditemukan tepat satu kali di index.html, navigasi beranda dilewati.')
        return False
    new = NAV_RE.sub(lambda m: home_nav_html(nodes), cur)
    return write_if_changed('index.html', new)



def main():
    products = load_json('products.json', None)
    if not isinstance(products, list):
        sys.exit('products.json bukan daftar, halaman statis dan sitemap TIDAK diubah.')
    products = [p for p in products if isinstance(p, dict) and re.fullmatch(r'[0-9a-fA-F-]{8,64}', str(p.get('id', '')))
                and p.get('is_active') is not False and text_of(p.get('name')) and active_variants(p)]
    if not products:
        sys.exit('Tidak ada produk aktif yang valid, halaman statis dan sitemap TIDAK diubah (pengaman).')
    products.sort(key=lambda p: str(p.get('created_at') or ''), reverse=True)

    categories = load_json('categories.json', [])
    categories = categories if isinstance(categories, list) else []
    bio = load_json('bio.json', {})
    bio = bio[0] if isinstance(bio, list) and bio else (bio if isinstance(bio, dict) else {})
    acc = {}
    for r in load_json('reviews.json', []) if isinstance(load_json('reviews.json', []), list) else []:
        try:
            rt = float(r.get('rating'))
        except (TypeError, ValueError):
            continue
        if 1 <= rt <= 5:
            a = acc.setdefault(r.get('product_id'), [0.0, 0])
            a[0] += rt
            a[1] += 1
    ratings = {k: (round(v[0] / v[1], 1), v[1]) for k, v in acc.items() if v[1]}

    slugs = assign_slugs(products)
    nodes, prod_path = build_nodes(products, categories)
    imgs = {p['id']: image_list(p, active_variants(p)) for p in products}
    top = sorted((n for n in nodes.values() if len(n['path']) == 1), key=lambda n: n['path'])
    foot = sorted((n for n in nodes.values() if len(n['path']) >= 2), key=lambda n: (n['path'][0], n['path'][1:]))
    ctx = dict(products=products, slugs=slugs, nodes=nodes, prod_path=prod_path, imgs=imgs, ratings=ratings, bio=bio,
               nav_nodes=top, foot_nodes=foot or top)

    old = old_lastmods()
    rows = []  # (loc, lastmod, changefreq, priority, [gambar])
    changed_pages = 0

    def lastmod_for(loc, path, html_):
        nonlocal changed_pages
        if write_if_changed(path, html_):
            changed_pages += 1
            return TODAY
        return old.get(loc) or TODAY

    for n in sorted(nodes.values(), key=lambda n: (len(n['path']), n['path'])):
        loc, page = category_page(n, ctx)
        rows.append((loc, lastmod_for(loc, 'kategori/%s/index.html' % n['slug'], page), 'weekly', '0.7', []))
    for p in products:
        loc, page, im = product_page(p, ctx)
        rows.append((loc, lastmod_for(loc, 'produk/%s/index.html' % slugs[p['id']], page), 'weekly', '0.8', im))

    pruned = prune('produk', set(slugs.values())) + prune('kategori', {n['slug'] for n in nodes.values()})

    old_prod = {u for u in old if '/produk/' in u}
    new_prod = {r[0] for r in rows if '/produk/' in r[0]}
    home_lm = TODAY if old_prod != new_prod else (old.get(SITE + '/') or TODAY)
    static_end = [('tentang-kami.html', '0.6', 'monthly'), ('kontak.html', '0.5', 'monthly'),
                  ('syarat-ketentuan.html', '0.4', 'monthly'), ('kebijakan-pengiriman.html', '0.4', 'monthly'),
                  ('kebijakan-pengembalian.html', '0.4', 'monthly'), ('privacy.html', '0.4', 'monthly')]
    all_rows = [(SITE + '/', home_lm, 'daily', '1.0', []),
                (SITE + '/bio/', old.get(SITE + '/bio/') or TODAY, 'weekly', '0.9', [])]
    cats = [r for r in rows if '/kategori/' in r[0]]
    prods_rows = [r for r in rows if '/produk/' in r[0]]
    all_rows += cats + prods_rows
    all_rows += [('%s/%s' % (SITE, f), old.get('%s/%s' % (SITE, f)) or TODAY, cf, pr, []) for f, pr, cf in static_end]

    out = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">']
    for loc, lm, cf, pr, ims in all_rows:
        img_xml = ''.join('\n    <image:image>\n      <image:loc>%s</image:loc>\n    </image:image>' % html.escape(u) for u in ims)
        out.append('  <url>\n    <loc>%s</loc>\n    <lastmod>%s</lastmod>\n    <changefreq>%s</changefreq>\n    <priority>%s</priority>%s\n  </url>'
                   % (html.escape(loc), lm, cf, pr, img_xml))
    out.append('</urlset>')
    write_if_changed('sitemap.xml', '\n'.join(out) + '\n')
    map_changed = write_if_changed('slug-map.js', slug_map_js(slugs))
    nav_changed = update_home_nav(nodes)
    print('Produk: %d | kategori: %d | halaman dibuat/diubah: %d | dihapus: %d | slug-map: %s | navigasi beranda: %s'
          % (len(products), len(nodes), changed_pages, pruned, 'diubah' if map_changed else 'tetap', 'diubah' if nav_changed else 'tetap'))


if __name__ == '__main__':
    main()
