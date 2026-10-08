import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, entryInput, vehicleInput } from './helpers/testDatabase.js'
import { createVehicleService } from '../src/services/vehicleService.js'
import { createFuelEntryService } from '../src/services/fuelEntryService.js'
import { NotFoundError, ValidationError } from '../src/database/errors.js'

let db, vehicles, fuel

beforeEach(async () => {
  db = await createTestDb()
  vehicles = createVehicleService(db)
  fuel = createFuelEntryService(db, { today: () => '2026-10-08' })
})

async function expectValidation(promise, field) {
  const error = await promise.catch((e) => e)
  expect(error).toBeInstanceOf(ValidationError)
  expect(error.errors[field]).toBeTruthy()
  return error
}

describe('vehicle service', () => {
  it('makes the first vehicle the default and keeps exactly one default', async () => {
    const a = await vehicles.create(vehicleInput())
    expect(a.isDefault).toBe(true)
    const b = await vehicles.create(vehicleInput({ name: 'Hilux' }))
    expect(b.isDefault).toBe(false)
    const c = await vehicles.create(vehicleInput({ name: 'Corolla', isDefault: true }))
    expect(c.isDefault).toBe(true)
    await vehicles.setDefault(b.id)
    const list = await vehicles.list()
    expect(list.filter((v) => v.isDefault).map((v) => v.id)).toEqual([b.id])
    expect(list[0].id).toBe(b.id)
  })

  it('rejects invalid vehicles without writing anything', async () => {
    await expectValidation(vehicles.create(vehicleInput({ name: '' })), 'name')
    expect(await vehicles.count()).toBe(0)
  })

  it('cannot lower the odometer below recorded fill-ups', async () => {
    const v = await vehicles.create(vehicleInput())
    await fuel.create(entryInput(v.id, { odometer: '50500' }))
    await expectValidation(vehicles.update(v.id, vehicleInput({ currentOdometer: '50400' })), 'currentOdometer')
    const ok = await vehicles.update(v.id, vehicleInput({ currentOdometer: '51000', name: 'My Polo' }))
    expect(ok).toMatchObject({ name: 'My Polo', currentOdometer: 51000 })
  })

  it('deleting removes its fill-ups and promotes another default', async () => {
    const a = await vehicles.create(vehicleInput())
    const b = await vehicles.create(vehicleInput({ name: 'Hilux' }))
    await fuel.create(entryInput(a.id))
    await fuel.create(entryInput(a.id, { date: '2026-09-10', odometer: '51000' }))
    await fuel.create(entryInput(b.id))
    expect(await vehicles.deletionImpact(a.id)).toEqual({ fillUps: 2 })
    await vehicles.delete(a.id)
    expect(await fuel.listByVehicle(a.id)).toEqual([])
    expect(await fuel.listByVehicle(b.id)).toHaveLength(1)
    expect((await vehicles.getById(b.id)).isDefault).toBe(true)
  })

  it('throws NotFoundError for missing vehicles', async () => {
    await expect(vehicles.delete(42)).rejects.toBeInstanceOf(NotFoundError)
    await expect(vehicles.setDefault(42)).rejects.toBeInstanceOf(NotFoundError)
    await expect(vehicles.update(42, vehicleInput())).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('fuel entry service', () => {
  let v
  beforeEach(async () => {
    v = await vehicles.create(vehicleInput({ currentOdometer: '50000' }))
  })

  it('creates an entry with calculated total and raises the vehicle odometer', async () => {
    const created = await fuel.create(entryInput(v.id, { odometer: '50500', litres: '40', pricePerLitre: '23,50' }))
    expect(created).toMatchObject({ litres: 40, pricePerLitre: 23.5, totalCost: 940, odometer: 50500 })
    expect((await vehicles.getById(v.id)).currentOdometer).toBe(50500)
  })

  it('never lowers the vehicle odometer for a backdated entry', async () => {
    await fuel.create(entryInput(v.id, { date: '2026-09-01', odometer: '49000' }))
    expect((await vehicles.getById(v.id)).currentOdometer).toBe(50000)
  })

  it('odometer cannot decrease over time', async () => {
    await fuel.create(entryInput(v.id, { date: '2026-09-01', odometer: '50500' }))
    await fuel.create(entryInput(v.id, { date: '2026-09-20', odometer: '51500' }))
    await expectValidation(fuel.create(entryInput(v.id, { date: '2026-10-01', odometer: '51400' })), 'odometer')
    await expectValidation(fuel.create(entryInput(v.id, { date: '2026-09-10', odometer: '52000' })), 'odometer')
    await expectValidation(fuel.create(entryInput(v.id, { date: '2026-09-10', odometer: '50400' })), 'odometer')
    const between = await fuel.create(entryInput(v.id, { date: '2026-09-10', odometer: '51000' }))
    expect(between.odometer).toBe(51000)
    expect(await fuel.listByVehicle(v.id)).toHaveLength(3)
  })

  it('editing an entry excludes itself from the bounds', async () => {
    const a = await fuel.create(entryInput(v.id, { date: '2026-09-01', odometer: '50500' }))
    await fuel.create(entryInput(v.id, { date: '2026-09-20', odometer: '51500' }))
    const edited = await fuel.update(a.id, entryInput(v.id, { date: '2026-09-01', odometer: '50600', litres: '35' }))
    expect(edited).toMatchObject({ odometer: 50600, litres: 35 })
    await expectValidation(fuel.update(a.id, entryInput(v.id, { date: '2026-09-01', odometer: '51600' })), 'odometer')
  })

  it('rejects invalid entries without writing', async () => {
    await expectValidation(fuel.create(entryInput(v.id, { litres: '0' })), 'litres')
    await expectValidation(fuel.create(entryInput(v.id, { pricePerLitre: '-1' })), 'pricePerLitre')
    await expectValidation(fuel.create(entryInput(v.id, { date: '2026-10-09' })), 'date')
    await expectValidation(fuel.create(entryInput(999)), 'vehicleId')
    expect(await fuel.listByVehicle(v.id)).toEqual([])
    expect((await vehicles.getById(v.id)).currentOdometer).toBe(50000)
  })

  it('keeps records separate per vehicle', async () => {
    const other = await vehicles.create(vehicleInput({ name: 'Hilux', currentOdometer: '1000' }))
    await fuel.create(entryInput(v.id, { odometer: '50500' }))
    // A low reading is fine for the other vehicle: bounds are per vehicle.
    await fuel.create(entryInput(other.id, { odometer: '1200' }))
    expect(await fuel.listByVehicle(v.id)).toHaveLength(1)
    expect(await fuel.listByVehicle(other.id)).toHaveLength(1)
  })

  it('check() reports warnings without saving', async () => {
    const result = await fuel.check(entryInput(v.id, { odometer: '49000' }))
    expect(result.valid).toBe(true)
    expect(result.warnings.odometer).toBeTruthy()
    expect(await fuel.listByVehicle(v.id)).toEqual([])
  })

  it('update/delete of missing entries throw NotFoundError', async () => {
    await expect(fuel.update(77, entryInput(v.id))).rejects.toBeInstanceOf(NotFoundError)
    await expect(fuel.delete(77)).rejects.toBeInstanceOf(NotFoundError)
  })
})
