import { isFiniteNumber, roundTo } from './numberUtils.js'

/**
 * Pure fuel calculations. Every function returns `null` (meaning "not available")
 * instead of NaN/Infinity when inputs are missing, invalid or would divide by zero.
 */

/** totalCost = litres × pricePerLitre (rounded to cents). */
export function calculateTotalCost(litres, pricePerLitre) {
  if (!isFiniteNumber(litres) || !isFiniteNumber(pricePerLitre)) return null
  if (litres <= 0 || pricePerLitre < 0) return null
  return roundTo(litres * pricePerLitre, 2)
}

/** distance = currentOdometer − previousOdometer. Negative readings → null. */
export function calculateDistance(currentOdometer, previousOdometer) {
  if (!isFiniteNumber(currentOdometer) || !isFiniteNumber(previousOdometer)) return null
  if (currentOdometer < 0 || previousOdometer < 0) return null
  const distance = currentOdometer - previousOdometer
  return distance < 0 ? null : roundTo(distance, 1)
}

/** consumption = litres / distance × 100 (L/100 km). */
export function calculateConsumption(litres, distance) {
  if (!isFiniteNumber(litres) || !isFiniteNumber(distance)) return null
  if (litres <= 0 || distance <= 0) return null
  return (litres / distance) * 100
}

/** costPerKm = fuelCost / distance. */
export function calculateCostPerKm(fuelCost, distance) {
  if (!isFiniteNumber(fuelCost) || !isFiniteNumber(distance)) return null
  if (fuelCost < 0 || distance <= 0) return null
  return fuelCost / distance
}

/**
 * Builds full-tank-to-full-tank consumption segments.
 *
 * A segment opens at a full-tank entry and closes at the next full-tank entry. Its
 * fuel is the sum of every entry after the opening fill up to and including the
 * closing fill (partial top-ups in between are included). Entries before the first
 * full tank cannot be measured and are ignored. A closing entry whose odometer did
 * not advance cannot be measured either; it simply becomes the new opening fill.
 *
 * @param {Array} entries one vehicle's entries in chronological order
 * @returns {Array<{startEntryId, endEntryId, startDate, endDate, startOdometer,
 *   endOdometer, distance, litres, cost, consumption, costPerKm, fillUps}>}
 */
export function buildConsumptionSegments(entries) {
  const segments = []
  let open = null
  let litres = 0
  let cost = 0
  let fillUps = 0

  for (const entry of entries || []) {
    if (!entry || !isFiniteNumber(entry.odometer) || !isFiniteNumber(entry.litres)) continue
    if (open) {
      litres += entry.litres
      cost += isFiniteNumber(entry.totalCost) ? entry.totalCost : 0
      fillUps += 1
    }
    if (!entry.isFullTank) continue

    if (open) {
      const distance = calculateDistance(entry.odometer, open.odometer)
      if (distance !== null && distance > 0) {
        segments.push({
          startEntryId: open.id,
          endEntryId: entry.id,
          startDate: open.date,
          endDate: entry.date,
          startOdometer: open.odometer,
          endOdometer: entry.odometer,
          distance,
          litres: roundTo(litres, 2),
          cost: roundTo(cost, 2),
          consumption: calculateConsumption(litres, distance),
          costPerKm: calculateCostPerKm(cost, distance),
          fillUps,
        })
      }
    }
    open = entry
    litres = 0
    cost = 0
    fillUps = 0
  }
  return segments
}

/**
 * Distance-weighted averages over all measurable segments.
 * `hasEnoughData` is false until at least one complete segment exists.
 */
export function summariseConsumption(entries) {
  const segments = buildConsumptionSegments(entries)
  if (segments.length === 0) {
    return {
      segments,
      hasEnoughData: false,
      averageConsumption: null,
      averageCostPerKm: null,
      measuredDistance: 0,
      measuredLitres: 0,
      measuredCost: 0,
    }
  }
  const measuredDistance = segments.reduce((sum, s) => sum + s.distance, 0)
  const measuredLitres = segments.reduce((sum, s) => sum + s.litres, 0)
  const measuredCost = segments.reduce((sum, s) => sum + s.cost, 0)
  return {
    segments,
    hasEnoughData: true,
    averageConsumption: calculateConsumption(measuredLitres, measuredDistance),
    averageCostPerKm: calculateCostPerKm(measuredCost, measuredDistance),
    measuredDistance: roundTo(measuredDistance, 1),
    measuredLitres: roundTo(measuredLitres, 2),
    measuredCost: roundTo(measuredCost, 2),
  }
}

/** Map of closing entry id → its segment, for showing per-fill consumption in history. */
export function segmentsByClosingEntry(entries) {
  const map = new Map()
  for (const segment of buildConsumptionSegments(entries)) map.set(segment.endEntryId, segment)
  return map
}
