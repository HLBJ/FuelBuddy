import { describe, expect, it } from 'vitest'
import { createTestDb } from './helpers/testDatabase.js'
import { getSchemaVersion, runMigrations } from '../src/database/migrator.js'
import { LATEST_SCHEMA_VERSION, migrations } from '../src/database/migrations/index.js'
import { createVehicleRepository } from '../src/repositories/vehicleRepository.js'
import { createFuelEntryRepository } from '../src/repositories/fuelEntryRepository.js'
import { createSettingsRepository, SETTING_DEFAULTS } from '../src/repositories/settingsRepository.js'

const baseVehicle = { name: 'Polo', fuelType: 'petrol', currentOdometer: 1000 }
const baseEntry = (vehicleId, o = {}) => ({ vehicleId, date: '2026-09-01', odometer: 1500, litres: 40, pricePerLitre: 22, totalCost: 880, isFullTank: true, ...o })

async function columns(db, table) {
  return (await db.query(`PRAGMA table_info(${table})`)).map((c) => c.name)
}

describe('initialisation and migrations', () => {
  it('creates the schema on a fresh database', async () => {
    const db = await createTestDb({ migrate: false })
    expect(await getSchemaVersion(db)).toBe(0)
    const result = await runMigrations(db)
    expect(result).toMatchObject({ from: 0, to: LATEST_SCHEMA_VERSION })
    expect(await columns(db, 'vehicles')).toEqual(expect.arrayContaining([
      'id', 'name', 'make', 'model', 'registration', 'year', 'fuel_type', 'tank_capacity', 'current_odometer', 'is_default', 'created_at', 'updated_at']))
    expect(await columns(db, 'fuel_entries')).toEqual(expect.arrayContaining([
      'id', 'vehicle_id', 'date', 'odometer', 'litres', 'price_per_litre', 'total_cost', 'fuel_station', 'notes', 'is_full_tank', 'created_at', 'updated_at']))
    expect(await columns(db, 'settings')).toEqual(['key', 'value', 'updated_at'])
  })

  it('is idempotent', async () => {
    const db = await createTestDb()
    const again = await runMigrations(db)
    expect(again.applied).toEqual([])
    expect(again.to).toBe(LATEST_SCHEMA_VERSION)
  })

  it('upgrades an existing database in place without losing data (app update)', async () => {
    const db = await createTestDb()
    const vehicle = await createVehicleRepository(db).create(baseVehicle)
    await createFuelEntryRepository(db).create(baseEntry(vehicle.id))
    const bytes = db.exportBytes()

    const reopened = await createTestDb({ data: bytes, migrate: false })
    const next = [...migrations, { version: migrations.length + 1, statements: ['ALTER TABLE vehicles ADD COLUMN colour TEXT'] }]
    const result = await runMigrations(reopened, next)
    expect(result.applied).toEqual([migrations.length + 1])
    expect(await columns(reopened, 'vehicles')).toContain('colour')
    expect((await createVehicleRepository(reopened).list())[0].name).toBe('Polo')
    expect(await createFuelEntryRepository(reopened).countByVehicle(vehicle.id)).toBe(1)
  })

  it('rolls back a failing migration and keeps the previous version', async () => {
    const db = await createTestDb()
    const broken = [...migrations, { version: migrations.length + 1, statements: ['CREATE TABLE extra (id INTEGER)', 'THIS IS NOT SQL'] }]
    await expect(runMigrations(db, broken)).rejects.toThrow(/upgrade to schema/)
    expect(await getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION)
    expect(await db.query("SELECT name FROM sqlite_master WHERE name = 'extra'")).toEqual([])
  })

  it('refuses a database from a newer app version and bad migration lists', async () => {
    const db = await createTestDb()
    await db.run('PRAGMA user_version = 99')
    await expect(runMigrations(db)).rejects.toThrow(/newer version/)
    const fresh = await createTestDb({ migrate: false })
    await expect(runMigrations(fresh, [{ version: 2, statements: [] }])).rejects.toThrow(/consecutive/)
  })
})

describe('driver transactions', () => {
  it('rolls back every statement when the callback throws', async () => {
    const db = await createTestDb()
    await expect(db.transaction(async (tx) => {
      await tx.run("INSERT INTO settings (key, value, updated_at) VALUES ('a', '1', 'now')")
      throw new Error('boom')
    })).rejects.toThrow('boom')
    expect(await db.query('SELECT * FROM settings')).toEqual([])
  })

  it('serialises concurrent operations so transactions do not interleave', async () => {
    const db = await createTestDb()
    const order = []
    const slow = db.transaction(async (tx) => {
      order.push('tx-start')
      await new Promise((r) => setTimeout(r, 20))
      await tx.run("INSERT INTO settings (key, value, updated_at) VALUES ('t', '1', 'now')")
      order.push('tx-end')
    })
    const read = db.query('SELECT COUNT(*) AS n FROM settings').then((rows) => { order.push(`read-${rows[0].n}`) })
    await Promise.all([slow, read])
    expect(order).toEqual(['tx-start', 'tx-end', 'read-1'])
  })
})

describe('repositories', () => {
  it('vehicle CRUD maps fields and booleans', async () => {
    const db = await createTestDb()
    const repo = createVehicleRepository(db)
    const v = await repo.create({ ...baseVehicle, make: ' VW ', model: '', registration: 'CA 1', year: 2019, tankCapacity: 45, isDefault: true })
    expect(v).toMatchObject({ name: 'Polo', make: 'VW', model: null, registration: 'CA 1', year: 2019, fuelType: 'petrol', tankCapacity: 45, currentOdometer: 1000, isDefault: true })
    expect(v.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    const updated = await repo.update(v.id, { ...v, name: 'Polo Vivo', currentOdometer: 1200 })
    expect(updated).toMatchObject({ name: 'Polo Vivo', currentOdometer: 1200, isDefault: true })
    expect(await repo.count()).toBe(1)
    expect(await repo.delete(v.id)).toBe(true)
    expect(await repo.getById(v.id)).toBeNull()
    expect(await repo.delete(v.id)).toBe(false)
  })

  it('setDefault leaves exactly one default', async () => {
    const db = await createTestDb()
    const repo = createVehicleRepository(db)
    const a = await repo.create({ ...baseVehicle, isDefault: true })
    const b = await repo.create({ ...baseVehicle, name: 'Hilux' })
    await repo.setDefault(b.id)
    const defaults = (await repo.list()).filter((v) => v.isDefault)
    expect(defaults.map((v) => v.id)).toEqual([b.id])
    expect((await repo.getDefault()).id).toBe(b.id)
    expect((await repo.getById(a.id)).isDefault).toBe(false)
  })

  it('fuel entry CRUD, ordering and bounds', async () => {
    const db = await createTestDb()
    const v = await createVehicleRepository(db).create(baseVehicle)
    const repo = createFuelEntryRepository(db)
    const mid = await repo.create(baseEntry(v.id, { date: '2026-09-10', odometer: 2000, fuelStation: ' Sasol ', isFullTank: false }))
    const first = await repo.create(baseEntry(v.id, { date: '2026-09-01', odometer: 1500 }))
    const last = await repo.create(baseEntry(v.id, { date: '2026-09-20', odometer: 2500 }))
    expect(mid).toMatchObject({ fuelStation: 'Sasol', isFullTank: false, notes: null })
    expect((await repo.listByVehicle(v.id)).map((x) => x.id)).toEqual([first.id, mid.id, last.id])
    expect((await repo.listRecent(v.id, 2)).map((x) => x.id)).toEqual([last.id, mid.id])
    expect(await repo.getOdometerBounds(v.id, '2026-09-10')).toEqual({ min: 1500, max: 2500 })
    expect(await repo.getOdometerBounds(v.id, '2026-09-10', mid.id)).toEqual({ min: 1500, max: 2500 })
    expect(await repo.getOdometerBounds(v.id, '2026-08-01')).toEqual({ min: null, max: 1500 })
    expect(await repo.getOdometerBounds(v.id, '2026-10-01')).toEqual({ min: 2500, max: null })
    expect(await repo.maxOdometer(v.id)).toBe(2500)
    const edited = await repo.update(mid.id, { ...mid, litres: 12, totalCost: 264 })
    expect(edited).toMatchObject({ litres: 12, totalCost: 264 })
    expect(await repo.delete(mid.id)).toBe(true)
    expect(await repo.countByVehicle(v.id)).toBe(2)
  })

  it('deleting a vehicle cascades to its entries only', async () => {
    const db = await createTestDb()
    const vehicles = createVehicleRepository(db)
    const entries = createFuelEntryRepository(db)
    const a = await vehicles.create(baseVehicle)
    const b = await vehicles.create({ ...baseVehicle, name: 'Hilux' })
    await entries.create(baseEntry(a.id))
    await entries.create(baseEntry(b.id))
    await vehicles.delete(a.id)
    expect(await entries.countByVehicle(a.id)).toBe(0)
    expect(await entries.countByVehicle(b.id)).toBe(1)
  })

  it('SQL constraints reject invalid rows and orphan entries', async () => {
    const db = await createTestDb()
    const v = await createVehicleRepository(db).create(baseVehicle)
    const entries = createFuelEntryRepository(db)
    await expect(entries.create(baseEntry(v.id, { litres: 0 }))).rejects.toThrow()
    await expect(entries.create(baseEntry(v.id, { odometer: -1 }))).rejects.toThrow()
    await expect(entries.create(baseEntry(v.id, { pricePerLitre: -1 }))).rejects.toThrow()
    await expect(entries.create(baseEntry(9999))).rejects.toThrow()
    await expect(createVehicleRepository(db).create({ ...baseVehicle, name: '   ' })).rejects.toThrow()
  })

  it('settings round-trip JSON values with defaults', async () => {
    const db = await createTestDb()
    const repo = createSettingsRepository(db)
    expect(await repo.getAll()).toEqual(SETTING_DEFAULTS)
    expect(await repo.get('theme')).toBe('system')
    await repo.set('onboardingComplete', true)
    await repo.set('theme', 'dark')
    await repo.set('theme', 'light')
    expect(await repo.get('onboardingComplete')).toBe(true)
    expect(await repo.get('theme')).toBe('light')
    await db.run("INSERT INTO settings (key, value, updated_at) VALUES ('proUnlocked', '{corrupt', 'x')")
    expect(await repo.get('proUnlocked')).toBe(false)
    await repo.deleteAll()
    expect(await repo.get('theme')).toBe('system')
  })
})
