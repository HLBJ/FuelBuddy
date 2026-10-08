import { parseDecimal, roundTo } from './numberUtils.js'
import { calculateCostPerKm } from './fuelCalculationService.js'
import { summariseConsumption } from './fuelCalculationService.js'

export const TRIP_LIMITS = Object.freeze({
  maxDistance: 100_000,
  minConsumption: 1,
  maxConsumption: 100,
  maxFuelPrice: 1000,
})

/** fuelRequired = distance × consumption / 100 */
export function calculateFuelRequired(distance, consumption) {
  if (!Number.isFinite(distance) || !Number.isFinite(consumption)) return null
  if (distance <= 0 || consumption <= 0) return null
  return (distance * consumption) / 100
}

/** tripCost = fuelRequired × fuelPrice */
export function calculateTripCost(fuelRequired, fuelPrice) {
  if (!Number.isFinite(fuelRequired) || !Number.isFinite(fuelPrice)) return null
  if (fuelRequired <= 0 || fuelPrice < 0) return null
  return roundTo(fuelRequired * fuelPrice, 2)
}

/**
 * Validates trip calculator input and returns the estimate.
 * @param {object} input { distance, roundTrip, consumption, fuelPrice, tankCapacity? }
 *        (strings from the form or numbers)
 * @returns {{ valid: boolean, errors: object, result: object|null }}
 */
export function estimateTrip(input) {
  const errors = {}
  const distance = parseDecimal(input.distance)
  const consumption = parseDecimal(input.consumption)
  const fuelPrice = parseDecimal(input.fuelPrice)
  const tankCapacity = parseDecimal(input.tankCapacity)

  if (distance === null) errors.distance = 'Enter the trip distance in kilometres.'
  else if (distance <= 0) errors.distance = 'Distance must be greater than zero.'
  else if (distance > TRIP_LIMITS.maxDistance) errors.distance = 'Distance is too large.'

  if (consumption === null) errors.consumption = 'Enter fuel consumption in L/100 km.'
  else if (consumption < TRIP_LIMITS.minConsumption || consumption > TRIP_LIMITS.maxConsumption)
    errors.consumption = `Consumption must be between ${TRIP_LIMITS.minConsumption} and ${TRIP_LIMITS.maxConsumption} L/100 km.`

  if (fuelPrice === null) errors.fuelPrice = 'Enter the fuel price per litre.'
  else if (fuelPrice < 0) errors.fuelPrice = 'Fuel price cannot be negative.'
  else if (fuelPrice > TRIP_LIMITS.maxFuelPrice) errors.fuelPrice = 'Fuel price is too high.'

  if (Object.keys(errors).length) return { valid: false, errors, result: null }

  const totalDistance = input.roundTrip ? distance * 2 : distance
  const fuelRequired = calculateFuelRequired(totalDistance, consumption)
  const cost = calculateTripCost(fuelRequired, fuelPrice)
  const tanksNeeded = tankCapacity && tankCapacity > 0 ? fuelRequired / tankCapacity : null

  return {
    valid: true,
    errors: {},
    result: {
      totalDistance: roundTo(totalDistance, 1),
      fuelRequired: roundTo(fuelRequired, 2),
      cost,
      costPerKm: calculateCostPerKm(cost, totalDistance),
      consumption,
      fuelPrice,
      tanksNeeded: tanksNeeded === null ? null : roundTo(tanksNeeded, 2),
    },
  }
}

/**
 * Suggested calculator inputs from a vehicle's history. Values are null when the
 * history cannot support them, so the UI can ask the user for an estimate instead.
 * @param {Array} entries chronological entries for the vehicle
 */
export function suggestTripInputs(entries) {
  const summary = summariseConsumption(entries)
  const latestWithPrice = [...(entries || [])].reverse().find((e) => e.pricePerLitre > 0)
  return {
    consumption: summary.hasEnoughData ? roundTo(summary.averageConsumption, 1) : null,
    consumptionSource: summary.hasEnoughData ? 'history' : null,
    measuredDistance: summary.measuredDistance,
    fuelPrice: latestWithPrice ? latestWithPrice.pricePerLitre : null,
    fuelPriceSource: latestWithPrice ? 'lastFillUp' : null,
    fuelPriceDate: latestWithPrice ? latestWithPrice.date : null,
  }
}
