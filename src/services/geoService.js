import { mapsConfig } from '../config/maps.js'

/**
 * Online geo services for the route planner (OpenStreetMap ecosystem):
 *  - place search: Photon (komoot) with Nominatim as automatic fallback, biased to
 *    southern Africa (searches run only on submit — Nominatim allows 1 request/s)
 *  - car routing: OSRM (FOSSGIS server)
 *  - current position: @capacitor/geolocation (only when the user asks)
 *
 * Only the typed search text, the chosen start/destination coordinates and, if the
 * user taps "Use my location", their position are sent. No fuel log data ever is.
 */

export class GeoServiceError extends Error {
  constructor(message, cause) {
    super(message)
    this.name = 'GeoServiceError'
    if (cause) this.cause = cause
  }
}

async function getJson(url, timeoutMs = mapsConfig.requestTimeoutMs, signal) {
  let response
  try {
    const timeout = AbortSignal.timeout(timeoutMs)
    response = await fetch(url, { signal: signal ? AbortSignal.any([timeout, signal]) : timeout, headers: { Accept: 'application/json' } })
  } catch (error) {
    if (signal?.aborted) throw error // superseded by a newer request; callers ignore this
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false
    throw new GeoServiceError(
      offline ? 'You appear to be offline. Route planning needs an internet connection.' : 'The map service did not respond. Please try again.',
      error,
    )
  }
  if (!response.ok) throw new GeoServiceError(`The map service returned an error (${response.status}). Please try again later.`)
  return response.json()
}

/** Human-readable one-line label for a Photon feature. */
export function placeLabel(props = {}) {
  const parts = [props.name, props.street && props.housenumber ? `${props.street} ${props.housenumber}` : props.street, props.city || props.town || props.district, props.state]
  return [...new Set(parts.filter(Boolean))].join(', ') || 'Unnamed place'
}

/** Converts a Photon GeoJSON response into place objects, southern Africa first. */
export function parsePhotonResults(geojson, countryCodes = mapsConfig.countryCodes) {
  const places = (geojson?.features || [])
    .filter((f) => f?.geometry?.type === 'Point')
    .map((f) => ({
      lat: f.geometry.coordinates[1],
      lon: f.geometry.coordinates[0],
      label: placeLabel(f.properties),
      countryCode: (f.properties?.countrycode || '').toUpperCase(),
    }))
  const local = places.filter((p) => countryCodes.includes(p.countryCode))
  return local.length ? local : places
}

/**
 * As-you-type suggestions from Photon (Nominatim's policy forbids autocomplete, so
 * there is no fallback here — offline place suggestions cover outages).
 * Pass an AbortSignal to cancel superseded requests.
 */
export async function suggestPlaces(query, { near, signal } = {}) {
  const q = (query || '').trim()
  if (q.length < 3) return []
  const bias = near || mapsConfig.searchBias
  const url = `${mapsConfig.geocoderUrl}/api/?q=${encodeURIComponent(q)}&limit=6&lang=en&lat=${bias.lat}&lon=${bias.lon}`
  return parsePhotonResults(await getJson(url, mapsConfig.suggestTimeoutMs, signal)).map((p) => ({ ...p, source: 'online' }))
}

/** Shortens a Nominatim display name to its first few meaningful parts. */
export function shortNominatimLabel(item) {
  const parts = String(item?.display_name || '').split(',').map((s) => s.trim()).filter(Boolean)
  // Drop postcodes, ward numbers and municipality names, which only add noise.
  const kept = [...new Set(parts.filter((p) => !/^\d{4}$/.test(p) && !/\bward \d+/i.test(p) && !/municipality/i.test(p)))]
  return kept.slice(0, 3).join(', ') || item?.name || 'Unnamed place'
}

/** Converts a Nominatim jsonv2 response into place objects. */
export function parseNominatimResults(items) {
  return (Array.isArray(items) ? items : items ? [items] : [])
    .filter((i) => i && Number.isFinite(Number(i.lat)) && Number.isFinite(Number(i.lon)))
    .map((i) => ({
      lat: Number(i.lat),
      lon: Number(i.lon),
      label: shortNominatimLabel(i),
      countryCode: (i.address?.country_code || '').toUpperCase(),
    }))
}

/**
 * Searches for places matching `query`. Call on submit, not per keystroke.
 * Tries Photon first and falls back to Nominatim if Photon is slow or failing.
 */
export async function searchPlaces(query, { near } = {}) {
  const q = (query || '').trim()
  if (q.length < 2) return []
  const bias = near || mapsConfig.searchBias
  try {
    const url = `${mapsConfig.geocoderUrl}/api/?q=${encodeURIComponent(q)}&limit=8&lang=en&lat=${bias.lat}&lon=${bias.lon}`
    return parsePhotonResults(await getJson(url, mapsConfig.geocoderTimeoutMs))
  } catch (primaryError) {
    const countries = mapsConfig.countryCodes.join(',').toLowerCase()
    const url = `${mapsConfig.fallbackGeocoderUrl}/search?q=${encodeURIComponent(q)}&format=jsonv2&limit=8&addressdetails=1&accept-language=en&countrycodes=${countries}`
    try {
      return parseNominatimResults(await getJson(url))
    } catch {
      throw primaryError
    }
  }
}

/** Address label for a coordinate (used for "Use my location"). */
export async function reverseGeocode({ lat, lon }) {
  try {
    const results = parsePhotonResults(await getJson(`${mapsConfig.geocoderUrl}/reverse?lat=${lat}&lon=${lon}&lang=en`, mapsConfig.geocoderTimeoutMs))
    if (results[0]) return results[0].label
  } catch {
    // fall through to Nominatim
  }
  try {
    const results = parseNominatimResults(await getJson(`${mapsConfig.fallbackGeocoderUrl}/reverse?lat=${lat}&lon=${lon}&format=jsonv2&accept-language=en&zoom=16`))
    return results[0]?.label || 'My location'
  } catch {
    return 'My location'
  }
}

/** Parses an OSRM route response. */
export function parseOsrmRoute(json) {
  if (json?.code !== 'Ok' || !json.routes?.length) {
    throw new GeoServiceError(json?.code === 'NoRoute' ? 'No driving route was found between these places.' : 'Could not plan a route between these places.')
  }
  const r = json.routes[0]
  return {
    distanceKm: r.distance / 1000,
    durationMin: r.duration / 60,
    points: r.geometry.coordinates.map(([lon, lat]) => ({ lat, lon })),
  }
}

/** Driving route from origin to destination with the full road geometry. */
export async function fetchRoute(origin, destination) {
  const coords = `${origin.lon},${origin.lat};${destination.lon},${destination.lat}`
  return parseOsrmRoute(await getJson(`${mapsConfig.routerUrl}/route/v1/driving/${coords}?overview=full&geometries=geojson`))
}

/** Current device position (asks for location permission the first time). */
export async function getCurrentPosition() {
  const { Capacitor } = await import('@capacitor/core')
  if (Capacitor.isNativePlatform()) {
    const { Geolocation } = await import('@capacitor/geolocation')
    let status = await Geolocation.checkPermissions()
    if (status.location !== 'granted' && status.coarseLocation !== 'granted') {
      status = await Geolocation.requestPermissions({ permissions: ['location', 'coarseLocation'] })
    }
    if (status.location !== 'granted' && status.coarseLocation !== 'granted') {
      throw new GeoServiceError('Location permission was not granted. Search for your start point instead.')
    }
    // A recent fix is fine for a trip's start point. Try the quick network-based fix
    // first; devices without one (emulators, poor coverage) fall back to GPS.
    const attempts = [
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 10 * 60 * 1000 },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 10 * 60 * 1000 },
    ]
    for (const options of attempts) {
      try {
        const pos = await Geolocation.getCurrentPosition(options)
        return { lat: pos.coords.latitude, lon: pos.coords.longitude }
      } catch {
        // try the next, more accurate method
      }
    }
    throw new GeoServiceError("Couldn't get your location. Check that location is switched on, or search for your start point.")
  }
  if (!navigator.geolocation) throw new GeoServiceError('Location is not available on this device.')
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => reject(new GeoServiceError('Could not get your location. Search for your start point instead.')),
      { timeout: 15000, maximumAge: 60000 },
    )
  })
}

/** Opens Google Maps (app if installed) with the given directions URL. */
export async function openExternalNavigation(url) {
  const { Capacitor } = await import('@capacitor/core')
  if (Capacitor.isNativePlatform()) {
    const { AppLauncher } = await import('@capacitor/app-launcher')
    await AppLauncher.openUrl({ url })
    return
  }
  window.open(url, '_blank', 'noopener')
}
