import { createVehicleRepository } from '../repositories/vehicleRepository.js'
import { createFuelEntryRepository } from '../repositories/fuelEntryRepository.js'
import { NotFoundError, ValidationError } from '../database/errors.js'
import { validateFuelEntry } from './validation.js'
import { toIsoDate } from './dateUtils.js'

/**
 * Fuel entry use-cases. Enforces that odometer readings never decrease over time
 * for a vehicle and keeps the vehicle's current odometer at least as high as its
 * latest fill-up.
 */
export function createFuelEntryService(db, { today = () => toIsoDate() } = {}) {
  const entries = createFuelEntryRepository(db)

  async function buildContext(tx, input, excludeId) {
    const vehicle = await createVehicleRepository(tx).getById(Number(input.vehicleId))
    if (!vehicle) return { vehicle: null, context: { today: today() } }
    const repo = createFuelEntryRepository(tx)
    const date = typeof input.date === 'string' ? input.date.slice(0, 10) : ''
    const bounds = date ? await repo.getOdometerBounds(vehicle.id, date, excludeId) : { min: null, max: null }
    return {
      vehicle,
      context: {
        today: today(),
        bounds,
        isLatest: bounds.max === null,
        vehicleOdometer: vehicle.currentOdometer,
        tankCapacity: vehicle.tankCapacity,
      },
    }
  }

  async function validate(tx, input, excludeId = null) {
    const { vehicle, context } = await buildContext(tx, input, excludeId)
    const result = validateFuelEntry(input, context)
    if (!vehicle && !result.errors.vehicleId) result.errors.vehicleId = 'That vehicle no longer exists.'
    result.valid = Object.keys(result.errors).length === 0
    return { ...result, vehicle }
  }

  async function raiseVehicleOdometer(tx, vehicle, odometer) {
    if (odometer > vehicle.currentOdometer) {
      await createVehicleRepository(tx).updateOdometer(vehicle.id, odometer)
    }
  }

  return {
    listByVehicle: (vehicleId) => entries.listByVehicle(vehicleId),
    listRecent: (vehicleId, limit) => entries.listRecent(vehicleId, limit),
    listAll: () => entries.listAll(),
    getById: (id) => entries.getById(id),

    /** Validation without saving — lets forms show errors and warnings live. */
    check(input, excludeId = null) {
      return validate(db, input, excludeId)
    },

    async create(input) {
      return db.transaction(async (tx) => {
        const { valid, errors, value, vehicle } = await validate(tx, input)
        if (!valid) throw new ValidationError(errors)
        const created = await createFuelEntryRepository(tx).create(value)
        await raiseVehicleOdometer(tx, vehicle, value.odometer)
        return created
      })
    },

    async update(id, input) {
      return db.transaction(async (tx) => {
        const repo = createFuelEntryRepository(tx)
        if (!(await repo.getById(id))) throw new NotFoundError('That fill-up no longer exists.')
        const { valid, errors, value, vehicle } = await validate(tx, input, id)
        if (!valid) throw new ValidationError(errors)
        const updated = await repo.update(id, value)
        await raiseVehicleOdometer(tx, vehicle, value.odometer)
        return updated
      })
    },

    async delete(id) {
      const removed = await entries.delete(id)
      if (!removed) throw new NotFoundError('That fill-up no longer exists.')
      return true
    },
  }
}
