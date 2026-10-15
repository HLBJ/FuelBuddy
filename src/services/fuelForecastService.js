import { isFiniteNumber, roundTo } from './numberUtils.js'
import { addDays, daysBetween, toIsoDate } from './dateUtils.js'
import { summariseConsumption } from './fuelCalculationService.js'

/**
 * Estimates how much fuel is left and when the next fill-up is due, from the
 * vehicle's measured consumption, its tank size and how far it is usually driven.
 * Everything here is an estimate; the UI must present it as one.
 */
export const FORECAST_RULES = Object.freeze({
  reserveFraction: 0.15, // suggest filling up with about this much of the tank left
  windowDays: 120, // driving pattern taken from fill-ups in this many recent days
  minSpanDays: 7, // need at least this much history to estimate daily distance
})

/**
 * @param {Array} entries one vehicle's fill-ups in chronological order
 * @param {object} options
 * @param {number|null} options.tankCapacity litres
 * @param {string} [options.today] `YYYY-MM-DD`
 * @returns {{ available: boolean, reason: string|null, consumption: number|null,
 *   fullRangeKm: number|null, fuelLeftLitres: number|null, percentLeft: number|null,
 *   rangeLeftKm: number|null, dailyKm: number|null, daysUntilFill: number|null,
 *   nextFillDate: string|null }}
 */
export function forecastFuel(entries, { tankCapacity, today = toIsoDate() } = {}) {
  const list = (entries || []).filter((e) => e && isFiniteNumber(e.odometer) && isFiniteNumber(e.litres))
  const empty = {
    available: false, reason: null, consumption: null, fullRangeKm: null, fuelLeftLitres: null, percentLeft: null,
    rangeLeftKm: null, dailyKm: null, daysUntilFill: null, nextFillDate: null,
  }
  if (!(tankCapacity > 0)) return { ...empty, reason: 'no-tank' }
  const consumption = summariseConsumption(list).averageConsumption
  if (!(consumption > 0)) return { ...empty, reason: 'no-consumption' }

  const last = list[list.length - 1]
  const dailyKm = estimateDailyKm(list)

  // Fuel left = full tank at the last full fill, minus what was burnt since, plus top-ups.
  let anchorIndex = -1
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (list[i].isFullTank) { anchorIndex = i; break }
  }
  const anchor = list[anchorIndex]
  const topUps = list.slice(anchorIndex + 1).reduce((sum, e) => sum + e.litres, 0)
  const daysSinceLast = Math.max(0, daysBetween(last.date, today))
  const estimatedOdometer = last.odometer + (dailyKm ?? 0) * daysSinceLast
  const burnt = ((estimatedOdometer - anchor.odometer) * consumption) / 100
  const fuelLeft = Math.min(tankCapacity, Math.max(0, tankCapacity - burnt + topUps))
  const rangeLeftKm = (fuelLeft / consumption) * 100

  let daysUntilFill = null
  let nextFillDate = null
  if (dailyKm) {
    const reserveLitres = tankCapacity * FORECAST_RULES.reserveFraction
    const kmToReserve = Math.max(0, ((fuelLeft - reserveLitres) / consumption) * 100)
    daysUntilFill = Math.floor(kmToReserve / dailyKm)
    nextFillDate = addDays(today, daysUntilFill)
  }

  return {
    available: true,
    reason: null,
    consumption,
    fullRangeKm: roundTo((tankCapacity / consumption) * 100, 0),
    fuelLeftLitres: roundTo(fuelLeft, 1),
    percentLeft: Math.round((fuelLeft / tankCapacity) * 100),
    rangeLeftKm: roundTo(rangeLeftKm, 0),
    dailyKm: dailyKm === null ? null : roundTo(dailyKm, 1),
    daysUntilFill,
    nextFillDate,
  }
}

/** Average km driven per day over recent fill-ups, or null without enough history. */
export function estimateDailyKm(entries) {
  const list = entries || []
  if (list.length < 2) return null
  const last = list[list.length - 1]
  const window = list.filter((e) => daysBetween(e.date, last.date) <= FORECAST_RULES.windowDays)
  const first = window[0]
  const span = daysBetween(first.date, last.date)
  const distance = last.odometer - first.odometer
  if (span < FORECAST_RULES.minSpanDays || !(distance > 0)) return null
  return distance / span
}
