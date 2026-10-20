/**
 * Compact bundled dataset of fuel stations and toll plazas (OpenStreetMap, ODbL).
 *
 * File format (src/data/poi-za.json):
 *   { version, generated, osmBase, attribution, brands: [..],
 *     fuel: [[lat×1e5, lon×1e5, brandIndex|-1, name|null], ...],
 *     tolls: [[lat×1e5, lon×1e5, name|null], ...] }
 * Integer coordinates (≈1 m precision) keep the file small.
 */
export const POI_DATASET_VERSION = 1
const SCALE = 1e5

function coordsOf(el) {
  if (Number.isFinite(el.lat) && Number.isFinite(el.lon)) return { lat: el.lat, lon: el.lon }
  if (el.center && Number.isFinite(el.center.lat)) return { lat: el.center.lat, lon: el.center.lon }
  return null
}

const clean = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/**
 * Gauteng's e-Toll gantries are still mapped as toll booths in OpenStreetMap, but
 * e-tolling was switched off in 2024 — showing them would mislead drivers.
 */
export const isDecommissionedToll = (name) => /^e-?toll\b/i.test(name || '')

/** Builds the compact dataset from Overpass `elements` (used by the build script). */
export function compactPoiDataset(elements, { osmBase = null, generated = new Date().toISOString() } = {}) {
  const brands = []
  const brandIndex = new Map()
  const fuel = []
  const tolls = []
  const seen = new Set()
  for (const el of elements || []) {
    const tags = el.tags || {}
    const p = coordsOf(el)
    if (!p) continue
    const lat = Math.round(p.lat * SCALE)
    const lon = Math.round(p.lon * SCALE)
    if (tags.amenity === 'fuel') {
      const dedupe = `f:${lat}:${lon}`
      if (seen.has(dedupe)) continue
      seen.add(dedupe)
      const brand = clean(tags.brand) || clean(tags.operator)
      let bi = -1
      if (brand) {
        if (!brandIndex.has(brand)) {
          brandIndex.set(brand, brands.length)
          brands.push(brand)
        }
        bi = brandIndex.get(brand)
      }
      const name = clean(tags.name)
      fuel.push([lat, lon, bi, name && name !== brand ? name : null])
    } else if (tags.barrier === 'toll_booth') {
      if (isDecommissionedToll(tags.name)) continue
      const dedupe = `t:${lat}:${lon}`
      if (seen.has(dedupe)) continue
      seen.add(dedupe)
      tolls.push([lat, lon, clean(tags.name)])
    }
  }
  return {
    version: POI_DATASET_VERSION,
    generated,
    osmBase,
    attribution: '© OpenStreetMap contributors, available under the Open Database License (ODbL)',
    brands,
    fuel,
    tolls,
  }
}

/** Expands the compact dataset into station / plaza objects. */
export function expandPoiDataset(data) {
  if (!data || data.version !== POI_DATASET_VERSION) {
    throw new Error('Fuel station data is missing or from an incompatible version.')
  }
  const stations = data.fuel.map(([lat, lon, bi, name], i) => {
    const brand = bi >= 0 ? data.brands[bi] : null
    return { id: `f${i}`, lat: lat / SCALE, lon: lon / SCALE, brand, name: name || brand || 'Fuel station' }
  })
  const tolls = data.tolls.map(([lat, lon, name], i) => ({ id: `t${i}`, lat: lat / SCALE, lon: lon / SCALE, name }))
  return { stations, tolls, generated: data.generated, osmBase: data.osmBase, attribution: data.attribution }
}

let cache = null

/** Lazily loads the bundled dataset (kept out of the main JS chunk). */
export async function loadPoiDataset() {
  if (!cache) {
    cache = import('../data/poi-za.json').then((m) => expandPoiDataset(m.default || m))
    cache.catch(() => {
      cache = null
    })
  }
  return cache
}
