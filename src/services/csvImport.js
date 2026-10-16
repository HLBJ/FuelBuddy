import { parseDecimal, roundTo } from './numberUtils.js'
import { isValidIsoDate } from './dateUtils.js'

/**
 * Reads fuel history exported by other apps (or spreadsheets, or FuelBuddy's own CSV)
 * into fill-ups and running costs. Columns are recognised by their header names in
 * several languages; units, date order and delimiters are detected from the file.
 * Everything here is pure; importService writes the result to the database.
 */

/** RFC 4180 CSV with the delimiter (comma, semicolon or tab) detected from the file. */
export function parseCsv(text) {
  const src = String(text ?? '').replace(/^﻿/, '')
  const delimiter = detectDelimiter(src)
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 1 } else quoted = false
      } else field += ch
    } else if (ch === '"' && field === '') quoted = true
    else if (ch === delimiter) { row.push(field); field = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1
      row.push(field); rows.push(row); row = []; field = ''
    } else field += ch
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return { delimiter, rows: rows.map((r) => r.map((c) => c.trim())) }
}

function detectDelimiter(src) {
  const sample = src.split(/\r?\n/).filter((l) => l.trim()).slice(0, 20)
  const score = (d) => sample.reduce((n, line) => n + line.replace(/"[^"]*"/g, '').split(d).length - 1, 0)
  return [',', ';', '\t'].map((d) => [d, score(d)]).sort((a, b) => b[1] - a[1])[0][0]
}

/** Lower-case, accents removed, units in brackets stripped: "Odo (km)" → "odo". */
export function normaliseHeader(text) {
  return String(text ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Header names per field (normalised). Order matters: earlier wins. */
const FILL_UP_FIELDS = {
  date: ['date', 'data', 'datum', 'fecha', 'fuelup date', 'refuel date', 'date time', 'datetime', 'day'],
  odometer: ['odometer', 'odo', 'odometre', 'odometro', 'kilometerstand', 'km stand', 'mileage', 'km reading', 'odometer reading', 'kilometers', 'kilometres', 'km'],
  distance: ['trip', 'trip distance', 'distance', 'miles', 'km driven', 'driven', 'trip km', 'trip miles'],
  litres: ['litres', 'liters', 'litre', 'liter', 'fuel', 'volume', 'quantity', 'qty', 'amount of fuel', 'fuel amount', 'gallons', 'menge', 'litros', 'fuel litres'],
  pricePerLitre: ['price per litre', 'price per liter', 'volumeprice', 'volume price', 'unit price', 'price l', 'price per unit', 'cost per litre', 'cost per liter', 'fuel price', 'price per gallon', 'ppg', 'preis liter', 'preco'],
  total: ['total cost', 'total', 'cost', 'price', 'amount', 'total price', 'paid', 'value', 'sum', 'kosten', 'betrag', 'valor total', 'total amount'],
  full: ['full', 'full tank', 'filled to full', 'tank full', 'full fillup', 'voll', 'cheio', 'tanque cheio'],
  partial: ['partial', 'partial fuelup', 'partial fillup', 'partial fill', 'partial fill up', 'not full'],
  missed: ['missed', 'missed fuelup', 'missed fillup', 'missed fill up', 'skipped'],
  station: ['fuel station', 'station', 'gas station', 'petrol station', 'brand', 'location', 'city', 'tankstelle', 'posto'],
  notes: ['notes', 'note', 'comment', 'comments', 'remarks', 'notiz', 'notas'],
  vehicle: ['vehicle', 'car', 'car name', 'vehicle name', 'fahrzeug', 'veiculo'],
}

const COST_FIELDS = {
  date: FILL_UP_FIELDS.date,
  odometer: FILL_UP_FIELDS.odometer,
  amount: ['cost', 'amount', 'total', 'price', 'value', 'total cost', 'paid'],
  category: ['category', 'type', 'cost type', 'expense type', 'service type', 'costtypeid', 'cost category'],
  title: ['title', 'description', 'name', 'item', 'service', 'expense', 'notes', 'note', 'comment'],
  vehicle: FILL_UP_FIELDS.vehicle,
}

function matchColumns(header, fields) {
  const names = header.map(normaliseHeader)
  const used = new Set()
  const map = {}
  for (const [field, synonyms] of Object.entries(fields)) {
    for (const synonym of synonyms) {
      const index = names.findIndex((n, i) => !used.has(i) && n === synonym)
      if (index !== -1) { map[field] = index; used.add(index); break }
    }
  }
  return map
}

/** Units from header text such as "Odo (mi)", "Gallons" or "MPG". */
export function detectUnits(header) {
  const text = header.join(' ').toLowerCase()
  const distance = /\bmi\b|miles|mileage \(mi|mpg/.test(text) && !/\bkm\b|kilomet/.test(text) ? 'mi' : 'km'
  let volume = 'l'
  if (/gallon|\bgal\b|mpg/.test(text) && !/litre|liter|\bl\b/.test(text)) volume = /imp|uk/.test(text) ? 'ukgal' : 'usgal'
  return { distance, volume }
}

const KM_PER_MILE = 1.609344
const LITRES_PER = { l: 1, usgal: 3.785411784, ukgal: 4.54609 }

/** A header row has at least a date and two other known columns. */
function isFillUpHeader(row) {
  const map = matchColumns(row, FILL_UP_FIELDS)
  return map.date !== undefined && (map.litres !== undefined) && (map.odometer !== undefined || map.distance !== undefined)
}
function isCostHeader(row) {
  const map = matchColumns(row, COST_FIELDS)
  return map.date !== undefined && map.amount !== undefined && (map.category !== undefined || map.title !== undefined) && !isFillUpHeader(row)
}

/** Splits a file into tables (fill-ups and costs), each with its header and data rows. */
export function findTables(rows) {
  const tables = []
  let current = null
  for (const row of rows) {
    const blank = row.every((c) => c === '')
    if (isFillUpHeader(row)) { current = { kind: 'fillUps', header: row, rows: [] }; tables.push(current); continue }
    if (isCostHeader(row)) { current = { kind: 'costs', header: row, rows: [] }; tables.push(current); continue }
    if (blank || (row.filter((c) => c !== '').length === 1 && /^#|[a-z]/i.test(row.find((c) => c !== '')) && !/\d/.test(row.join('')))) {
      current = null // section title or gap ends a table
      continue
    }
    if (current) current.rows.push(row)
  }
  return tables
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** Splits a date cell into numbers: [a, b, c] for 12/03/2026, or with a month name. */
function dateParts(text) {
  const t = String(text ?? '').trim().toLowerCase()
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(t)
  if (m) return { kind: 'ymd', y: +m[1], a: +m[2], b: +m[3] }
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(t)
  if (m) return { kind: 'xy', a: +m[1], b: +m[2], y: +m[3] < 100 ? 2000 + +m[3] : +m[3] }
  m = /^(\d{1,2})[\s-]+([a-z]{3})[a-z]*\.?[\s-,]+(\d{2,4})/.exec(t)
  if (m && MONTHS.includes(m[2])) return { kind: 'named', y: +m[3] < 100 ? 2000 + +m[3] : +m[3], a: MONTHS.indexOf(m[2]) + 1, b: +m[1] }
  m = /^([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(t)
  if (m && MONTHS.includes(m[1])) return { kind: 'named', y: +m[3], a: MONTHS.indexOf(m[1]) + 1, b: +m[2] }
  return null
}

/** Day-first or month-first, decided from the whole column (South Africa defaults to day-first). */
export function detectDateOrder(values) {
  let dayFirst = 0
  let monthFirst = 0
  for (const v of values) {
    const p = dateParts(v)
    if (!p || p.kind !== 'xy') continue
    if (p.a > 12) dayFirst += 1
    if (p.b > 12) monthFirst += 1
  }
  return monthFirst > dayFirst ? 'mdy' : 'dmy'
}

export function parseDateValue(text, order = 'dmy') {
  const p = dateParts(text)
  if (!p) return null
  let month
  let day
  if (p.kind === 'ymd' || p.kind === 'named') { month = p.a; day = p.b } else if (order === 'mdy') { month = p.a; day = p.b } else { day = p.a; month = p.b }
  const iso = `${p.y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return isValidIsoDate(iso) ? iso : null
}

const TRUE_WORDS = /^(1|y|yes|true|x|full|ja|sim|si|oui|✓|✔)$/i
const FALSE_WORDS = /^(0|n|no|false|partial|nee|nao|não|non)?$/i
const yes = (v) => TRUE_WORDS.test(String(v ?? '').trim())
const no = (v) => FALSE_WORDS.test(String(v ?? '').trim())

/** Money/number cells: "R 1 217,56", "1,217.56", "$45.10". */
function number(text) {
  if (text === undefined || text === null) return null
  return parseDecimal(String(text).replace(/[R$€£]|ZAR|USD|EUR|GBP/gi, '').trim())
}

/** Running-cost category from free text (other apps' categories, any language-ish). */
export function guessCategory(text) {
  const t = normaliseHeader(text)
  if (/insur|versicher|seguro/.test(t)) return 'insurance'
  if (/tyre|tire|reifen|pneu/.test(t)) return 'tyres'
  if (/repair|fix|reparatur/.test(t)) return 'repairs'
  if (/service|maint|oil|filter|wartung|inspect|brake|battery|revis/.test(t)) return 'service'
  if (/financ|loan|lease|instal|payment|credit/.test(t)) return 'finance'
  if (/licen[cs]e|registr|disc|roadworth|vehicle tax|road tax|kfz steuer/.test(t)) return 'licence'
  if (/toll|maut|e toll|etoll/.test(t)) return 'tolls'
  if (/park/.test(t)) return 'parking'
  if (/wash|clean|valet/.test(t)) return 'washing'
  return 'other'
}

/**
 * Turns a file's text into an import plan without touching the database.
 * @returns {{ fillUps, costs, vehicleNames, units, dateOrder, skipped, warnings }}
 */
export function buildImportPlan(text) {
  const { rows } = parseCsv(text)
  const tables = findTables(rows)
  const fillUps = []
  const costs = []
  const skipped = []
  const warnings = []
  const vehicleNames = new Set()
  let units = { distance: 'km', volume: 'l' }
  let dateOrder = 'dmy'

  for (const table of tables) {
    const lineOf = (row) => rows.indexOf(row) + 1
    if (table.kind === 'fillUps') {
      const map = matchColumns(table.header, FILL_UP_FIELDS)
      units = detectUnits(table.header)
      dateOrder = detectDateOrder(table.rows.map((r) => r[map.date]))
      const kmFactor = units.distance === 'mi' ? KM_PER_MILE : 1
      const litreFactor = LITRES_PER[units.volume]
      let runningOdometer = 0
      // Oldest first, so trip distances can be added up into odometer readings.
      const dated = table.rows
        .map((r) => ({ r, date: parseDateValue(r[map.date], dateOrder) }))
        .sort((x, y) => (x.date || '').localeCompare(y.date || ''))
      for (const { r, date } of dated) {
        const line = lineOf(r)
        if (!date) { skipped.push({ line, reason: `Unreadable date "${r[map.date] ?? ''}"` }); continue }
        let odometer = map.odometer !== undefined ? number(r[map.odometer]) : null
        if (odometer === null && map.distance !== undefined) {
          const d = number(r[map.distance])
          if (d !== null) { runningOdometer += d; odometer = runningOdometer }
        }
        const litres = number(r[map.litres])
        if (odometer === null || litres === null || litres <= 0) { skipped.push({ line, reason: 'Missing odometer or fuel amount' }); continue }
        let price = map.pricePerLitre !== undefined ? number(r[map.pricePerLitre]) : null
        const total = map.total !== undefined ? number(r[map.total]) : null
        const volume = litres * litreFactor
        if (price !== null) price /= litreFactor
        if ((price === null || price === 0) && total !== null) price = total / volume
        if (price === null) { skipped.push({ line, reason: 'No price or total' }); continue }
        let isFullTank = true
        if (map.full !== undefined) isFullTank = yes(r[map.full])
        else if (map.partial !== undefined) isFullTank = no(r[map.partial])
        const missed = map.missed !== undefined && yes(r[map.missed])
        const vehicle = map.vehicle !== undefined ? r[map.vehicle] : null
        if (vehicle) vehicleNames.add(vehicle)
        fillUps.push({
          line,
          vehicle,
          date,
          odometer: roundTo(odometer * kmFactor, 1),
          litres: roundTo(volume, 2),
          pricePerLitre: roundTo(price, 3),
          isFullTank,
          missed,
          fuelStation: map.station !== undefined ? r[map.station] || null : null,
          notes: map.notes !== undefined ? r[map.notes] || null : null,
        })
      }
      if (map.odometer === undefined && map.distance !== undefined) warnings.push('The file has trip distances instead of odometer readings, so readings were counted from zero.')
    } else {
      const map = matchColumns(table.header, COST_FIELDS)
      const order = detectDateOrder(table.rows.map((r) => r[map.date]))
      for (const r of table.rows) {
        const date = parseDateValue(r[map.date], order)
        const amount = number(r[map.amount])
        if (!date || amount === null || amount <= 0) { skipped.push({ line: lineOf(r), reason: 'Unreadable cost row' }); continue }
        const title = map.title !== undefined ? r[map.title] || null : null
        const categoryText = map.category !== undefined ? r[map.category] : title
        const odometer = map.odometer !== undefined ? number(r[map.odometer]) : null
        const vehicle = map.vehicle !== undefined ? r[map.vehicle] : null
        if (vehicle) vehicleNames.add(vehicle)
        costs.push({
          line: lineOf(r),
          vehicle,
          date,
          category: guessCategory(`${categoryText ?? ''} ${title ?? ''}`),
          amount: roundTo(amount, 2),
          odometer: odometer === null ? null : roundTo(odometer * (units.distance === 'mi' ? KM_PER_MILE : 1), 1),
          description: title,
        })
      }
    }
  }
  if (units.distance === 'mi' || units.volume !== 'l') warnings.push('Miles and gallons were converted to km and litres.')
  return { fillUps, costs, vehicleNames: [...vehicleNames], units, dateOrder, skipped, warnings, tables: tables.length }
}
