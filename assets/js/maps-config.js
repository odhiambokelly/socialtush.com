/*
 * Google Maps settings for the IP checker map (https://socialtush.com/ip-checker).
 *
 * googleMapsApiKey: a BROWSER key from Google Cloud Console. Browser keys are visible to visitors by
 *   design, so the key MUST be restricted (see IP-CHECKER.md, "Google Maps setup"):
 *     - Application restriction: Websites -> https://socialtush.com/* and https://www.socialtush.com/*
 *     - API restriction: Maps JavaScript API only
 * mapId: optional Map ID from Google Cloud (Maps Management). Leave empty to use the standard map.
 *
 * With no key (or a rejected key) the page shows Google's keyless embedded satellite map instead and
 * says that the interactive map is not configured. It never shows a fake map.
 */
window.SOCIALTUSH_MAPS = {
  googleMapsApiKey: '',
  mapId: ''
};
