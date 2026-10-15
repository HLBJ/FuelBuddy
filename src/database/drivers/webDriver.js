import initSqlJs from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import { createSqlJsDriver } from './sqljsDriver.js'

/**
 * Browser development-preview driver: sql.js in WebAssembly, persisted to
 * IndexedDB in this browser only. The Android app never uses this driver.
 */
const IDB_NAME = 'fuelbuddy-web'
const IDB_STORE = 'databases'

function openIdb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(IDB_STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function idb(mode, action) {
  const db = await openIdb()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, mode)
      const request = action(tx.objectStore(IDB_STORE))
      tx.oncomplete = () => resolve(request.result)
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

export async function createWebDriver(databaseName) {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl })
  let data
  try {
    data = await idb('readonly', (store) => store.get(databaseName))
  } catch (error) {
    console.warn('FuelBuddy: browser storage unavailable, data will not persist.', error)
  }
  const persist = async (bytes) => {
    try {
      await idb('readwrite', (store) => store.put(bytes, databaseName))
    } catch (error) {
      console.warn('FuelBuddy: could not persist browser database.', error)
    }
  }
  return createSqlJsDriver(SQL, { data: data || undefined, persist })
}
