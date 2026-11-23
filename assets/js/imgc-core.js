/* SocialTush image compressor: the real image processing. Runs in a Web Worker (or the page as a fallback).
 * Nothing is uploaded: images are decoded, resized and re-encoded on the visitor's device.
 * JPEG/WebP: the browser's own encoder with the chosen quality.
 * PNG: UPNG.js (Photopea, MIT) with deflate from fflate (MIT): lossless re-encoding, or optional colour reduction. */
(function (root) {
  'use strict';
  var MIME = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
  var EXT = { jpeg: 'jpg', png: 'png', webp: 'webp' };
  var MAX_PIXELS = 50e6;            // output limit (50 megapixels): larger canvases crash many browsers
  var MAX_BYTES = 60 * 1024 * 1024; // 60 MB per file

  /** Detect the real format from the file's first bytes (not the name or the browser's guess). */
  function sniff(bytes) {
    var b = bytes;
    if (b.length >= 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'jpeg';
    if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 && b[4] === 0x0D && b[5] === 0x0A && b[6] === 0x1A && b[7] === 0x0A) return 'png';
    if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp';
    return null;
  }

  /** Work out the output size. o: { mode: 'original'|'percent'|'custom'|'max', percent, width, height, keepAspect, maxEdge } */
  function targetSize(w, h, o) {
    var tw = w, th = h;
    o = o || {};
    if (o.mode === 'percent') {
      var p = Math.min(100, Math.max(1, +o.percent || 100)) / 100;
      tw = w * p; th = h * p;
    } else if (o.mode === 'max') {
      var m = +o.maxEdge || 0, s = Math.max(w, h);
      if (m > 0 && s > m) { tw = w * m / s; th = h * m / s; }
    } else if (o.mode === 'custom') {
      var cw = +o.width || 0, ch = +o.height || 0;
      if (o.keepAspect !== false) {
        if (cw && ch) { var k = Math.min(cw / w, ch / h); tw = w * k; th = h * k; }
        else if (cw) { tw = cw; th = h * cw / w; }
        else if (ch) { th = ch; tw = w * ch / h; }
      } else {
        if (cw) tw = cw;
        if (ch) th = ch;
      }
    }
    tw = Math.max(1, Math.round(tw)); th = Math.max(1, Math.round(th));
    return { width: tw, height: th };
  }

  function outFormat(src, choice) { return choice === 'jpeg' || choice === 'png' || choice === 'webp' ? choice : src; }

  function makeCanvas(w, h) {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    var c = document.createElement('canvas'); c.width = w; c.height = h; return c;
  }
  function canvasBlob(c, type, q) {
    if (c.convertToBlob) return c.convertToBlob(q == null ? { type: type } : { type: type, quality: q });
    return new Promise(function (res, rej) { c.toBlob(function (b) { b ? res(b) : rej(new Error('The browser could not encode this image.')); }, type, q); });
  }
  function freeCanvas(c) { try { c.width = c.height = 0; } catch (e) { /* ignore */ } }

  /** Draw a bitmap at the target size. Large reductions are done in halving steps for a sharp, alias-free result. */
  function drawResized(bmp, sw, sh, tw, th, flatten) {
    var src = bmp, cw = sw, ch = sh, tmp = null;
    while (cw / 2 >= tw && ch / 2 >= th) {
      var nw = Math.max(tw, Math.round(cw / 2)), nh = Math.max(th, Math.round(ch / 2));
      var step = makeCanvas(nw, nh), sx = step.getContext('2d');
      sx.imageSmoothingEnabled = true; sx.imageSmoothingQuality = 'high';
      sx.drawImage(src, 0, 0, cw, ch, 0, 0, nw, nh);
      if (tmp) freeCanvas(tmp);
      tmp = step; src = step; cw = nw; ch = nh;
    }
    var c = makeCanvas(tw, th), ctx = c.getContext('2d');
    if (!ctx) throw new Error('This image is too large for your browser to process. Try resizing it smaller.');
    if (flatten) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, tw, th); }
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, cw, ch, 0, 0, tw, th);
    if (tmp) freeCanvas(tmp);
    return c;
  }

  function upng() {
    if (!root.UPNG) throw new Error('PNG optimiser failed to load. Refresh the page and try again.');
    return root.UPNG;
  }

  /** Encode RGBA pixels as an optimised PNG. colours = 0 for lossless, or 2..256 to reduce the palette (lossy). */
  function encodePng(rgba, w, h, colours) {
    var buf = rgba.buffer.byteLength === w * h * 4 ? rgba.buffer : rgba.slice().buffer;
    return new Blob([upng().encode([buf], w, h, colours || 0)], { type: 'image/png' });
  }

  /**
   * Compress one image file. Returns a Promise of a result object with the real output Blob and its real numbers.
   * opts: { format: 'original'|'jpeg'|'png'|'webp', quality: 10..100, pngColours: 0|256|128|64|32|16, resize: {...} }
   */
  async function processFile(file, opts) {
    opts = opts || {};
    if (file.size > MAX_BYTES) throw new Error('This file is larger than 60 MB. Please use a smaller image.');
    var bytes = new Uint8Array(await file.arrayBuffer());
    var src = sniff(bytes);
    if (!src) throw new Error('Unsupported file. Only JPG, PNG and WebP images can be compressed.');
    var fmt = outFormat(src, opts.format);
    var q = Math.min(100, Math.max(10, +opts.quality || 80)) / 100;
    var notes = [];

    var bmp;
    try { bmp = await createImageBitmap(new Blob([bytes], { type: MIME[src] }), { imageOrientation: 'from-image', premultiplyAlpha: 'none' }); }
    catch (e) { throw new Error('This image could not be read. The file may be damaged or not a real ' + ({ jpeg: 'JPG', png: 'PNG', webp: 'WebP' })[src] + ' image.'); }
    var sw = bmp.width, sh = bmp.height;
    if (!sw || !sh) { bmp.close && bmp.close(); throw new Error('This image could not be read.'); }
    var t = targetSize(sw, sh, opts.resize);
    if (t.width * t.height > MAX_PIXELS) { bmp.close && bmp.close(); throw new Error('The output would be ' + t.width + ' × ' + t.height + ' px, which is too large to process in a browser. Choose a smaller size.'); }
    var resized = t.width !== sw || t.height !== sh;

    var blob;
    try {
      if (fmt === 'png') {
        var colours = +opts.pngColours || 0, rgba = null, w = t.width, h = t.height;
        if (src === 'png' && !resized) {
          // Decode the original PNG exactly (no canvas colour rounding), so "lossless" really is lossless.
          try {
            var dec = upng().decode(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
            if (dec.width === sw && dec.height === sh) {
              if (dec.frames && dec.frames.length > 1) notes.push('Animated PNG: only the first frame is kept.');
              if (dec.depth === 16) notes.push('16-bit PNG converted to 8 bits per channel.');
              rgba = new Uint8Array(upng().toRGBA8(dec)[0]);
            }
          } catch (e) { rgba = null; }
        }
        if (!rgba) {
          var c = drawResized(bmp, sw, sh, w, h, false);
          rgba = new Uint8Array(c.getContext('2d').getImageData(0, 0, w, h).data.buffer);
          freeCanvas(c);
        }
        blob = encodePng(rgba, w, h, colours);
        rgba = null;
        if (colours) notes.push('Colours reduced to ' + colours + ' (lossy PNG).');
        else notes.push('Lossless PNG optimisation.');
      } else {
        var cv = drawResized(bmp, sw, sh, t.width, t.height, fmt === 'jpeg');
        blob = await canvasBlob(cv, MIME[fmt], q);
        freeCanvas(cv);
        if (!blob || blob.type !== MIME[fmt]) {
          throw new Error(fmt === 'webp' ? 'Your browser cannot create WebP files (Safari before version 17 cannot). Choose JPG or PNG as the output format.' : 'Your browser could not create a ' + fmt.toUpperCase() + ' file.');
        }
        if (fmt === 'jpeg' && src !== 'jpeg') notes.push('Transparent areas filled with white (JPG has no transparency).');
      }
    } finally { bmp.close && bmp.close(); }

    var head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
    if (sniff(head) !== fmt) throw new Error('The encoded file failed its format check, so it was not offered for download.');
    var saved = file.size - blob.size;
    return {
      blob: blob, srcFormat: src, format: fmt, ext: EXT[fmt], mime: MIME[fmt],
      originalSize: file.size, size: blob.size, saved: saved,
      percent: file.size ? saved / file.size * 100 : 0,
      reduced: saved > 0,
      originalWidth: sw, originalHeight: sh, width: t.width, height: t.height, resized: resized, notes: notes
    };
  }

  root.IMGC = { sniff: sniff, targetSize: targetSize, outFormat: outFormat, processFile: processFile, encodePng: encodePng, MIME: MIME, EXT: EXT, MAX_PIXELS: MAX_PIXELS, MAX_BYTES: MAX_BYTES };
})(typeof self !== 'undefined' ? self : this);
