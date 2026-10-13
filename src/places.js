// Finding a custom starting point: typed coordinates, or a place-name search through OpenStreetMap's
// Nominatim geocoder. Nominatim's usage policy allows about one request a second and no
// search-as-you-type, so the menu only searches when the form is submitted.

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

/**
 * Reads "lat, lon" in decimal degrees: "36.1, -112.1", "36.1 -112.1" or "36.1N 112.1W".
 * Returns { lat, lon } or null if the text isn't a coordinate pair.
 */
export function parseLatLon(text) {
  const m = text
    .trim()
    .match(/^([+-]?\d+(?:\.\d+)?)\s*°?\s*([NS])?\s*[,;\s]\s*([+-]?\d+(?:\.\d+)?)\s*°?\s*([EW])?$/i);
  if (!m) return null;
  let lat = Number(m[1]);
  let lon = Number(m[3]);
  if (m[2] && m[2].toUpperCase() === 'S') lat = -Math.abs(lat);
  if (m[4] && m[4].toUpperCase() === 'W') lon = -Math.abs(lon);
  if (Math.abs(lat) > 85 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

/** "36.0300°N 112.3000°W" */
export function formatLatLon(lat, lon) {
  return `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(4)}°${lon >= 0 ? 'E' : 'W'}`;
}

/** First two parts of a Nominatim display name: "Grand Canyon Village, Coconino County". */
export function shortName(displayName) {
  return displayName.split(',').slice(0, 2).map((s) => s.trim()).join(', ');
}

/** Up to five places matching a query, as { name, detail, lat, lon }. */
export async function searchPlaces(query, { signal } = {}) {
  const url = `${NOMINATIM}?format=jsonv2&limit=5&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Place search failed (HTTP ${res.status})`);
  const results = await res.json();
  return results
    .map((r) => ({ name: shortName(r.display_name), detail: r.display_name, lat: Number(r.lat), lon: Number(r.lon) }))
    .filter((r) => Math.abs(r.lat) <= 85);
}
