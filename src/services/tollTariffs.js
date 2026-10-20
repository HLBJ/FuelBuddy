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

/**
 * Adds fees to the plazas on a route and totals them.
 * @param {Array<{name}>} plazas from tollPlazasAlongRoute
 * @returns {{ plazas: Array, total: number, unknown: number }} plazas with a `fee`
 */
export function routeTolls(plazas, tollClass = 1, t = tariffs()) {
  const roadTolls = (plazas || []).filter((p) => isRoadToll(p.name, t))
  const priced = roadTolls.map((p) => ({ ...p, fee: tollFee(p.name, tollClass, t) }))
  const total = roundTo(priced.reduce((sum, p) => sum + (p.fee ?? 0), 0), 2)
  return { plazas: priced, total, unknown: priced.filter((p) => p.fee === null).length }
}
