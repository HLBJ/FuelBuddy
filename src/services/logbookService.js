import { createTripRepository } from '../repositories/tripRepository.js'
import { createVehicleRepository } from '../repositories/vehicleRepository.js'
import { NotFoundError, ValidationError } from '../database/errors.js'
import { parseDecimal, roundTo } from './numberUtils.js'
import { isValidIsoDate, toIsoDate } from './dateUtils.js'

/**
 * Travel logbook for SARS. A South African tax year runs from 1 March to the end of
 * February; it is named by the year it ends in (tax year 2027 = 1 Mar 2026 to
 * 28 Feb 2027). SARS expects, per business trip, the date, the distance, where you
 * went and why, plus the odometer readings at the start and end of the tax year.
 */
export const TRIP_PURPOSES = Object.freeze([
  { value: 'business', label: 'Business' },
  { value: 'private', label: 'Private' },
])

export const LOGBOOK_LIMITS = Object.freeze({
  placeLength: 80,
  reasonLength: 120,
  notesLength: 300,
  maxTripKm: 5000,
  maxOdometer: 9_999_999,
})

/** Tax year (named by the year it ends) that a date falls in. */
export function taxYearFor(isoDate) {
  const year = Number(isoDate.slice(0, 4))
  const month = Number(isoDate.slice(5, 7))
  return month >= 3 ? year + 1 : year
}

/** First and last day of a tax year. */
export function taxYearRange(taxYear) {
  const end = new Date(Date.UTC(taxYear, 2, 0)).toISOString().slice(0, 10) // last day of February
  return { start: `${taxYear - 1}-03-01`, end }
}

/** "1 Mar 2026 – 28 Feb 2027" */
export function taxYearLabel(taxYear) {
  return `1 Mar ${taxYear - 1} – ${Number(taxYearRange(taxYear).end.slice(8))} Feb ${taxYear}`
}

function odometerField(raw, label, errors, key) {
  const text = String(raw ?? '').trim()
  if (!text) {
    errors[key] = `Enter the ${label} odometer reading.`
    return null
  }
  const n = parseDecimal(text)
  if (n === null || n < 0 || n > LOGBOOK_LIMITS.maxOdometer) {
    errors[key] = 'Enter the reading in km.'
    return null
  }
  return roundTo(n, 1)
}

function text(raw, max, label, errors, key) {
  const value = String(raw ?? '').trim()
  if (value.length > max) errors[key] = `Keep the ${label} under ${max} characters.`
  return value || null
}

/** Validates trip form input. Business trips need a destination and a reason (SARS). */
export function validateTrip(input, { today = toIsoDate() } = {}) {
  const errors = {}
  const vehicleId = Number(input.vehicleId)
  if (!Number.isInteger(vehicleId) || vehicleId <= 0) errors.vehicleId = 'Choose a vehicle.'

  const date = String(input.date ?? '').trim().slice(0, 10)
  if (!isValidIsoDate(date)) errors.date = 'Enter a valid date.'
  else if (date > today) errors.date = "The trip can't be in the future."

  const purpose = TRIP_PURPOSES.some((p) => p.value === input.purpose) ? input.purpose : null
  if (!purpose) errors.purpose = 'Choose business or private.'

  const startOdometer = odometerField(input.startOdometer, 'starting', errors, 'startOdometer')
  const endOdometer = odometerField(input.endOdometer, 'ending', errors, 'endOdometer')
  if (startOdometer !== null && endOdometer !== null) {
    if (endOdometer < startOdometer) errors.endOdometer = 'The ending reading must be higher than the starting one.'
    else if (endOdometer - startOdometer > LOGBOOK_LIMITS.maxTripKm) errors.endOdometer = `That's over ${LOGBOOK_LIMITS.maxTripKm} km. Please check the readings.`
  }

  const origin = text(input.origin, LOGBOOK_LIMITS.placeLength, 'starting point', errors, 'origin')
  const destination = text(input.destination, LOGBOOK_LIMITS.placeLength, 'destination', errors, 'destination')
  const reason = text(input.reason, LOGBOOK_LIMITS.reasonLength, 'reason', errors, 'reason')
  const notes = text(input.notes, LOGBOOK_LIMITS.notesLength, 'notes', errors, 'notes')
  if (purpose === 'business') {
    if (!destination && !errors.destination) errors.destination = 'SARS needs the destination of a business trip.'
    if (!reason && !errors.reason) errors.reason = 'SARS needs the reason, e.g. "Client meeting – ABC Ltd".'
  }

  const valid = Object.keys(errors).length === 0
  return {
    valid,
    errors,
    value: valid ? { vehicleId, date, purpose, startOdometer, endOdometer, origin, destination, reason, notes } : null,
  }
}

/**
 * Yearly totals. When both odometer readings are known, private km is everything
 * that wasn't logged as business (SARS's method); otherwise only logged km count.
 */
export function summariseLogbook(trips, { openingOdometer = null, closingOdometer = null } = {}) {
  const sum = (purpose) => roundTo(trips.filter((t) => t.purpose === purpose).reduce((s, t) => s + t.distance, 0), 1)
  const businessKm = sum('business')
  const loggedPrivateKm = sum('private')
  const hasReadings = openingOdometer !== null && closingOdometer !== null && closingOdometer >= openingOdometer
  const totalKm = hasReadings ? roundTo(closingOdometer - openingOdometer, 1) : roundTo(businessKm + loggedPrivateKm, 1)
  const privateKm = hasReadings ? roundTo(Math.max(0, totalKm - businessKm), 1) : loggedPrivateKm
  return {
    tripCount: trips.length,
    businessTrips: trips.filter((t) => t.purpose === 'business').length,
    businessKm,
    privateKm,
    totalKm,
    hasReadings,
    businessShare: totalKm > 0 ? roundTo((businessKm / totalKm) * 100, 1) : null,
    readingsTooLow: hasReadings && businessKm > totalKm,
  }
}

export function createLogbookService(db, { today = () => toIsoDate() } = {}) {
  const trips = createTripRepository(db)
  const vehicles = createVehicleRepository(db)

  async function requireVehicle(id) {
    const vehicle = await vehicles.getById(id)
    if (!vehicle) throw new ValidationError({ vehicleId: 'That vehicle no longer exists.' })
    return vehicle
  }

  async function save(id, input) {
    const { valid, errors, value } = validateTrip(input, { today: today() })
    if (!valid) throw new ValidationError(errors)
    return db.transaction(async (tx) => {
      const vehicle = await createVehicleRepository(tx).getById(value.vehicleId)
      if (!vehicle) throw new ValidationError({ vehicleId: 'That vehicle no longer exists.' })
      const repo = createTripRepository(tx)
      const saved = id === null ? await repo.create(value) : await repo.update(id, value)
      if (value.endOdometer > vehicle.currentOdometer) await createVehicleRepository(tx).updateOdometer(vehicle.id, value.endOdometer)
      return saved
    })
  }

  return {
    getById: (id) => trips.getById(id),

    /** Trips in a tax year, newest first, with the year's readings and totals. */
    async year(vehicleId, taxYear) {
      const { start, end } = taxYearRange(taxYear)
      const [list, readings, range] = await Promise.all([
        trips.listByVehicle(vehicleId, { from: start, to: end }),
        trips.getYear(vehicleId, taxYear),
        trips.odometerRange(vehicleId, start, end),
      ])
      return {
        taxYear,
        trips: [...list].reverse(),
        readings,
        suggested: { openingOdometer: range.low, closingOdometer: range.high },
        summary: summariseLogbook(list, readings),
      }
    },

    /** Starting odometer to suggest for a new trip: where the last one ended, or the vehicle's. */
    async suggestedStart(vehicleId) {
      const [last, vehicle] = await Promise.all([trips.latest(vehicleId), requireVehicle(vehicleId)])
      return Math.max(last?.endOdometer ?? 0, vehicle.currentOdometer ?? 0)
    },

    create: (input) => save(null, input),

    async update(id, input) {
      if (!(await trips.getById(id))) throw new NotFoundError('That trip no longer exists.')
      return save(id, input)
    },

    async delete(id) {
      if (!(await trips.delete(id))) throw new NotFoundError('That trip no longer exists.')
      return true
    },

    async setReadings(vehicleId, taxYear, input) {
      const errors = {}
      const read = (raw, key) => {
        const t = String(raw ?? '').trim()
        if (!t) return null
        const n = parseDecimal(t)
        if (n === null || n < 0 || n > LOGBOOK_LIMITS.maxOdometer) { errors[key] = 'Enter the reading in km.'; return null }
        return roundTo(n, 1)
      }
      const openingOdometer = read(input.openingOdometer, 'openingOdometer')
      const closingOdometer = read(input.closingOdometer, 'closingOdometer')
      if (openingOdometer !== null && closingOdometer !== null && closingOdometer < openingOdometer) {
        errors.closingOdometer = 'The closing reading must be higher than the opening one.'
      }
      if (Object.keys(errors).length) throw new ValidationError(errors)
      await requireVehicle(vehicleId)
      return trips.setYear(vehicleId, taxYear, { openingOdometer, closingOdometer })
    },
  }
}
