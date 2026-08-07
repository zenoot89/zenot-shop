// ===================== VARIANT TAG SYSTEM =====================
let colorTags = []; // [{name, hex}]
let sizeTags = [];  // [string]

function renderColorTags() {
  const el = document.getElementById('v1-tags');
  if (!el) return;
  el.innerHTML = colorTags.map((c,i) => `
    <div class="var-tag">
      <span class="var-tag-dot" style="background:${c.hex}"></span>
      ${c.name}
      <button class="var-tag-remove" onclick="removeColorTag(${i})">✕</button>
    </div>`).join('');
  rebuildVariantTable();
}

function renderSizeTags() {
  const el = document.getElementById('v2-tags');
  if (!el) return;
  el.innerHTML = sizeTags.map((s,i) => `
    <div class="var-tag">${s}<button class="var-tag-remove" onclick="removeSizeTag(${i})">✕</button></div>`).join('');
  rebuildVariantTable();
}

function addColorTag(e) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const input = document.getElementById('v1-input');
  const picker = document.getElementById('v1-color-picker');
  const name = input.value.trim();
  if (!name) return;
  if (colorTags.find(c => c.name.toLowerCase() === name.toLowerCase())) { input.value=''; return; }
  colorTags.push({name, hex: picker.value});
  input.value = '';
  renderColorTags();
}

function removeColorTag(i) { colorTags.splice(i,1); renderColorTags(); }

function addSizePreset(s) {
  if (sizeTags.includes(s)) return;
  sizeTags.push(s);
  renderSizeTags();
}

function addSizeTag(e) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const input = document.getElementById('v2-input');
  const s = input.value.trim();
  if (!s || sizeTags.includes(s)) { input.value=''; return; }
  sizeTags.push(s);
  input.value='';
  renderSizeTags();
}

function removeSizeTag(i) { sizeTags.splice(i,1); renderSizeTags(); }

function variantKey(colorName, size) { return `${colorName}__${size}`; }

let variantData = {}; // key -> {price, orig, stock, image_url}
let variantPhotoFiles = {}; // key -> File

function rebuildVariantTable() {
  const wrap = document.getElementById('variant-table-wrap');
  const tbody = document.getElementById('variant-tbody');
  if (!wrap || !tbody) return;
  if (!colorTags.length || !sizeTags.length) { wrap.style.display='none'; return; }
  wrap.style.display='block';

  const rows = [];
  colorTags.forEach(c => {
    sizeTags.forEach((s, si) => {
      const key = variantKey(c.name, s);
      const d = variantData[key] || {};
      const existingImg = d.image_url || '';
      const showPhoto = si === 0; // hanya 1 foto per warna (baris pertama ukuran)
      rows.push(`
        <tr style="border-bottom:1px solid var(--border)" data-key="${key}">
          <td style="padding:10px 6px;white-space:nowrap">
            ${showPhoto ? `<div style="display:flex;align-items:center;gap:8px">
              <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${c.hex};flex-shrink:0"></span>
              <span>${c.name}</span>
            </div>
            <div style="margin-top:6px;display:flex;align-items:center;gap:6px">
              <div id="vph-${key}" style="width:36px;height:36px;border-radius:6px;background:#f0ede8;background-size:cover;background-position:center;flex-shrink:0;${existingImg?`background-image:url('${existingImg}')`:''}" data-existing="${existingImg}"></div>
              <input type="file" id="vf-${key}" accept="image/*" style="display:none" onchange="previewVariantPhotoNew(this,'${key}')"/>
              <button type="button" class="variant-photo-btn" onclick="document.getElementById('vf-${key}').click()">📷</button>
            </div>` : `<span style="margin-left:18px;color:var(--muted);font-size:12px">↳</span>`}
          </td>
          <td style="padding:10px 6px">${s}</td>
          <td style="padding:10px 6px"></td>
          <td style="padding:10px 6px"><input class="form-input vt-price" style="padding:7px 10px;font-size:12px" type="number" placeholder="Harga" value="${d.price||''}" oninput="updateVariantData('${key}','price',this.value)"/></td>
          <td style="padding:10px 6px"><input class="form-input vt-stock" style="padding:7px 10px;font-size:12px" type="number" placeholder="Stok" value="${d.stock||''}" oninput="updateVariantData('${key}','stock',this.value)"/></td>
        </tr>`);
    });
  });
  tbody.innerHTML = rows.join('');
}

function updateVariantData(key, field, val) {
  if (!variantData[key]) variantData[key] = {};
  variantData[key][field] = val;
}

function previewVariantPhotoNew(input, key) {
  if (!input.files || !input.files[0]) return;
  variantPhotoFiles[key] = input.files[0];
  const preview = document.getElementById(`vph-${key}`);
  if (preview) preview.style.backgroundImage = `url(${URL.createObjectURL(input.files[0])})`;
}

function applyToAll() {
  const price = document.getElementById('bulk-price').value;
  const stock = document.getElementById('bulk-stock').value;
  colorTags.forEach(c => sizeTags.forEach(s => {
    const key = variantKey(c.name, s);
    if (!variantData[key]) variantData[key] = {};
    if (price) variantData[key].price = price;
    if (stock) variantData[key].stock = stock;
  }));
  rebuildVariantTable();
}

function resetVariantSystem() {
  colorTags = []; sizeTags = []; variantData = {}; variantPhotoFiles = {};
  ['v1-tags','v2-tags'].forEach(id => { const el = document.getElementById(id); if(el) el.innerHTML=''; });
  const wrap = document.getElementById('variant-table-wrap');
  if (wrap) wrap.style.display='none';
}

function compressImage(file, maxDim = 1200, quality = 0.82) {
  return new Promise((resolve) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => { img.src = e.target.result; };
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width > height) { height = Math.round(height * maxDim / width); width = maxDim; }
        else { width = Math.round(width * maxDim / height); height = maxDim; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => resolve(blob || file), 'image/jpeg', quality);
    };
    reader.readAsDataURL(file);
  });
}

let uploadedFiles = [];
let existingPhotoUrls = [];

function renderUploadPreview() {
  const prev = document.getElementById('upload-preview');
  let html = '';
  existingPhotoUrls.forEach((url, i) => {
    html += `<div class="upload-thumb">${i===0?'<span class="upload-thumb-cover">Cover</span>':''}<img src="${url}"/><button type="button" class="upload-thumb-remove" onclick="removeExistingPhoto(${i})">✕</button></div>`;
  });
  uploadedFiles.forEach((f, i) => {
    const idx = existingPhotoUrls.length + i;
    html += `<div class="upload-thumb">${idx===0?'<span class="upload-thumb-cover">Cover</span>':''}<img src="${URL.createObjectURL(f)}"/><button type="button" class="upload-thumb-remove" onclick="removeNewPhoto(${i})">✕</button></div>`;
  });
  prev.innerHTML = html;
}

function removeExistingPhoto(i) { existingPhotoUrls.splice(i,1); renderUploadPreview(); }
function removeNewPhoto(i) { uploadedFiles.splice(i,1); renderUploadPreview(); }

function previewPhotos(input) {
  const remaining = 9 - existingPhotoUrls.length - uploadedFiles.length;
  if (remaining <= 0) { showToast('Maksimal 9 foto per produk'); input.value=''; return; }
  const newFiles = Array.from(input.files).slice(0, remaining);
  uploadedFiles = uploadedFiles.concat(newFiles);
  input.value = '';
  renderUploadPreview();
}

let editingProductId = null;
let adminProductsData = [];

async function saveProduct() {
  const name = document.getElementById('p-name').value.trim();
  const category = document.getElementById('p-cat').value;
  const gender = document.getElementById('p-gender').value;
  const description = document.getElementById('p-desc').value.trim();
  if (!name) { showToast('Nama produk wajib diisi'); return; }

  // Upload foto produk (dikompres dulu, gabung sama foto lama yang dipertahankan)
  let newUrls = [];
  for (const file of uploadedFiles) {
    const compressed = await compressImage(file);
    const path = `${Date.now()}-${Math.random().toString(36).slice(2,7)}.jpg`;
    const { error: upErr } = await sb.storage.from('product-photos').upload(path, compressed, { contentType: 'image/jpeg' });
    if (!upErr) {
      const { data: urlData } = sb.storage.from('product-photos').getPublicUrl(path);
      newUrls.push(urlData.publicUrl);
    }
  }
  const finalUrls = existingPhotoUrls.concat(newUrls);
  const image_urls = finalUrls.length ? finalUrls : null;
  const image_url = finalUrls.length ? finalUrls[0] : null;

  let prod;
  if (editingProductId) {
    const payload = {name,category,gender,description,image_url,image_urls};
    const { data, error } = await sb.from('products').update(payload).eq('id',editingProductId).select().single();
    if (error) { showToast('Gagal update produk'); return; }
    prod = data;
    await sb.from('variants').delete().eq('product_id', prod.id);
  } else {
    const { data, error } = await sb.from('products').insert({name,category,gender,description,image_url,image_urls}).select().single();
    if (error) { showToast('Gagal simpan produk'); return; }
    prod = data;
  }

  // Variants dari tag system
  const variants = [];
  for (const c of colorTags) {
    // ambil foto per warna (dari file baru atau existing)
    const firstKey = variantKey(c.name, sizeTags[0]);
    let variantImageUrl = null;
    const existingPreview = document.getElementById(`vph-${firstKey}`);
    if (existingPreview && existingPreview.dataset.existing) variantImageUrl = existingPreview.dataset.existing;
    if (variantPhotoFiles[firstKey]) {
      const compressed = await compressImage(variantPhotoFiles[firstKey]);
      const path = `variant-${Date.now()}-${Math.random().toString(36).slice(2,7)}.jpg`;
      const { error: upErr } = await sb.storage.from('product-photos').upload(path, compressed, { contentType: 'image/jpeg' });
      if (!upErr) {
        const { data: urlData } = sb.storage.from('product-photos').getPublicUrl(path);
        variantImageUrl = urlData.publicUrl;
      }
    }
    for (const s of sizeTags) {
      const key = variantKey(c.name, s);
      const d = variantData[key] || {};
      const price = parseInt(d.price)||0;
      if (!price) continue;
      variants.push({
        product_id: prod.id,
        color_name: c.name,
        color_hex: c.hex,
        size: s,
        price,
        original_price: null,
        stock: parseInt(d.stock)||0,
        image_url: variantImageUrl
      });
    }
  }
  if (variants.length) await sb.from('variants').insert(variants);

  showToast(editingProductId ? 'Produk berhasil diupdate ✓' : 'Produk berhasil disimpan ✓');
  closeProductForm();
  loadAdminProducts();
}

function resetProductForm() {
  document.getElementById('p-name').value='';
  document.getElementById('p-desc').value='';
  document.getElementById('p-cat').value='Cardigan';
  document.getElementById('p-gender').value='pria';
  uploadedFiles=[];
  existingPhotoUrls=[];
  document.getElementById('upload-preview').innerHTML='';
  resetVariantSystem();
}

function cancelEdit() {
  editingProductId = null;
  resetProductForm();
  document.getElementById('form-mode-title').textContent = 'Tambah Produk';
  document.getElementById('save-product-btn').textContent = 'Simpan Produk';
  document.getElementById('cancel-product-btn').textContent = 'Batal';
}

function openProductForm() {
  cancelEdit();
  document.getElementById('product-form-card').classList.remove('hidden');
  document.getElementById('product-form-card').scrollIntoView({behavior:'smooth', block:'start'});
}

function closeProductForm() {
  cancelEdit();
  document.getElementById('product-form-card').classList.add('hidden');
}

function editProduct(id) {
  const p = adminProductsData.find(x=>x.id===id);
  if (!p) return;
  editingProductId = id;
  document.getElementById('p-name').value = p.name;
  document.getElementById('p-cat').value = p.category;
  document.getElementById('p-gender').value = p.gender || 'pria';
  document.getElementById('p-desc').value = p.description || '';
  uploadedFiles = [];
  existingPhotoUrls = (p.image_urls && p.image_urls.length) ? [...p.image_urls] : (p.image_url ? [p.image_url] : []);
  renderUploadPreview();
  // Prefill variant tag system dari data lama
  resetVariantSystem();
  const vars = p.variants || [];
  // Build unique colors dan sizes
  const seenColors = new Map();
  const seenSizes = new Set();
  vars.forEach(v => {
    if (!seenColors.has(v.color_name)) seenColors.set(v.color_name, v.color_hex || '#1a1a1a');
    seenSizes.add(v.size);
  });
  colorTags = Array.from(seenColors.entries()).map(([name,hex]) => ({name,hex}));
  sizeTags = Array.from(seenSizes);
  // Prefill variantData
  vars.forEach(v => {
    const key = variantKey(v.color_name, v.size);
    variantData[key] = {price: v.price, orig: v.original_price, stock: v.stock, image_url: v.image_url};
  });
  renderColorTags();
  renderSizeTags();
  document.getElementById('form-mode-title').textContent = `Edit Produk: ${p.name}`;
  document.getElementById('save-product-btn').textContent = 'Update Produk';
  document.getElementById('cancel-product-btn').textContent = 'Batal Perubahan';
  document.getElementById('product-form-card').classList.remove('hidden');
  document.getElementById('product-form-card').scrollIntoView({behavior:'smooth', block:'start'});
}

async function loadAdminProducts() {
  const { data } = await sb.from('products').select('*,variants(*)');
  adminProductsData = data || [];
  const el = document.getElementById('admin-products-render');
  if (!data||!data.length) { el.innerHTML='<p style="color:var(--muted);font-size:13px">Belum ada produk.</p>'; return; }
  el.innerHTML = data.map(p=>`
    <div class="admin-product-item">
      <div class="admin-product-img">${p.image_url?`<img src="${p.image_url}"/>`:`<div style="width:100%;height:100%;background:#f0ede8"></div>`}</div>
      <div class="admin-product-info">
        <p class="admin-product-name">${p.name}</p>
        <p class="admin-product-meta">${p.gender==='wanita'?'Wanita':'Pria'} · ${p.category} · ${(p.variants||[]).length} varian · ${p.is_active?'Aktif':'Nonaktif'}</p>
      </div>
      <div class="admin-product-actions">
        <button class="btn-edit" onclick="editProduct('${p.id}')">Edit</button>
        <button class="btn-danger" onclick="deleteProduct('${p.id}')">Hapus</button>
      </div>
    </div>`).join('');
}

async function deleteProduct(id) {
  if (!confirm('Hapus produk ini?')) return;
  await sb.from('products').delete().eq('id',id);
  showToast('Produk dihapus');
  loadAdminProducts();
}
