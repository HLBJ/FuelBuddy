import { describe, expect, it } from 'vitest'
import { createTestDb, entryInput, vehicleInput } from './helpers/testDatabase.js'
import { BACKUP_TABLES, BackupError, createBackup, parseBackup, restoreBackup, summariseBackup } from '../src/services/backupService.js'
import { createVehicleService } from '../src/services/vehicleService.js'
import { createFuelEntryService } from '../src/services/fuelEntryService.js'
import { createReminderService } from '../src/services/reminderService.js'
import { createSettingsRepository } from '../src/repositories/settingsRepository.js'

async function seededDb() {
  const db = await createTestDb()
  const vehicle = await createVehicleService(db).create(vehicleInput())
  const fuel = createFuelEntryService(db, { today: () => '2026-10-15' })
  await fuel.create(entryInput(vehicle.id, { date: '2026-09-01', odometer: '50500' }))
  await fuel.create(entryInput(vehicle.id, { date: '2026-09-15', odometer: '51000', litres: '35' }))
  await createReminderService(db, { today: () => '2026-10-15' }).create({ vehicleId: vehicle.id, type: 'licence', title: 'Renew licence disc', dueDate: '2027-01-31' })
  await db.run(
    `INSERT INTO trips (vehicle_id, date, start_odometer, end_odometer, purpose, destination, reason, created_at, updated_at)
     VALUES (?, '2026-09-10', 50700, 50760, 'business', 'Client A, Stellenbosch', 'Site visit', 'x', 'x')`,
    [vehicle.id],
  )
  await db.run("INSERT INTO logbook_years (vehicle_id, tax_year, opening_odometer, updated_at) VALUES (?, 2027, 49000, 'x')", [vehicle.id])
  const settings = createSettingsRepository(db)
  await settings.set('theme', 'dark')
  await settings.set('proUnlocked', true)
  return { db, vehicle }
}

const dump = async (db) => {
  const out = {}
  for (const t of BACKUP_TABLES) out[t] = await db.query(`SELECT * FROM ${t}`)
  return out
}

describe('backup and restore', () => {
  it('restores everything onto another device, except the Pro purchase', async () => {
    const { db: oldPhone } = await seededDb()
    const file = JSON.stringify(await createBackup(oldPhone, { now: new Date('2026-10-15T10:00:00Z') }))

    const newPhone = await createTestDb()
    await createVehicleService(newPhone).create(vehicleInput({ name: 'Other car' }))
    const backup = parseBackup(file)
    expect(summariseBackup(backup)).toEqual({ createdAt: '2026-10-15T10:00:00.000Z', vehicles: 1, fillUps: 2, reminders: 1, trips: 1 })
    expect(JSON.parse(file).settings.proUnlocked).toBeUndefined()

    await restoreBackup(newPhone, backup)
    expect(await dump(newPhone)).toEqual(await dump(oldPhone))
    const settings = createSettingsRepository(newPhone)
    expect(await settings.get('theme')).toBe('dark')
    expect(await settings.get('proUnlocked')).toBe(false) // not unlocked by a file
  })

  it('keeps a purchase made on this device when restoring', async () => {
    const { db } = await seededDb()
    const backup = parseBackup(JSON.stringify(await createBackup(db)))
    await restoreBackup(db, backup)
    expect(await createSettingsRepository(db).get('proUnlocked')).toBe(true)
  })

  it('rejects files that are not FuelBuddy backups', () => {
    expect(() => parseBackup('not json')).toThrow(BackupError)
    expect(() => parseBackup('{"format":"other"}')).toThrow(/isn't a FuelBuddy backup/)
    expect(() => parseBackup(JSON.stringify({ format: 'fuelbuddy-backup', version: 1, schemaVersion: 1, tables: { vehicles: 'x' } }))).toThrow(/damaged/)
    expect(() => parseBackup(JSON.stringify({ format: 'fuelbuddy-backup', version: 1, schemaVersion: 99, tables: {} }))).toThrow(/newer version/)
  })

  it('restores a backup from an older version that had no logbook', async () => {
    const { db } = await seededDb()
    const backup = await createBackup(db)
    delete backup.tables.trips
    delete backup.tables.logbook_years
    backup.schemaVersion = 2
    backup.tables.vehicles[0].retired_column = 'ignored'
    const target = await createTestDb()
    await restoreBackup(target, parseBackup(JSON.stringify(backup)))
    expect((await target.query('SELECT name FROM vehicles'))[0].name).toBe('Polo')
    expect(await target.query('SELECT * FROM trips')).toEqual([])
  })

  it('leaves existing data untouched when a row breaks a rule', async () => {
    const { db } = await seededDb()
    const before = await dump(db)
    const bad = await createBackup(db)
    bad.tables.fuel_entries[0].vehicle_id = 999 // no such vehicle
    await expect(restoreBackup(db, parseBackup(JSON.stringify(bad)))).rejects.toThrow()
    expect(await dump(db)).toEqual(before)
  })
})
