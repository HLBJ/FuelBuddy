import { describe, expect, it } from 'vitest'
import { createTestDb, vehicleInput } from './helpers/testDatabase.js'
import { createVehicleService } from '../src/services/vehicleService.js'
import { costOfDriving, createExpenseService, validateExpense } from '../src/services/expenseService.js'

const today = '2026-10-15'
const input = (o = {}) => ({ vehicleId: 1, date: '2026-10-01', category: 'service', amount: '2 450,00', odometer: '', description: 'Minor service', ...o })

describe('running cost validation', () => {
  it('accepts SA-style amounts and optional odometer', () => {
    expect(validateExpense(input(), { today }).value).toMatchObject({ amount: 2450, odometer: null, category: 'service' })
    expect(validateExpense(input({ odometer: '61 200' }), { today }).value.odometer).toBe(61200)
  })

  it('rejects missing or impossible values', () => {
    const { errors } = validateExpense(input({ amount: '0', category: 'boat', date: '2026-10-16', odometer: '-1' }), { today })
    expect(errors).toMatchObject({ amount: expect.any(String), category: expect.any(String), date: expect.stringMatching(/future/), odometer: expect.any(String) })
    expect(validateExpense(input({ amount: '' }), { today }).errors.amount).toMatch(/Enter the amount/)
  })
})

describe('true cost of driving', () => {
  const entries = [
    { date: '2025-09-20', odometer: 40000, totalCost: 900 }, // before the 12-month window
    { date: '2025-11-05', odometer: 41000, totalCost: 1000 },
    { date: '2026-10-10', odometer: 52000, totalCost: 1200 },
  ]
  const expenses = [
    { date: '2026-03-01', category: 'insurance', amount: 600, odometer: null },
    { date: '2026-06-15', category: 'service', amount: 3000, odometer: 47000 },
    { date: '2025-08-01', category: 'tyres', amount: 5000, odometer: null }, // too old
  ]

  it('adds running costs to fuel and divides by the distance driven', () => {
    const c = costOfDriving({ entries, expenses }, { today })
    expect(c).toMatchObject({
      from: '2025-11-01',
      fuelCost: 2200,
      runningCost: 3600,
      totalCost: 5800,
      distance: 12000, // 52 000 now − 40 000, the last reading before the window
      costPerKm: 0.48,
      fuelCostPerKm: 0.18,
      perMonth: 483.33, // 12 months with records from November
    })
    expect(c.byCategory.map((x) => [x.label, x.amount, x.share])).toEqual([
      ['Service & maintenance', 3000, 51.7],
      ['Fuel', 2200, 37.9],
      ['Insurance', 600, 10.3],
    ])
    expect(c.months).toHaveLength(12)
    expect(c.months.at(-1)).toEqual({ month: '2026-10', fuel: 1200, other: 0, total: 1200 })
  })

  it('uses logbook trips as odometer readings and copes with no distance', () => {
    const trips = [{ date: '2026-10-12', startOdometer: 52000, endOdometer: 52300 }]
    expect(costOfDriving({ entries, expenses, trips }, { today }).distance).toBe(12300)
    const none = costOfDriving({ expenses: [{ date: '2026-10-01', category: 'parking', amount: 50, odometer: null }] }, { today })
    expect(none).toMatchObject({ hasData: true, distance: null, costPerKm: null, perMonth: 50 })
    expect(costOfDriving({}, { today })).toMatchObject({ hasData: false, perMonth: null })
  })
})

describe('running cost service with real SQLite', () => {
  it('creates, updates, lists and deletes, and goes with the vehicle', async () => {
    const db = await createTestDb()
    const vehicles = createVehicleService(db)
    const v = await vehicles.create(vehicleInput())
    const service = createExpenseService(db, { today: () => today })
    const e = await service.create(input({ vehicleId: v.id }))
    expect(e).toMatchObject({ amount: 2450, category: 'service', description: 'Minor service' })
    expect((await service.update(e.id, input({ vehicleId: v.id, amount: '2500' }))).amount).toBe(2500)
    await service.create(input({ vehicleId: v.id, date: '2026-09-01', category: 'tolls', amount: '57' }))
    expect((await service.listByVehicle(v.id)).map((x) => x.category)).toEqual(['tolls', 'service'])
    await expect(service.create(input({ vehicleId: 999 }))).rejects.toMatchObject({ name: 'ValidationError' })
    await service.delete(e.id)
    await expect(service.delete(e.id)).rejects.toMatchObject({ name: 'NotFoundError' })
    await vehicles.delete(v.id)
    expect(await service.listAll()).toEqual([])
  })
})

import { buildCsv } from '../src/services/exportService.js'

describe('CSV export with running costs', () => {
  it('adds a running costs table only when there are costs', () => {
    const vehicles = [{ id: 1, name: 'Polo', fuelType: 'petrol', currentOdometer: 0 }]
    const csv = buildCsv(vehicles, [], { expenses: [{ vehicleId: 1, date: '2026-10-01', category: 'tolls', amount: 57, odometer: null, description: 'N1 Huguenot' }] })
    expect(csv).toContain('FuelBuddy running costs\r\nVehicle,Date,Category,Amount (ZAR),Odometer (km),Description\r\nPolo,2026-10-01,Tolls,57,,N1 Huguenot')
    expect(buildCsv(vehicles, [])).not.toContain('running costs')
  })
})
