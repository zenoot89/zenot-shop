// ===================== TABEL UKURAN OTOMATIS DARI SPESIFIKASI =====================
function pfInsertSizeTable() {
  const ta = document.getElementById('p-desc');
  if (!ta) return;
  if (/^[ \t]*\|.*\|[ \t]*$/m.test(ta.value)) { 
    showToast('Tabel ukuran sudah ada di deskripsi, edit angkanya langsung'); 
    return; 
  }
  const val = id => { const el = document.getElementById(id); return el && String(el.value).trim() ? String(el.value).trim() : '-'; };
  const panjang = val('p-panjang');
  const dada = val('p-lingkar-dada');
  
  // Format tabel ukuran ala Shopee yang disisipkan ke deskripsi
  const block = 'Panduan Ukuran:\n' +
    '| Ukuran | Panjang Atasan (cm) | Lingkar Dada (cm) | Panjang Lengan (cm) |\n' +
    '| All Size | ' + panjang + ' | ' + dada + ' | - |';
    
  const pos = ta.selectionEnd != null && ta.value.length ? ta.selectionEnd : ta.value.length;
  const before = ta.value.slice(0, pos), after = ta.value.slice(pos);
  const pre = before && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : '';
  const post = after && !after.startsWith('\n') ? '\n\n' : (after ? '\n' : '');
  
  ta.value = before + pre + block + post + after;
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.focus();
  showToast('Tabel ukuran berhasil disisipkan dari data spesifikasi ✓');
}
```[cite: 17]

---

#### 2. Untuk Repositori `zenoot-shop` (`build-static.py`)
Perbarui skrip generator statis di repositori `zenoot-shop` agar tabel spesifikasi produk di halaman pembeli merapikan posisi "Panduan Ukuran" tepat setelah baris **Motif**[cite: 9, 18].

Perbarui fungsi penyusunan spesifikasi di dalam file **`.github/scripts/build-static.py`**:

```python
def product_page(p, ctx):
    # ... (kode lainnya tetap)
    c = product_context(p)
    
    # Menyusun spesifikasi dengan menyisipkan Panduan Ukuran setelah Motif
    specs = [
        ('Bahan', c['bahan']), 
        ('Gramasi', ('%d gr/m²' % c['gramasi']) if c['gramasi'] else ''),
        ('Ketebalan', c['ketebalan']), 
        ('Lengan', c['lengan']), 
        ('Tipe cutting', text_of(p.get('tipe_cutting'))),
        ('Motif', text_of(p.get('motif')))
    ]
    
    # Tabel ukuran jika data Lingkar Dada atau Panjang tersedia
    lingkar_dada = num_text(p.get('lingkar_dada_cm')) if num(p.get('lingkar_dada_cm')) else '-'
    panjang_baju = num_text(p.get('panjang_cm')) if num(p.get('panjang_cm')) else '-'
    
    size_table_html = (
        '<tr><td colspan="2" style="padding:12px 0">'
        '<div style="font-weight:600;margin-bottom:6px">Panduan Ukuran</div>'
        '<div class="sg"><table><thead><tr><th>Ukuran</th><th>Panjang Atasan (cm)</th><th>Lingkar Dada (cm)</th><th>Panjang Lengan (cm)</th></tr></thead>'
        '<tbody><tr><td>All Size</td><td>%s</td><td>%s</td><td>-</td></tr></tbody></table></div>'
        '</td></tr>'
    ) % (panjang_baju, lingkar_dada)
    
    specs_after = [
        ('Dipakai model', text_of(p.get('dipakai_model'))), 
        ('Perawatan', text_of(p.get('perawatan'))),
        ('Untuk', c['gender']), 
        ('Kategori', c['cat'])
    ]
    
    valid_specs = [(k, v) for k, v in specs if v]
    valid_specs_after = [(k, v) for k, v in specs_after if v]
    
    spec_rows_html = ''.join('<tr><th>%s</th><td>%s</td></tr>' % (esc(k), esc(v)) for k, v in valid_specs)
    spec_rows_html += size_table_html
    spec_rows_html += ''.join('<tr><th>%s</th><td>%s</td></tr>' % (esc(k), esc(v)) for k, v in valid_specs_after)
    
    spec_html = ('<section class="box"><h2>Spesifikasi %s</h2><table>%s</table></section>' % (
        esc(name), spec_rows_html)) if (valid_specs or valid_specs_after) else ''
    # ... (lanjutan fungsi)
```[cite: 18]

---

### Tes Sesudah Pasang
1. **Di `zenoot-seller`:** Buka menu Edit Produk, isi spesifikasi *Lingkar Dada* dan *Panjang Baju*, lalu ke Tab Deskripsi dan klik **"Sisipkan tabel ukuran"**. Angka dari spesifikasi akan otomatis masuk ke dalam tabel[cite: 17].
2. **Di `zenoot-shop`:** Lakukan *push* atau *workflow run* di GitHub Actions untuk `build-static.py`. Cek halaman produk di `zenoot.web.id`, tabel **Panduan Ukuran** kini sudah berpindah posisi ke atas (tepat setelah baris *Motif* di dalam tabel spesifikasi)[cite: 9, 18].