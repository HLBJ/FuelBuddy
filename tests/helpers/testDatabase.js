import initSqlJs from 'sql.js'
import { createSqlJsDriver } from '../../src/database/drivers/sqljsDriver.js'
import { runMigrations } from '../../src/database/migrator.js'

let SQL

/** Real in-memory SQLite (sql.js) with the production migrations applied. */
export async function createTestDb({ migrate = true, data } = {}) {
  SQL = SQL || (await initSqlJs())
  const db = createSqlJsDriver(SQL, { data })
  if (migrate) await runMigrations(db)
  return db
}

export function vehicleInput(overrides = {}) {
  return {
    name: 'Polo',
    make: 'Volkswagen',
    model: 'Polo Vivo',
    registration: 'CA 123-456',
    year: '2019',
    fuelType: 'petrol',
    tankCapacity: '45',
    currentOdometer: '50000',
    ...overrides,
  }
}

export function entryInput(vehicleId, overrides = {}) {
  return {
    vehicleId,
    date: '2026-09-01',
    odometer: '50500',
    litres: '40',
    pricePerLitre: '23.50',
    fuelStation: 'Engen Main Rd',
    notes: '',
    isFullTank: true,
    ...overrides,
  }
}
