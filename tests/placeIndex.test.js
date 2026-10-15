import { describe, expect, it } from 'vitest'
import { compactPlacesDataset, createPlaceIndex, mergeSuggestions, normaliseText } from '../src/services/placeIndex.js'

// GeoNames dump rows: id, name, ascii, alternates, lat, lon, class, code, cc, cc2, admin1, ..., population(15th)
const row = (name, lat, lon, code, admin1, pop = 0, cls = 'P') =>
  ['1', name, name, '', lat, lon, cls, code, 'ZA', '', admin1, '', '', '', String(pop), '', '0', 'Africa/Johannesburg', '2024-01-01'].join('\t')
const admin1 = { '02': 'KwaZulu-Natal', '06': 'Gauteng', '11': 'Western Cape' }

const rows = [
  row('Vanderbijlpark', -26.71171, 27.83795, 'PPLA3', '06', 246754),
  row('Vanderbijlpark CE 2', -26.69049, 27.83245, 'PPLX', '06'),
  row('Ballito', -29.53598, 31.21396, 'PPL', '02'),
  row('Ballitoville', -29.53897, 31.21439, 'PPL', '02', 27718),
  row('Umhlanga', -29.72528, 31.08583, 'PPL', '02'),
  row('Umhlanga', -29.71667, 31.06667, 'PPL', '02'), // duplicate ~2 km away
  row('Cape Town', -33.92584, 18.42322, 'PPLA', '11', 3433441),
  row('Old Town', -25.1, 28.1, 'PPLH', '06'), // historical: excluded
  row('Northern Karroo', -30, 24, 'PLAT', '00', 0, 'T'), // not a populated place
  row('Sāo Café', -26.2, 28.0, 'PPL', '06'),
]
const idx = createPlaceIndex(compactPlacesDataset(rows, admin1, { generated: 'x' }))

describe('offline place suggestions', () => {
  it('keeps populated places only and merges near-duplicates', () => {
    expect(idx.size).toBe(7)
    expect(idx.search('Umhlanga')).toHaveLength(1)
  })

  it('ranks exact and prefix matches, then importance', () => {
    expect(idx.search('Vand').map((p) => p.label)).toEqual(['Vanderbijlpark, Gauteng', 'Vanderbijlpark CE 2, Gauteng'])
    expect(idx.search('ballito')[0].label).toBe('Ballito, KwaZulu-Natal') // exact beats the bigger Ballitoville
    expect(idx.search('Cape T')[0]).toMatchObject({ label: 'Cape Town, Western Cape', lat: -33.92584, lon: 18.42322, source: 'offline' })
  })

  it('matches later words from 3 letters and ignores accents and case', () => {
    expect(idx.search('town').map((p) => p.label)).toContain('Cape Town, Western Cape')
    expect(idx.search('to')).toEqual([]) // word matches need 3+ letters
    expect(idx.search('SAO CA')[0].label).toBe('Sāo Café, Gauteng')
    expect(idx.search('x')).toEqual([])
  })

  it('normalises text for matching', () => {
    expect(normaliseText('  Sāo-Café!  ')).toBe('sao cafe')
  })

  it('rejects incompatible data', () => {
    expect(() => createPlaceIndex({ version: 2 })).toThrow(/incompatible/)
  })
})

describe('merging offline and online suggestions', () => {
  const offline = [{ label: 'Ballito, KwaZulu-Natal', lat: -29.536, lon: 31.214 }]
  it('drops online results for the same place and caps the list', () => {
    const online = [
      { label: 'Ballito, KwaDukuza', lat: -29.538, lon: 31.215 },
      { label: 'Ballito Junction, Leonora Drive', lat: -29.52, lon: 31.2 },
    ]
    expect(mergeSuggestions(offline, online).map((p) => p.label)).toEqual(['Ballito, KwaZulu-Natal', 'Ballito Junction, Leonora Drive'])
    expect(mergeSuggestions(offline, Array(20).fill(online[1]).map((p, i) => ({ ...p, lat: p.lat + i }))).length).toBe(8)
    expect(mergeSuggestions(null, null)).toEqual([])
  })
})
