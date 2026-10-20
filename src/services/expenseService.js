import { createExpenseRepository } from '../repositories/expenseRepository.js'
import { createVehicleRepository } from '../repositories/vehicleRepository.js'
import { NotFoundError, ValidationError } from '../database/errors.js'
import { parseDecimal, roundTo } from './numberUtils.js'
import { isValidIsoDate, monthKey, shiftMonth, toIsoDate } from './dateUtils.js'

/** Running costs on top of fuel. Together they give the true cost of driving. */
export const EXPENSE_CATEGORIES = Object.freeze([
  { value: 'service', label: 'Service & maintenance' },
  { value: 'repairs', label: 'Repairs' },
  { value: 'tyres', label: 'Tyres' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'finance', label: 'Car payment / finance' },
  { value: 'licence', label: 'Licence & registration' },
  { value: 'tolls', label: 'Tolls' },
  { value: 'parking', label: 'Parking' },
  { value: 'washing', label: 'Car wash' },
  { value: 'other', label: 'Other' },
])

export const categoryLabel = (value) => EXPENSE_CATEGORIES.find((c) => c.value === value)?.label || 'Other'

export const EXPENSE_LIMITS = Object.freeze({ maxAmount: 10_000_000, descriptionLength: 120, maxOdometer: 9_999_999 })

export function validateExpense(input, { today = toIsoDate() } = {}) {
  const errors = {}
  const vehicleId = Number(input.vehicleId)
  if (!Number.isInteger(vehicleId) || vehicleId <= 0) errors.vehicleId = 'Choose a vehicle.'

  const date = String(input.date ?? '').trim().slice(0, 10)
  if (!isValidIsoDate(date)) errors.date = 'Enter a valid date.'
  else if (date > today) errors.date = "The date can't be in the future."

  const category = EXPENSE_CATEGORIES.some((c) => c.value === input.category) ? input.category : null
  if (!category) errors.category = 'Choose a category.'

  const amount = parseDecimal(input.amount)
  if (amount === null) errors.amount = 'Enter the amount.'
  else if (amount <= 0 || amount > EXPENSE_LIMITS.maxAmount) errors.amount = 'Enter an amount above zero.'

  const rawOdo = String(input.odometer ?? '').trim()
  let odometer = null
  if (rawOdo) {
    odometer = parseDecimal(rawOdo)
    if (odometer === null || odometer < 0 || odometer > EXPENSE_LIMITS.maxOdometer) errors.odometer = 'Enter the reading in km.'
  }

  const description = String(input.description ?? '').trim()
  if (description.length > EXPENSE_LIMITS.descriptionLength) errors.description = `Keep it under ${EXPENSE_LIMITS.descriptionLength} characters.`

  const valid = Object.keys(errors).length === 0
  return {
    valid,
    errors,
    value: valid ? { vehicleId, date, category, amount: roundTo(amount, 2), odometer: odometer === null ? null : roundTo(odometer, 1), description: description || null } : null,
  }
}

/**
 * Fuel plus running costs over the last `months` calendar months (including this one).
 * Cost per km uses the distance between odometer readings (fill-ups, running costs with a
 * reading, and logbook trips): from the last reading before the period (or the first in
 * it) to the latest one.
 */
export function costOfDriving({ entries = [], expenses = [], trips = [] }, { today = toIsoDate(), months = 12 } = {}) {
  const thisMonth = monthKey(today)
  const firstMonth = shiftMonth(thisMonth, -(months - 1))
  const from = `${firstMonth}-01`
  const inPeriod = (d) => d >= from && d <= today

  const fuel = entries.filter((e) => inPeriod(e.date))
  const running = expenses.filter((e) => inPeriod(e.date))
  const fuelCost = roundTo(fuel.reduce((s, e) => s + (e.totalCost || 0), 0), 2)
  const runningCost = roundTo(running.reduce((s, e) => s + (e.amount || 0), 0), 2)
  const totalCost = roundTo(fuelCost + runningCost, 2)

  const totals = new Map()
  for (const e of running) totals.set(e.category, (totals.get(e.category) || 0) + e.amount)
  const byCategory = [...(fuelCost > 0 ? [['fuel', fuelCost]] : []), ...totals]
    .map(([category, amount]) => ({
      category,
      label: category === 'fuel' ? 'Fuel' : categoryLabel(category),
      amount: roundTo(amount, 2),
      share: totalCost > 0 ? roundTo((amount / totalCost) * 100, 1) : 0,
    }))
    .sort((a, b) => b.amount - a.amount)

  const readings = [
    ...entries.map((e) => ({ date: e.date, km: e.odometer })),
    ...expenses.filter((e) => e.odometer !== null && e.odometer !== undefined).map((e) => ({ date: e.date, km: e.odometer })),
    ...trips.flatMap((t) => [{ date: t.date, km: t.startOdometer }, { date: t.date, km: t.endOdometer }]),
  ].filter((r) => Number.isFinite(r.km) && r.date <= today)
  const before = readings.filter((r) => r.date < from).map((r) => r.km)
  const during = readings.filter((r) => inPeriod(r.date)).map((r) => r.km)
  const start = before.length ? Math.max(...before) : during.length ? Math.min(...during) : null
  const end = during.length ? Math.max(...during) : null
  const distance = start !== null && end !== null && end > start ? roundTo(end - start, 1) : null

  const series = []
  for (let i = 0; i < months; i += 1) {
    const key = shiftMonth(firstMonth, i)
    const f = fuel.filter((e) => monthKey(e.date) === key).reduce((s, e) => s + (e.totalCost || 0), 0)
    const o = running.filter((e) => monthKey(e.date) === key).reduce((s, e) => s + e.amount, 0)
    series.push({ month: key, fuel: roundTo(f, 2), other: roundTo(o, 2), total: roundTo(f + o, 2) })
  }
  // Average over the months that have records, from the first one up to this month.
  const firstActive = series.findIndex((m) => m.total > 0)
  const activeMonths = firstActive === -1 ? 0 : months - firstActive

  return {
    from,
    to: today,
    hasData: totalCost > 0,
    fuelCost,
    runningCost,
    totalCost,
    byCategory,
    distance,
    costPerKm: distance ? roundTo(totalCost / distance, 2) : null,
    fuelCostPerKm: distance ? roundTo(fuelCost / distance, 2) : null,
    perMonth: activeMonths ? roundTo(totalCost / activeMonths, 2) : null,
    months: series,
  }
}

export function createExpenseService(db, { today = () => toIsoDate() } = {}) {
  const repo = createExpenseRepository(db)
  const vehicles = createVehicleRepository(db)

  async function checked(input) {
    const { valid, errors, value } = validateExpense(input, { today: today() })
    if (!valid) throw new ValidationError(errors)
    if (!(await vehicles.getById(value.vehicleId))) throw new ValidationError({ vehicleId: 'That vehicle no longer exists.' })
    return value
  }

  return {
    listByVehicle: (vehicleId, range) => repo.listByVehicle(vehicleId, range),
    listAll: () => repo.listAll(),
    getById: (id) => repo.getById(id),
    create: async (input) => repo.create(await checked(input)),
    async update(id, input) {
      if (!(await repo.getById(id))) throw new NotFoundError('That cost no longer exists.')
      return repo.update(id, await checked(input))
    },
    async delete(id) {
      if (!(await repo.delete(id))) throw new NotFoundError('That cost no longer exists.')
      return true
    },
  }
}
