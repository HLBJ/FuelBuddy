import { createRouteIndex, haversineKm } from './geoUtils.js'
import { roundTo } from './numberUtils.js'

/**
 * Pure route-planning logic: matching bundled fuel stations / toll plazas to a route,
 * choosing well-spaced fuel stops, and building the Google Maps hand-off link.
 * Network access lives in geoService.js; this module is fully testable offline.
 */

export const PLANNER_LIMITS = Object.freeze({
  maxStops: 9, // Google Maps Android accepts up to 9 waypoints
  maxStationDetourKm: 3,
  maxTollOffsetKm: 0.15, // booths are on the carriageway; further away is another road
  /** Plan stops before the tank is this full-range fraction empty. */
  usableRangeFraction: 0.75,
  defaultLegKm: 400,
})

/** Estimated distance (km) on a full tank, or null when it cannot be known. */
export function vehicleRangeKm(tankCapacity, consumption) {
  if (!(tankCapacity > 0) || !(consumption > 0)) return null
  return roundTo((tankCapacity / consumption) * 100, 0)
}

/**
 * Suggested number of fuel stops for a trip: enough that no leg exceeds the
 * usable part of the vehicle's range (or ~400 km when the range is unknown).
 */
export function suggestStopCount(totalKm, rangeKm) {
  if (!(totalKm > 0)) return 0
  const leg = rangeKm > 0 ? rangeKm * PLANNER_LIMITS.usableRangeFraction : PLANNER_LIMITS.defaultLegKm
  return Math.min(PLANNER_LIMITS.maxStops, Math.max(0, Math.ceil(totalKm / leg) - 1))
}

/**
 * Stations within `maxDetourKm` of the route, sorted by distance along it.
 * @param {Array<{lat,lon}>} routePoints
 * @param {Array<{id,lat,lon,name,brand}>} stations
 */
export function stationsAlongRoute(routePoints, stations, { maxDetourKm = PLANNER_LIMITS.maxStationDetourKm, index } = {}) {
  const idx = index || createRouteIndex(routePoints)
  const out = []
  for (const s of stations || []) {
    const hit = idx.project(s, maxDetourKm)
    if (hit) out.push({ ...s, alongKm: roundTo(hit.alongKm, 1), detourKm: roundTo(hit.offsetKm, 2) })
  }
  return out.sort((a, b) => a.alongKm - b.alongKm)
}

/**
 * Toll plazas on the route. OSM often maps one plaza as several booth nodes (and
 * ramp booths without a name), so booths within 1 km of each other along the route
 * are merged, and an unnamed booth within 6 km of a named plaza joins that plaza.
 */
export function tollPlazasAlongRoute(routePoints, tolls, { maxOffsetKm = PLANNER_LIMITS.maxTollOffsetKm, index } = {}) {
  const idx = index || createRouteIndex(routePoints)
  const hits = []
  for (const t of tolls || []) {
    const hit = idx.project(t, maxOffsetKm)
    if (hit) hits.push({ ...t, alongKm: roundTo(hit.alongKm, 1) })
  }
  hits.sort((a, b) => a.alongKm - b.alongKm)
  const plazas = []
  for (const h of hits) {
    const last = plazas[plazas.length - 1]
    const gap = last ? h.alongKm - last.alongKm : Infinity
    const related = last && (!last.name || !h.name || last.name === h.name)
    if (gap <= 1 || (related && gap <= 6)) {
      // Keep the named booth's position for the merged plaza.
      if (!last.name && h.name) plazas[plazas.length - 1] = { ...h }
      continue
    }
    plazas.push({ ...h })
  }
  return plazas
}

/**
 * Picks `count` fuel stops spread evenly along the route. Each target point
 * (i/(count+1) of the way) takes the candidate that minimises distance from the
 * target plus a penalty for leaving the road; stops stay in route order.
 * @returns {Array} chosen candidates (may be fewer than `count` on sparse routes)
 */
export function chooseBestStops(candidates, count, totalKm, { detourPenalty = 8, minGapKm = 15 } = {}) {
  const n = Math.max(0, Math.min(PLANNER_LIMITS.maxStops, Math.floor(count || 0)))
  if (!n || !(totalKm > 0) || !candidates?.length) return []
  const chosen = []
  let lastAlong = -Infinity
  for (let i = 1; i <= n; i += 1) {
    const target = (totalKm * i) / (n + 1)
    let best = null
    let bestCost = Infinity
    for (const c of candidates) {
      if (c.alongKm <= lastAlong + minGapKm || chosen.includes(c)) continue
      const cost = Math.abs(c.alongKm - target) + detourPenalty * c.detourKm
      if (cost < bestCost) {
        best = c
        bestCost = cost
      }
    }
    if (best) {
      chosen.push(best)
      lastAlong = best.alongKm
    }
  }
  return chosen
}

/**
 * Leg distances between start, stops and destination, flagging any leg longer
 * than the vehicle's usable range.
 */
export function legsForStops(stops, totalKm, rangeKm) {
  const marks = [0, ...[...stops].sort((a, b) => a.alongKm - b.alongKm).map((s) => s.alongKm), totalKm]
  const usable = rangeKm > 0 ? rangeKm * PLANNER_LIMITS.usableRangeFraction : null
  const legs = []
  for (let i = 1; i < marks.length; i += 1) {
    const km = roundTo(marks[i] - marks[i - 1], 1)
    legs.push({ km, tooLong: usable !== null && km > usable })
  }
  return legs
}

const fmt = (p) => `${roundTo(p.lat, 6)},${roundTo(p.lon, 6)}`

/**
 * Google Maps directions link (opens the Google Maps app on Android) with the
 * chosen stops as waypoints, in route order.
 */
export function googleMapsDirectionsUrl(origin, destination, stops = []) {
  const ordered = [...stops].sort((a, b) => (a.alongKm ?? 0) - (b.alongKm ?? 0)).slice(0, PLANNER_LIMITS.maxStops)
  const params = new URLSearchParams({ api: '1', origin: fmt(origin), destination: fmt(destination), travelmode: 'driving' })
  if (ordered.length) params.set('waypoints', ordered.map(fmt).join('|'))
  return `https://www.google.com/maps/dir/?${params.toString()}`
}

/** Straight-line sanity check used to reject identical start/destination. */
export function isSamePlace(a, b, toleranceKm = 0.2) {
  return Boolean(a && b) && haversineKm(a, b) < toleranceKm
}
