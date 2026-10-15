import { migrations as defaultMigrations } from './migrations/index.js'
import { DatabaseError } from './errors.js'

export async function getSchemaVersion(driver) {
  const rows = await driver.query('PRAGMA user_version')
  const value = rows[0] ? Object.values(rows[0])[0] : 0
  return Number(value) || 0
}

function validateMigrations(migrations) {
  migrations.forEach((m, index) => {
    if (m.version !== index + 1) {
      throw new DatabaseError(
        `Migration list is not consecutive: expected version ${index + 1}, found ${m.version}`,
      )
    }
  })
}

/**
 * Applies every migration newer than the database's current `user_version`.
 * Each migration runs in its own transaction together with the version bump, so a
 * failure leaves the database at the last fully applied version.
 *
 * @returns {Promise<{from: number, to: number, applied: number[]}>}
 */
export async function runMigrations(driver, migrations = defaultMigrations) {
  validateMigrations(migrations)
  const from = await getSchemaVersion(driver)
  const latest = migrations.length ? migrations[migrations.length - 1].version : 0

  if (from > latest) {
    throw new DatabaseError(
      `This database was created by a newer version of FuelBuddy (schema ${from}). ` +
        'Please update the app.',
    )
  }

  const applied = []
  for (const migration of migrations) {
    if (migration.version <= from) continue
    try {
      await driver.transaction(async (tx) => {
        for (const sql of migration.statements) {
          await tx.run(sql)
        }
        // PRAGMA does not accept bound parameters; version is a trusted integer.
        await tx.run(`PRAGMA user_version = ${Number(migration.version)}`)
      })
      applied.push(migration.version)
    } catch (error) {
      throw new DatabaseError(
        `Database upgrade to schema ${migration.version} failed: ${error.message}`,
        error,
      )
    }
  }

  return { from, to: await getSchemaVersion(driver), applied }
}
