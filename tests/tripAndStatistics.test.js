import { describe, expect, it } from 'vitest'
import {
  calculateFuelRequired,
  calculateTripCost,
  estimateTrip,
  suggestTripInputs,
} from '../src/services/tripCalculationService.js'
import {
  compareVehicles,
  computeVehicleStatistics,
  consumptionExtremes,
  consumptionTrend,
  groupEntriesByMonth,
  monthlyBreakdown,
} from '../src/services/statisticsService.js'
import { isValidIsoDate, shiftMonth } from '../src/services/dateUtils.js'

let id = 1
const e = (date, odometer, litres, price = 20, isFullTank = true) => ({
  id: id++, vehicleId: 1, date, odometer, litres, pricePerLitre: price, totalCost: Math.round(litres * price * 100) / 100, isFullTank,
})

describe('trip formulas', () => {
  it('fuel required = distance × consumption / 100', () => {
    expect(calculateFuelRequired(500, 8)).toBe(40)
    expect(calculateFuelRequired(0, 8)).toBeNull()
    expect(calculateFuelRequired(100, 0)).toBeNull()
    expect(calculateFuelRequired(NaN, 8)).toBeNull()
  })

  it('trip cost = fuel required × price', () => {
    expect(calculateTripCost(40, 23.5)).toBe(940)
    expect(calculateTripCost(40, 0)).toBe(0)
    expect(calculateTripCost(40, -1)).toBeNull()
    expect(calculateTripCost(0, 20)).toBeNull()
  })
})

describe('estimateTrip', () => {
  it('estimates a one-way trip from form strings', () => {
    const { valid, result } = estimateTrip({ distance: '1 400', consumption: '7,5', fuelPrice: '22.80', roundTrip: false })
    expect(valid).toBe(true)
    expect(result.totalDistance).toBe(1400)
    expect(result.fuelRequired).toBe(105)
    expect(result.cost).toBe(2394)
    expect(result.costPerKm).toBeCloseTo(1.71, 10)
    expect(result.tanksNeeded).toBeNull()
  })

  it('doubles distance for a round trip and reports tanks needed', () => {
    const { result } = estimateTrip({ distance: 250, consumption: 8, fuelPrice: 20, roundTrip: true, tankCapacity: 50 })
    expect(result.totalDistance).toBe(500)
    expect(result.fuelRequired).toBe(40)
    expect(result.cost).toBe(800)
    expect(result.tanksNeeded).toBe(0.8)
  })

  it('returns field errors instead of numbers for bad input', () => {
    const { valid, errors, result } = estimateTrip({ distance: '0', consumption: '', fuelPrice: '-2' })
    expect(valid).toBe(false)
    expect(result).toBeNull()
    expect(Object.keys(errors).sort()).toEqual(['consumption', 'distance', 'fuelPrice'])
    expect(estimateTrip({ distance: 10, consumption: 0.5, fuelPrice: 20 }).errors.consumption).toMatch(/between/)
    expect(estimateTrip({ distance: 'far', consumption: 8, fuelPrice: 20 }).errors.distance).toBeTruthy()
  })

  it('suggests inputs from history only when it is sufficient', () => {
    expect(suggestTripInputs([])).toMatchObject({ consumption: null, consumptionSource: null, fuelPrice: null })
    const one = [e('2026-01-01', 1000, 40, 21)]
    expect(suggestTripInputs(one)).toMatchObject({ consumption: null, fuelPrice: 21, fuelPriceSource: 'lastFillUp' })
    const two = [e('2026-01-01', 1000, 40, 21), e('2026-01-10', 1500, 40, 22.5)]
    expect(suggestTripInputs(two)).toMatchObject({ consumption: 8, consumptionSource: 'history', fuelPrice: 22.5, fuelPriceDate: '2026-01-10' })
  })
})

describe('statistics', () => {
  const today = '2026-10-08'
  const entries = [
    e('2026-08-20', 10000, 40, 20),
    e('2026-09-05', 10500, 40, 21),
    e('2026-09-25', 10900, 10, 22, false),
    e('2026-10-02', 11300, 30, 22),
  ]

  it('handles no data without fake numbers', () => {
    const s = computeVehicleStatistics([], { today })
    expect(s).toMatchObject({ fillUpCount: 0, hasEntries: false, hasEnoughData: false, averageConsumption: null, averageCostPerKm: null, totalSpend: 0, averagePricePerLitre: null, distanceTracked: 0 })
  })

  it('computes headline statistics', () => {
    const s = computeVehicleStatistics(entries, { today })
    expect(s.fillUpCount).toBe(4)
    expect(s.totalLitres).toBe(120)
    expect(s.totalSpend).toBe(800 + 840 + 220 + 660)
    expect(s.distanceTracked).toBe(1300)
    expect(s.averagePricePerLitre).toBe(21)
    expect(s.thisMonthSpend).toBe(660)
    expect(s.lastMonthSpend).toBe(1060)
    // Segments: 40 L/500 km, then (10+30) L/800 km -> 80 L / 1300 km
    expect(s.averageConsumption).toBeCloseTo((80 / 1300) * 100, 10)
    expect(s.segmentCount).toBe(2)
    expect(s.lastEntry.date).toBe('2026-10-02')
  })

  it('builds 12 monthly buckets across a year boundary', () => {
    const rows = monthlyBreakdown([e('2025-12-31', 1, 10, 20), e('2026-01-02', 50, 5, 20), e('2024-12-01', 0, 5)], { today: '2026-01-15' })
    expect(rows).toHaveLength(12)
    expect(rows[0].month).toBe('2025-02')
    expect(rows[11]).toMatchObject({ month: '2026-01', spend: 100, litres: 5, fillUps: 1, averagePrice: 20 })
    expect(rows[10]).toMatchObject({ month: '2025-12', spend: 200 })
    expect(rows[5]).toMatchObject({ spend: 0, fillUps: 0, averagePrice: null })
  })

  it('reports trend points and best/worst segments', () => {
    const trend = consumptionTrend(entries)
    expect(trend.map((p) => p.date)).toEqual(['2026-09-05', '2026-10-02'])
    expect(trend[0].consumption).toBe(8)
    const { best, worst } = consumptionExtremes(entries)
    expect(best.consumption).toBeCloseTo(5, 10)
    expect(worst.consumption).toBeCloseTo(8, 10)
    expect(consumptionExtremes([])).toEqual({ best: null, worst: null })
  })

  it('compares vehicles side by side', () => {
    const rows = compareVehicles([
      { vehicle: { id: 1, name: 'Polo' }, entries },
      { vehicle: { id: 2, name: 'Hilux' }, entries: [] },
    ], { today })
    expect(rows[0]).toMatchObject({ vehicleId: 1, name: 'Polo', fillUpCount: 4, hasEnoughData: true })
    expect(rows[1]).toMatchObject({ vehicleId: 2, fillUpCount: 0, hasEnoughData: false, averageConsumption: null })
  })

  it('groups history by month, newest first, with totals', () => {
    const groups = groupEntriesByMonth(entries)
    expect(groups.map((g) => g.month)).toEqual(['2026-10', '2026-09', '2026-08'])
    expect(groups[1].entries.map((x) => x.date)).toEqual(['2026-09-25', '2026-09-05'])
    expect(groups[1]).toMatchObject({ spend: 1060, litres: 50 })
  })
})

describe('dates', () => {
  it('validates real calendar dates', () => {
    expect(isValidIsoDate('2024-02-29')).toBe(true)
    expect(isValidIsoDate('2026-02-29')).toBe(false)
    expect(isValidIsoDate('2026-02-30')).toBe(false)
    expect(isValidIsoDate('2026-13-01')).toBe(false)
    expect(isValidIsoDate('26-01-01')).toBe(false)
  })

  it('shifts months across years', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2025-12', 1)).toBe('2026-01')
    expect(shiftMonth('2026-03', -14)).toBe('2025-01')
  })
})
