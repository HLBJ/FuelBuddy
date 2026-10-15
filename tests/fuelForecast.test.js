import { describe, expect, it } from 'vitest'
import { estimateDailyKm, forecastFuel } from '../src/services/fuelForecastService.js'
import { addDays, daysBetween } from '../src/services/dateUtils.js'

const entry = (id, date, odometer, litres, isFullTank = true) => ({ id, date, odometer, litres, totalCost: litres * 23, isFullTank })

// 7.0 L/100 km over 1 000 km in 20 days → 50 km a day.
const history = [
  entry(1, '2026-09-01', 50000, 40),
  entry(2, '2026-09-11', 50500, 35),
  entry(3, '2026-09-21', 51000, 35),
]

describe('date helpers', () => {
  it('counts calendar days across months and leap years', () => {
    expect(daysBetween('2026-09-21', '2026-10-01')).toBe(10)
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2)
    expect(daysBetween('2026-10-05', '2026-10-01')).toBe(-4)
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
  })
})

describe('fuel forecast', () => {
  it('estimates fuel left, range and the next fill-up date', () => {
    const f = forecastFuel(history, { tankCapacity: 45, today: '2026-09-25' })
    expect(f).toMatchObject({
      available: true,
      fullRangeKm: 643,
      dailyKm: 50,
      fuelLeftLitres: 31, // 45 L − 200 km × 7 L/100 km
      percentLeft: 69,
      rangeLeftKm: 443,
      daysUntilFill: 6, // until ~15% of the tank is left
      nextFillDate: '2026-10-01',
    })
  })

  it('is full on the day of a full fill-up and never goes below empty', () => {
    expect(forecastFuel(history, { tankCapacity: 45, today: '2026-09-21' })).toMatchObject({ percentLeft: 100, fuelLeftLitres: 45 })
    expect(forecastFuel(history, { tankCapacity: 45, today: '2026-11-30' })).toMatchObject({ percentLeft: 0, rangeLeftKm: 0, daysUntilFill: 0, nextFillDate: '2026-11-30' })
  })

  it('counts partial top-ups after the last full tank', () => {
    const withTopUp = [...history, entry(4, '2026-09-25', 51200, 10, false)]
    // 45 − 14 burnt + 10 topped up = 41 L at the top-up.
    expect(forecastFuel(withTopUp, { tankCapacity: 45, today: '2026-09-25' })).toMatchObject({ fuelLeftLitres: 41, percentLeft: 91 })
  })

  it('explains why it cannot forecast', () => {
    expect(forecastFuel(history, { tankCapacity: null }).reason).toBe('no-tank')
    expect(forecastFuel(history.slice(0, 1), { tankCapacity: 45 }).reason).toBe('no-consumption')
    expect(forecastFuel([], { tankCapacity: 45 }).available).toBe(false)
  })

  it('still shows fuel left without enough history for a date', () => {
    const quick = [entry(1, '2026-09-01', 50000, 40), entry(2, '2026-09-03', 50500, 35)]
    const f = forecastFuel(quick, { tankCapacity: 45, today: '2026-09-03' })
    expect(f).toMatchObject({ available: true, dailyKm: null, nextFillDate: null, percentLeft: 100 })
  })

  it('uses only recent driving for the daily distance', () => {
    const old = [entry(1, '2025-01-01', 10000, 40), entry(2, '2026-08-01', 20000, 40), entry(3, '2026-08-31', 21500, 40)]
    expect(estimateDailyKm(old)).toBe(50)
  })
})
