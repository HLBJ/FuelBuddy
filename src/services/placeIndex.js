/**
 * Offline place suggestions (South African cities, towns, villages and suburbs) for
 * instant autocomplete. Data: GeoNames (CC BY 4.0), bundled as src/data/places-za.json
 * by scripts/build-places-dataset.mjs.
 *
 * Format: { version, generated, attribution, provinces: [..],
 *           places: [[name, lat×1e5, lon×1e5, provinceIndex, weight], ...] }
 */
export const PLACES_DATASET_VERSION = 1
const SCALE = 1e5

// Ranking weight by GeoNames feature code: capitals and big towns before suburbs.
const FEATURE_WEIGHT = { PPLC: 100, PPLA: 90, PPLA2: 80, PPLA3: 70, PPL: 40, PPLX: 30, PPLL: 20, PPLF: 10 }
const EXCLUDED = new Set(['PPLH', 'PPLQ', 'PPLW', 'PPLCH']) // historical, abandoned, destroyed

/** Lower-case, accent-free text for matching. */
export function normaliseText(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Builds the compact dataset from GeoNames country-dump rows (tab-separated, as in
 * ZA.txt) and admin1 names ({ '06': 'Gauteng', ... }).
 */
export function compactPlacesDataset(rows, admin1Names, { generated = new Date().toISOString() } = {}) {
  const provinces = []
  const provIndex = new Map()
  const kept = []
  for (const row of rows) {
    const f = row.split('\t')
    if (f.length < 15 || f[6] !== 'P' || EXCLUDED.has(f[7])) continue
    const name = f[1].trim()
    const lat = Number(f[4]), lon = Number(f[5])
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) continue
    const province = admin1Names[f[10]] || null
    let pi = -1
    if (province) {
      if (!provIndex.has(province)) {
        provIndex.set(province, provinces.length)
        provinces.push(province)
      }
      pi = provIndex.get(province)
    }
    const population = Number(f[14]) || 0
    const weight = Math.round((FEATURE_WEIGHT[f[7]] ?? 30) + Math.log10(population + 1) * 5 - (/\d/.test(name) ? 15 : 0))
    kept.push({ name, lat, lon, pi, weight })
  }
  // Merge duplicates: same name in the same province within ~5 km; keep the heavier one.
  kept.sort((a, b) => b.weight - a.weight)
  const places = []
  const seen = new Map()
  for (const p of kept) {
    const key = `${normaliseText(p.name)}|${p.pi}`
    const near = (seen.get(key) || []).some((q) => Math.abs(q.lat - p.lat) < 0.05 && Math.abs(q.lon - p.lon) < 0.05)
    if (near) continue
    if (!seen.has(key)) seen.set(key, [])
    seen.get(key).push(p)
    places.push([p.name, Math.round(p.lat * SCALE), Math.round(p.lon * SCALE), p.pi, p.weight])
  }
  return {
    version: PLACES_DATASET_VERSION,
    generated,
    attribution: 'Place names: GeoNames (geonames.org), CC BY 4.0',
    provinces,
    places,
  }
}

/** Creates a search index over the compact dataset. */
export function createPlaceIndex(data) {
  if (!data || data.version !== PLACES_DATASET_VERSION) throw new Error('Place data is missing or incompatible.')
  const entries = data.places.map(([name, lat, lon, pi, weight]) => {
    const norm = normaliseText(name)
    return { name, lat: lat / SCALE, lon: lon / SCALE, province: pi >= 0 ? data.provinces[pi] : null, weight, norm, words: norm.split(' ') }
  })

  return {
    size: entries.length,
    /**
     * Places whose name (or a word in it) starts with the query, best first:
     * exact name > name prefix > word prefix, then by importance.
     */
    search(query, limit = 6) {
      const q = normaliseText(query)
      if (q.length < 2) return []
      const scored = []
      for (const e of entries) {
        let score
        if (e.norm === q) score = 3000
        else if (e.norm.startsWith(q)) score = 2000
        else if (q.length >= 3 && e.words.some((w) => w.startsWith(q))) score = 1000
        else continue
        scored.push({ e, s: score + e.weight })
      }
      scored.sort((a, b) => b.s - a.s || a.e.name.length - b.e.name.length)
      return scored.slice(0, limit).map(({ e }) => ({
        lat: e.lat,
        lon: e.lon,
        label: e.province ? `${e.name}, ${e.province}` : e.name,
        countryCode: 'ZA',
        source: 'offline',
      }))
    },
  }
}

/**
 * Offline suggestions first, then online ones that are not the same place (same
 * leading name within ~2 km), capped at `limit`.
 */
export function mergeSuggestions(offline, online, limit = 8) {
  const out = [...(offline || [])]
  const head = (label) => normaliseText(String(label).split(',')[0])
  for (const o of online || []) {
    const dup = out.some((p) => head(p.label) === head(o.label) && Math.abs(p.lat - o.lat) < 0.02 && Math.abs(p.lon - o.lon) < 0.02)
    if (!dup) out.push(o)
  }
  return out.slice(0, limit)
}

let cache = null

/** Lazily loads the bundled place index (kept out of the startup bundle). */
export function loadPlaceIndex() {
  if (!cache) {
    cache = import('../data/places-za.json').then((m) => createPlaceIndex(m.default || m))
    cache.catch(() => {
      cache = null
    })
  }
  return cache
}
