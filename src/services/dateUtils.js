/** Local calendar date as `YYYY-MM-DD` (fuel entries are stored this way). */
export function toIsoDate(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** True for a real calendar date in `YYYY-MM-DD` form (rejects 2026-02-30). */
export function isValidIsoDate(value) {
  if (typeof value !== 'string') return false
  const match = ISO_DATE.exec(value)
  if (!match) return false
  const [, y, m, d] = match.map(Number)
  const date = new Date(y, m - 1, d)
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
}

/** `YYYY-MM` month key for an ISO date string. */
export function monthKey(isoDate) {
  return isoDate.slice(0, 7)
}

/** Month key `offset` months away from the month containing `isoDate`. */
export function shiftMonth(key, offset) {
  const [y, m] = key.split('-').map(Number)
  const date = new Date(y, m - 1 + offset, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

/** Accepts an ISO date or a full ISO timestamp and returns `YYYY-MM-DD`. */
export function normaliseDateInput(value) {
  if (typeof value !== 'string') return null
  const candidate = value.slice(0, 10)
  return isValidIsoDate(candidate) ? candidate : null
}
