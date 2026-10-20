import { captureText } from './textCapture.js'

/**
 * Finds the odometer reading in a photo of a dashboard. Instrument clusters show
 * several numbers (trip meters, range, time, temperature, speed), so every number is
 * scored: an "ODO" label nearby wins, trip/range/time/temperature lose, and readings
 * that fit the vehicle's history (not lower than the last one, not wildly higher) are
 * preferred. The user always confirms, and can pick another candidate.
 */
export const ODOMETER_RULES = Object.freeze({
  minKm: 10,
  maxKm: 2_000_000,
  // A reading this far above the last known one is unlikely (but still offered).
  plausibleJumpKm: 30_000,
})

const ODO_WORD = /\b(odo|odometer|total|km\s*total|kilometerstand)\b/i
const OTHER_WORDS = /\b(trip|trp|range|dte|to empty|avg|average|km\/h|kmh|mph|l\/100|rpm|service|oil|temp|eco)\b|°|\b[ab]\s*$/i

/** Every whole number in a line, with digits split by spaces, dots or commas joined up. */
function numbersIn(text) {
  const found = []
  const cleaned = String(text)
    .replace(/\b\d{1,2}:\d{2}\b/g, ' ') // clock
    .replace(/\b\d+[.,]\d\b(?!\d)/g, ' ') // one decimal: trip meters (123.4)
  for (const m of cleaned.matchAll(/\d{1,3}(?:[ ., ]\d{3})+|\d+/g)) {
    const value = Number(m[0].replace(/[ ., ]/g, ''))
    if (Number.isFinite(value)) found.push({ value, digits: m[0].replace(/\D/g, '').length })
  }
  return found
}

/**
 * @param {{ lines?: Array<{text, left, top, right, bottom}>, text?: string }} recognised
 * @param {{ lastOdometer?: number|null }} context the vehicle's latest known reading
 * @returns {{ best: number|null, candidates: number[] }} candidates best-first
 */
export function parseOdometer(recognised, { lastOdometer = null } = {}) {
  const lines = recognised?.lines?.length
    ? recognised.lines
    : String(recognised?.text || '').split(/\r?\n/).map((text, i) => ({ text, top: i * 40, bottom: i * 40 + 30, left: 0, right: 100 }))
  const heightOf = (l) => Math.max(1, (l.bottom ?? 0) - (l.top ?? 0))
  const tallest = Math.max(1, ...lines.map(heightOf))
  const labels = lines.filter((l) => ODO_WORD.test(l.text))
  const near = (a, b) => Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) < heightOf(b) * 2.5

  const scored = new Map()
  for (const line of lines) {
    for (const n of numbersIn(line.text)) {
      if (n.value < ODOMETER_RULES.minKm || n.value > ODOMETER_RULES.maxKm || n.digits < 3) continue
      let score = n.digits * 2 // odometers are the longest number on the dash
      score += (heightOf(line) / tallest) * 2 // and usually large
      if (ODO_WORD.test(line.text) || labels.some((l) => l !== line && near(l, line))) score += 10
      if (OTHER_WORDS.test(line.text)) score -= 10
      if (lastOdometer !== null && lastOdometer !== undefined) {
        if (n.value < lastOdometer) score -= 8
        else if (n.value - lastOdometer <= ODOMETER_RULES.plausibleJumpKm) score += 6
        else score -= 3
      }
      scored.set(n.value, Math.max(scored.get(n.value) ?? -Infinity, score))
    }
  }
  const candidates = [...scored.entries()].sort((a, b) => b[1] - a[1]).map(([value]) => value)
  return { best: candidates[0] ?? null, candidates: candidates.slice(0, 4) }
}

/** Takes or picks a photo of the dashboard and reads it. Null when the user cancels. */
export async function scanOdometer(context) {
  const recognised = await captureText({ title: 'Read odometer' })
  return recognised ? parseOdometer(recognised, context) : null
}
