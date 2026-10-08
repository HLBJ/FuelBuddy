/**
 * Wraps a raw SQLite connection in the application's driver interface:
 *
 *   query(sql, params?)  -> Promise<object[]>
 *   run(sql, params?)    -> Promise<{ changes: number, lastId: number|null }>
 *   transaction(fn)      -> Promise<result of fn(tx)>
 *   close()              -> Promise<void>
 *
 * A single SQLite connection cannot interleave statements from two logical
 * transactions, so every operation is queued. Statements issued through the `tx`
 * object inside `transaction()` bypass the queue because they already own it.
 *
 * The raw connection must provide: query, run, begin, commit, rollback, close.
 * `onWrite` (optional) is invoked after each committed write — used by the browser
 * preview to persist the database.
 */
export function createSerializedDriver(raw, { onWrite } = {}) {
  let tail = Promise.resolve()

  function enqueue(task) {
    const result = tail.then(task)
    tail = result.catch(() => {})
    return result
  }

  const tx = {
    query: (sql, params = []) => raw.query(sql, params),
    run: (sql, params = []) => raw.run(sql, params),
  }

  return {
    query(sql, params = []) {
      return enqueue(() => raw.query(sql, params))
    },

    run(sql, params = []) {
      return enqueue(async () => {
        const result = await raw.run(sql, params)
        if (onWrite) await onWrite()
        return result
      })
    },

    transaction(fn) {
      return enqueue(async () => {
        await raw.begin()
        let value
        try {
          value = await fn(tx)
        } catch (error) {
          try {
            await raw.rollback()
          } catch {
            // The original error is more useful than a rollback failure.
          }
          throw error
        }
        await raw.commit()
        if (onWrite) await onWrite()
        return value
      })
    },

    close() {
      return enqueue(() => raw.close())
    },
  }
}
