/* SocialTush image compressor worker: processes one image at a time off the main thread, so the page never freezes. */
self.window = self; // UPNG.js registers itself on `window`
importScripts('../vendor/fflate-0.8.2.js');
self.pako = {
  deflate: function (d) { return fflate.zlibSync(d, { level: 9, mem: 12 }); },
  inflate: function (d) { return fflate.unzlibSync(d); }
};
importScripts('../vendor/upng-2.1.0.js', 'imgc-core.js?v=1');

self.onmessage = async function (e) {
  var m = e.data;
  if (m && m.type === 'ping') {
    var ok = typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap === 'function';
    if (ok) { try { var c = new OffscreenCanvas(1, 1); ok = !!c.getContext('2d') && typeof c.convertToBlob === 'function'; } catch (x) { ok = false; } }
    self.postMessage({ type: 'pong', id: m.id, ok: ok });
    return;
  }
  try {
    var r = await IMGC.processFile(m.file, m.opts);
    self.postMessage({ type: 'done', id: m.id, result: r });
  } catch (err) {
    self.postMessage({ type: 'error', id: m.id, error: (err && err.message) || 'This image could not be processed.' });
  }
};
