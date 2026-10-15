import { parseDecimal, roundTo } from './numberUtils.js'
import { daysBetween, isValidIsoDate, toIsoDate } from './dateUtils.js'

/**
 * Reads litres, price per litre, total, date and station from the text of a fuel
 * slip (recognised on the phone by ML Kit). Slips differ a lot between garages, so
 * the parser scores every number by its label and unit, and prefers a combination
 * where litres × price ≈ total. Anything it isn't sure of is left out for the user.
 */

export const SLIP_LIMITS = Object.freeze({
  litres: [0.5, 400],
  price: [5, 80], // rand per litre
  total: [5, 50000],
  maxAgeDays: 365,
})

const LITRE_UNIT = /^\s?(?:L|LT|LTR|LTRS|LITRES?|LITERS?|ℓ)(?![A-Z])/i
const PER_LITRE_UNIT = /^\s?(?:R\s?)?\/\s?(?:L|LT|LTR|LITRE)\b/i
const CENTS_PER_LITRE = /^\s?C\s?\/\s?L/i
const LITRE_WORDS = /\b(?:LITRES?|LITERS?|LTRS?|LT|VOL(?:UME)?|QTY|QUANTITY)\b/i
const PRICE_WORDS = /(?:PRICE|UNIT|RATE|PER\s*LIT|\bP\s?\/\s?L\b|\bR\s?\/\s?L\b)/i
const TOTAL_WORDS = /\b(?:TOTAL|AMOUNT|AMT|SALE|PURCHASE|DUE|PAID|VALUE)\b/i
const STRONG_TOTAL = /\bTOTAL\b/i
const EXCLUDE_WORDS = /\b(?:VAT|TAX|CHANGE|TENDER(?:ED)?|CASH\s*BACK|BALANCE|ROUNDING|DISCOUNT|POINTS|REWARDS?|SAVINGS?|LEVY|TIP)\b/i
// Digits with optional thousands groups ("1 217,56", "1,217.56") and up to 3 decimals.
const NUMBER = /\d+(?:[ ,]\d{3})*(?:[.,]\d{1,3})?/g

const BRANDS = ['ENGEN', 'SHELL', 'BP', 'SASOL', 'TOTALENERGIES', 'CALTEX', 'ASTRON', 'PUMA', 'ELEGANT', 'SPAR EXPRESS', 'TOTAL']
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

/**
 * Groups recognised lines into printed rows using their positions, so a label on
 * the left and its value on the right end up on the same row.
 * @param {Array<{text, left, top, right, bottom}>} lines
 * @returns {string[]} rows, top to bottom
 */
export function buildRows(lines) {
  const valid = (lines || []).filter((l) => l && typeof l.text === 'string' && l.text.trim())
  // A tilted photo makes a row's label and value sit at different heights. Undo the
  // tilt (median angle of the recognised lines) before comparing heights.
  const angles = valid.map((l) => l.angle).filter((a) => Number.isFinite(a)).sort((a, b) => a - b)
  const tilt = angles.length ? (angles[Math.floor(angles.length / 2)] * Math.PI) / 180 : 0
  const items = valid
    .map((l) => {
      const cx = (l.left + l.right) / 2
      const cy = (l.top + l.bottom) / 2
      const straight = { left: l.left * Math.cos(tilt) + l.top * Math.sin(tilt), mid: cy * Math.cos(tilt) - cx * Math.sin(tilt) }
      // A rotated box is taller than its text; scale it back for the row tolerance.
      const height = Math.max(1, (l.bottom - l.top) * Math.cos(tilt) - Math.abs((l.right - l.left) * Math.sin(tilt)))
      return { text: l.text, left: straight.left, mid: straight.mid, height: Math.max(height, (l.bottom - l.top) * 0.4) }
    })
    .sort((a, b) => a.mid - b.mid)
  const rows = []
  for (const item of items) {
    const row = rows.find((r) => Math.abs(r.mid - item.mid) <= Math.min(r.height, item.height) * 0.55)
    if (row) {
      row.items.push(item)
      row.mid = (row.mid * (row.items.length - 1) + item.mid) / row.items.length
    } else {
      rows.push({ mid: item.mid, height: item.height, items: [item] })
    }
  }
  return rows
    .sort((a, b) => a.mid - b.mid)
    .map((r) => r.items.sort((a, b) => a.left - b.left).map((i) => i.text.trim()).join('  '))
}

/** Every number in a row with the text around it, dates and times removed first. */
function numbersIn(row) {
  const cleaned = row
    .replace(/\b\d{1,4}[/.-]\d{1,2}[/.-]\d{2,4}\b/g, ' ')
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, ' ')
  const found = []
  for (const match of cleaned.matchAll(NUMBER)) {
    const value = parseDecimal(match[0])
    if (value === null) continue
    const before = cleaned.slice(Math.max(0, match.index - 4), match.index)
    const after = cleaned.slice(match.index + match[0].length, match.index + match[0].length + 8)
    found.push({ value, raw: match[0], before, after, hasDecimals: /[.,]\d{1,3}$/.test(match[0]) })
  }
  return found
}

const inRange = (v, [min, max]) => v >= min && v <= max

/** Scored candidates for each role. */
function candidates(rows) {
  const out = { litres: [], price: [], total: [], any: [] }
  rows.forEach((row, rowIndex) => {
    const excluded = EXCLUDE_WORDS.test(row)
    for (const n of numbersIn(row)) {
      const id = `${rowIndex}:${n.raw}:${out.any.length}`
      const base = { id, value: n.value, rowIndex }
      if (n.hasDecimals) out.any.push({ ...base, score: 0 })

      if (LITRE_UNIT.test(n.after)) out.litres.push({ ...base, score: 3 })
      else if (LITRE_WORDS.test(row) && !PRICE_WORDS.test(row) && !excluded && n.hasDecimals) out.litres.push({ ...base, score: 2 })

      if (PER_LITRE_UNIT.test(n.after)) out.price.push({ ...base, score: 3 })
      else if (CENTS_PER_LITRE.test(n.after)) out.price.push({ ...base, value: roundTo(n.value / 100, 2), score: 3 })
      else if (/@\s*R?\s*$/.test(n.before)) out.price.push({ ...base, score: 3 })
      else if (PRICE_WORDS.test(row) && !excluded) out.price.push({ ...base, score: 2 })

      if (TOTAL_WORDS.test(row) && !excluded && n.hasDecimals) out.total.push({ ...base, score: STRONG_TOTAL.test(row) ? 3 : 2 })
      else if (/R\s?$/i.test(n.before) && !excluded && n.hasDecimals) out.total.push({ ...base, score: 1 })
    }
  })
  out.litres = out.litres.filter((c) => inRange(c.value, SLIP_LIMITS.litres))
  out.price = out.price.filter((c) => inRange(c.value, SLIP_LIMITS.price))
  out.total = out.total.filter((c) => inRange(c.value, SLIP_LIMITS.total))
  return out
}

const consistent = (l, p, t) => Math.abs(l * p - t) <= Math.max(0.01 * t, 0.1)

/** Best litres/price/total, preferring a combination that adds up. */
function chooseAmounts(c) {
  const pool = (list, range) => [...list, ...c.any.filter((a) => inRange(a.value, range))]
  const litres = pool(c.litres, SLIP_LIMITS.litres)
  const price = pool(c.price, SLIP_LIMITS.price)
  const total = pool(c.total, SLIP_LIMITS.total)

  let best = null
  for (const l of litres) {
    for (const p of price) {
      if (p.id === l.id) continue
      for (const t of total) {
        if (t.id === l.id || t.id === p.id || !consistent(l.value, p.value, t.value)) continue
        const score = l.score + p.score + t.score
        if (!best || score > best.score) best = { score, litres: l.value, pricePerLitre: p.value, total: t.value }
      }
    }
  }
  if (best) return { litres: best.litres, pricePerLitre: best.pricePerLitre, total: best.total, consistent: true }

  // Nothing adds up: trust only labelled values, and derive one from the other two.
  const top = (list) => list.filter((x) => x.score >= 2).sort((a, b) => b.score - a.score)[0]?.value ?? null
  let l = top(c.litres)
  let p = top(c.price)
  const t = top(c.total)
  if (l === null && p !== null && t !== null) l = roundTo(t / p, 2)
  if (p === null && l !== null && t !== null) p = roundTo(t / l, 2)
  return {
    litres: l !== null && inRange(l, SLIP_LIMITS.litres) ? l : null,
    pricePerLitre: p !== null && inRange(p, SLIP_LIMITS.price) ? p : null,
    total: t,
    consistent: false,
  }
}

/** Fill-up date printed on the slip (day-first, as in South Africa), or null. */
export function findSlipDate(rows, today = toIsoDate()) {
  const valid = (y, m, d) => {
    const year = y < 100 ? 2000 + y : y
    const iso = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    if (!isValidIsoDate(iso)) return null
    const age = daysBetween(iso, today)
    return age >= 0 && age <= SLIP_LIMITS.maxAgeDays ? iso : null
  }
  for (const row of rows) {
    let m = /\b(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})\b/.exec(row)
    if (m) { const d = valid(+m[1], +m[2], +m[3]); if (d) return d }
    m = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/.exec(row)
    if (m) { const d = valid(+m[3], +m[2], +m[1]); if (d) return d }
    m = /\b(\d{1,2})[\s-]?([A-Z]{3})[A-Z]*[\s,-]*(\d{2,4})\b/i.exec(row)
    if (m) {
      const month = MONTHS.indexOf(m[2].toUpperCase()) + 1
      if (month) { const d = valid(+m[3], month, +m[1]); if (d) return d }
    }
  }
  return null
}

/** The garage, from a brand name near the top of the slip. */
export function findStation(rows) {
  for (const row of rows.slice(0, 6)) {
    if (/\d{2}/.test(row) && !/^[A-Z\s&'-]+\d{0,4}$/i.test(row)) continue
    const upper = row.toUpperCase()
    const brand = BRANDS.find((b) => new RegExp(`\\b${b}\\b`).test(upper))
    if (!brand || (brand === 'TOTAL' && TOTAL_WORDS.test(row) && /\d/.test(row))) continue
    const name = row.replace(/[^A-Za-z0-9&' -]/g, ' ').replace(/\s+/g, ' ').trim()
    return name
      .toLowerCase()
      .replace(/\b[a-z]/g, (ch) => ch.toUpperCase())
      .replace(/\bBp\b/, 'BP')
      .slice(0, 60)
  }
  return null
}

/**
 * @param {{ lines?: Array, text?: string }} recognised ML Kit output
 * @returns {{ litres, pricePerLitre, total, date, station, consistent, found: number }}
 */
export function parseSlip(recognised, { today = toIsoDate() } = {}) {
  const rows = recognised?.lines?.length
    ? buildRows(recognised.lines)
    : String(recognised?.text || '').split(/\r?\n/).map((r) => r.trim()).filter(Boolean)
  const amounts = chooseAmounts(candidates(rows))
  const result = { ...amounts, date: findSlipDate(rows, today), station: findStation(rows) }
  result.found = ['litres', 'pricePerLitre', 'total', 'date', 'station'].filter((k) => result[k] !== null).length
  return result
}

export class SlipScanError extends Error {}

let slipScanner = null

/**
 * Takes or picks a photo of a slip and reads it. Resolves to null when the user
 * cancels. Only available in the Android app.
 */
export async function scanSlip({ today } = {}) {
  const { Capacitor, registerPlugin } = await import('@capacitor/core')
  if (!Capacitor.isNativePlatform()) throw new SlipScanError('Slip scanning works in the Android app.')
  const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera')
  let photo
  try {
    photo = await Camera.getPhoto({
      source: CameraSource.Prompt,
      resultType: CameraResultType.Uri,
      quality: 90,
      width: 2400,
      correctOrientation: true,
      promptLabelHeader: 'Scan fuel slip',
      promptLabelPhoto: 'Choose from gallery',
      promptLabelPicture: 'Take photo',
    })
  } catch (error) {
    if (/cancel/i.test(error?.message || '')) return null
    throw error
  }
  slipScanner ??= registerPlugin('SlipScanner')
  const recognised = await slipScanner.recognize({ path: photo.path })
  return parseSlip(recognised, { today })
}
