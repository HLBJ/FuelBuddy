import { createVehicleRepository } from '../repositories/vehicleRepository.js'
import { createFuelEntryRepository } from '../repositories/fuelEntryRepository.js'
import { NotFoundError, ValidationError } from '../database/errors.js'
import { validateVehicle } from './validation.js'

/**
 * Vehicle use-cases. Guarantees: validated input only, exactly one default
 * vehicle whenever at least one vehicle exists, and fuel entries removed together
 * with their vehicle.
 */
export function createVehicleService(db) {
  const vehicles = createVehicleRepository(db)

  async function requireVehicle(repo, id) {
    const vehicle = await repo.getById(id)
    if (!vehicle) throw new NotFoundError('That vehicle no longer exists.')
    return vehicle
  }

  return {
    list: () => vehicles.list(),
    getById: (id) => vehicles.getById(id),
    getDefault: () => vehicles.getDefault(),
    count: () => vehicles.count(),

    async create(input) {
      const { valid, errors, value } = validateVehicle(input)
      if (!valid) throw new ValidationError(errors)
      return db.transaction(async (tx) => {
        const repo = createVehicleRepository(tx)
        const isFirst = (await repo.count()) === 0
        const created = await repo.create({ ...value, isDefault: isFirst })
        if (!isFirst && input.isDefault) await repo.setDefault(created.id)
        return repo.getById(created.id)
      })
    },

    async update(id, input) {
      return db.transaction(async (tx) => {
        const repo = createVehicleRepository(tx)
        await requireVehicle(repo, id)
        const maxEntryOdometer = await createFuelEntryRepository(tx).maxOdometer(id)
        const { valid, errors, value } = validateVehicle(input, { maxEntryOdometer })
        if (!valid) throw new ValidationError(errors)
        await repo.update(id, value)
        if (input.isDefault) await repo.setDefault(id)
        return repo.getById(id)
      })
    },

    async setDefault(id) {
      return db.transaction(async (tx) => {
        const repo = createVehicleRepository(tx)
        await requireVehicle(repo, id)
        await repo.setDefault(id)
        return repo.getById(id)
      })
    },

    /** Number of fill-ups that deleting this vehicle would also remove. */
    async deletionImpact(id) {
      return { fillUps: await createFuelEntryRepository(db).countByVehicle(id) }
    },

    /** Deletes the vehicle and its entries; promotes another vehicle to default if needed. */
    async delete(id) {
      return db.transaction(async (tx) => {
        const repo = createVehicleRepository(tx)
        const vehicle = await requireVehicle(repo, id)
        // Explicit delete keeps behaviour identical even if a driver had FKs disabled.
        await tx.run('DELETE FROM fuel_entries WHERE vehicle_id = ?', [id])
        await repo.delete(id)
        if (vehicle.isDefault) {
          const remaining = await repo.list()
          if (remaining.length) await repo.setDefault(remaining[0].id)
        }
        return true
      })
    },
  }
}
