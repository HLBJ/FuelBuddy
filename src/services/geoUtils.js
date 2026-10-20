/**
 * Small geometry helpers for routes on the earth's surface. Points are
 * `{ lat, lon }` in degrees; distances are kilometres.
 */
const EARTH_RADIUS_KM = 6371.0088
const toRad = (deg) => (deg * Math.PI) / 180

export function haversineKm(a, b) {
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Cumulative distance (km) at every vertex of a polyline. */
export function cumulativeDistances(points) {
  const out = new Array(points.length)
  let total = 0
  for (let i = 0; i < points.length; i += 1) {
    if (i > 0) total += haversineKm(points[i - 1], points[i])
    out[i] = total
  }
  return out
}

/**
 * Keeps a vertex roughly every `spacingKm` along the line (plus both ends). Used to
 * cut a 10 000-vertex OSRM geometry down before matching stations against it.
 */
export function resampleLine(points, spacingKm) {
  if (points.length <= 2) return points.slice()
  const out = [points[0]]
  let since = 0
  for (let i = 1; i < points.length - 1; i += 1) {
    since += haversineKm(points[i - 1], points[i])
    if (since >= spacingKm) {
      out.push(points[i])
      since = 0
    }
  }
  out.push(points[points.length - 1])
  return out
}

export function boundsOf(points) {
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat
    if (p.lat > maxLat) maxLat = p.lat
    if (p.lon < minLon) minLon = p.lon
    if (p.lon > maxLon) maxLon = p.lon
  }
  return { minLat, maxLat, minLon, maxLon }
}

/**
 * Closest point on segment a→b to p, using a local flat projection (accurate for
 * the few-kilometre detours this app cares about).
 * @returns {{ distanceKm: number, t: number }} t ∈ [0,1] along the segment
 */
export function pointToSegment(p, a, b) {
  const kx = 111.32 * Math.cos(toRad((a.lat + b.lat) / 2))
  const ky = 110.574
  const ax = a.lon * kx, ay = a.lat * ky
  const bx = b.lon * kx, by = b.lat * ky
  const px = p.lon * kx, py = p.lat * ky
  const dx = bx - ax, dy = by - ay
  const len2 = dx * dx + dy * dy
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0
  t = Math.max(0, Math.min(1, t))
  const cx = ax + t * dx, cy = ay + t * dy
  return { distanceKm: Math.hypot(px - cx, py - cy), t }
}

/**
 * Indexes a route so many points can be matched to it quickly.
 * `project(p, maxKm)` returns `{ alongKm, offsetKm }` for the nearest point of the
 * route within `maxKm`, or null when the point is farther away.
 */
export function createRouteIndex(points, { cellDeg = 0.05 } = {}) {
  const cum = cumulativeDistances(points)
  const grid = new Map()
  const key = (ix, iy) => `${ix}:${iy}`
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i], b = points[i + 1]
    const x0 = Math.floor(Math.min(a.lon, b.lon) / cellDeg), x1 = Math.floor(Math.max(a.lon, b.lon) / cellDeg)
    const y0 = Math.floor(Math.min(a.lat, b.lat) / cellDeg), y1 = Math.floor(Math.max(a.lat, b.lat) / cellDeg)
    for (let x = x0; x <= x1; x += 1) {
      for (let y = y0; y <= y1; y += 1) {
        const k = key(x, y)
        if (!grid.has(k)) grid.set(k, [])
        grid.get(k).push(i)
      }
    }
  }

  return {
    totalKm: cum[cum.length - 1] || 0,
    project(p, maxKm) {
      // Search the cells that can contain a segment within maxKm of p.
      const reach = Math.ceil(maxKm / (cellDeg * 100)) + 1
      const cx = Math.floor(p.lon / cellDeg), cy = Math.floor(p.lat / cellDeg)
      let best = null
      const seen = new Set()
      for (let x = cx - reach; x <= cx + reach; x += 1) {
        for (let y = cy - reach; y <= cy + reach; y += 1) {
          for (const i of grid.get(key(x, y)) || []) {
            if (seen.has(i)) continue
            seen.add(i)
            const { distanceKm, t } = pointToSegment(p, points[i], points[i + 1])
            if (distanceKm <= maxKm && (!best || distanceKm < best.offsetKm)) {
              best = { offsetKm: distanceKm, alongKm: cum[i] + t * (cum[i + 1] - cum[i]) }
            }
          }
        }
      }
      return best
    },
  }
}
