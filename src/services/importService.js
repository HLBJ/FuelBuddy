import { createFuelEntryRepository } from '../repositories/fuelEntryRepository.js'
import { createVehicleRepository } from '../repositories/vehicleRepository.js'
import { createExpenseRepository } from '../repositories/expenseRepository.js'
import { ValidationError } from '../database/errors.js'
import { validateFuelEntry, validateVehicle } from './validation.js'
import { validateExpense } from './expenseService.js'
import { toIsoDate } from './dateUtils.js'

/**
 * Writes an import plan (see csvImport.buildImportPlan) into one vehicle, in a single
 * transaction. Rows are checked with the same rules as the forms; rows already in the
 * vehicle (same date and odometer) are skipped, as are rows whose odometer goes
 * backwards in time. The vehicle's current odometer is raised to the latest reading.
 *
 * @param {object} plan
 * @param {{ vehicleId?: number, newVehicle?: object, vehicleName?: string|null }} target
 *   an existing vehicle, or the fields for a new one; `vehicleName` limits the import
 *   to rows for that vehicle when the file has several
 * @returns {Promise<{ vehicleId, fillUps, costs, duplicates, rejected: Array<{line, reason}> }>}
 */
export async function importPlan(db, plan, target, { today = toIsoDate() } = {}) {
  const forVehicle = (row) => !target.vehicleName || !row.vehicle || row.vehicle === target.vehicleName
  const fillUps = plan.fillUps.filter(forVehicle)
  const costs = plan.costs.filter(forVehicle)

  return db.transaction(async (tx) => {
    const vehicles = createVehicleRepository(tx)
    let vehicleId = target.vehicleId
    if (!vehicleId) {
      const latest = fillUps.reduce((m, f) => Math.max(m, f.odometer), 0)
      const { valid, errors, value } = validateVehicle({ ...target.newVehicle, currentOdometer: String(latest) })
      if (!valid) throw new ValidationError(errors)
      vehicleId = (await vehicles.create(value)).id
    }
    const vehicle = await vehicles.getById(vehicleId)
    if (!vehicle) throw new ValidationError({ vehicleId: 'That vehicle no longer exists.' })

    const entriesRepo = createFuelEntryRepository(tx)
    const existing = await entriesRepo.listByVehicle(vehicleId)
    const seen = new Set(existing.map((e) => `${e.date}|${e.odometer}`))
    const readings = existing.map((e) => ({ date: e.date, odometer: e.odometer }))
    const rejected = []
    let duplicates = 0
    let added = 0
    let highest = vehicle.currentOdometer

    // An odometer must not be lower than any reading on an earlier date, nor higher than one on a later date.
    const fits = (date, km) => readings.every((r) => (r.date < date ? r.odometer <= km : r.date > date ? r.odometer >= km : true))

    for (const f of [...fillUps].sort((a, b) => a.date.localeCompare(b.date) || a.odometer - b.odometer)) {
      if (seen.has(`${f.date}|${f.odometer}`)) { duplicates += 1; continue }
      const { valid, errors, value } = validateFuelEntry(
        {
          vehicleId, date: f.date, odometer: f.odometer, litres: f.litres, pricePerLitre: f.pricePerLitre, isFullTank: f.isFullTank,
          fuelStation: f.fuelStation?.slice(0, 80),
          // FuelBuddy has no "missed fill-up" flag; keep the information so odd consumption makes sense.
          notes: [f.notes, f.missed ? 'Imported: the fill-up before this one was not recorded.' : null].filter(Boolean).join(' ').slice(0, 500) || null,
        },
        { today },
      )
      if (!valid) { rejected.push({ line: f.line, reason: Object.values(errors)[0] }); continue }
      if (!fits(value.date, value.odometer)) { rejected.push({ line: f.line, reason: 'Odometer is out of order with other fill-ups' }); continue }
      await entriesRepo.create(value)
      seen.add(`${value.date}|${value.odometer}`)
      readings.push({ date: value.date, odometer: value.odometer })
      highest = Math.max(highest, value.odometer)
      added += 1
    }

    const expenses = createExpenseRepository(tx)
    const existingCosts = new Set((await expenses.listByVehicle(vehicleId)).map((e) => `${e.date}|${e.amount}|${e.category}`))
    let costsAdded = 0
    for (const c of costs) {
      const key = `${c.date}|${c.amount}|${c.category}`
      if (existingCosts.has(key)) { duplicates += 1; continue }
      const { valid, errors, value } = validateExpense({ vehicleId, date: c.date, category: c.category, amount: c.amount, odometer: c.odometer ?? '', description: c.description?.slice(0, 120) }, { today })
      if (!valid) { rejected.push({ line: c.line, reason: Object.values(errors)[0] }); continue }
      await expenses.create(value)
      existingCosts.add(key)
      if (value.odometer) highest = Math.max(highest, value.odometer)
      costsAdded += 1
    }

    if (highest > vehicle.currentOdometer) await vehicles.updateOdometer(vehicleId, highest)
    return { vehicleId, fillUps: added, costs: costsAdded, duplicates, rejected }
  })
}
