import { roundTo } from './numberUtils.js'
import { monthKey, shiftMonth, toIsoDate } from './dateUtils.js'
import { summariseConsumption } from './fuelCalculationService.js'

/**
 * Statistics derived from one vehicle's chronological entries. Metrics that need
 * more history than exists are returned as null with `hasEnoughData` flags.
 */
export function computeVehicleStatistics(entries, { today = toIsoDate() } = {}) {
  const list = entries || []
  const consumption = summariseConsumption(list)
  const totalSpend = sum(list.map((e) => e.totalCost))
  const totalLitres = sum(list.map((e) => e.litres))
  const thisMonth = monthKey(today)
  const lastMonth = shiftMonth(thisMonth, -1)

  const odometers = list.map((e) => e.odometer).filter(Number.isFinite)
  const distanceTracked =
    odometers.length >= 2 ? roundTo(Math.max(...odometers) - Math.min(...odometers), 1) : 0

  return {
    fillUpCount: list.length,
    hasEntries: list.length > 0,
    hasEnoughData: consumption.hasEnoughData,
    averageConsumption: consumption.averageConsumption,
    averageCostPerKm: consumption.averageCostPerKm,
    measuredDistance: consumption.measuredDistance,
    segmentCount: consumption.segments.length,
    totalSpend: roundTo(totalSpend, 2),
    totalLitres: roundTo(totalLitres, 2),
    distanceTracked,
    averagePricePerLitre: totalLitres > 0 ? roundTo(totalSpend / totalLitres, 2) : null,
    thisMonthSpend: roundTo(sum(list.filter((e) => monthKey(e.date) === thisMonth).map((e) => e.totalCost)), 2),
    lastMonthSpend: roundTo(sum(list.filter((e) => monthKey(e.date) === lastMonth).map((e) => e.totalCost)), 2),
    firstDate: list.length ? list[0].date : null,
    lastDate: list.length ? list[list.length - 1].date : null,
    lastEntry: list.length ? list[list.length - 1] : null,
  }
}

/**
 * Spend/litres/fill-ups per calendar month for the `months` months ending with
 * the month containing `today` (oldest first; months without fill-ups are zero).
 */
export function monthlyBreakdown(entries, { months = 12, today = toIsoDate() } = {}) {
  const end = monthKey(today)
  const buckets = []
  for (let i = months - 1; i >= 0; i -= 1) {
    buckets.push({ month: shiftMonth(end, -i), spend: 0, litres: 0, fillUps: 0 })
  }
  const index = new Map(buckets.map((b) => [b.month, b]))
  for (const entry of entries || []) {
    const bucket = index.get(monthKey(entry.date))
    if (!bucket) continue
    bucket.spend += entry.totalCost || 0
    bucket.litres += entry.litres || 0
    bucket.fillUps += 1
  }
  return buckets.map((b) => ({
    ...b,
    spend: roundTo(b.spend, 2),
    litres: roundTo(b.litres, 2),
    averagePrice: b.litres > 0 ? roundTo(b.spend / b.litres, 2) : null,
  }))
}

/** Consumption trend points (one per measured segment), oldest first. */
export function consumptionTrend(entries) {
  return summariseConsumption(entries).segments.map((s) => ({
    date: s.endDate,
    consumption: roundTo(s.consumption, 2),
    costPerKm: roundTo(s.costPerKm, 2),
    distance: s.distance,
  }))
}

/** Best (lowest) and worst (highest) consumption segments, or nulls. */
export function consumptionExtremes(entries) {
  const segments = summariseConsumption(entries).segments
  if (segments.length === 0) return { best: null, worst: null }
  let best = segments[0]
  let worst = segments[0]
  for (const s of segments) {
    if (s.consumption < best.consumption) best = s
    if (s.consumption > worst.consumption) worst = s
  }
  return { best, worst }
}

/**
 * Side-by-side summary for several vehicles.
 * @param {Array<{vehicle: object, entries: Array}>} datasets
 */
export function compareVehicles(datasets, { today = toIsoDate() } = {}) {
  return (datasets || []).map(({ vehicle, entries }) => {
    const stats = computeVehicleStatistics(entries, { today })
    return {
      vehicleId: vehicle.id,
      name: vehicle.name,
      fillUpCount: stats.fillUpCount,
      hasEnoughData: stats.hasEnoughData,
      averageConsumption: stats.averageConsumption,
      averageCostPerKm: stats.averageCostPerKm,
      totalSpend: stats.totalSpend,
      totalLitres: stats.totalLitres,
      distanceTracked: stats.distanceTracked,
    }
  })
}

/**
 * Groups entries (any order) by month for the history list, newest month first,
 * entries within a month newest first, with per-month totals.
 */
export function groupEntriesByMonth(entries) {
  const groups = new Map()
  const sorted = [...(entries || [])].sort(compareEntriesDesc)
  for (const entry of sorted) {
    const key = monthKey(entry.date)
    if (!groups.has(key)) groups.set(key, { month: key, entries: [], spend: 0, litres: 0 })
    const group = groups.get(key)
    group.entries.push(entry)
    group.spend += entry.totalCost || 0
    group.litres += entry.litres || 0
  }
  return [...groups.values()].map((g) => ({ ...g, spend: roundTo(g.spend, 2), litres: roundTo(g.litres, 2) }))
}

function compareEntriesDesc(a, b) {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1
  if (a.odometer !== b.odometer) return b.odometer - a.odometer
  return b.id - a.id
}

function sum(values) {
  return values.reduce((total, v) => total + (Number.isFinite(v) ? v : 0), 0)
}
