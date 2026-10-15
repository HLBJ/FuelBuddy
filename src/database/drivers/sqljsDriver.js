import { createSerializedDriver } from './serializedDriver.js'

/**
 * SQLite driver backed by sql.js (SQLite compiled to WebAssembly).
 * Used for automated tests (Node) and the browser development preview. The Android
 * app uses the native driver instead.
 *
 * @param {object} SQL       an initialised sql.js module (`await initSqlJs()`)
 * @param {object} [options]
 * @param {Uint8Array} [options.data]   existing database bytes to open
 * @param {(bytes: Uint8Array) => Promise<void>|void} [options.persist]
 *        called with the exported database after every committed write
 */
export function createSqlJsDriver(SQL, { data, persist } = {}) {
  const db = data ? new SQL.Database(data) : new SQL.Database()
  db.run('PRAGMA foreign_keys = ON')

  const raw = {
    async query(sql, params) {
      const stmt = db.prepare(sql)
      try {
        stmt.bind(normaliseParams(params))
        const rows = []
        while (stmt.step()) rows.push(stmt.getAsObject())
        return rows
      } finally {
        stmt.free()
      }
    },
    async run(sql, params) {
      db.run(sql, normaliseParams(params))
      const changes = db.getRowsModified()
      const idRow = db.exec('SELECT last_insert_rowid() AS id')
      const lastId = idRow[0] ? Number(idRow[0].values[0][0]) : null
      return { changes, lastId }
    },
    async begin() {
      db.run('BEGIN TRANSACTION')
    },
    async commit() {
      db.run('COMMIT')
    },
    async rollback() {
      db.run('ROLLBACK')
    },
    async close() {
      db.close()
    },
  }

  const onWrite = persist ? () => persist(db.export()) : undefined
  const driver = createSerializedDriver(raw, { onWrite })
  driver.exportBytes = () => db.export()
  return driver
}

// sql.js rejects `undefined` and booleans; SQLite has no boolean type.
function normaliseParams(params = []) {
  return params.map((value) => {
    if (value === undefined) return null
    if (typeof value === 'boolean') return value ? 1 : 0
    return value
  })
}
