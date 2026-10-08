import { describe, expect, it } from 'vitest'
import {
  buildConsumptionSegments,
  calculateConsumption,
  calculateCostPerKm,
  calculateDistance,
  calculateTotalCost,
  segmentsByClosingEntry,
  summariseConsumption,
} from '../src/services/fuelCalculationService.js'
import { parseDecimal, roundTo } from '../src/services/numberUtils.js'

let nextId = 1
function e(date, odometer, litres, price = 20, isFullTank = true) {
  return { id: nextId++, date, odometer, litres, pricePerLitre: price, totalCost: roundTo(litres * price, 2), isFullTank }
}

describe('primitive formulas', () => {
  it('total cost = litres × price, rounded to cents', () => {
    expect(calculateTotalCost(40, 23.5)).toBe(940)
    expect(calculateTotalCost(33.33, 21.999)).toBe(733.23) // 733.22667
    expect(calculateTotalCost(10, 0)).toBe(0)
  })

  it('total cost rejects invalid inputs', () => {
    expect(calculateTotalCost(0, 20)).toBeNull()
    expect(calculateTotalCost(-5, 20)).toBeNull()
    expect(calculateTotalCost(10, -1)).toBeNull()
    expect(calculateTotalCost(NaN, 20)).toBeNull()
    expect(calculateTotalCost('10', 20)).toBeNull()
    expect(calculateTotalCost(Infinity, 20)).toBeNull()
  })

  it('distance = current − previous; negative is unavailable', () => {
    expect(calculateDistance(50500, 50000)).toBe(500)
    expect(calculateDistance(50000, 50000)).toBe(0)
    expect(calculateDistance(49000, 50000)).toBeNull()
    expect(calculateDistance(100, null)).toBeNull()
    expect(calculateDistance(-1, 0)).toBeNull()
  })

  it('consumption = litres / distance × 100 with zero-distance guard', () => {
    expect(calculateConsumption(40, 500)).toBeCloseTo(8, 10)
    expect(calculateConsumption(40, 0)).toBeNull()
    expect(calculateConsumption(40, -100)).toBeNull()
    expect(calculateConsumption(0, 100)).toBeNull()
    expect(calculateConsumption(undefined, 100)).toBeNull()
  })

  it('cost per km = cost / distance with zero-distance guard', () => {
    expect(calculateCostPerKm(940, 500)).toBeCloseTo(1.88, 10)
    expect(calculateCostPerKm(0, 500)).toBe(0)
    expect(calculateCostPerKm(940, 0)).toBeNull()
    expect(calculateCostPerKm(-1, 100)).toBeNull()
  })
})

describe('full-tank-to-full-tank segments', () => {
  it('needs two full tanks before anything can be measured', () => {
    expect(buildConsumptionSegments([])).toEqual([])
    expect(buildConsumptionSegments([e('2026-01-01', 1000, 40)])).toEqual([])
    const summary = summariseConsumption([e('2026-01-01', 1000, 40)])
    expect(summary.hasEnoughData).toBe(false)
    expect(summary.averageConsumption).toBeNull()
    expect(summary.averageCostPerKm).toBeNull()
  })

  it('measures fuel added at the closing fill, not the opening fill', () => {
    const segments = buildConsumptionSegments([e('2026-01-01', 1000, 50), e('2026-01-10', 1500, 40, 25)])
    expect(segments).toHaveLength(1)
    expect(segments[0]).toMatchObject({ distance: 500, litres: 40, cost: 1000, fillUps: 1 })
    expect(segments[0].consumption).toBeCloseTo(8, 10)
    expect(segments[0].costPerKm).toBeCloseTo(2, 10)
  })

  it('adds partial fills to the next full-tank segment', () => {
    const entries = [
      e('2026-01-01', 1000, 45),
      e('2026-01-05', 1200, 10, 20, false),
      e('2026-01-09', 1600, 38, 20, true),
    ]
    const [segment] = buildConsumptionSegments(entries)
    expect(segment.litres).toBe(48)
    expect(segment.distance).toBe(600)
    expect(segment.consumption).toBeCloseTo(8, 10)
    expect(segment.cost).toBe(960)
    expect(segment.fillUps).toBe(2)
  })

  it('ignores partial fills before the first full tank', () => {
    const entries = [e('2026-01-01', 900, 20, 20, false), e('2026-01-02', 1000, 30), e('2026-01-08', 1400, 32)]
    const segments = buildConsumptionSegments(entries)
    expect(segments).toHaveLength(1)
    expect(segments[0].litres).toBe(32)
    expect(segments[0].distance).toBe(400)
  })

  it('skips a zero-distance segment instead of dividing by zero', () => {
    const entries = [e('2026-01-01', 1000, 40), e('2026-01-01', 1000, 2), e('2026-01-05', 1500, 35)]
    const segments = buildConsumptionSegments(entries)
    expect(segments).toHaveLength(1)
    expect(segments[0].startOdometer).toBe(1000)
    expect(segments[0].litres).toBe(35)
    for (const s of segments) expect(Number.isFinite(s.consumption)).toBe(true)
  })

  it('skips entries with invalid numbers', () => {
    const entries = [e('2026-01-01', 1000, 40), { id: 99, date: '2026-01-02', odometer: null, litres: 5, isFullTank: true }, e('2026-01-05', 1500, 40)]
    const segments = buildConsumptionSegments(entries)
    expect(segments).toHaveLength(1)
    expect(segments[0].distance).toBe(500)
  })

  it('averages are distance weighted across segments', () => {
    const entries = [e('2026-01-01', 1000, 40), e('2026-01-10', 1100, 10, 20), e('2026-01-20', 2000, 60, 30)]
    // Segment 1: 10 L / 100 km = 10; segment 2: 60 L / 900 km = 6.67
    // Weighted: 70 L / 1000 km = 7 L/100km (a simple mean would be 8.33)
    const summary = summariseConsumption(entries)
    expect(summary.hasEnoughData).toBe(true)
    expect(summary.averageConsumption).toBeCloseTo(7, 10)
    expect(summary.measuredDistance).toBe(1000)
    expect(summary.measuredLitres).toBe(70)
    expect(summary.measuredCost).toBe(2000)
    expect(summary.averageCostPerKm).toBeCloseTo(2, 10)
  })

  it('maps segments by their closing entry', () => {
    const a = e('2026-01-01', 1000, 40)
    const b = e('2026-01-10', 1500, 40)
    const map = segmentsByClosingEntry([a, b])
    expect(map.has(a.id)).toBe(false)
    expect(map.get(b.id).distance).toBe(500)
  })
})

describe('parseDecimal / roundTo', () => {
  it('accepts dot or comma decimals and grouped thousands', () => {
    expect(parseDecimal('23.45')).toBe(23.45)
    expect(parseDecimal('23,45')).toBe(23.45)
    expect(parseDecimal('1 234,5')).toBe(1234.5)
    expect(parseDecimal('1,234.50')).toBe(1234.5)
    expect(parseDecimal('1.234,50')).toBe(1234.5)
    expect(parseDecimal(' 42 ')).toBe(42)
    expect(parseDecimal(12.5)).toBe(12.5)
    expect(parseDecimal('-3')).toBe(-3)
  })

  it('rejects empty and malformed text', () => {
    for (const bad of ['', '   ', 'abc', '12abc', '1,2,3', '1..2', null, undefined, NaN, Infinity]) {
      expect(parseDecimal(bad)).toBeNull()
    }
  })

  it('rounds half away from zero without float artefacts', () => {
    expect(roundTo(1.005, 2)).toBe(1.01)
    expect(roundTo(2.675, 2)).toBe(2.68)
    expect(roundTo(10, 2)).toBe(10)
    expect(roundTo(NaN)).toBeNull()
  })
})
