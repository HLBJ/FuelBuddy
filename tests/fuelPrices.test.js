import { describe, expect, it } from 'vitest'
import {
  ALERT_MIN_CHANGE, PriceDataError, priceFileUrl, bundledPriceData, formatPriceChange, gradeForFuelType, loadFuelPrices, mergePriceData,
  normalisePriceData, priceAlertPlan, priceOn, upcomingChange,
} from '../src/services/fuelPriceService.js'

const file = (periods, updated = '2026-11-01') => ({ format: 'fuelbuddy-fuel-prices', version: 1, updated, periods })
const november = { effective: '2026-11-04', inland: { ulp93: 30.56, ulp95: 30.93, diesel50: 32.1 }, coastal: { ulp95: 30.06 } }

function memorySettings(initial = {}) {
  const store = { ...initial }
  return { store, get: async (k) => store[k] ?? null, set: async (k, v) => { store[k] = v } }
}

describe('bundled fuel prices', () => {
  it('ship valid, sorted official prices', () => {
    const data = bundledPriceData()
    expect(data.periods.length).toBeGreaterThanOrEqual(6)
    expect(data.periods.map((p) => p.effective)).toEqual([...data.periods.map((p) => p.effective)].sort())
    // Spot-check against the DMPR October 2026 breakdown.
    expect(priceOn(data, { date: '2026-10-15', region: 'inland', grade: 'ulp95' })).toEqual({ price: 30.25, effective: '2026-10-07', regulated: true })
    expect(priceOn(data, { date: '2026-10-15', region: 'coastal', grade: 'ulp95' }).price).toBe(29.38)
  })
})

describe('price lookups', () => {
  const data = mergePriceData(bundledPriceData(), normalisePriceData(file([november])))

  it('uses the period in effect on the fill-up date', () => {
    expect(priceOn(data, { date: '2026-10-06', region: 'inland', grade: 'ulp95' }).price).toBe(26.92) // still September's
    expect(priceOn(data, { date: '2026-10-07', region: 'inland', grade: 'ulp95' }).price).toBe(30.25)
    expect(priceOn(data, { date: '2026-11-04', region: 'inland', grade: 'ulp95' }).price).toBe(30.93)
    expect(priceOn(data, { date: '2026-10-15', region: 'inland', grade: 'diesel50' })).toMatchObject({ price: 32.8, regulated: false })
    expect(priceOn(data, { date: '2020-01-01', region: 'inland', grade: 'ulp95' })).toBeNull()
    expect(priceOn(data, { date: '2026-10-15', region: 'inland', grade: null })).toBeNull()
  })

  it('maps vehicles to grades', () => {
    expect(gradeForFuelType('petrol')).toBe('ulp95')
    expect(gradeForFuelType('hybrid', { petrolGrade: 'ulp93' })).toBe('ulp93')
    expect(gradeForFuelType('diesel', { dieselGrade: 'diesel500' })).toBe('diesel500')
    expect(gradeForFuelType('lpg')).toBeNull()
  })

  it('finds the next announced change', () => {
    expect(upcomingChange(data, { today: '2026-11-01', region: 'inland', grade: 'ulp95' })).toEqual({
      effective: '2026-11-04', price: 30.93, previous: 30.25, change: 0.68, grade: 'ulp95',
    })
    expect(upcomingChange(data, { today: '2026-11-04', region: 'inland', grade: 'ulp95' })).toBeNull()
    expect(upcomingChange(bundledPriceData(), { today: '2026-10-15', region: 'inland', grade: 'ulp95' })).toBeNull()
  })
})

describe('price change alerts', () => {
  const change = { effective: '2026-11-04', price: 30.93, previous: 30.25, change: 0.68, grade: 'ulp95' }

  it('warns at 17:00 the evening before an increase', () => {
    const plan = priceAlertPlan(change, { now: new Date(2026, 10, 1, 9) })
    expect(plan.at).toEqual(new Date(2026, 10, 3, 17))
    expect(plan.title).toBe('95 petrol goes up 68c tomorrow')
    expect(plan.body).toMatch(/Fill up today/)
  })

  it('tells diesel drivers about a drop and skips tiny or late changes', () => {
    const drop = { ...change, grade: 'diesel50', change: -1.24 }
    expect(priceAlertPlan(drop, { now: new Date(2026, 10, 1) }).title).toBe('Diesel 50ppm drops R1.24 tomorrow')
    expect(priceAlertPlan({ ...change, change: ALERT_MIN_CHANGE / 2 }, { now: new Date(2026, 10, 1) })).toBeNull()
    expect(priceAlertPlan(change, { now: new Date(2026, 10, 3, 18) })).toBeNull()
    expect(formatPriceChange(0.05)).toBe('5c')
  })
})

describe('price data from the hosted file', () => {
  it('rejects bad files', () => {
    expect(() => normalisePriceData({ format: 'x' })).toThrow(PriceDataError)
    expect(() => normalisePriceData(file([{ effective: '2026-13-01' }]))).toThrow(/effective date/)
    expect(() => normalisePriceData(file([{ effective: '2026-11-04', inland: { ulp95: 3093 } }]))).toThrow(/Implausible/)
  })

  it('downloads, caches and falls back when offline', async () => {
    const settings = memorySettings()
    const ok = async () => file([november])
    const config = { remoteUrl: 'https://example.test/prices.json', refreshHours: 6, timeoutMs: 1000 }
    const now = Date.parse('2026-11-01T08:00:00Z')

    const fresh = await loadFuelPrices(settings, { getJson: ok, now, config })
    expect(fresh.periods.at(-1).effective).toBe('2026-11-04')
    expect(settings.store.fuelPricesFetchedAt).toBe('2026-11-01T08:00:00.000Z')

    let calls = 0
    const offline = async () => { calls += 1; throw new Error('offline') }
    const cached = await loadFuelPrices(settings, { getJson: offline, now: now + 3_600_000, config })
    expect(calls).toBe(0) // still fresh, no download attempted
    expect(cached.periods.at(-1).effective).toBe('2026-11-04')

    const later = await loadFuelPrices(settings, { getJson: offline, now: now + 7 * 3_600_000, config })
    expect(calls).toBe(1)
    expect(later.periods.at(-1).effective).toBe('2026-11-04') // cached copy still used

    const noUrl = await loadFuelPrices(memorySettings(), { getJson: ok, config: { ...config, remoteUrl: null } })
    expect(noUrl.periods.at(-1).effective).toBe('2026-10-07')
  })
})

describe('hosted price file URLs', () => {
  const id = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345'
  const direct = `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`

  it('turns Google Drive share links into direct downloads', () => {
    expect(priceFileUrl(`https://drive.google.com/file/d/${id}/view?usp=sharing`)).toBe(direct)
    expect(priceFileUrl(`https://drive.google.com/open?id=${id}`)).toBe(direct)
    expect(priceFileUrl(`https://drive.google.com/uc?export=download&id=${id}`)).toBe(direct)
  })

  it('leaves other hosts alone', () => {
    const pages = 'https://someone.github.io/fuelbuddy-data/fuel-prices-za.json'
    expect(priceFileUrl(pages)).toBe(pages)
    expect(priceFileUrl(null)).toBeNull()
  })
})
