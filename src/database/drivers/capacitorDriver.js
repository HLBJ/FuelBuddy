import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite'
import { createSerializedDriver } from './serializedDriver.js'

const WRITE_PATTERN = /^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i

/**
 * Native Android/iOS driver using @capacitor-community/sqlite.
 * The plugin enables foreign keys on open and leaves `PRAGMA user_version` alone
 * when no plugin-level upgrade statements are registered, so FuelBuddy's own
 * migration runner owns the schema version.
 */
export async function createCapacitorDriver(databaseName) {
  const sqlite = new SQLiteConnection(CapacitorSQLite)

  // After a WebView reload the native side may still hold the connection.
  const consistency = await sqlite.checkConnectionsConsistency()
  const exists = (await sqlite.isConnection(databaseName, false)).result
  const db =
    consistency.result && exists
      ? await sqlite.retrieveConnection(databaseName, false)
      : await sqlite.createConnection(databaseName, false, 'no-encryption', 1, false)

  await db.open()

  const raw = {
    async query(sql, params) {
      const result = await db.query(sql, normaliseParams(params))
      return result.values || []
    },
    async run(sql, params) {
      const values = normaliseParams(params)
      // DDL and PRAGMA statements go through execute(); DML through run() so the
      // plugin reports lastId. `false` = do not wrap in a plugin-level transaction,
      // transactions are controlled explicitly by the serialized driver.
      const result =
        values.length === 0 && !WRITE_PATTERN.test(sql)
          ? await db.execute(sql, false)
          : await db.run(sql, values, false)
      const changes = result.changes || {}
      return { changes: changes.changes ?? 0, lastId: changes.lastId ?? null }
    },
    async begin() {
      await db.beginTransaction()
    },
    async commit() {
      await db.commitTransaction()
    },
    async rollback() {
      await db.rollbackTransaction()
    },
    async close() {
      await sqlite.closeConnection(databaseName, false)
    },
  }

  return createSerializedDriver(raw)
}

function normaliseParams(params = []) {
  return params.map((value) => {
    if (value === undefined) return null
    if (typeof value === 'boolean') return value ? 1 : 0
    return value
  })
}
