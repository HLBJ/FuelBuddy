/**
 * Parses user-entered decimal text. Accepts both "." and "," as the decimal
 * separator (South African keyboards commonly produce either) and ignores spaces
 * used as thousands separators. Returns null for empty or invalid input.
 *
 *   "1 234,5" -> 1234.5     "1,234.50" -> 1234.5     "abc" -> null
 */
export function parseDecimal(input) {
  if (input === null || input === undefined) return null
  if (typeof input === 'number') return Number.isFinite(input) ? input : null
  let text = String(input).replace(/[\s  ]/g, '')
  if (text === '') return null

  const lastDot = text.lastIndexOf('.')
  const lastComma = text.lastIndexOf(',')
  if (lastDot !== -1 && lastComma !== -1) {
    // The right-most separator is the decimal one; the other is grouping.
    if (lastComma > lastDot) text = text.replace(/\./g, '').replace(',', '.')
    else text = text.replace(/,/g, '')
  } else if (lastComma !== -1) {
    if ((text.match(/,/g) || []).length > 1) return null
    text = text.replace(',', '.')
  }

  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(text)) return null
  const value = Number(text)
  return Number.isFinite(value) ? value : null
}

export function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

export function roundTo(value, decimals = 2) {
  if (!isFiniteNumber(value)) return null
  const factor = 10 ** decimals
  // Number.EPSILON nudge avoids 1.005 -> 1.00 style floating point surprises.
  return Math.round((value + Math.sign(value) * Number.EPSILON) * factor) / factor
}
