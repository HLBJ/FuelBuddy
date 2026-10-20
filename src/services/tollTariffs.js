import tariffData from '../data/toll-tariffs-za.json'
import { roundTo } from './numberUtils.js'

/**
 * Toll fees for plazas on a planned route, from SANRAL's published tariffs (see
 * src/data/toll-tariffs-za.json). Prices are per pass; e-tag discounts and
 * frequent-user rebates are not included.
 */
export const TOLL_CLASSES = Object.freeze([
  { value: 1, label: 'Class 1', description: 'Cars, bakkies and minibuses' },
  { value: 2, label: 'Class 2', description: 'Medium heavy vehicles' },
  { value: 3, label: 'Class 3', description: 'Large heavy vehicles' },
  { value: 4, label: 'Class 4', description: 'Extra-large heavy vehicles' },
])

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

export function prepareTariffs(data) {
  const byName = new Map()
  for (const plaza of data?.plazas || []) for (const name of plaza.names) byName.set(norm(name), plaza)
  return { byName, notTolls: new Set((data?.notTolls || []).map(norm)), effectiveFrom: data?.effectiveFrom || null, source: data?.source || '' }
}

let prepared = null
const tariffs = () => (prepared ??= prepareTariffs(tariffData))
export const tariffsEffectiveFrom = () => tariffs().effectiveFrom

/** Park entrance gates are tagged as toll booths in map data, but aren't road tolls. */
export function isRoadToll(name, t = tariffs()) {
  return !t.notTolls.has(norm(name))
}

/** Fee for one pass at a plaza, or null when unknown (or the class may not use it). */
export function tollFee(name, tollClass = 1, t = tariffs()) {
  const plaza = t.byName.get(norm(name))
  const fee = plaza?.classes?.[tollClass - 1]
  return typeof fee === 'number' ? fee : null
}

export function isRampPlaza(name, t = tariffs()) {
  return Boolean(t.byName.get(norm(name))?.ramp)
}

/** A ramp plaza this close to the start or end is where the trip joins or leaves the highway. */
export const RAMP_ENDPOINT_KM = 3

/**
 * Adds fees to the plazas on a route and totals them. Ramp plazas are only charged
 * near the start or end of the trip; along the way the route passes them on the
 * highway, so they're listed as `optional` (paid only when using that exit).
 * @param {Array<{name, alongKm}>} plazas from tollPlazasAlongRoute
 * @param {{ totalKm?: number }} [route]
 * @returns {{ plazas: Array, total: number, unknown: number }} plazas with `fee` and `optional`
 */
export function routeTolls(plazas, tollClass = 1, { totalKm = null } = {}, t = tariffs()) {
  const roadTolls = (plazas || []).filter((p) => isRoadToll(p.name, t))
  const nearEnd = (p) => p.alongKm <= RAMP_ENDPOINT_KM || (totalKm !== null && totalKm - p.alongKm <= RAMP_ENDPOINT_KM)
  const priced = roadTolls.map((p) => ({ ...p, fee: tollFee(p.name, tollClass, t), optional: isRampPlaza(p.name, t) && !nearEnd(p) }))
  const charged = priced.filter((p) => !p.optional)
  const total = roundTo(charged.reduce((sum, p) => sum + (p.fee ?? 0), 0), 2)
  return { plazas: priced, total, unknown: charged.filter((p) => p.fee === null).length }
}
