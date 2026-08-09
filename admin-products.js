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

// Sinkron manual: ketik/paste hex di kotak teks -> update swatch color picker
function syncHexToPicker() {
  const hexInput = document.getElementById('v1-color-hex');
  const picker = document.getElementById('v1-color-picker');
  let v = hexInput.value.trim();
  if (v && !v.startsWith('#')) v = '#' + v;
  if (/^#[0-9A-Fa-f]{6}$/.test(v)) picker.value = v;
}
// Sinkron balik: pilih warna lewat swatch -> update kotak teks hex
function syncPickerToHex() {
  const hexInput = document.getElementById('v1-color-hex');
  const picker = document.getElementById('v1-color-picker');
  if (hexInput) hexInput.value = picker.value.toUpperCase();
}

function removeColorTag(i) { colorTags.splice(i,1); renderColorTags(); }

// ===================== SIZE DROPDOWN (Shopee-style) =====================
const SIZE_OPTIONS = {
  'Standar': ['XS','S','M','L','XL','XXL','XXXL','XXXXL','XXS'],
  'Anak': ['Anak 0-6 bln','Anak 6-12 bln','Anak 1-2 thn','Anak 2-3 thn','Anak 3-4 thn','Anak 4-5 thn','Anak 5-6 thn','Anak 6-7 thn','Anak 7-8 thn','Anak 8-9 thn','Anak 9-10 thn','Anak 10-11 thn','Anak 11-12 thn'],
  'Celana (inch)': ['27','28','29','30','31','32','33','34','36','38','40'],
  'Lainnya': ['All Size','Free Size','Oversize','Jumbo']
};
// flatten for search
const SIZE_FLAT = Object.entries(SIZE_OPTIONS).flatMap(([cat, items]) => items.map(v => ({cat, v})));

let _sizeDropFocusIdx = -1;

function sizeDropdownShow() {
  sizeDropdownFilter(document.getElementById('v2-input')?.value || '');
}

function sizeDropdownFilter(query) {
  const dd = document.getElementById('size-dropdown');
  if (!dd) return;
  const q = query.trim().toLowerCase();
  // filter
  const filtered = q
    ? SIZE_FLAT.filter(s => s.v.toLowerCase().includes(q))
    : SIZE_FLAT;

  if (filtered.length === 0 && !q) { dd.style.display='none'; return; }

  let html = '';
  if (!q) {
    // grouped by category
    let lastCat = null;
    SIZE_FLAT.forEach(({cat, v}) => {
      if (cat !== lastCat) {
        html += `<div class="size-drop-divider">${cat}</div>`;
        lastCat = cat;
      }
      const sel = sizeTags.includes(v);
      html += `<div class="size-drop-item${sel?' selected':''}" onmousedown="sizeDropSelect('${v}')">${v}${sel?'<span class="size-check">✓</span>':''}</div>`;
    });
  } else {
    filtered.forEach(({v}) => {
      const sel = sizeTags.includes(v);
      html += `<div class="size-drop-item${sel?' selected':''}" onmousedown="sizeDropSelect('${v}')">${v}${sel?'<span class="size-check">✓</span>':''}</div>`;
    });
    // jika tidak ada di list, tawarkan "Tambah custom"
    const exactMatch = SIZE_FLAT.some(s => s.v.toLowerCase() === q);
    if (!exactMatch) {
      html += `<div class="size-drop-item" style="color:var(--accent);font-style:italic" onmousedown="sizeDropSelect('${query.trim()}')">+ Tambah "${query.trim()}"</div>`;
    }
  }

  dd.innerHTML = html;
  dd.style.display = 'block';
  _sizeDropFocusIdx = -1;
}

function sizeDropSelect(val) {
  if (!val) return;
  if (sizeTags.includes(val)) {
    // toggle off
    sizeTags.splice(sizeTags.indexOf(val), 1);
  } else {
    sizeTags.push(val);
  }
  const input = document.getElementById('v2-input');
  if (input) { input.value = ''; input.focus(); }
  renderSizeTags();
  sizeDropdownFilter('');
}

function sizeInputKeydown(e) {
  const dd = document.getElementById('size-dropdown');
  const items = dd ? [...dd.querySelectorAll('.size-drop-item')] : [];
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    _sizeDropFocusIdx = Math.min(_sizeDropFocusIdx + 1, items.length - 1);
    items.forEach((el,i) => el.classList.toggle('focused', i === _sizeDropFocusIdx));
    items[_sizeDropFocusIdx]?.scrollIntoView({block:'nearest'});
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    _sizeDropFocusIdx = Math.max(_sizeDropFocusIdx - 1, 0);
    items.forEach((el,i) => el.classList.toggle('focused', i === _sizeDropFocusIdx));
    items[_sizeDropFocusIdx]?.scrollIntoView({block:'nearest'});
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (_sizeDropFocusIdx >= 0 && items[_sizeDropFocusIdx]) {
      items[_sizeDropFocusIdx].dispatchEvent(new MouseEvent('mousedown'));
    } else {
      const val = document.getElementById('v2-input')?.value.trim();
      if (val) sizeDropSelect(val);
    }
  } else if (e.key === 'Escape') {
    if (dd) dd.style.display = 'none';
  }
}

// tutup dropdown saat klik di luar
document.addEventListener('click', (e) => {
  if (!e.target.closest('#v2-input') && !e.target.closest('#size-dropdown')) {
    const dd = document.getElementById('size-dropdown');
    if (dd) dd.style.display = 'none';
  }
});

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
  const picker = document.getElementById('v1-color-picker');
  const hexInput = document.getElementById('v1-color-hex');
  if (picker) picker.value = '#1a1a1a';
  if (hexInput) hexInput.value = '#1A1A1A';
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

// ===================== PHOTO STRIP SYSTEM =====================
// photoSlots: array of {type:'url'|'file'|'cropped', url:string, file:File|null, blob:Blob|null}
let photoSlots = [];
let cropTargetIdx = null; // index in photoSlots being cropped

// ---- Drag state ----
let dragSrcIdx = null;

function photoStripRender() {
  const strip = document.getElementById('photo-strip');
  if (!strip) return;
  const total = photoSlots.length;
  let html = '';
  photoSlots.forEach((slot, i) => {
    const src = slot.type === 'url' ? slot.url : URL.createObjectURL(slot.blob || slot.file);
    html += `
      <div class="photo-item" id="pslot-${i}" draggable="true"
           ondragstart="photoDragStart(event,${i})" ondragover="photoDragOver(event,${i})"
           ondrop="photoDrop(event,${i})" ondragleave="photoDragLeave(event,${i})" ondragend="photoDragEnd()">
        <div class="photo-item-inner">
          <img src="${src}" alt="foto ${i+1}"/>
        </div>
        ${i===0 ? '<div class="photo-item-cover">Cover</div>' : ''}
        <div class="photo-item-actions">
          <button class="photo-action-btn" onclick="photoOpenCrop(${i})" title="Crop">✂</button>
          <button class="photo-action-btn" onclick="photoRemove(${i})" title="Hapus">🗑</button>
        </div>
      </div>`;
  });
  if (total < 9) {
    html += `
      <button class="photo-add-btn" onclick="document.getElementById('p-photos').click()" type="button">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M12 8v8M8 12h8"/></svg>
        <span>Tambahkan<br>Foto (${total}/9)</span>
      </button>`;
  }
  strip.innerHTML = html;
}

function photoStripHandleFiles(input) {
  const remaining = 9 - photoSlots.length;
  if (remaining <= 0) { showToast('Maksimal 9 foto per produk'); input.value=''; return; }
  const files = Array.from(input.files).slice(0, remaining);
  files.forEach(f => photoSlots.push({type:'file', file:f, blob:null, url:null}));
  input.value = '';
  photoStripRender();
}

function photoRemove(i) {
  photoSlots.splice(i, 1);
  photoStripRender();
}

// ---- Drag reorder ----
function photoDragStart(e, i) {
  dragSrcIdx = i;
  e.dataTransfer.effectAllowed = 'move';
  document.getElementById(`pslot-${i}`)?.classList.add('dragging');
}
function photoDragOver(e, i) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  if (i !== dragSrcIdx) document.getElementById(`pslot-${i}`)?.classList.add('drag-over');
}
function photoDragLeave(e, i) {
  document.getElementById(`pslot-${i}`)?.classList.remove('drag-over');
}
function photoDrop(e, i) {
  e.preventDefault();
  document.getElementById(`pslot-${i}`)?.classList.remove('drag-over');
  if (dragSrcIdx === null || dragSrcIdx === i) return;
  const moved = photoSlots.splice(dragSrcIdx, 1)[0];
  photoSlots.splice(i, 0, moved);
  photoStripRender();
}
function photoDragEnd() {
  dragSrcIdx = null;
  document.querySelectorAll('.photo-item').forEach(el => { el.classList.remove('dragging','drag-over'); });
}

// ---- Legacy compat wrappers (dipakai saveProduct & resetProductForm) ----
function _photoGetExistingUrls() { return photoSlots.filter(s=>s.type==='url').map(s=>s.url); }

// ===================== CROP ENGINE =====================
let _cropImg = null;         // HTMLImageElement (source gambar asli)
let _cropState = {};         // {scale, angle, flipH, flipV, offsetX, offsetY}
let _cropInitState = {};     // untuk reset
let _cropCanvas = null;
let _cropCtx = null;
let _cropPreviewCanvas = null;
let _cropPreviewCtx = null;
let _cropWrapW = 0;
let _cropWrapH = 0;
let _cropDragging = false;
let _cropDragStart = {x:0, y:0};

function photoOpenCrop(idx) {
  cropTargetIdx = idx;
  const slot = photoSlots[idx];
  const overlay = document.getElementById('crop-overlay');
  overlay.classList.add('open');

  const img = new Image();
  img.onload = () => {
    _cropImg = img;
    _cropCanvas = document.getElementById('crop-canvas');
    _cropCtx = _cropCanvas.getContext('2d');
    _cropPreviewCanvas = document.getElementById('crop-preview-canvas');
    _cropPreviewCtx = _cropPreviewCanvas.getContext('2d');

    const wrap = document.getElementById('crop-canvas-wrap');
    _cropWrapW = wrap.clientWidth || 460;
    _cropWrapH = wrap.clientHeight || 380;
    _cropCanvas.width = _cropWrapW;
    _cropCanvas.height = _cropWrapH;
    _cropPreviewCanvas.width = 120;
    _cropPreviewCanvas.height = 120;

    // Init scale: fit image in canvas, then 1:1 crop box = min(W,H)*0.8
    const fitScale = Math.min(_cropWrapW / img.naturalWidth, _cropWrapH / img.naturalHeight) * 0.85;
    _cropState = {scale: fitScale, angle: 0, flipH: false, flipV: false, offsetX: 0, offsetY: 0};
    _cropInitState = {..._cropState};
    cropDraw();
    cropDrawPreview();
    _cropBindMouse();
  };
  const src = slot.type === 'url' ? slot.url : URL.createObjectURL(slot.blob || slot.file);
  img.crossOrigin = 'anonymous';
  img.src = src;
}

function cropDraw() {
  if (!_cropCtx || !_cropImg) return;
  const W = _cropWrapW, H = _cropWrapH;
  const boxSize = Math.min(W, H) * 0.78;
  const cx = W/2 + _cropState.offsetX;
  const cy = H/2 + _cropState.offsetY;

  _cropCtx.clearRect(0, 0, W, H);

  // Draw image
  _cropCtx.save();
  _cropCtx.translate(cx, cy);
  _cropCtx.rotate(_cropState.angle * Math.PI / 180);
  _cropCtx.scale(_cropState.flipH ? -1 : 1, _cropState.flipV ? -1 : 1);
  _cropCtx.scale(_cropState.scale, _cropState.scale);
  _cropCtx.drawImage(_cropImg, -_cropImg.naturalWidth/2, -_cropImg.naturalHeight/2);
  _cropCtx.restore();

  // Dim outside crop box
  _cropCtx.save();
  _cropCtx.fillStyle = 'rgba(0,0,0,0.5)';
  const bx = cx - boxSize/2, by = cy - boxSize/2;
  _cropCtx.fillRect(0, 0, W, by);
  _cropCtx.fillRect(0, by+boxSize, W, H - (by+boxSize));
  _cropCtx.fillRect(0, by, bx, boxSize);
  _cropCtx.fillRect(bx+boxSize, by, W-(bx+boxSize), boxSize);
  _cropCtx.restore();

  // Crop border
  _cropCtx.save();
  _cropCtx.strokeStyle = 'rgba(100,160,255,0.9)';
  _cropCtx.lineWidth = 1.5;
  _cropCtx.strokeRect(bx, by, boxSize, boxSize);
  // Grid lines (thirds)
  _cropCtx.strokeStyle = 'rgba(255,255,255,0.25)';
  _cropCtx.lineWidth = 1;
  for (let g=1; g<3; g++) {
    _cropCtx.beginPath();
    _cropCtx.moveTo(bx + boxSize*g/3, by);
    _cropCtx.lineTo(bx + boxSize*g/3, by+boxSize);
    _cropCtx.stroke();
    _cropCtx.beginPath();
    _cropCtx.moveTo(bx, by + boxSize*g/3);
    _cropCtx.lineTo(bx+boxSize, by + boxSize*g/3);
    _cropCtx.stroke();
  }
  _cropCtx.restore();

  cropDrawPreview();
}

function cropDrawPreview() {
  if (!_cropPreviewCtx || !_cropImg) return;
  const W = _cropWrapW, H = _cropWrapH;
  const boxSize = Math.min(W, H) * 0.78;
  const cx = W/2 + _cropState.offsetX;
  const cy = H/2 + _cropState.offsetY;
  const bx = cx - boxSize/2, by = cy - boxSize/2;

  // offscreen for crop area
  const off = document.createElement('canvas');
  off.width = boxSize; off.height = boxSize;
  const offCtx = off.getContext('2d');
  offCtx.drawImage(_cropCanvas, bx, by, boxSize, boxSize, 0, 0, boxSize, boxSize);

  _cropPreviewCtx.clearRect(0,0,120,120);
  _cropPreviewCtx.drawImage(off, 0, 0, boxSize, boxSize, 0, 0, 120, 120);
}

function _cropBindMouse() {
  const c = _cropCanvas;
  c.onmousedown = (e) => {
    _cropDragging = true;
    _cropDragStart = {x: e.clientX - _cropState.offsetX, y: e.clientY - _cropState.offsetY};
    c.style.cursor = 'grabbing';
  };
  c.onmousemove = (e) => {
    if (!_cropDragging) return;
    _cropState.offsetX = e.clientX - _cropDragStart.x;
    _cropState.offsetY = e.clientY - _cropDragStart.y;
    cropDraw();
  };
  c.onmouseup = () => { _cropDragging = false; c.style.cursor = 'move'; };
  c.onmouseleave = () => { _cropDragging = false; };
  // Touch support
  c.ontouchstart = (e) => {
    const t = e.touches[0];
    _cropDragging = true;
    _cropDragStart = {x: t.clientX - _cropState.offsetX, y: t.clientY - _cropState.offsetY};
  };
  c.ontouchmove = (e) => {
    e.preventDefault();
    if (!_cropDragging) return;
    const t = e.touches[0];
    _cropState.offsetX = t.clientX - _cropDragStart.x;
    _cropState.offsetY = t.clientY - _cropDragStart.y;
    cropDraw();
  };
  c.ontouchend = () => { _cropDragging = false; };
}

function cropZoom(delta) {
  _cropState.scale = Math.max(0.1, Math.min(8, _cropState.scale + delta * _cropState.scale));
  cropDraw();
}
function cropRotate(deg) { _cropState.angle = (_cropState.angle + deg + 360) % 360; cropDraw(); }
function cropFlipH() { _cropState.flipH = !_cropState.flipH; cropDraw(); }
function cropFlipV() { _cropState.flipV = !_cropState.flipV; cropDraw(); }
function cropReset() { _cropState = {..._cropInitState}; cropDraw(); }

function cropClose() {
  document.getElementById('crop-overlay').classList.remove('open');
  _cropImg = null;
  cropTargetIdx = null;
  if (_cropCanvas) { _cropCanvas.onmousedown = null; _cropCanvas.onmousemove = null; _cropCanvas.onmouseup = null; }
}

function cropSave() {
  if (cropTargetIdx === null || !_cropCanvas) return;
  const W = _cropWrapW, H = _cropWrapH;
  const boxSize = Math.min(W, H) * 0.78;
  const cx = W/2 + _cropState.offsetX;
  const cy = H/2 + _cropState.offsetY;
  const bx = cx - boxSize/2, by = cy - boxSize/2;

  // Extract crop area at native resolution
  const out = document.createElement('canvas');
  const outSize = 1200; // output square size
  out.width = outSize; out.height = outSize;
  const outCtx = out.getContext('2d');
  outCtx.drawImage(_cropCanvas, bx, by, boxSize, boxSize, 0, 0, outSize, outSize);

  out.toBlob((blob) => {
    if (!blob) return;
    photoSlots[cropTargetIdx] = {type:'cropped', blob, file:null, url:null};
    photoStripRender();
    cropClose();
  }, 'image/jpeg', 0.88);
}

// ===================== RESET / PREFILL HELPERS =====================
function resetUploadState() {
  photoSlots = [];
  photoStripRender();
}

function prefillPhotosFromProduct(p) {
  const urls = (p.image_urls && p.image_urls.length) ? p.image_urls : (p.image_url ? [p.image_url] : []);
  photoSlots = urls.map(url => ({type:'url', url, file:null, blob:null}));
  photoStripRender();
}

let editingProductId = null;
let adminProductsData = [];

async function saveProduct() {
  const name = document.getElementById('p-name').value.trim();
  const category_id = document.getElementById('p-cat-id').value || null;
  const category = category_id ? catName(category_id) : null; // nama leaf, buat kompatibilitas filter toko lama
  const gender = document.getElementById('p-gender').value;
  const supplier_id = document.getElementById('p-supplier').value || null;
  const supplier = supplier_id ? supplierName(supplier_id) : null; // nama supplier, buat kompatibilitas legacy
  const description = document.getElementById('p-desc').value.trim();
  const bahan = document.getElementById('p-bahan').value.trim() || null;
  const tipe_cutting = document.getElementById('p-tipe-cutting').value.trim() || null;
  const ketebalan = document.getElementById('p-ketebalan').value.trim() || null;
  const motif = document.getElementById('p-motif').value.trim() || null;
  const dipakai_model = document.getElementById('p-dipakai-model').value.trim() || null;
  if (!name) { showToast('Nama produk wajib diisi'); return; }
  if (!category_id) { showToast('Kategori wajib dipilih'); return; }

  // Upload foto produk dari photoSlots (url=langsung pakai, file/cropped=upload dulu)
  const finalUrls = [];
  for (const slot of photoSlots) {
    if (slot.type === 'url') {
      finalUrls.push(slot.url);
    } else {
      // file atau cropped blob
      const raw = slot.blob || slot.file;
      if (!raw) continue;
      const compressed = await compressImage(raw);
      const path = `${Date.now()}-${Math.random().toString(36).slice(2,7)}.jpg`;
      const { error: upErr } = await sb.storage.from('product-photos').upload(path, compressed, { contentType: 'image/jpeg' });
      if (!upErr) {
        const { data: urlData } = sb.storage.from('product-photos').getPublicUrl(path);
        finalUrls.push(urlData.publicUrl);
      }
    }
  }
  const image_urls = finalUrls.length ? finalUrls : null;
  const image_url = finalUrls.length ? finalUrls[0] : null;

  let prod;
  if (editingProductId) {
    const payload = {name,category,category_id,gender,supplier,supplier_id,description,bahan,tipe_cutting,ketebalan,motif,dipakai_model,image_url,image_urls};
    const { data, error } = await sb.from('products').update(payload).eq('id',editingProductId).select().single();
    if (error) { console.error('Update produk gagal:', error); showToast('Gagal update: ' + error.message); return; }
    prod = data;
    await sb.from('variants').delete().eq('product_id', prod.id);
  } else {
    const { data, error } = await sb.from('products').insert({name,category,category_id,gender,supplier,supplier_id,description,bahan,tipe_cutting,ketebalan,motif,dipakai_model,image_url,image_urls}).select().single();
    if (error) { console.error('Insert produk gagal:', error); showToast('Gagal simpan: ' + error.message); return; }
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
  document.getElementById('p-bahan').value='';
  document.getElementById('p-tipe-cutting').value='';
  document.getElementById('p-ketebalan').value='';
  document.getElementById('p-motif').value='';
  document.getElementById('p-dipakai-model').value='';
  document.getElementById('p-supplier').value='';
  document.getElementById('p-cat-id').value='';
  const catBtn = document.getElementById('p-cat-btn');
  catBtn.textContent = 'Pilih kategori';
  catBtn.classList.remove('filled');
  const genderSel = document.getElementById('p-gender');
  if (genderSel && genderSel.options.length) genderSel.selectedIndex = 0;
  resetUploadState();
  resetVariantSystem();
}

function cancelEdit() {
  editingProductId = null;
  resetProductForm();
  document.getElementById('form-mode-title').textContent = 'Tambah Produk';
  document.getElementById('edit-actions-extra')?.classList.add('hidden');
  if (typeof pfResetTabs === 'function') pfResetTabs();
}

function openProductForm() {
  cancelEdit();
  document.getElementById('product-list-view').classList.add('hidden');
  document.getElementById('product-form-card').classList.remove('hidden');
  window.scrollTo({top:0, behavior:'smooth'});
}

function closeProductForm() {
  cancelEdit();
  document.getElementById('product-form-card').classList.add('hidden');
  document.getElementById('product-list-view').classList.remove('hidden');
}

function editProduct(id) {
  const p = adminProductsData.find(x=>x.id===id);
  if (!p) return;
  editingProductId = id;
  document.getElementById('p-name').value = p.name;
  document.getElementById('p-supplier').value = p.supplier_id || '';
  document.getElementById('p-cat-id').value = p.category_id || '';
  const catBtn = document.getElementById('p-cat-btn');
  if (p.category_id) { catBtn.textContent = categoryBreadcrumb(p.category_id); catBtn.classList.add('filled'); }
  else { catBtn.textContent = p.category || 'Pilih kategori'; catBtn.classList.remove('filled'); }
  document.getElementById('p-gender').value = p.gender || 'pria';
  document.getElementById('p-desc').value = p.description || '';
  document.getElementById('p-bahan').value = p.bahan || '';
  document.getElementById('p-tipe-cutting').value = p.tipe_cutting || '';
  document.getElementById('p-ketebalan').value = p.ketebalan || '';
  document.getElementById('p-motif').value = p.motif || '';
  document.getElementById('p-dipakai-model').value = p.dipakai_model || '';
  prefillPhotosFromProduct(p);
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
  document.getElementById('product-list-view').classList.add('hidden');
  document.getElementById('product-form-card').classList.remove('hidden');
  document.getElementById('edit-actions-extra')?.classList.remove('hidden');
  document.getElementById('status-toggle-btn').textContent = productStatus(p) === 'nonaktif' ? 'Aktifkan' : 'Arsipkan';
  if (typeof pfResetTabs === 'function') pfResetTabs();
  window.scrollTo({top:0, behavior:'smooth'});
}

const LOW_STOCK_THRESHOLD = 5;
let bulkSelected = new Set();
let expandedProductId = null;
let productSalesMap = {};
let lastRenderedIds = [];
let productStatusTab = 'semua';
let lowStockOnly = false;
let noPromoOnly = false;
let selectModeOn = false;

function toggleSelectMode() {
  selectModeOn = !selectModeOn;
  bulkSelected.clear();
  document.getElementById('col-check-th')?.classList.toggle('hidden', !selectModeOn);
  const btn = document.getElementById('pf-selectmode-btn');
  if (btn) { btn.textContent = selectModeOn ? 'Batal Pilih' : 'Pilih Produk'; btn.classList.toggle('active', selectModeOn); }
  renderAdminProductList();
}

function productStatus(p) {
  return p.status || (p.is_active ? 'aktif' : 'nonaktif');
}
function productHasPromo(p) {
  return (p.variants || []).some(v => v.original_price != null);
}
function setProductStatusTab(tab) {
  productStatusTab = tab;
  renderAdminProductList();
}
function toggleLowStockFilter() {
  lowStockOnly = !lowStockOnly;
  document.getElementById('pf-lowstock-chip')?.classList.toggle('active', lowStockOnly);
  renderAdminProductList();
}
function toggleNoPromoFilter() {
  noPromoOnly = !noPromoOnly;
  document.getElementById('pf-nopromo-chip')?.classList.toggle('active', noPromoOnly);
  renderAdminProductList();
}
function renderStatusTabs() {
  const el = document.getElementById('prod-status-tabs');
  if (!el) return;
  const counts = { semua: adminProductsData.length, aktif: 0, nonaktif: 0 };
  adminProductsData.forEach(p => { const s = productStatus(p); if (counts[s] !== undefined) counts[s]++; });
  const tabs = [
    ['semua', 'Semua'],
    ['aktif', 'Aktif'],
    ['nonaktif', 'Di Arsipkan'],
  ];
  el.innerHTML = tabs.map(([key,label]) =>
    `<button class="pstab ${productStatusTab===key?'active':''}" onclick="setProductStatusTab('${key}')">${label} (${counts[key]})</button>`
  ).join('');
}

function fRp(n) { return 'Rp' + Math.round(n).toLocaleString('id-ID'); }
function priceRangeStr(vars, field) {
  const vals = vars.map(v => v[field]).filter(v => v !== null && v !== undefined);
  if (!vals.length) return null;
  const min = Math.min(...vals), max = Math.max(...vals);
  return min === max ? fRp(min) : `${fRp(min)}–${fRp(max)}`;
}

async function loadProductSales() {
  const { data } = await sb.from('orders').select('items');
  productSalesMap = {};
  (data || []).forEach(o => {
    (o.items || []).forEach(it => {
      if (!it.productId) return;
      productSalesMap[it.productId] = (productSalesMap[it.productId] || 0) + (it.qty || 0);
    });
  });
}

async function loadAdminProducts() {
  const [prodRes] = await Promise.all([
    sb.from('products').select('*,variants(*)').order('created_at', {ascending:false}),
    loadProductSales()
  ]);
  adminProductsData = prodRes.data || [];
  bulkSelected.clear();
  renderAdminProductList();
}

function productLowestStock(p) {
  const vars = p.variants || [];
  if (!vars.length) return 0;
  return Math.min(...vars.map(v => v.stock ?? 0));
}
function productTotalStock(p) {
  return (p.variants || []).reduce((sum,v) => sum + (v.stock ?? 0), 0);
}

function renderAdminProductList() {
  const el = document.getElementById('admin-products-render');
  if (!el) return;
  renderStatusTabs();
  if (!adminProductsData.length) { el.innerHTML=`<tr><td colspan="${selectModeOn?9:8}" style="color:var(--muted);font-size:13px;padding:20px">Belum ada produk.</td></tr>`; updateBulkBar(); return; }

  const q = (document.getElementById('pf-search')?.value || '').trim().toLowerCase();
  const genderF = document.getElementById('pf-gender')?.value || '';
  const supplierF = document.getElementById('pf-supplier')?.value || '';
  const categoryF = document.getElementById('pf-category')?.value || '';
  const sortF = document.getElementById('pf-sort')?.value || 'newest';

  let list = adminProductsData.filter(p => {
    if (q && !p.name.toLowerCase().includes(q)) return false;
    if (genderF && p.gender !== genderF) return false;
    if (productStatusTab !== 'semua' && productStatus(p) !== productStatusTab) return false;
    if (lowStockOnly && productLowestStock(p) > LOW_STOCK_THRESHOLD) return false;
    if (noPromoOnly && productHasPromo(p)) return false;
    if (supplierF && p.supplier_id !== supplierF) return false;
    if (categoryF && p.category_id !== categoryF) return false;
    return true;
  });

  if (sortF === 'name') list = list.slice().sort((a,b)=>a.name.localeCompare(b.name));
  else if (sortF === 'stock-asc') list = list.slice().sort((a,b)=>productTotalStock(a)-productTotalStock(b));
  else if (sortF === 'stock-desc') list = list.slice().sort((a,b)=>productTotalStock(b)-productTotalStock(a));
  else if (sortF === 'sold-desc') list = list.slice().sort((a,b)=>(productSalesMap[b.id]||0)-(productSalesMap[a.id]||0));
  else if (sortF === 'supplier') list = list.slice().sort((a,b)=>supplierName(a.supplier_id).localeCompare(supplierName(b.supplier_id)));
  // 'newest' sudah urutan default dari query (created_at desc)

  if (!list.length) { el.innerHTML=`<tr><td colspan="${selectModeOn?9:8}" style="color:var(--muted);font-size:13px;padding:20px">Nggak ada produk yang cocok dengan filter.</td></tr>`; updateBulkBar(); return; }

  el.innerHTML = list.map(p => {
    const vars = p.variants || [];
    const lowest = productLowestStock(p);
    const isLow = vars.length && lowest <= LOW_STOCK_THRESHOLD;
    const isOpen = expandedProductId === p.id;
    const breakdown = vars.map(v => `<span class="variant-breakdown-chip ${(v.stock??0)<=LOW_STOCK_THRESHOLD?'low':''}">${v.color_name} · ${v.size}: ${v.stock??0}</span>`).join('');
    const hasDiscount = vars.some(v => v.original_price != null);
    const netStr = priceRangeStr(vars, 'price') || '-';
    const jualStr = hasDiscount ? priceRangeStr(vars, 'original_price') : null;
    const sold = productSalesMap[p.id] || 0;
    const row = `
    <tr>
      ${selectModeOn ? `<td><input type="checkbox" class="prod-check" ${bulkSelected.has(p.id)?'checked':''} onchange="toggleBulkCheck('${p.id}',this.checked)"/></td>` : ''}
      <td>
        <div class="prod-cell-main">
          <div class="admin-product-img">${p.image_url?`<img src="${p.image_url}"/>`:`<div style="width:100%;height:100%;background:#f0ede8"></div>`}</div>
          <div>
            <div class="prod-name">${p.name}${isLow?`<span class="badge-lowstock">Stok menipis</span>`:''}${productHasPromo(p)?`<span class="badge-promo">Promo</span>`:''}</div>
            <div class="prod-sub">${capitalize(p.gender)} · ${vars.length} varian</div>
            ${vars.length ? `<button class="variant-toggle" onclick="toggleVariantBreakdown('${p.id}')">${isOpen?'Sembunyikan varian':'Lihat stok per varian'}</button>` : ''}
          </div>
        </div>
      </td>
      <td>${p.category||'-'}</td>
      <td>${hasDiscount?`<span class="prod-price-old">${jualStr}</span>`:''}<span class="prod-price-net">${netStr}</span></td>
      <td class="prod-stock-num">${productTotalStock(p)}</td>
      <td class="prod-sold-num">${sold}</td>
      <td>${p.supplier_id ? supplierName(p.supplier_id) : (p.supplier || '-')}</td>
      <td>${(() => { const s = productStatus(p); const cls = s==='aktif'?'on':'off'; const label = s==='aktif'?'Aktif':'Di Arsipkan'; return `<span class="prod-status-badge ${cls}">${label}</span>`; })()}</td>
      <td>
        <button class="btn-edit" onclick="editProduct('${p.id}')">Edit</button>
      </td>
    </tr>`;
    const variantRow = isOpen ? `<tr class="variant-row">${selectModeOn?'<td></td>':''}<td colspan="8"><div class="variant-breakdown">${breakdown}</div></td></tr>` : '';
    return row + variantRow;
  }).join('');
  lastRenderedIds = list.map(p => p.id);
  updateBulkBar();
}

function toggleSelectAll(checked) {
  if (checked) lastRenderedIds.forEach(id => bulkSelected.add(id));
  else bulkSelected.clear();
  renderAdminProductList();
}

function toggleVariantBreakdown(id) {
  expandedProductId = (expandedProductId === id) ? null : id;
  renderAdminProductList();
}

// ---- Bulk selection ----
function toggleBulkCheck(id, checked) {
  if (checked) bulkSelected.add(id); else bulkSelected.delete(id);
  updateBulkBar();
}
function clearBulkSelection() {
  bulkSelected.clear();
  renderAdminProductList();
}
function updateBulkBar() {
  const bar = document.getElementById('prod-bulkbar');
  if (!bar) return;
  bar.classList.toggle('hidden', bulkSelected.size === 0);
  document.getElementById('prod-bulk-count').textContent = `${bulkSelected.size} dipilih`;
}
async function bulkSetActive(active) {
  if (!bulkSelected.size) return;
  await sb.from('products').update({is_active: active, status: active ? 'aktif' : 'nonaktif'}).in('id', [...bulkSelected]);
  showToast(`${bulkSelected.size} produk di${active?'aktifkan':'arsipkan'} ✓`);
  loadAdminProducts();
}
async function bulkDelete() {
  if (!bulkSelected.size) return;
  const n = bulkSelected.size;
  showConfirmDialog(`Apakah kamu yakin ingin menghapus ${n} produk terpilih? Semua data termasuk foto bakal terhapus permanen dan nggak bisa dikembalikan.`, async () => {
    for (const id of [...bulkSelected]) {
      await deleteProductCascade(id);
    }
    showToast(`${n} produk & semua datanya dihapus`);
    loadAdminProducts();
  });
}

let _confirmCallback = null;
function showConfirmDialog(message, onConfirm) {
  document.getElementById('confirm-message').textContent = message;
  _confirmCallback = onConfirm;
  document.getElementById('confirm-overlay').classList.add('open');
}
function closeConfirmDialog() {
  document.getElementById('confirm-overlay').classList.remove('open');
  _confirmCallback = null;
}
async function confirmDialogProceed() {
  const cb = _confirmCallback;
  document.getElementById('confirm-overlay').classList.remove('open');
  _confirmCallback = null;
  if (cb) await cb();
}

function extractStoragePath(url) {
  if (!url) return null;
  const marker = '/product-photos/';
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length);
}

async function deleteProductCascade(id) {
  const p = adminProductsData.find(x => x.id === id);
  const vars = p?.variants || [];
  // Kumpulin semua url foto (produk + tiap varian warna), unik, biar sekali hapus aja
  const urls = new Set();
  (p?.image_urls || (p?.image_url ? [p.image_url] : [])).forEach(u => urls.add(u));
  vars.forEach(v => { if (v.image_url) urls.add(v.image_url); });
  const paths = [...urls].map(extractStoragePath).filter(Boolean);
  if (paths.length) {
    const { error: storageErr } = await sb.storage.from('product-photos').remove(paths);
    if (storageErr) console.error('Gagal hapus foto di storage:', storageErr);
  }
  await sb.from('wishlists').delete().eq('product_id', id);
  await sb.from('variants').delete().eq('product_id', id);
  await sb.from('products').delete().eq('id', id);
}

async function toggleActiveCurrent() {
  if (!editingProductId) return;
  const p = adminProductsData.find(x => x.id === editingProductId);
  if (!p) return;
  const isActive = productStatus(p) === 'aktif';
  const newStatus = isActive ? 'nonaktif' : 'aktif';
  await sb.from('products').update({status: newStatus, is_active: newStatus === 'aktif'}).eq('id', editingProductId);
  showToast(isActive ? 'Produk diarsipkan ✓' : 'Produk diaktifkan ✓');
  closeProductForm();
  loadAdminProducts();
}

async function deleteProductFromForm() {
  if (!editingProductId) return;
  showConfirmDialog('Apakah kamu yakin ingin menghapus produk ini? Semua data termasuk foto bakal terhapus permanen dan nggak bisa dikembalikan.', async () => {
    await deleteProductCascade(editingProductId);
    showToast('Produk & semua datanya dihapus');
    closeProductForm();
    loadAdminProducts();
  });
}
