import { parseDecimal, roundTo } from './numberUtils.js'
import { isValidIsoDate, normaliseDateInput, toIsoDate } from './dateUtils.js'
import { calculateTotalCost } from './fuelCalculationService.js'

export const FUEL_TYPES = Object.freeze([
  { value: 'petrol', label: 'Petrol' },
  { value: 'diesel', label: 'Diesel' },
  { value: 'hybrid', label: 'Hybrid (petrol)' },
  { value: 'lpg', label: 'LPG' },
  { value: 'other', label: 'Other' },
])

export const LIMITS = Object.freeze({
  nameLength: 50,
  makeModelLength: 50,
  registrationLength: 20,
  stationLength: 80,
  notesLength: 500,
  maxTankCapacity: 1000,
  maxLitres: 1000,
  maxPricePerLitre: 1000,
  maxOdometer: 9_999_999,
  minYear: 1900,
})

const formatKm = (n) => `${Math.round(n).toLocaleString('en-ZA')} km`

function textField(value, { label, max, required = false }, errors, key) {
  const text = value === null || value === undefined ? '' : String(value).trim()
  if (required && text === '') errors[key] = `${label} is required.`
  else if (text.length > max) errors[key] = `${label} must be ${max} characters or fewer.`
  return text === '' ? null : text
}

/**
 * Validates and normalises vehicle form input.
 * @param {object} input raw form values (strings or numbers)
 * @param {object} [context]
 * @param {number|null} [context.maxEntryOdometer] highest recorded fill-up odometer
 * @param {number} [context.currentYear]
 * @returns {{ valid: boolean, errors: object, value: object }}
 */
export function validateVehicle(input, context = {}) {
  const errors = {}
  const currentYear = context.currentYear ?? new Date().getFullYear()

  const name = textField(input.name, { label: 'Vehicle name', max: LIMITS.nameLength, required: true }, errors, 'name')
  const make = textField(input.make, { label: 'Make', max: LIMITS.makeModelLength }, errors, 'make')
  const model = textField(input.model, { label: 'Model', max: LIMITS.makeModelLength }, errors, 'model')
  const registration = textField(
    input.registration,
    { label: 'Registration', max: LIMITS.registrationLength },
    errors,
    'registration',
  )

  let year = null
  if (input.year !== null && input.year !== undefined && String(input.year).trim() !== '') {
    const parsed = parseDecimal(input.year)
    if (parsed === null || !Number.isInteger(parsed)) errors.year = 'Year must be a whole number, e.g. 2019.'
    else if (parsed < LIMITS.minYear || parsed > currentYear + 1)
      errors.year = `Year must be between ${LIMITS.minYear} and ${currentYear + 1}.`
    else year = parsed
  }

  const fuelType = input.fuelType || 'petrol'
  if (!FUEL_TYPES.some((t) => t.value === fuelType)) errors.fuelType = 'Choose a valid fuel type.'

  let tankCapacity = null
  if (input.tankCapacity !== null && input.tankCapacity !== undefined && String(input.tankCapacity).trim() !== '') {
    const parsed = parseDecimal(input.tankCapacity)
    if (parsed === null) errors.tankCapacity = 'Tank capacity must be a number.'
    else if (parsed <= 0) errors.tankCapacity = 'Tank capacity must be greater than zero.'
    else if (parsed > LIMITS.maxTankCapacity)
      errors.tankCapacity = `Tank capacity cannot exceed ${LIMITS.maxTankCapacity} litres.`
    else tankCapacity = roundTo(parsed, 1)
  }

  let currentOdometer = 0
  const rawOdo = input.currentOdometer
  if (rawOdo === null || rawOdo === undefined || String(rawOdo).trim() === '') {
    errors.currentOdometer = 'Current odometer is required (enter 0 if unknown).'
  } else {
    const parsed = parseDecimal(rawOdo)
    if (parsed === null) errors.currentOdometer = 'Odometer must be a number.'
    else if (parsed < 0) errors.currentOdometer = 'Odometer cannot be negative.'
    else if (parsed > LIMITS.maxOdometer) errors.currentOdometer = 'Odometer reading is too large.'
    else if (context.maxEntryOdometer != null && parsed < context.maxEntryOdometer)
      errors.currentOdometer = `Odometer cannot be lower than your latest fill-up (${formatKm(context.maxEntryOdometer)}).`
    else currentOdometer = roundTo(parsed, 1)
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    value: {
      name, make, model, registration, year, fuelType, tankCapacity, currentOdometer,
      catalogKey: typeof input.catalogKey === 'string' && /^[a-z0-9-]{1,80}$/.test(input.catalogKey) ? input.catalogKey : null,
      tollClass: [1, 2, 3, 4].includes(Number(input.tollClass)) ? Number(input.tollClass) : 1,
    },
  }
}

/**
 * Validates and normalises fuel entry form input.
 * @param {object} input raw form values
 * @param {object} [context]
 * @param {{min: number|null, max: number|null}} [context.bounds] odometer bounds
 *        from neighbouring entries (see fuelEntryRepository.getOdometerBounds)
 * @param {number|null} [context.vehicleOdometer] the vehicle's current odometer
 * @param {boolean} [context.isLatest] whether the entry would be the newest one
 * @param {string} [context.today] `YYYY-MM-DD`
 * @returns {{ valid: boolean, errors: object, warnings: object, value: object }}
 */
export function validateFuelEntry(input, context = {}) {
  const errors = {}
  const warnings = {}
  const today = context.today ?? toIsoDate()

  const vehicleId = Number(input.vehicleId)
  if (!Number.isInteger(vehicleId) || vehicleId <= 0) errors.vehicleId = 'Choose a vehicle.'

  const date = normaliseDateInput(input.date)
  if (!date || !isValidIsoDate(date)) errors.date = 'Enter a valid date.'
  else if (date > today) errors.date = 'The date cannot be in the future.'

  const odometer = parseDecimal(input.odometer)
  if (input.odometer === null || input.odometer === undefined || String(input.odometer).trim() === '')
    errors.odometer = 'Odometer reading is required.'
  else if (odometer === null) errors.odometer = 'Odometer must be a number.'
  else if (odometer < 0) errors.odometer = 'Odometer cannot be negative.'
  else if (odometer > LIMITS.maxOdometer) errors.odometer = 'Odometer reading is too large.'
  else {
    const { min = null, max = null } = context.bounds || {}
    if (min !== null && odometer < min)
      errors.odometer = `Odometer cannot be lower than an earlier fill-up (${formatKm(min)}).`
    else if (max !== null && odometer > max)
      errors.odometer = `Odometer cannot be higher than a later fill-up (${formatKm(max)}).`
    else if (context.isLatest && context.vehicleOdometer != null && odometer < context.vehicleOdometer)
      warnings.odometer = `This is lower than the vehicle's current odometer (${formatKm(context.vehicleOdometer)}). Check the reading.`
  }

  const litres = parseDecimal(input.litres)
  if (input.litres === null || input.litres === undefined || String(input.litres).trim() === '')
    errors.litres = 'Litres is required.'
  else if (litres === null) errors.litres = 'Litres must be a number.'
  else if (litres <= 0) errors.litres = 'Litres must be greater than zero.'
  else if (litres > LIMITS.maxLitres) errors.litres = `Litres cannot exceed ${LIMITS.maxLitres}.`
  else if (context.tankCapacity && litres > context.tankCapacity * 1.1)
    warnings.litres = `More than this vehicle's ${context.tankCapacity} L tank. Check the amount.`

  const pricePerLitre = parseDecimal(input.pricePerLitre)
  if (input.pricePerLitre === null || input.pricePerLitre === undefined || String(input.pricePerLitre).trim() === '')
    errors.pricePerLitre = 'Price per litre is required.'
  else if (pricePerLitre === null) errors.pricePerLitre = 'Price must be a number.'
  else if (pricePerLitre < 0) errors.pricePerLitre = 'Price cannot be negative.'
  else if (pricePerLitre > LIMITS.maxPricePerLitre) errors.pricePerLitre = 'Price per litre is too high.'

  const fuelStation = textField(input.fuelStation, { label: 'Fuel station', max: LIMITS.stationLength }, errors, 'fuelStation')
  const notes = textField(input.notes, { label: 'Notes', max: LIMITS.notesLength }, errors, 'notes')

  const valid = Object.keys(errors).length === 0
  return {
    valid,
    errors,
    warnings,
    value: valid
      ? {
          vehicleId,
          date,
          odometer: roundTo(odometer, 1),
          litres: roundTo(litres, 2),
          pricePerLitre: roundTo(pricePerLitre, 3),
          totalCost: calculateTotalCost(roundTo(litres, 2), roundTo(pricePerLitre, 3)),
          fuelStation,
          notes,
          isFullTank: input.isFullTank !== false && input.isFullTank !== 0,
        }
      : null,
  }
}
