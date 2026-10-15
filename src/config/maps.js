/**
 * Online map services used by the route planner (OpenStreetMap ecosystem).
 * None require an API key during development. Before a public release, switch the
 * map tiles to a provider that allows app traffic (OpenStreetMap's own tile servers
 * forbid distributing apps that use them) — see docs/RELEASE.md.
 *
 * Fuel stations and toll plazas are NOT fetched online: they ship inside the app as
 * an OpenStreetMap extract (src/data/poi-za.json, rebuilt by scripts/build-poi-dataset.mjs).
 */
const env = import.meta.env || {}

export const mapsConfig = Object.freeze({
  /** Place search (Photon by Komoot, OSM data); Nominatim is the automatic fallback. */
  geocoderUrl: env.VITE_GEOCODER_URL || 'https://photon.komoot.io',
  fallbackGeocoderUrl: env.VITE_FALLBACK_GEOCODER_URL || 'https://nominatim.openstreetmap.org',
  /** OSRM-compatible car routing (FOSSGIS community server). */
  routerUrl: env.VITE_ROUTER_URL || 'https://routing.openstreetmap.de/routed-car',
  /** Raster tiles. {s}/{z}/{x}/{y} placeholders as used by Leaflet. */
  tileUrl: env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  tileAttribution: env.VITE_MAP_TILE_ATTRIBUTION || '&copy; OpenStreetMap contributors',
  /** Bias place search towards South Africa. */
  searchBias: Object.freeze({ lat: -29.0, lon: 24.0 }),
  countryCodes: Object.freeze(['ZA', 'LS', 'SZ', 'NA', 'BW', 'ZW', 'MZ']),
  requestTimeoutMs: 20000,
  /** Shorter wait for the primary geocoder so the fallback kicks in quickly. */
  geocoderTimeoutMs: 7000,
  /** As-you-type suggestions give up quickly; offline suggestions are already shown. */
  suggestTimeoutMs: 4000,
})
