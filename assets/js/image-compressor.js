/* SocialTush image compressor page. Images never leave this browser tab: they are processed one at a time
 * in a Web Worker (or on the page if the browser has no OffscreenCanvas), and every number shown comes from
 * the real output file. Needs assets/vendor/fflate-0.8.2.js (ZIP) loaded first. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var fileInput = $('imc-file'), drop = $('imc-drop'), list = $('imc-list'), err = $('imc-err');
  var quality = $('imc-quality'), qualityVal = $('imc-quality-val'), format = $('imc-format'), pngCol = $('imc-png');
  var resizeMode = $('imc-resize'), percent = $('imc-percent'), percentVal = $('imc-percent-val'), maxEdge = $('imc-max');
  var cw = $('imc-w'), ch = $('imc-h'), aspect = $('imc-aspect');
  var btnGo = $('imc-go'), btnCancel = $('imc-cancel'), btnClear = $('imc-clear'), btnZip = $('imc-zip');
  var summary = $('imc-summary'), overall = $('imc-overall'), overallBar = $('imc-overall-bar'), overallTxt = $('imc-overall-txt');
  var results = $('imc-results'), status = $('imc-status');
  var cmp = $('imc-compare'), cmpBefore = $('imc-cmp-before'), cmpAfter = $('imc-cmp-after'), cmpRange = $('imc-cmp-range');
  var cmpTitle = $('imc-cmp-title'), cmpStats = $('imc-cmp-stats'), cmpAfterWrap = $('imc-cmp-after-wrap'), cmpDivider = $('imc-cmp-divider');

  var items = [], seq = 0, running = false, cancelled = false, worker = null, workerOk = null, pending = null, compareId = null;
  var ACCEPT = /\.(jpe?g|png|webp)$/i;

  /* ---------- helpers ---------- */
  function fmtBytes(n) {
    var a = Math.abs(n);
    if (a < 1024) return n + ' B';
    if (a < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(2) + ' MB';
  }
  function exact(n) { return n.toLocaleString('en-US') + ' bytes'; }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function baseName(name) { return (name.replace(/\.[^.]+$/, '').replace(/[^\w\-. ]+/g, '').trim().replace(/\s+/g, '-') || 'image').slice(0, 80); }
  function outName(it) { return baseName(it.file.name) + '-compressed.' + it.result.ext; }
  function say(t, cls) { status.textContent = t; status.className = 'pwg-status' + (cls ? ' ' + cls : ''); }
  function upper(f) { return f === 'jpeg' ? 'JPG' : f.toUpperCase(); }

  function options() {
    return {
      format: format.value,
      quality: parseInt(quality.value, 10),
      pngColours: parseInt(pngCol.value, 10) || 0,
      resize: { mode: resizeMode.value, percent: parseInt(percent.value, 10), maxEdge: parseInt(maxEdge.value, 10), width: parseInt(cw.value, 10) || 0, height: parseInt(ch.value, 10) || 0, keepAspect: aspect.checked }
    };
  }

  /* ---------- processing engine: worker, or page fallback ---------- */
  function loadScript(src) {
    return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(new Error('Could not load ' + src)); }; document.head.appendChild(s); });
  }
  var fallbackReady = null;
  function ensureFallback() {
    if (!fallbackReady) {
      window.pako = { deflate: function (d) { return fflate.zlibSync(d, { level: 9, mem: 12 }); }, inflate: function (d) { return fflate.unzlibSync(d); } };
      fallbackReady = loadScript('assets/vendor/upng-2.1.0.js').then(function () { return loadScript('assets/js/imgc-core.js?v=1'); });
    }
    return fallbackReady;
  }
  function newWorker() {
    if (worker) worker.terminate();
    worker = new Worker('assets/js/imgc-worker.js?v=1');
    worker.onmessage = function (e) { if (pending && e.data.id === pending.id) { var p = pending; pending = null; p.resolve(e.data); } };
    worker.onerror = function (e) {
      e.preventDefault && e.preventDefault();
      if (pending) { var p = pending; pending = null; p.resolve({ type: 'error', error: 'Your browser ran out of memory on this image. Try a smaller size, or close other tabs.', crashed: true }); }
    };
    return worker;
  }
  function callWorker(msg) {
    return new Promise(function (resolve) { pending = { id: msg.id, resolve: resolve }; worker.postMessage(msg); });
  }
  async function engineReady() {
    if (workerOk !== null) return workerOk;
    try {
      if (typeof Worker === 'undefined') throw 0;
      newWorker();
      var r = await Promise.race([callWorker({ type: 'ping', id: 'ping' }), new Promise(function (res) { setTimeout(function () { res({ ok: false }); }, 8000); })]);
      workerOk = !!r.ok;
    } catch (x) { workerOk = false; }
    if (!workerOk) { if (worker) worker.terminate(); worker = null; pending = null; await ensureFallback(); }
    return workerOk;
  }
  async function processOne(it, opts) {
    if (workerOk) {
      var r = await callWorker({ type: 'process', id: it.id + ':' + it.run, file: it.file, opts: opts });
      if (r.crashed) newWorker();
      return r;
    }
    try { return { type: 'done', result: await window.IMGC.processFile(it.file, opts) }; }
    catch (e) { return { type: 'error', error: e.message || 'This image could not be processed.' }; }
  }

  /* ---------- list rendering ---------- */
  function addFiles(files) {
    var bad = [];
    Array.prototype.forEach.call(files, function (f) {
      var typeOk = /^image\/(jpeg|png|webp)$/.test(f.type) || ACCEPT.test(f.name);
      if (!typeOk) { bad.push(f.name); return; }
      var it = { id: ++seq, file: f, status: 'ready', result: null, url: null, srcUrl: null, run: 0 };
      items.push(it); it.node = renderItem(it); list.appendChild(it.node);
    });
    err.textContent = bad.length ? 'Not added (unsupported format, use JPG, PNG or WebP): ' + bad.slice(0, 5).join(', ') + (bad.length > 5 ? ' and ' + (bad.length - 5) + ' more' : '') + '.' : '';
    refresh();
  }

  function renderItem(it) {
    var li = el('li', 'imc-item');
    li.dataset.id = it.id;
    var thumb = el('div', 'imc-thumb'); thumb.appendChild(el('span', 'imc-badge', (it.file.name.split('.').pop() || '').toUpperCase().slice(0, 4)));
    var body = el('div', 'imc-body');
    var name = el('p', 'imc-name', it.file.name); name.title = it.file.name;
    var meta = el('p', 'imc-meta', 'Original: ' + fmtBytes(it.file.size));
    var bar = el('div', 'imc-bar'); bar.appendChild(el('span'));
    var st = el('p', 'imc-st', 'Ready to compress');
    var det = el('dl', 'imc-det'); det.hidden = true;
    body.append(name, meta, bar, st, det);
    var acts = el('div', 'imc-acts');
    var cmpBtn = el('button', 'btn btn-ghost imc-cmp-btn', 'Compare'); cmpBtn.type = 'button'; cmpBtn.hidden = true;
    var dl = el('a', 'btn btn-primary imc-dl', 'Download'); dl.hidden = true;
    var rm = el('button', 'imc-rm', '×'); rm.type = 'button'; rm.setAttribute('aria-label', 'Remove ' + it.file.name); rm.title = 'Remove';
    acts.append(cmpBtn, dl);
    li.append(thumb, body, acts, rm);
    cmpBtn.addEventListener('click', function () { openCompare(it); });
    rm.addEventListener('click', function () { removeItem(it); });
    return li;
  }

  function setItem(it) {
    var li = it.node, st = li.querySelector('.imc-st'), bar = li.querySelector('.imc-bar'), det = li.querySelector('.imc-det');
    var dl = li.querySelector('.imc-dl'), cmpBtn = li.querySelector('.imc-cmp-btn'), thumb = li.querySelector('.imc-thumb'), meta = li.querySelector('.imc-meta');
    li.className = 'imc-item is-' + it.status;
    bar.hidden = it.status !== 'working' && it.status !== 'queued';
    dl.hidden = cmpBtn.hidden = it.status !== 'done';
    det.hidden = it.status !== 'done';
    st.className = 'imc-st';
    if (it.status === 'ready') st.textContent = 'Ready to compress';
    else if (it.status === 'queued') st.textContent = 'Waiting…';
    else if (it.status === 'working') st.textContent = 'Compressing…';
    else if (it.status === 'cancelled') st.textContent = 'Cancelled';
    else if (it.status === 'error') { st.textContent = it.error; st.className = 'imc-st bad'; }
    else if (it.status === 'done') {
      var r = it.result;
      if (r.saved > 0) { st.textContent = 'Saved ' + fmtBytes(r.saved) + ' (' + r.percent.toFixed(1) + '% smaller)'; st.className = 'imc-st ok'; }
      else if (r.saved === 0) { st.textContent = 'No size reduction achieved. The optimized file is the same size as the original.'; st.className = 'imc-st warn'; }
      else { st.textContent = 'No size reduction achieved. The optimized file is larger than the original.'; st.className = 'imc-st warn'; }
      meta.textContent = fmtBytes(r.originalSize) + ' → ' + fmtBytes(r.size);
      det.replaceChildren();
      [['Original format', upper(r.srcFormat)], ['Output format', upper(r.format)],
       ['Original size', fmtBytes(r.originalSize), exact(r.originalSize)], ['Compressed size', fmtBytes(r.size), exact(r.size)],
       ['Original dimensions', r.originalWidth + ' × ' + r.originalHeight + ' px'], ['New dimensions', r.width + ' × ' + r.height + ' px'],
       ['Size reduction', r.saved > 0 ? fmtBytes(r.saved) : 'None'], ['Percentage saved', r.saved > 0 ? r.percent.toFixed(1) + '%' : r.saved === 0 ? '0%' : '0% (' + fmtBytes(-r.saved) + ' larger)']
      ].forEach(function (p) { var dd = el('dd', null, p[1]), row = el('div'); if (p[2]) dd.title = p[2]; row.append(el('dt', null, p[0]), dd); det.append(row); });
      if (r.notes.length) { var nr = el('div', 'imc-note'); nr.append(el('dt', null, 'Notes'), el('dd', null, r.notes.join(' '))); det.append(nr); }
      dl.href = it.url; dl.download = outName(it);
      dl.textContent = r.saved > 0 ? 'Download ' + upper(r.format) : 'Download anyway';
      dl.title = outName(it) + ' · ' + exact(r.size);
      var img = thumb.querySelector('img') || el('img');
      img.alt = ''; img.decoding = 'async'; img.src = it.url;
      thumb.replaceChildren(img);
    }
  }

  function revoke(it) {
    if (it.url) { URL.revokeObjectURL(it.url); it.url = null; }
    if (it.srcUrl) { URL.revokeObjectURL(it.srcUrl); it.srcUrl = null; }
  }
  function removeItem(it) {
    if (it.status === 'working') { say('Wait for this image to finish, or press Cancel first.', 'bad'); return; }
    if (compareId === it.id) closeCompare();
    revoke(it); it.result = null; it.status = 'removed';
    it.node.remove(); items = items.filter(function (x) { return x !== it; });
    refresh();
  }
  function clearAll() {
    if (running) cancel();
    closeCompare();
    items.forEach(revoke); items = []; list.replaceChildren(); err.textContent = ''; say('');
    fileInput.value = '';
    refresh();
  }

  function refresh() {
    var done = items.filter(function (i) { return i.status === 'done'; });
    results.hidden = items.length === 0;
    btnGo.disabled = running || items.length === 0;
    btnClear.disabled = items.length === 0;
    btnCancel.hidden = !running;
    btnZip.disabled = running || done.length === 0;
    btnZip.textContent = done.length > 1 ? 'Download all as ZIP (' + done.length + ')' : 'Download all as ZIP';
    btnGo.textContent = items.length && items.some(function (i) { return i.status === 'done'; }) ? 'Compress again with these settings' : (items.length > 1 ? 'Compress ' + items.length + ' images' : 'Compress image');
    if (!done.length) { summary.textContent = items.length ? items.length + ' image' + (items.length > 1 ? 's' : '') + ' ready. Adjust the settings, then press Compress.' : ''; return; }
    var o = 0, c = 0; done.forEach(function (i) { o += i.result.originalSize; c += i.result.size; });
    var s = o - c;
    summary.textContent = done.length + ' of ' + items.length + ' compressed · ' + fmtBytes(o) + ' → ' + fmtBytes(c) + ' · ' +
      (s > 0 ? 'saved ' + fmtBytes(s) + ' (' + (s / o * 100).toFixed(1) + '%)' : 'no overall size reduction (' + fmtBytes(-s) + ' larger)');
  }

  /* ---------- run / cancel ---------- */
  async function run() {
    if (running || !items.length) return;
    running = true; cancelled = false; say(''); closeCompare();
    var opts = options();
    var queue = items.slice();
    queue.forEach(function (it) { revoke(it); it.result = null; it.status = 'queued'; it.run++; setItem(it); });
    overall.hidden = false; refresh();
    var ready = await engineReady().then(function () { return true; }, function () { return false; });
    if (!ready) { running = false; say('The image engine failed to load. Refresh the page and try again.', 'bad'); refresh(); return; }
    var n = 0;
    for (var k = 0; k < queue.length; k++) {
      var it = queue[k];
      if (cancelled) break;
      if (it.status === 'removed') continue;
      it.status = 'working'; setItem(it);
      overallTxt.textContent = 'Compressing ' + (n + 1) + ' of ' + queue.length + '…';
      var r = await processOne(it, opts);
      if (cancelled || it.status === 'removed') break;
      if (r.type === 'done') { it.result = r.result; it.url = URL.createObjectURL(r.result.blob); it.status = 'done'; }
      else { it.status = 'error'; it.error = r.error; }
      setItem(it); n++;
      overallBar.style.width = (n / queue.length * 100) + '%';
      refresh();
      await new Promise(function (res) { setTimeout(res, 0); }); // let the page breathe between images
    }
    running = false; overall.hidden = true; overallBar.style.width = '0';
    var ok = items.filter(function (i) { return i.status === 'done'; }).length, bad = items.filter(function (i) { return i.status === 'error'; }).length;
    if (!cancelled) say(ok + ' image' + (ok === 1 ? '' : 's') + ' processed' + (bad ? ', ' + bad + ' failed' : '') + '.', bad && !ok ? 'bad' : 'ok');
    refresh();
  }
  function cancel() {
    if (!running) return;
    cancelled = true;
    if (workerOk && worker) { newWorker(); if (pending) { var p = pending; pending = null; p.resolve({ type: 'error', error: 'Cancelled' }); } }
    items.forEach(function (it) { if (it.status === 'queued' || it.status === 'working') { it.status = 'cancelled'; setItem(it); } });
    running = false; overall.hidden = true; overallBar.style.width = '0';
    say('Cancelled. Finished images are kept.', 'bad'); refresh();
  }

  /* ---------- ZIP ---------- */
  btnZip.addEventListener('click', async function () {
    var done = items.filter(function (i) { return i.status === 'done'; });
    if (!done.length) return;
    btnZip.disabled = true; say('Creating ZIP…');
    try {
      var files = {}, used = {};
      for (var i = 0; i < done.length; i++) {
        var name = outName(done[i]), base = name.replace(/\.[^.]+$/, ''), ext = name.slice(base.length), n = 2;
        while (used[name.toLowerCase()]) name = base + '-' + (n++) + ext;
        used[name.toLowerCase()] = 1;
        files[name] = [new Uint8Array(await done[i].result.blob.arrayBuffer()), { level: 0 }]; // images are already compressed: store them
      }
      var zip = fflate.zipSync(files);
      var blob = new Blob([zip], { type: 'application/zip' }), url = URL.createObjectURL(blob);
      var a = document.createElement('a'); a.href = url; a.download = 'socialtush-compressed-images.zip';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
      say('ZIP downloaded: ' + done.length + ' image' + (done.length > 1 ? 's' : '') + ', ' + fmtBytes(blob.size) + '.', 'ok');
    } catch (e) { say('The ZIP could not be created (' + (e.message || 'out of memory') + '). Download the images one by one instead.', 'bad'); }
    refresh();
  });

  /* ---------- before / after comparison ---------- */
  function openCompare(it) {
    if (!it.result) return;
    if (!it.srcUrl) it.srcUrl = URL.createObjectURL(it.file);
    compareId = it.id;
    cmpBefore.src = it.srcUrl; cmpAfter.src = it.url;
    var r = it.result;
    cmpTitle.textContent = it.file.name;
    cmpStats.replaceChildren(
      el('span', null, 'Original: ' + fmtBytes(r.originalSize) + ' · ' + r.originalWidth + '×' + r.originalHeight + ' ' + upper(r.srcFormat)),
      el('span', null, 'Compressed: ' + fmtBytes(r.size) + ' · ' + r.width + '×' + r.height + ' ' + upper(r.format)),
      el('span', r.saved > 0 ? 'ok' : 'warn', r.saved > 0 ? 'Difference: ' + fmtBytes(r.saved) + ' smaller (' + r.percent.toFixed(1) + '%)' : 'Difference: ' + fmtBytes(-r.saved) + ' larger (no reduction)')
    );
    cmpRange.value = 50; setSplit(50);
    cmp.hidden = false;
    cmp.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function closeCompare() { cmp.hidden = true; compareId = null; cmpBefore.removeAttribute('src'); cmpAfter.removeAttribute('src'); }
  function setSplit(v) { cmpAfterWrap.style.clipPath = 'inset(0 0 0 ' + v + '%)'; cmpDivider.style.left = v + '%'; }
  cmpRange.addEventListener('input', function () { setSplit(cmpRange.value); });
  $('imc-cmp-close').addEventListener('click', closeCompare);

  /* ---------- settings UI ---------- */
  function syncSettings() {
    qualityVal.textContent = quality.value + '%';
    percentVal.textContent = percent.value + '%';
    document.querySelectorAll('[data-resize]').forEach(function (g) { g.hidden = g.dataset.resize !== resizeMode.value; });
    var f = format.value;
    $('imc-quality-box').classList.toggle('is-off', f === 'png');
    $('imc-q-note').textContent = f === 'png' ? 'The quality slider does not apply to PNG. PNG is optimised losslessly; choose fewer colours below for smaller PNG files.'
      : f === 'original' ? 'Quality applies to JPG and WebP images. PNG images are optimised losslessly unless you reduce their colours.' : '';
    $('imc-png-box').hidden = f === 'jpeg' || f === 'webp';
    if (items.some(function (i) { return i.status === 'done'; }) && !running) say('Settings changed. Press "Compress again" to apply them.');
  }
  [quality, format, pngCol, resizeMode, percent, maxEdge, cw, ch, aspect].forEach(function (x) { x.addEventListener('input', syncSettings); x.addEventListener('change', syncSettings); });

  /* ---------- file input + drag and drop ---------- */
  fileInput.addEventListener('change', function () { addFiles(fileInput.files); fileInput.value = ''; });
  $('imc-browse').addEventListener('click', function () { fileInput.click(); });
  ['dragenter', 'dragover'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add('is-over'); }); });
  ['dragleave', 'dragend'].forEach(function (t) { drop.addEventListener(t, function () { drop.classList.remove('is-over'); }); });
  drop.addEventListener('drop', function (e) { e.preventDefault(); drop.classList.remove('is-over'); if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files); });
  drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
  // Stop a missed drop from opening the image in the tab (which would leave the page).
  window.addEventListener('dragover', function (e) { e.preventDefault(); });
  window.addEventListener('drop', function (e) { if (!drop.contains(e.target)) e.preventDefault(); });

  btnGo.addEventListener('click', run);
  btnCancel.addEventListener('click', cancel);
  btnClear.addEventListener('click', clearAll);
  window.addEventListener('pagehide', function () { items.forEach(revoke); if (worker) worker.terminate(); });

  syncSettings(); say(''); refresh();
  window.SocialTushImageCompressor = { items: function () { return items; } }; // read-only hook for automated tests
})();
