import catalogData from '../data/vehicles-za.json'
import { roundTo } from './numberUtils.js'

/**
 * Popular South African vehicles with their fuel tank size and the manufacturer's
 * official combined consumption (see src/data/vehicles-za.json for sources). Used to
 * suggest makes and models, fill in the tank size, and compare a driver's measured
 * consumption with the official figure.
 */
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '')

export const slug = (...parts) => parts.join(' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)

/** Adds a stable key to each entry. */
export function prepareCatalog(data) {
  return (data?.vehicles || [])
    .filter((v) => v.make && v.model)
    .map((v) => ({ ...v, key: slug(v.make, v.model, v.variant || '', v.years || '') }))
}

let prepared = null
export const catalog = () => (prepared ??= prepareCatalog(catalogData))

export function makes(list = catalog()) {
  return [...new Set(list.map((v) => v.make))].sort((a, b) => a.localeCompare(b))
}

/** Models of a make (matched loosely: "vw" finds Volkswagen too). */
export function modelsFor(make, list = catalog()) {
  const m = norm(make)
  if (!m) return []
  const aliases = { vw: 'volkswagen', merc: 'mercedesbenz', mercedes: 'mercedesbenz', chev: 'chevrolet' }
  const target = aliases[m] || m
  return [...new Set(list.filter((v) => norm(v.make) === target).map((v) => v.model))].sort((a, b) => a.localeCompare(b))
}

/** Engine variants for a make and model, with tank size and rated consumption. */
export function variantsFor(make, model, list = catalog()) {
  const mk = norm(make)
  const md = norm(model)
  if (!mk || !md) return []
  return list.filter((v) => norm(v.make) === mk && norm(v.model) === md)
}

export function findByKey(key, list = catalog()) {
  return key ? list.find((v) => v.key === key) || null : null
}

/**
 * The tank size and catalogue entry to suggest. With one variant (or all variants
 * sharing a tank size) it's certain; otherwise the variant matching the fuel type is
 * used if that's unambiguous.
 */
export function suggestTank({ make, model, fuelType, catalogKey }, list = catalog()) {
  const chosen = findByKey(catalogKey, list)
  if (chosen) return { entry: chosen, tankLitres: chosen.tankLitres ?? null, certain: true }
  const variants = variantsFor(make, model, list)
  if (!variants.length) return null
  const sizes = [...new Set(variants.map((v) => v.tankLitres).filter(Boolean))]
  if (sizes.length === 1) return { entry: variants.length === 1 ? variants[0] : null, tankLitres: sizes[0], certain: true }
  let sameFuel = variants.filter((v) => v.fuelType === fuelType)
  if (!sameFuel.length && fuelType === 'hybrid') sameFuel = variants.filter((v) => v.fuelType === 'petrol')
  const fuelSizes = [...new Set(sameFuel.map((v) => v.tankLitres).filter(Boolean))]
  if (fuelSizes.length === 1) return { entry: sameFuel.length === 1 ? sameFuel[0] : null, tankLitres: fuelSizes[0], certain: false }
  return { entry: null, tankLitres: null, certain: false, options: variants }
}

/**
 * Measured consumption against the official figure. Official figures are measured in
 * a lab cycle; real-world driving is normally higher (often 10–25% for WLTP and
 * 20–40% for the older NEDC cycle), so the verdict allows for that.
 */
export function compareWithRated(measured, entry) {
  const rated = entry?.combinedL100
  if (!(measured > 0) || !(rated > 0)) return null
  const diffPercent = roundTo(((measured - rated) / rated) * 100, 0)
  const typicalMax = entry.cycle === 'WLTP' ? 25 : 40
  let verdict
  if (diffPercent <= 0) verdict = 'better' // better than the official figure
  else if (diffPercent <= typicalMax) verdict = 'typical'
  else verdict = 'high'
  return { measured: roundTo(measured, 1), rated, cycle: entry.cycle || null, diffPercent, typicalMax, verdict }
}
