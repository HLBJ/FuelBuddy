import bundledPrices from '../data/fuel-prices-za.json'
import { fuelPricesConfig } from '../config/fuelPrices.js'
import { addDays, isValidIsoDate } from './dateUtils.js'
import { roundTo } from './numberUtils.js'
import { loadHostedJson } from './remoteData.js'

export { priceFileUrl } from './remoteData.js'

/**
 * South African regulated fuel prices. Petrol pump prices are set monthly by the
 * DMPR (taking effect on the first Wednesday); diesel is published as a wholesale
 * price, and pumps charge a little more. Prices ship with the app and can be kept
 * current from a small hosted JSON file (see docs/FUEL_PRICES.md).
 */
export const PRICE_DATA_FORMAT = 'fuelbuddy-fuel-prices'

export const FUEL_REGIONS = Object.freeze([
  { value: 'inland', label: 'Inland (Gauteng)' },
  { value: 'coastal', label: 'Coastal' },
])

export const FUEL_GRADES = Object.freeze({
  ulp93: { label: '93 unleaded', short: '93', regulated: true },
  ulp95: { label: '95 unleaded', short: '95', regulated: true },
  diesel50: { label: 'Diesel 50ppm', short: 'diesel 50ppm', regulated: false },
  diesel500: { label: 'Diesel 500ppm', short: 'diesel 500ppm', regulated: false },
})

/** Changes smaller than this (R/L) are not worth an alert. */
export const ALERT_MIN_CHANGE = 0.1
export const PRICE_ALERT_NOTIFICATION_ID = 1_999_999_001
const ALERT_HOUR = 17 // the evening before a change

export class PriceDataError extends Error {}

/** Validates price data (bundled or downloaded) and sorts periods oldest first. */
export function normalisePriceData(json) {
  if (!json || json.format !== PRICE_DATA_FORMAT || !Array.isArray(json.periods)) {
    throw new PriceDataError('Not FuelBuddy fuel price data.')
  }
  const periods = json.periods.map((p) => {
    if (!p || !isValidIsoDate(p.effective)) throw new PriceDataError('A price period has no valid effective date.')
    const region = (r) => {
      const out = {}
      for (const grade of Object.keys(FUEL_GRADES)) {
        const value = r?.[grade]
        if (value === null || value === undefined) continue
        if (typeof value !== 'number' || !(value > 5 && value < 200)) throw new PriceDataError(`Implausible ${grade} price on ${p.effective}.`)
        out[grade] = value
      }
      return out
    }
    return { effective: p.effective, inland: region(p.inland), coastal: region(p.coastal) }
  })
  periods.sort((a, b) => a.effective.localeCompare(b.effective))
  return { updated: json.updated || null, periods }
}

/** Combines two data sets; where both have a period, `newer` wins. */
export function mergePriceData(base, newer) {
  if (!newer) return base
  const byDate = new Map(base.periods.map((p) => [p.effective, p]))
  for (const p of newer.periods) byDate.set(p.effective, p)
  const periods = [...byDate.values()].sort((a, b) => a.effective.localeCompare(b.effective))
  const updated = [base.updated, newer.updated].filter(Boolean).sort().pop() || null
  return { updated, periods }
}

/** The grade a vehicle uses, from its fuel type and the user's preferences. */
export function gradeForFuelType(fuelType, { petrolGrade = 'ulp95', dieselGrade = 'diesel50' } = {}) {
  if (fuelType === 'petrol' || fuelType === 'hybrid') return petrolGrade
  if (fuelType === 'diesel') return dieselGrade
  return null // LPG and other fuels are not covered
}

/** Price in effect on `date`, or null when unknown. */
export function priceOn(data, { date, region, grade }) {
  if (!data || !grade || !isValidIsoDate(date)) return null
  let match = null
  for (const p of data.periods) {
    if (p.effective > date) break
    if (p[region]?.[grade] !== undefined) match = p
  }
  if (!match) return null
  return { price: roundTo(match[region][grade], 2), effective: match.effective, regulated: FUEL_GRADES[grade].regulated }
}

/** The next announced change after `today`, compared with today's price. */
export function upcomingChange(data, { today, region, grade }) {
  if (!data || !grade) return null
  const next = data.periods.find((p) => p.effective > today && p[region]?.[grade] !== undefined)
  const current = priceOn(data, { date: today, region, grade })
  if (!next || !current) return null
  const price = roundTo(next[region][grade], 2)
  return { effective: next.effective, price, previous: current.price, change: roundTo(price - current.price, 2), grade }
}

/** Cents per litre as South Africans say it: "68c", or "R1.24" past a rand. */
export function formatPriceChange(change) {
  const abs = Math.abs(change)
  return abs >= 1 ? `R${abs.toFixed(2)}` : `${Math.round(abs * 100)}c`
}

/**
 * The "price changes tomorrow" notification for an upcoming change, at 17:00 the
 * evening before, or null when there is nothing worth saying or it's too late.
 */
export function priceAlertPlan(change, { now = new Date() } = {}) {
  if (!change || Math.abs(change.change) < ALERT_MIN_CHANGE) return null
  const [y, m, d] = addDays(change.effective, -1).split('-').map(Number)
  const at = new Date(y, m - 1, d, ALERT_HOUR)
  if (at <= now) return null
  const grade = FUEL_GRADES[change.grade]
  const up = change.change > 0
  const name = grade.regulated ? `${grade.short} petrol` : grade.label
  return {
    id: PRICE_ALERT_NOTIFICATION_ID,
    at,
    title: up ? `${name} goes up ${formatPriceChange(change.change)} tomorrow` : `${name} drops ${formatPriceChange(change.change)} tomorrow`,
    body: up ? 'Fill up today to beat the increase.' : 'If you can, wait until tomorrow to fill up.',
  }
}

let bundled = null
export function bundledPriceData() {
  bundled ??= normalisePriceData(bundledPrices)
  return bundled
}

/**
 * Current price data: what ships with the app, merged with the hosted file (refreshed
 * at most every few hours, cached for offline use). Never throws.
 */
export async function loadFuelPrices(settings, { getJson, now = Date.now(), config = fuelPricesConfig } = {}) {
  const remote = await loadHostedJson(
    settings,
    {
      url: config.remoteUrl,
      cacheKey: 'fuelPricesCache',
      fetchedKey: 'fuelPricesFetchedAt',
      refreshHours: config.refreshHours,
      timeoutMs: config.timeoutMs,
      validate: normalisePriceData,
    },
    { getJson, now },
  )
  return mergePriceData(bundledPriceData(), remote)
}
