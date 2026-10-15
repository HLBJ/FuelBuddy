import { LATEST_SCHEMA_VERSION } from '../database/migrations/index.js'
import { toIsoDate } from './dateUtils.js'
import { saveFile } from './fileService.js'

/**
 * Full backup and restore of the user's data as one JSON file, so a new phone (or a
 * reinstall) can pick up where the old one left off. Rows are stored as they are in
 * SQLite, keyed by table, with the schema version they came from.
 *
 * Restoring replaces everything on the device, inside one transaction: a file that
 * fails any check or constraint leaves the existing data untouched.
 */
export const BACKUP_FORMAT = 'fuelbuddy-backup'
export const BACKUP_VERSION = 1

/** Parents before children: restore inserts in this order and deletes in reverse. */
export const BACKUP_TABLES = Object.freeze(['vehicles', 'fuel_entries', 'reminders', 'trips', 'logbook_years'])

/**
 * Settings that belong to this device and are neither backed up nor replaced by a
 * restore. Pro is restored from Google Play, not from a file.
 */
const PROTECTED_SETTINGS = Object.freeze(['proUnlocked', 'fuelPricesCache', 'fuelPricesFetchedAt'])

const MAX_ROWS_PER_TABLE = 200_000

export class BackupError extends Error {
  constructor(message) {
    super(message)
    this.name = 'BackupError'
  }
}

/** Reads every backed-up table and setting. */
export async function createBackup(db, { now = new Date(), appVersion = null } = {}) {
  const tables = {}
  for (const table of BACKUP_TABLES) tables[table] = await db.query(`SELECT * FROM ${table}`)
  const settingRows = await db.query('SELECT key, value FROM settings')
  const settings = {}
  for (const { key, value } of settingRows) if (!PROTECTED_SETTINGS.includes(key)) settings[key] = value
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    schemaVersion: LATEST_SCHEMA_VERSION,
    appVersion,
    createdAt: now.toISOString(),
    tables,
    settings,
  }
}

export function backupFileName(date = new Date()) {
  return `fuelbuddy-backup-${toIsoDate(date)}.json`
}

/** Builds a backup and hands it to the share sheet (Google Drive, email, Files…). */
export async function shareBackup(db, options) {
  const backup = await createBackup(db, options)
  const result = await saveFile(JSON.stringify(backup), backupFileName(), {
    mimeType: 'application/json',
    title: 'FuelBuddy backup',
  })
  return { ...result, summary: summariseBackup(backup) }
}

/**
 * Parses and checks a backup file's text. Throws BackupError with a message that
 * can be shown to the user.
 */
export function parseBackup(text) {
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new BackupError("This isn't a FuelBuddy backup file.")
  }
  if (!data || typeof data !== 'object' || data.format !== BACKUP_FORMAT) {
    throw new BackupError("This isn't a FuelBuddy backup file.")
  }
  if (!Number.isInteger(data.version) || !Number.isInteger(data.schemaVersion)) {
    throw new BackupError('This backup file is damaged.')
  }
  if (data.version > BACKUP_VERSION || data.schemaVersion > LATEST_SCHEMA_VERSION) {
    throw new BackupError('This backup was made by a newer version of FuelBuddy. Update the app, then try again.')
  }
  const tables = data.tables
  if (!tables || typeof tables !== 'object') throw new BackupError('This backup file is damaged.')
  for (const table of BACKUP_TABLES) {
    const rows = tables[table]
    if (rows === undefined) continue // made before this table existed
    if (!Array.isArray(rows) || rows.length > MAX_ROWS_PER_TABLE || rows.some((r) => !r || typeof r !== 'object' || Array.isArray(r))) {
      throw new BackupError('This backup file is damaged.')
    }
  }
  if (data.settings !== undefined && (typeof data.settings !== 'object' || Array.isArray(data.settings))) {
    throw new BackupError('This backup file is damaged.')
  }
  return data
}

export function summariseBackup(backup) {
  const count = (table) => backup.tables?.[table]?.length ?? 0
  return {
    createdAt: backup.createdAt || null,
    vehicles: count('vehicles'),
    fillUps: count('fuel_entries'),
    reminders: count('reminders'),
    trips: count('trips'),
  }
}

/**
 * Replaces all data with the backup's contents. Only columns that exist in this
 * version's schema are written, so backups from older versions restore cleanly.
 */
export async function restoreBackup(db, backup) {
  return db.transaction(async (tx) => {
    const columns = {}
    for (const table of BACKUP_TABLES) {
      columns[table] = new Set((await tx.query(`PRAGMA table_info(${table})`)).map((c) => c.name))
    }

    for (const table of [...BACKUP_TABLES].reverse()) await tx.run(`DELETE FROM ${table}`)
    const keep = PROTECTED_SETTINGS.map(() => '?').join(', ')
    await tx.run(`DELETE FROM settings WHERE key NOT IN (${keep})`, PROTECTED_SETTINGS)

    for (const table of BACKUP_TABLES) {
      for (const row of backup.tables[table] || []) {
        const keys = Object.keys(row).filter((k) => columns[table].has(k))
        if (!keys.length) throw new BackupError('This backup file is damaged.')
        const placeholders = keys.map(() => '?').join(', ')
        await tx.run(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`, keys.map((k) => row[k]))
      }
    }

    const now = new Date().toISOString()
    for (const [key, value] of Object.entries(backup.settings || {})) {
      if (PROTECTED_SETTINGS.includes(key) || typeof value !== 'string') continue
      await tx.run('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)', [key, value, now])
    }
    return summariseBackup(backup)
  })
}
