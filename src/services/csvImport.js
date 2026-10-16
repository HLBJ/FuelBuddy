import { parseDecimal, roundTo } from './numberUtils.js'
import { isValidIsoDate } from './dateUtils.js'

/**
 * Reads fuel history exported by other apps (Fuelio, Drivvo, Fuelly, aCar, Spritmonitor,
 * Simply Auto, My Cars, LubeLogger), spreadsheets or FuelBuddy's own CSV into fill-ups
 * and running costs. The app is recognised from the file where possible; otherwise
 * columns are matched by header name. Units, date order, delimiters and number
 * formats are detected from the file. Everything here is pure; importService writes
 * the result to the database.
 *
 * Format notes come from real export files and open-source importers (LubeLogger,
 * Hammond, FuelioImport, PySpritmonitor); see docs/IMPORT_FORMATS.md.
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
    } else if (ch === '"' && field.trim() === '') { quoted = true; field = '' }
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
  const sample = src.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('//')).slice(0, 30)
  const score = (d) => sample.reduce((n, line) => n + line.replace(/"[^"]*"/g, '').split(d).length - 1, 0)
  return [',', ';', '\t'].map((d) => [d, score(d)]).sort((a, b) => b[1] - a[1])[0][0]
}

/** Lower-case, accents and units in brackets removed: "Odo (km)" → "odo", "##car_name" → "car name". */
export function normaliseHeader(text) {
  return String(text ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Header names per field (normalised). Within a field, earlier names win. */
const FILL_UP_FIELDS = {
  date: ['date', 'data', 'datum', 'fecha', 'fuelup date', 'refuel date', 'refueldate', 'date time', 'datetime'],
  odometer: ['odometer', 'odo', 'odometer reading', 'odometre', 'odometro', 'kilometerstand', 'km stand', 'mileage', 'km reading', 'kilometers', 'kilometres', 'km'],
  distance: ['trip', 'trip distance', 'distance', 'teil km', 'distance travelled', 'miles', 'km driven', 'driven', 'trip km', 'trip miles', 'km'],
  // "Volume" before "Fuel": in Drivvo files "Fuel" is the fuel's name.
  litres: ['volume', 'litres', 'liters', 'litre', 'liter', 'quantity', 'qty', 'spritmenge', 'fuelconsumed', 'gallons', 'amount of fuel', 'fuel amount', 'menge', 'litros', 'fuel'],
  pricePerLitre: [
    'price per litre', 'price per liter', 'volumeprice', 'volume price', 'unit price', 'price l', 'price per unit', 'cost per litre',
    'cost per liter', 'cost litre', 'cost liter', 'cost gallon', 'price gallon', 'price per gallon', 'ppg', 'fuel price', 'preis liter', 'preco',
  ],
  total: ['total cost', 'totalcost', 'total', 'total price', 'cost pos curr', 'cost', 'kosten', 'price', 'amount', 'paid', 'betrag', 'valor total', 'total amount', 'sum', 'value'],
  full: ['full', 'full tank', 'filled to full', 'filled up', 'filled tank completely', 'isfilltofull', 'tank full', 'full fillup', 'voll', 'cheio', 'tanque cheio'],
  partial: ['partial', 'partial fuelup', 'partial fillup', 'partial fill', 'partial fill up', 'partial tank', 'not full'],
  missed: ['missed', 'missed fuelup', 'missedfuelup', 'missed fillup', 'missed fill up', 'missed fill', 'previously missed fill ups', 'skipped'],
  station: ['fuel station', 'gas station', 'petrol station', 'station', 'fueling station address', 'fuel brand', 'gas brand', 'tankstelle', 'posto', 'location', 'city', 'brand'],
  notes: ['notes', 'note', 'comment', 'comments', 'remarks', 'bemerkung', 'notiz', 'notas'],
  vehicle: ['vehicle', 'car', 'car name', 'vehicle name', 'fahrzeug', 'veiculo'],
  tankType: ['tankart'], // Spritmonitor: 1 full, 2 partial, 3 first fill
  type: ['type', 'record type'], // Fuelly app: Gas/Service; Simply Auto: 0 fuel, 1 service, 2 expense
  services: ['services', 'record desc'],
  day: ['day'],
  month: ['month'],
  year: ['year'],
  distanceUnit: ['distance unit'], // aCar: units per row
  volumeUnit: ['volume unit'],
}

const COST_FIELDS = {
  date: FILL_UP_FIELDS.date,
  odometer: FILL_UP_FIELDS.odometer,
  amount: ['cost', 'total cost', 'amount', 'total', 'price', 'value', 'paid'],
  category: [
    'category', 'cost type', 'expense type', 'type of expense', 'type of service', 'service type', 'costtypeid', 'cost category',
    'bill type name', 'service categories', 'type',
  ],
  title: ['title', 'costtitle', 'description', 'name', 'item', 'reason', 'service', 'expense', 'notes', 'note', 'comment'],
  vehicle: [...FILL_UP_FIELDS.vehicle, 'carname'],
  template: ['istemplate'],
  income: ['isincome'],
}

function matchColumns(header, fields) {
  const names = header.map(normaliseHeader)
  const used = new Set()
  const map = {}
  const via = {}
  for (const [field, synonyms] of Object.entries(fields)) {
    for (const synonym of synonyms) {
      const index = names.findIndex((n, i) => !used.has(i) && n === synonym)
      if (index !== -1) { map[field] = index; via[field] = synonym; used.add(index); break }
    }
  }
  return { map, via }
}

/** Units from header text such as "Odo (mi)", "Gallons" or "MPG". */
export function detectUnits(header) {
  const text = header.join(' ').toLowerCase()
  const distance = /\bmi\b|miles|mpg/.test(text) && !/\bkm\b|kilomet|l\/100/.test(text) ? 'mi' : 'km'
  let volume = 'l'
  if (/gallon|\bgal\b|mpg/.test(text) && !/litre|liter|\(l\)|\/ l\b|l\/100/.test(text)) volume = /imp|uk/.test(text) ? 'ukgal' : 'usgal'
  return { distance, volume }
}

const KM_PER_MILE = 1.609344
const LITRES_PER = { l: 1, usgal: 3.785411784, ukgal: 4.54609 }
const distanceUnitOf = (text) => (/^mi/i.test(String(text ?? '').trim()) ? 'mi' : 'km')
const volumeUnitOf = (text) => {
  const t = String(text ?? '').trim().toLowerCase()
  if (/imp|uk/.test(t)) return 'ukgal'
  return /gal/.test(t) ? 'usgal' : 'l'
}

function isFillUpHeader(row) {
  const { map } = matchColumns(row, FILL_UP_FIELDS)
  const hasDate = map.date !== undefined || (map.day !== undefined && map.month !== undefined && map.year !== undefined)
  return hasDate && map.litres !== undefined && (map.odometer !== undefined || map.distance !== undefined)
}
function isCostHeader(row) {
  const { map } = matchColumns(row, COST_FIELDS)
  return map.date !== undefined && map.amount !== undefined && (map.category !== undefined || map.title !== undefined) && !isFillUpHeader(row)
}

const isTitleRow = (row) => {
  const cells = row.filter((c) => c !== '')
  return cells.length === 1 && (/^(#|\/\/)/.test(cells[0]) || (/[a-z]/i.test(cells[0]) && !/\d/.test(cells[0])))
}

/** Splits a file into tables (fill-ups and costs), each with its header and data rows. */
export function findTables(rows) {
  const tables = []
  let current = null
  rows.forEach((row, index) => {
    if (isFillUpHeader(row)) { current = { kind: 'fillUps', header: row, rows: [] }; tables.push(current); return }
    if (isCostHeader(row)) { current = { kind: 'costs', header: row, rows: [] }; tables.push(current); return }
    if (row.every((c) => c === '') || isTitleRow(row)) { current = null; return } // a gap or section title ends a table
    if (current) current.rows.push(Object.assign(row, { line: index + 1 }))
  })
  return tables
}

/**
 * Recognises the app that made the file and reads what it says about itself: units,
 * the vehicle's name and cost categories.
 */
export function detectSource(rows) {
  const cells = (r) => r.map((c) => c.trim())
  const after = (marker) => {
    const i = rows.findIndex((r) => r[0] === marker)
    return i === -1 ? null : { header: cells(rows[i + 1] || []), data: rows.slice(i + 2) }
  }
  const firstCells = new Set(rows.map((r) => r[0]))

  if (firstCells.has('## Log') || firstCells.has('## Vehicle')) {
    const source = { app: 'Fuelio', costCategories: new Map() }
    const vehicle = after('## Vehicle')
    if (vehicle && vehicle.data[0]) {
      const col = (name) => vehicle.data[0][vehicle.header.indexOf(name)]
      source.vehicleName = col('Name') || null
      source.units = { distance: col('DistUnit') === '1' ? 'mi' : 'km', volume: { 1: 'usgal', 2: 'ukgal' }[col('FuelUnit')] || 'l' }
    }
    const categories = after('## CostCategories')
    if (categories) {
      const id = categories.header.indexOf('CostTypeID')
      const name = categories.header.indexOf('Name')
      for (const r of categories.data) {
        if (r[0]?.startsWith('##') || r.length < 2) break
        source.costCategories.set(r[id], r[name])
      }
    }
    return source
  }
  if (rows.some((r) => /^#{1,2}(refuel|reabastec|abastec|tankowan|betank)/i.test(r[0] || ''))) return { app: 'Drivvo' }
  if (/^\/\/\s*mycar export/i.test(rows[0]?.[0] || '')) {
    const pref = (key) => rows.find((r) => r[0] === key)?.[1]
    const distance = /mile/i.test(pref('distanceUnit') || '') ? 'mi' : 'km'
    const fuel = pref('fuelQuantityUnit') || ''
    return { app: 'My Cars', units: { distance, volume: /uk|imp/i.test(fuel) ? 'ukgal' : /gallon/i.test(fuel) ? 'usgal' : 'l' }, distanceIsOdometer: (pref('refuelDistanceType') || 'odometer') === 'odometer' }
  }
  const headers = rows.slice(0, 50).map((r) => r.map(normaliseHeader))
  const has = (name) => headers.some((h) => h.includes(name))
  if (rows.some((r) => r[0] === 'FuelBuddy fill-ups')) return { app: 'FuelBuddy' }
  if (headers.some((h) => h[0] === 'type' && h[1] === 'mpg')) return { app: 'Fuelly' }
  if (has('car name') && has('fuelup date')) return { app: 'Fuelly', priceIsPerUnit: true }
  if (has('distance unit') && has('volume unit')) return { app: 'aCar' }
  if (has('km stand') || has('tankart')) return { app: 'Spritmonitor' }
  if (has('row id') && has('record type')) return { app: 'Simply Auto' }
  if (has('isfilltofull')) return { app: 'LubeLogger' }
  return { app: null }
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

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
  if (p.kind === 'ymd' || p.kind === 'named' || order === 'mdy') { month = p.a; day = p.b } else { day = p.a; month = p.b }
  const iso = `${p.y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return isValidIsoDate(iso) ? iso : null
}

const yes = (v) => /^(1|y|yes|true|x|full|ja|sim|si|sí|tak|oui|✓|✔)$/i.test(String(v ?? '').trim())

/**
 * Numbers as other apps write them: "R 1 217,56", "$4.099", "37,625", "1,217.56".
 * When a file writes decimals with a dot, a comma before three digits groups thousands.
 */
function makeNumber(groupingComma) {
  return (text) => {
    if (text === undefined || text === null) return null
    let t = String(text).replace(/[R$€£]|ZAR|USD|EUR|GBP|CZK|PLN/gi, '').replace(/\s+[a-z/]+$/i, '').trim()
    if (groupingComma) t = t.replace(/,(?=\d{3}(\D|$))/g, '')
    return parseDecimal(t)
  }
}

/** True when the table writes decimals with a dot (so commas group thousands). */
function usesDecimalDot(rows) {
  let dot = 0
  let comma = 0
  for (const r of rows) {
    for (const c of r) {
      if (/^[^\d,.]*\d+\.\d+[^\d]*$/.test(c)) dot += 1
      if (/^[^\d,.]*\d+,\d{1,2}[^\d]*$/.test(c)) comma += 1
    }
  }
  return dot > comma
}

const spread = (values) => {
  if (values.length < 3) return null
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length)
  return mean ? sd / mean : null
}

/** Running-cost category from free text (other apps' categories, several languages). */
export function guessCategory(text) {
  const t = normaliseHeader(text)
  if (/insur|versicher|seguro|ubezpiecz/.test(t)) return 'insurance'
  if (/tyre|tire|reifen|pneu|opon/.test(t)) return 'tyres'
  if (/repair|fix|reparatur|naprawa/.test(t)) return 'repairs'
  if (/service|serwis|maint|oil|filter|wartung|inspect|brake|battery|revis|spark plug/.test(t)) return 'service'
  if (/financ|loan|lease|instal|payment|credit/.test(t)) return 'finance'
  if (/licen[cs]e|registr|disc|roadworth|vehicle tax|road tax|kfz steuer|\btax\b/.test(t)) return 'licence'
  if (/toll|maut|e toll|etoll/.test(t)) return 'tolls'
  if (/park/.test(t)) return 'parking'
  if (/wash|clean|valet/.test(t)) return 'washing'
  return 'other'
}

/**
 * Turns a file's text into an import plan without touching the database.
 * @returns {{ app, fillUps, costs, vehicleNames, units, dateOrder, skipped, warnings, tables }}
 */
export function buildImportPlan(text) {
  const { rows } = parseCsv(text)
  const source = detectSource(rows)
  const tables = findTables(rows)
  const fillUps = []
  const costs = []
  const skipped = []
  const warnings = []
  const vehicleNames = new Set(source.vehicleName ? [source.vehicleName] : [])
  let units = source.units || { distance: 'km', volume: 'l' }
  let dateOrder = 'dmy'
  let countedFromZero = false
  let converted = false

  const addCost = (cost) => {
    if (cost.vehicle) vehicleNames.add(cost.vehicle)
    costs.push(cost)
  }

  for (const table of tables) {
    const number = makeNumber(usesDecimalDot(table.rows))
    if (table.kind === 'fillUps') {
      const { map, via } = matchColumns(table.header, FILL_UP_FIELDS)
      if (source.distanceIsOdometer && map.odometer === undefined && map.distance !== undefined) { map.odometer = map.distance; delete map.distance }
      units = source.units || detectUnits(table.header)
      dateOrder = detectDateOrder(table.rows.map((r) => r[map.date]))
      const dateOf = (r) =>
        map.date !== undefined
          ? parseDateValue(r[map.date], dateOrder)
          : parseDateValue(`${r[map.year]}-${r[map.month]}-${r[map.day]}`)

      // A bare "price" column is a per-litre price in some apps and a total in others:
      // per-litre prices barely change between fill-ups, totals change with the litres.
      let pricePerUnitColumn = map.pricePerLitre
      let totalColumn = map.total
      if (map.pricePerLitre === undefined && via.total === 'price') {
        const pairs = table.rows.map((r) => [number(r[map.total]), number(r[map.litres])]).filter(([v, l]) => v > 0 && l > 0)
        const asIs = spread(pairs.map(([v]) => v))
        const perUnit = spread(pairs.map(([v, l]) => v / l))
        if (source.priceIsPerUnit || (asIs !== null && perUnit !== null && asIs < perUnit)) { pricePerUnitColumn = map.total; totalColumn = undefined }
      }

      // Station: the first of the possible columns that has a value (aCar has an empty address and a brand).
      const names = table.header.map(normaliseHeader)
      const stationColumns = FILL_UP_FIELDS.station.map((n) => names.indexOf(n)).filter((i) => i !== -1)
      const stationOf = (r) => stationColumns.map((i) => r[i]).find((v) => v) || null

      let runningOdometer = 0
      const dated = table.rows.map((r) => ({ r, date: dateOf(r) })).sort((x, y) => (x.date || '').localeCompare(y.date || ''))
      for (const { r, date } of dated) {
        const line = r.line
        const type = map.type !== undefined ? String(r[map.type]).trim().toLowerCase() : ''
        if (!date) { skipped.push({ line, reason: `Unreadable date "${r[map.date] ?? ''}"` }); continue }
        const vehicle = map.vehicle !== undefined ? r[map.vehicle] || null : null
        const rowDistance = map.distanceUnit !== undefined ? distanceUnitOf(r[map.distanceUnit]) : units.distance
        const rowVolume = map.volumeUnit !== undefined ? volumeUnitOf(r[map.volumeUnit]) : units.volume
        const kmFactor = rowDistance === 'mi' ? KM_PER_MILE : 1
        const litreFactor = LITRES_PER[rowVolume]
        if (kmFactor !== 1 || litreFactor !== 1) converted = true
        let odometer = map.odometer !== undefined ? number(r[map.odometer]) : null

        // Service and expense rows inside a fuel log (Fuelly app, Simply Auto).
        if (type === 'service' || type === '1' || type === '2') {
          const amount = totalColumn !== undefined ? number(r[totalColumn]) : null
          const description = (map.services !== undefined ? r[map.services] : '') || (map.notes !== undefined ? r[map.notes] : '') || null
          if (amount > 0) {
            addCost({ line, vehicle, date, category: guessCategory(description || 'service'), amount: roundTo(amount, 2), odometer: odometer ? roundTo(odometer * kmFactor, 1) : null, description })
          } else skipped.push({ line, reason: 'Service row without an amount' })
          continue
        }

        if (odometer === null && map.distance !== undefined) {
          const d = number(r[map.distance])
          if (d !== null) { runningOdometer += d; odometer = runningOdometer; countedFromZero = true }
        }
        const litres = number(r[map.litres])
        if (odometer === null || litres === null || litres <= 0) { skipped.push({ line, reason: 'Missing odometer or fuel amount' }); continue }
        const volume = litres * litreFactor
        let price = pricePerUnitColumn !== undefined ? number(r[pricePerUnitColumn]) : null
        const total = totalColumn !== undefined ? number(r[totalColumn]) : null
        if (price !== null) price /= litreFactor
        if ((price === null || price === 0) && total !== null) price = total / volume
        if (price === null) { skipped.push({ line, reason: 'No price or total' }); continue }

        let isFullTank = true
        let missed = map.missed !== undefined && yes(r[map.missed])
        if (map.tankType !== undefined) isFullTank = String(r[map.tankType]).trim() !== '2'
        else if (map.full !== undefined) {
          const value = String(r[map.full]).trim().toLowerCase()
          if (value === 'reset') missed = true // Fuelly: restarts the consumption chain
          else isFullTank = yes(value)
        } else if (map.partial !== undefined) isFullTank = !yes(r[map.partial])

        if (vehicle) vehicleNames.add(vehicle)
        fillUps.push({
          line,
          vehicle: vehicle || source.vehicleName || null,
          date,
          odometer: roundTo(odometer * kmFactor, 1),
          litres: roundTo(volume, 2),
          pricePerLitre: roundTo(price, 3),
          isFullTank,
          missed,
          fuelStation: stationOf(r),
          notes: map.notes !== undefined ? r[map.notes] || null : null,
        })
      }
    } else {
      const { map } = matchColumns(table.header, COST_FIELDS)
      const order = detectDateOrder(table.rows.map((r) => r[map.date]))
      for (const r of table.rows) {
        if ((map.template !== undefined && yes(r[map.template])) || (map.income !== undefined && yes(r[map.income]))) continue
        const date = parseDateValue(r[map.date], order)
        const amount = number(r[map.amount])
        if (!date || amount === null || amount <= 0) { skipped.push({ line: r.line, reason: 'Unreadable cost row' }); continue }
        const title = map.title !== undefined ? r[map.title] || null : null
        let categoryText = map.category !== undefined ? r[map.category] : ''
        if (source.costCategories?.has(categoryText)) categoryText = source.costCategories.get(categoryText)
        const odometer = map.odometer !== undefined ? number(r[map.odometer]) : null
        addCost({
          line: r.line,
          vehicle: (map.vehicle !== undefined ? r[map.vehicle] : null) || source.vehicleName || null,
          date,
          category: guessCategory(`${categoryText ?? ''} ${title ?? ''}`),
          amount: roundTo(amount, 2),
          odometer: odometer ? roundTo(odometer * (units.distance === 'mi' ? KM_PER_MILE : 1), 1) : null,
          description: title || categoryText || null,
        })
      }
    }
  }
  if (converted) warnings.push('Miles and gallons were converted to km and litres.')
  if (countedFromZero) warnings.push('The file has trip distances instead of odometer readings, so readings were counted from zero.')
  return { app: source.app, fillUps, costs, vehicleNames: [...vehicleNames], units, dateOrder, skipped, warnings: [...new Set(warnings)], tables: tables.length }
}
