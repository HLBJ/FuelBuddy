import { describe, expect, it } from 'vitest'
import poi from '../src/data/poi-za.json'
import { isRoadToll, routeTolls, tariffsEffectiveFrom, tollFee } from '../src/services/tollTariffs.js'

describe('toll tariffs (SANRAL 2026)', () => {
  it('prices plazas by class, including spelling variants from the map data', () => {
    expect(tariffsEffectiveFrom()).toBe('2026-03-01')
    expect(tollFee('Huguenot')).toBe(54.5)
    expect(tollFee('Huguenot', 4)).toBe(383)
    expect(tollFee('Middleburg Toll Plaza')).toBe(84) // OSM spelling
    expect(tollFee('Machado Toll Plaza East')).toBe(126)
    expect(tollFee('Stormvoël')).toBe(12.5)
    expect(tollFee("Chapman's Peak", 4)).toBeNull() // not allowed
    expect(tollFee('Dr. Swanepoel Ramp Tollgate')).toBeNull() // not found
    expect(isRoadToll('Memorial Gate')).toBe(false)
  })

  it('totals a Johannesburg to Durban trip on the N3', () => {
    const route = [{ name: 'De Hoek' }, { name: 'Wilge' }, { name: 'Tugela' }, { name: 'Mooi Plaza' }, { name: 'Mariannhill Plaza' }]
    expect(routeTolls(route, 1)).toMatchObject({ total: 347.5, unknown: 0 })
    expect(routeTolls(route, 2).total).toBe(632)
  })

  it('leaves out park gates and counts plazas without a price', () => {
    const r = routeTolls([{ name: 'Nyalazi Gate' }, { name: 'Vaal' }, { name: '' }])
    expect(r.plazas.map((p) => [p.name, p.fee])).toEqual([['Vaal', 91.5], ['', null]])
    expect(r).toMatchObject({ total: 91.5, unknown: 1 })
  })

  it('knows a price for almost every named plaza in the bundled map data', () => {
    const names = [...new Set(poi.tolls.map((t) => t[2]).filter((n) => n && isRoadToll(n)))]
    const missing = names.filter((n) => tollFee(n) === null)
    expect(missing).toEqual(['Dr. Swanepoel Ramp Tollgate']) // not in SANRAL's list
  })

  it('charges ramp plazas only where the trip joins or leaves the highway', () => {
    const route = [{ name: 'Mooi Plaza', alongKm: 429 }, { name: 'Treverton Plaza', alongKm: 426 }, { name: 'Bergville', alongKm: 1.2 }]
    const r = routeTolls(route, 1, { totalKm: 570 })
    expect(r.plazas.map((p) => [p.name, p.optional])).toEqual([['Mooi Plaza', false], ['Treverton Plaza', true], ['Bergville', false]])
    expect(r.total).toBe(100) // Mooi 70 + Bergville 30, at the start
  })
})
