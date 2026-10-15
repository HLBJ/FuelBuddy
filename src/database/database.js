import { Capacitor } from '@capacitor/core'
import { runMigrations } from './migrator.js'
import { DatabaseError } from './errors.js'

export const DATABASE_NAME = 'fuelbuddy'

let driver = null
let initPromise = null

/**
 * Opens the platform's SQLite connection and brings the schema up to date.
 * Safe to call repeatedly; concurrent callers share one initialisation.
 */
export function initDatabase() {
  if (!initPromise) {
    initPromise = (async () => {
      try {
        const created = Capacitor.isNativePlatform()
          ? await (await import('./drivers/capacitorDriver.js')).createCapacitorDriver(DATABASE_NAME)
          : await (await import('./drivers/webDriver.js')).createWebDriver(DATABASE_NAME)
        await runMigrations(created)
        driver = created
        return driver
      } catch (error) {
        initPromise = null
        if (error instanceof DatabaseError) throw error
        throw new DatabaseError(`Could not open the FuelBuddy database: ${error.message}`, error)
      }
    })()
  }
  return initPromise
}

/** Returns the open driver. `initDatabase()` must have completed first. */
export function getDb() {
  if (!driver) throw new DatabaseError('Database has not been initialised.')
  return driver
}

/** Test hook: install an already-migrated driver (e.g. sql.js in Node). */
export function setDbForTesting(testDriver) {
  driver = testDriver
  initPromise = testDriver ? Promise.resolve(testDriver) : null
}
