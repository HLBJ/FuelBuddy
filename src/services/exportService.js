import { saveFile } from './fileService.js'
import { toIsoDate } from './dateUtils.js'
import { FUEL_TYPES } from './validation.js'

/**
 * CSV export of user-owned data. `buildCsv` is pure; `exportCsv` hands the file to
 * the platform (Android share sheet, or a browser download in the dev preview).
 * No storage permission is needed: the file is written to the app's cache folder.
 */

const BOM = '﻿'

export const ENTRY_COLUMNS = [
  ['Vehicle', (e, v) => v?.name ?? ''],
  ['Registration', (e, v) => v?.registration ?? ''],
  ['Date', (e) => e.date],
  ['Odometer (km)', (e) => e.odometer],
  ['Litres', (e) => e.litres],
  ['Price per litre', (e) => e.pricePerLitre],
  ['Total cost', (e) => e.totalCost],
  ['Full tank', (e) => (e.isFullTank ? 'Yes' : 'No')],
  ['Fuel station', (e) => e.fuelStation ?? ''],
  ['Notes', (e) => e.notes ?? ''],
]

export const VEHICLE_COLUMNS = [
  ['Vehicle', (v) => v.name],
  ['Make', (v) => v.make ?? ''],
  ['Model', (v) => v.model ?? ''],
  ['Registration', (v) => v.registration ?? ''],
  ['Year', (v) => v.year ?? ''],
  ['Fuel type', (v) => FUEL_TYPES.find((t) => t.value === v.fuelType)?.label ?? v.fuelType],
  ['Tank capacity (L)', (v) => v.tankCapacity ?? ''],
  ['Current odometer (km)', (v) => v.currentOdometer],
  ['Default', (v) => (v.isDefault ? 'Yes' : 'No')],
]

/** RFC 4180 field escaping, plus a guard against spreadsheet formula injection. */
export function escapeCsvField(value) {
  if (value === null || value === undefined) return ''
  let text = String(value)
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`
  if (/[",\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`
  return text
}

function toCsvRows(columns, rows, mapper) {
  const header = columns.map(([name]) => escapeCsvField(name)).join(',')
  const lines = rows.map((row) => columns.map(([, get]) => escapeCsvField(mapper(get, row))).join(','))
  return [header, ...lines]
}

/**
 * @param {Array} vehicles
 * @param {Array} entries
 * @param {object} [options]
 * @param {string} [options.currency] ISO code noted in the cost column headers
 * @returns {string} CSV text: a fill-ups table, a blank line, then a vehicles table
 */
export function buildCsv(vehicles, entries, { currency = 'ZAR' } = {}) {
  const byId = new Map((vehicles || []).map((v) => [v.id, v]))
  const entryColumns = ENTRY_COLUMNS.map(([name, get]) =>
    name === 'Price per litre' || name === 'Total cost' ? [`${name} (${currency})`, get] : [name, get],
  )
  const entryLines = toCsvRows(entryColumns, entries || [], (get, e) => get(e, byId.get(e.vehicleId)))
  const vehicleLines = toCsvRows(VEHICLE_COLUMNS, vehicles || [], (get, v) => get(v))
  return BOM + ['FuelBuddy fill-ups', ...entryLines, '', 'FuelBuddy vehicles', ...vehicleLines].join('\r\n') + '\r\n'
}

export function exportFileName(date = new Date()) {
  return `fuelbuddy-export-${toIsoDate(date)}.csv`
}

/**
 * Writes the CSV and opens the platform share/save flow.
 * @returns {Promise<{ fileName: string, method: 'share'|'download' }>}
 */
export function exportCsv(csv, fileName = exportFileName()) {
  return saveFile(csv, fileName, { mimeType: 'text/csv;charset=utf-8', title: 'FuelBuddy export' })
}
