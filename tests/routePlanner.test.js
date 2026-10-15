import { describe, expect, it } from 'vitest'
import { createRouteIndex, cumulativeDistances, haversineKm, pointToSegment, resampleLine } from '../src/services/geoUtils.js'
import {
  PLANNER_LIMITS, chooseBestStops, googleMapsDirectionsUrl, isSamePlace, legsForStops, stationsAlongRoute,
  suggestStopCount, tollPlazasAlongRoute, vehicleRangeKm,
} from '../src/services/routePlannerService.js'
import { compactPoiDataset, expandPoiDataset } from '../src/services/poiDataset.js'
import { parseNominatimResults, parseOsrmRoute, parsePhotonResults, placeLabel, shortNominatimLabel } from '../src/services/geoService.js'

// A straight north-south "road" along longitude 28°E: 0.9° of latitude ≈ 100 km.
const KM_PER_DEG_LAT = 111.195
const road = Array.from({ length: 101 }, (_, i) => ({ lat: -26 - i * 0.009, lon: 28 }))
const kmToLat = (km) => -26 - km / KM_PER_DEG_LAT
const kmToLonOffset = (km, lat = -26.45) => km / (111.32 * Math.cos((lat * Math.PI) / 180))
const station = (id, alongKm, offKm = 0) => ({ id, lat: kmToLat(alongKm), lon: 28 + kmToLonOffset(offKm), name: id })

describe('geo utilities', () => {
  it('measures great-circle distance', () => {
    // Johannesburg → Cape Town is ~1 270 km as the crow flies.
    expect(haversineKm({ lat: -26.2041, lon: 28.0473 }, { lat: -33.9249, lon: 18.4241 })).toBeGreaterThan(1255)
    expect(haversineKm({ lat: -26.2041, lon: 28.0473 }, { lat: -33.9249, lon: 18.4241 })).toBeLessThan(1275)
    expect(haversineKm({ lat: 0, lon: 0 }, { lat: 0, lon: 0 })).toBe(0)
  })

  it('accumulates and resamples a polyline', () => {
    const cum = cumulativeDistances(road)
    expect(cum[0]).toBe(0)
    expect(cum[100]).toBeCloseTo(100, 0)
    const coarse = resampleLine(road, 10)
    expect(coarse[0]).toEqual(road[0])
    expect(coarse[coarse.length - 1]).toEqual(road[100])
    expect(coarse.length).toBeGreaterThan(8)
    expect(coarse.length).toBeLessThan(15)
  })

  it('projects points onto a segment', () => {
    const a = { lat: -26, lon: 28 }, b = { lat: -26.9, lon: 28 }
    const mid = pointToSegment({ lat: -26.45, lon: 28 + kmToLonOffset(2) }, a, b)
    expect(mid.distanceKm).toBeCloseTo(2, 1)
    expect(mid.t).toBeCloseTo(0.5, 2)
    expect(pointToSegment({ lat: -25, lon: 28 }, a, b).t).toBe(0) // clamped before the start
  })

  it('indexes a route to find along-distance and offset', () => {
    const idx = createRouteIndex(road)
    expect(idx.totalKm).toBeCloseTo(100, 0)
    const hit = idx.project(station('x', 40, 1.5), 3)
    expect(hit.alongKm).toBeCloseTo(40, 0)
    expect(hit.offsetKm).toBeCloseTo(1.5, 1)
    expect(idx.project(station('far', 40, 10), 3)).toBeNull()
  })
})

describe('route planner', () => {
  it('estimates vehicle range from tank and consumption', () => {
    expect(vehicleRangeKm(45, 7.5)).toBe(600)
    expect(vehicleRangeKm(null, 7.5)).toBeNull()
    expect(vehicleRangeKm(45, 0)).toBeNull()
  })

  it('suggests enough stops for the usable range', () => {
    // 1 450 km with a 600 km tank: usable 450 km per leg → 4 legs → 3 stops
    expect(suggestStopCount(1450, 600)).toBe(3)
    expect(suggestStopCount(300, 600)).toBe(0)
    // Unknown range: one stop per ~400 km
    expect(suggestStopCount(1450, null)).toBe(3)
    expect(suggestStopCount(99999, 300)).toBe(PLANNER_LIMITS.maxStops)
    expect(suggestStopCount(0, 600)).toBe(0)
  })

  it('keeps only stations near the route, in route order', () => {
    const stations = [station('late', 80), station('early', 10, 0.5), station('far', 50, 8), station('mid', 50, 2.5)]
    const found = stationsAlongRoute(road, stations)
    expect(found.map((s) => s.id)).toEqual(['early', 'mid', 'late'])
    expect(found[0].alongKm).toBeCloseTo(10, 0)
    expect(found[1].detourKm).toBeCloseTo(2.5, 1)
  })

  it('chooses evenly spaced stops, preferring stations on the road', () => {
    const cands = stationsAlongRoute(road, [
      station('a', 24), station('b', 26, 2.5), station('c', 49, 0.2), station('d', 51, 0), station('e', 76),
    ])
    // 3 stops on 100 km → targets at 25, 50, 75 km
    const best = chooseBestStops(cands, 3, 100).map((s) => s.id)
    // a and b are both 1 km from the 25 km target; a is on the road, b 2.5 km off it
    expect(best).toEqual(['a', 'd', 'e'])
  })

  it('returns fewer stops when the route has too few stations', () => {
    const cands = stationsAlongRoute(road, [station('only', 50)])
    expect(chooseBestStops(cands, 3, 100).map((s) => s.id)).toEqual(['only'])
    expect(chooseBestStops([], 3, 100)).toEqual([])
    expect(chooseBestStops(cands, 0, 100)).toEqual([])
  })

  it('never picks two stops right next to each other', () => {
    const cands = stationsAlongRoute(road, [station('x', 30), station('y', 32), station('z', 34)])
    const best = chooseBestStops(cands, 2, 100)
    expect(best).toHaveLength(1)
  })

  it('flags legs longer than the usable range', () => {
    const legs = legsForStops([{ alongKm: 300 }], 1000, 600)
    expect(legs).toEqual([{ km: 300, tooLong: false }, { km: 700, tooLong: true }])
    expect(legsForStops([], 1000, null)).toEqual([{ km: 1000, tooLong: false }])
  })

  it('merges toll booths belonging to the same plaza', () => {
    const tolls = [
      { id: 't1', lat: kmToLat(40), lon: 28, name: 'Grasmere Plaza' },
      { id: 't2', lat: kmToLat(40.3), lon: 28 + kmToLonOffset(0.05), name: null },
      { id: 't3', lat: kmToLat(90), lon: 28, name: null },
      { id: 'off', lat: kmToLat(60), lon: 28 + kmToLonOffset(2), name: 'Other road' },
    ]
    const plazas = tollPlazasAlongRoute(road, tolls)
    expect(plazas.map((p) => p.name)).toEqual(['Grasmere Plaza', null])
    expect(plazas[1].alongKm).toBeCloseTo(90, 0)
  })

  it('folds an unnamed ramp booth into a nearby named plaza, but keeps separate named plazas', () => {
    const tolls = [
      { id: 'a', lat: kmToLat(20), lon: 28, name: 'Huguenot' },
      { id: 'b', lat: kmToLat(25), lon: 28, name: null },
      { id: 'c', lat: kmToLat(30), lon: 28, name: 'Other Plaza' },
    ]
    expect(tollPlazasAlongRoute(road, tolls).map((p) => p.name)).toEqual(['Huguenot', 'Other Plaza'])
  })

  it('builds a Google Maps link with ordered waypoints', () => {
    const url = new URL(googleMapsDirectionsUrl({ lat: -25.7461, lon: 28.1881 }, { lat: -33.9249, lon: 18.4241 }, [
      { lat: -29.1, lon: 26.2, alongKm: 400 }, { lat: -27, lon: 27.5, alongKm: 150 },
    ]))
    expect(url.origin + url.pathname).toBe('https://www.google.com/maps/dir/')
    expect(url.searchParams.get('api')).toBe('1')
    expect(url.searchParams.get('origin')).toBe('-25.7461,28.1881')
    expect(url.searchParams.get('destination')).toBe('-33.9249,18.4241')
    expect(url.searchParams.get('waypoints')).toBe('-27,27.5|-29.1,26.2')
    expect(url.searchParams.get('travelmode')).toBe('driving')
    const noStops = new URL(googleMapsDirectionsUrl({ lat: 1, lon: 2 }, { lat: 3, lon: 4 }))
    expect(noStops.searchParams.has('waypoints')).toBe(false)
  })

  it('detects identical start and destination', () => {
    expect(isSamePlace({ lat: -26, lon: 28 }, { lat: -26.0005, lon: 28 })).toBe(true)
    expect(isSamePlace({ lat: -26, lon: 28 }, { lat: -26.5, lon: 28 })).toBe(false)
    expect(isSamePlace(null, { lat: 1, lon: 1 })).toBe(false)
  })
})

describe('bundled POI dataset', () => {
  const elements = [
    { type: 'node', id: 1, lat: -26.1, lon: 28.05, tags: { amenity: 'fuel', brand: 'Engen', name: 'Engen Rivonia' } },
    { type: 'way', id: 2, center: { lat: -26.2, lon: 28.06 }, tags: { amenity: 'fuel', brand: 'Shell', name: 'Shell' } },
    { type: 'node', id: 3, lat: -26.1, lon: 28.05, tags: { amenity: 'fuel', brand: 'Engen' } }, // duplicate position
    { type: 'node', id: 4, lat: -26.3, lon: 28.07, tags: { amenity: 'fuel' } },
    { type: 'node', id: 5, lat: -25.9, lon: 28.2, tags: { barrier: 'toll_booth', name: 'Pumulani' } },
    { type: 'node', id: 6, lat: -25.8, lon: 28.2, tags: { highway: 'traffic_signals' } },
    { type: 'node', id: 8, lat: -26.0, lon: 28.1, tags: { barrier: 'toll_booth', name: 'e-Toll Phakwe' } }, // decommissioned
    { type: 'way', id: 7, tags: { amenity: 'fuel' } }, // no coordinates
  ]

  it('round-trips through the compact format', () => {
    const compact = compactPoiDataset(elements, { osmBase: '2026-10-14T20:21:12Z', generated: 'x' })
    expect(compact.fuel).toHaveLength(3)
    expect(compact.tolls).toHaveLength(1)
    expect(compact.brands).toEqual(['Engen', 'Shell'])
    const { stations, tolls, osmBase } = expandPoiDataset(JSON.parse(JSON.stringify(compact)))
    expect(osmBase).toBe('2026-10-14T20:21:12Z')
    expect(stations[0]).toMatchObject({ lat: -26.1, lon: 28.05, brand: 'Engen', name: 'Engen Rivonia' })
    expect(stations[1]).toMatchObject({ brand: 'Shell', name: 'Shell' }) // name equal to brand is not stored twice
    expect(stations[2]).toMatchObject({ brand: null, name: 'Fuel station' })
    expect(tolls[0]).toMatchObject({ lat: -25.9, lon: 28.2, name: 'Pumulani' })
  })

  it('rejects missing or incompatible data', () => {
    expect(() => expandPoiDataset(null)).toThrow(/missing/)
    expect(() => expandPoiDataset({ version: 99 })).toThrow(/incompatible/)
  })
})

describe('geo service parsing', () => {
  it('labels and filters Photon results, southern Africa first', () => {
    const geo = {
      features: [
        { geometry: { type: 'Point', coordinates: [-75.2, 39.9] }, properties: { name: 'Pretoria', countrycode: 'US', state: 'PA' } },
        { geometry: { type: 'Point', coordinates: [28.19, -25.75] }, properties: { name: 'Pretoria', countrycode: 'ZA', state: 'Gauteng' } },
      ],
    }
    const places = parsePhotonResults(geo)
    expect(places).toEqual([{ lat: -25.75, lon: 28.19, label: 'Pretoria, Gauteng', countryCode: 'ZA' }])
    expect(parsePhotonResults({ features: [geo.features[0]] })).toHaveLength(1) // falls back to other countries
    expect(placeLabel({ name: 'Sandton', city: 'Johannesburg', state: 'Gauteng' })).toBe('Sandton, Johannesburg, Gauteng')
    expect(placeLabel({})).toBe('Unnamed place')
  })

  it('parses Nominatim fallback results with short labels', () => {
    const items = [{
      lat: '-26.0682406', lon: '28.0479844', name: 'Sandton',
      display_name: 'Sandton, Johannesburg Ward 103, Sandton, City of Johannesburg Metropolitan Municipality, Gauteng, 1617, South Africa',
      address: { country_code: 'za' },
    }, { lat: 'x', lon: '1' }]
    expect(parseNominatimResults(items)).toEqual([{ lat: -26.0682406, lon: 28.0479844, label: 'Sandton, Gauteng, South Africa', countryCode: 'ZA' }])
    expect(parseNominatimResults(null)).toEqual([])
    expect(shortNominatimLabel({ display_name: '' , name: 'X' })).toBe('X')
  })

  it('parses OSRM routes and reports failures clearly', () => {
    const r = parseOsrmRoute({ code: 'Ok', routes: [{ distance: 1452136, duration: 57600, geometry: { coordinates: [[28.19, -25.75], [18.42, -33.92]] } }] })
    expect(r.distanceKm).toBeCloseTo(1452.1, 1)
    expect(r.durationMin).toBe(960)
    expect(r.points[0]).toEqual({ lat: -25.75, lon: 28.19 })
    expect(() => parseOsrmRoute({ code: 'NoRoute' })).toThrow(/No driving route/)
    expect(() => parseOsrmRoute({})).toThrow(/Could not plan/)
  })
})
