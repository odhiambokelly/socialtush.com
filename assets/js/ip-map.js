/* SocialTush IP checker map.
 * Primary: official Google Maps JavaScript API (satellite default, map/satellite switch, zoom, marker, info popup).
 * Without a configured key, or if Google rejects it: Google's keyless embedded map ("Share > Embed a map")
 * centred on the same coordinates, plus a clear configuration notice. Coordinates always come from the
 * IP intelligence API response; nothing is hardcoded or invented. */

const cfg = window.SOCIALTUSH_MAPS || {};
const KEY = String(cfg.googleMapsApiKey || '').trim();

let mode = KEY ? 'js' : 'embed';      // 'js' | 'embed'
let loadPromise = null;
let map = null, marker = null, info = null;
let els = null;
let last = null;

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// Configuration messages are for the site owner only: they go to the browser console, and are shown
// on the page only when it is opened with ?mapdebug (e.g. https://socialtush.com/ip-checker?mapdebug).
const SHOW_NOTICES = /[?&]mapdebug\b/.test(location.search);
function setNotice(html) {
  if (html) console.info('[SocialTush map] ' + html.replace(/<[^>]+>/g, ''));
  if (!els.notice) return;
  els.notice.innerHTML = SHOW_NOTICES ? html || '' : '';
  els.notice.hidden = !(SHOW_NOTICES && html);
}

/** Load the Google Maps JavaScript API once. Resolves with google.maps or rejects with a reason. */
function loadGoogle() {
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    if (window.google && window.google.maps && window.google.maps.Map) { resolve(window.google.maps); return; }
    const cb = '__stMapsReady' + Date.now();
    const timer = setTimeout(() => reject(new Error('timeout')), 15000);
    window[cb] = () => { clearTimeout(timer); resolve(window.google.maps); };
    // Google calls this when the key is invalid, restricted for this site, or billing is not enabled.
    window.gm_authFailure = () => { clearTimeout(timer); fallBack('Google rejected the Maps API key (check that it is valid, billing is enabled and socialtush.com is an allowed website).'); };
    const s = document.createElement('script');
    s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(KEY) + '&v=weekly&loading=async&callback=' + cb;
    s.async = true;
    s.onerror = () => { clearTimeout(timer); reject(new Error('script')); };
    document.head.appendChild(s);
  });
  return loadPromise;
}

function fallBack(reason) {
  mode = 'embed';
  if (map && els.canvas) els.canvas.innerHTML = '';
  map = marker = info = null;
  console.warn('[SocialTush map] ' + reason);
  setNotice('<strong>Interactive map not configured.</strong> ' + esc(reason) + ' Showing Google\'s embedded satellite map instead.');
  if (last) showEmbed(last);
}

function pinIcon(g) {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="56" viewBox="0 0 44 56">' +
    '<path d="M22 54s18-17.6 18-32A18 18 0 0 0 4 22c0 14.4 18 32 18 32z" fill="#d0342c" stroke="#fff" stroke-width="3"/>' +
    '<circle cx="22" cy="22" r="7" fill="#fff"/></svg>';
  return { url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg), scaledSize: new g.Size(44, 56), anchor: new g.Point(22, 54) };
}

function popupHtml(p) {
  const place = [p.city, p.region, p.country].filter(Boolean).join(', ');
  return '<div style="font:14px/1.45 Arial,sans-serif;max-width:250px;color:#14201f">' +
    '<div style="font-weight:700;font-size:15px;margin-bottom:4px">📍 ' + esc(place || 'Approximate location') + '</div>' +
    '<div><strong>IP:</strong> ' + esc(p.ip) + '</div>' +
    (p.isp ? '<div><strong>ISP:</strong> ' + esc(p.isp) + '</div>' : '') +
    '<div><strong>Coordinates:</strong> ' + p.lat.toFixed(4) + ', ' + p.lon.toFixed(4) + '</div>' +
    '<div style="margin-top:6px;color:#6a7877;font-size:12px">Approximate ' + esc(p.precision) + '-level location from ' + esc(p.source) + '. An IP address does not reveal a street address.</div></div>';
}

async function showJs(p) {
  let g;
  try { g = await loadGoogle(); } catch (e) { fallBack(e.message === 'timeout' ? 'Google Maps took too long to load.' : 'The Google Maps script could not be loaded.'); return; }
  if (mode !== 'js') return;
  const pos = { lat: p.lat, lng: p.lon };
  if (!map) {
    els.canvas.innerHTML = '';
    map = new g.Map(els.canvas, {
      center: pos, zoom: p.zoom, mapTypeId: 'hybrid',
      mapTypeControl: true,
      mapTypeControlOptions: { mapTypeIds: ['hybrid', 'roadmap'], style: g.MapTypeControlStyle.HORIZONTAL_BAR, position: g.ControlPosition.TOP_LEFT },
      zoomControl: true, fullscreenControl: true, streetViewControl: false, rotateControl: false,
      gestureHandling: 'cooperative', clickableIcons: false,
      ...(cfg.mapId ? { mapId: cfg.mapId } : {}),
    });
    marker = new g.Marker({ map, position: pos, icon: pinIcon(g), title: 'Approximate IP location' });
    info = new g.InfoWindow();
    marker.addListener('click', () => { info.setContent(popupHtml(last)); info.open({ map, anchor: marker }); });
  } else {
    info.close();
    marker.setPosition(pos);
    map.panTo(pos);
    map.setZoom(p.zoom);
  }
  marker.setTitle('Approximate location of ' + p.ip);
  els.canvas.dataset.lat = String(p.lat);
  els.canvas.dataset.lon = String(p.lon);
  els.canvas.dataset.mode = 'google-js';
}

// Google Maps "Share > Embed a map" URL: !1s<lat,lon> = marker at these coordinates, !5e1 = satellite, !6i = zoom
function embedSrc(p) { return 'https://www.google.com/maps/embed?origin=mfe&pb=!1m4!2m1!1s' + p.lat.toFixed(5) + ',' + p.lon.toFixed(5) + '!5e1!6i' + p.zoom; }

function showEmbed(p) {
  const src = embedSrc(p);
  let f = els.canvas.querySelector('iframe');
  if (!f || els.canvas.clientWidth < 50) {           // not laid out yet: wait one frame so the map loads at full size
    if (!f && !showEmbed.waiting) { showEmbed.waiting = true; requestAnimationFrame(() => { showEmbed.waiting = false; createEmbed(last, embedSrc(last)); }); }
    else if (f) { f.src = src; }
    return;
  }
  f.title = 'Google satellite map of the approximate location of ' + p.ip;
  if (f.src !== src) f.src = src;
  els.canvas.dataset.lat = String(p.lat);
  els.canvas.dataset.lon = String(p.lon);
  els.canvas.dataset.mode = 'google-embed';
}

function createEmbed(p, src) {
  let f = els.canvas.querySelector('iframe');
  if (!f) {
    els.canvas.innerHTML = '';
    f = document.createElement('iframe');
    f.setAttribute('loading', 'eager');
    f.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
    f.setAttribute('allowfullscreen', '');
    els.canvas.appendChild(f);
  }
  f.title = 'Google satellite map of the approximate location of ' + p.ip;
  if (f.src !== src) f.src = src;
  els.canvas.dataset.lat = String(p.lat);
  els.canvas.dataset.lon = String(p.lon);
  els.canvas.dataset.mode = 'google-embed';
}

export function initMap(container) {
  els = { canvas: container.querySelector('.ipc-map-canvas'), notice: container.querySelector('.ipc-map-notice'), empty: container.querySelector('.ipc-map-empty') };
  // Google's embedded map draws at the size it first loads with; redraw it when the box size really changes.
  if ('ResizeObserver' in window) {
    let size = '', t = 0;
    new ResizeObserver((entries) => {
      const r = entries[0].contentRect, s = Math.round(r.width / 40) + 'x' + Math.round(r.height / 40);
      if (s === size) return;
      const first = !size; size = s;
      if (first || mode !== 'embed') return;
      clearTimeout(t);
      t = setTimeout(() => { const f = els.canvas.querySelector('iframe'); if (f && f.src) { const src = f.src; f.src = 'about:blank'; f.src = src; } }, 250);
    }).observe(els.canvas);
  }
  if (!KEY) setNotice('<strong>Interactive map not configured.</strong> Add a Google Maps API key in <code>assets/js/maps-config.js</code> to enable satellite/map switching and the location popup. Showing Google\'s embedded satellite map instead.');
}

/** p: { ip, lat, lon, zoom, precision, source, city, region, country, isp } or null when the API returned no coordinates. */
export function showOnMap(p) {
  if (!els) return;
  if (!p || p.lat == null || p.lon == null) {
    els.canvas.hidden = true;
    if (els.empty) { els.empty.hidden = false; els.empty.textContent = 'No map: the IP intelligence services returned no coordinates for this address.'; }
    return;
  }
  els.canvas.hidden = false;
  if (els.empty) els.empty.hidden = true;
  last = p;
  if (mode === 'js') showJs(p); else showEmbed(p);
}
