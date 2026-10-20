import { describe, expect, it } from 'vitest'
import { createTestDb, entryInput, vehicleInput } from './helpers/testDatabase.js'
import { buildImportPlan, detectDateOrder, guessCategory, parseCsv, parseDateValue } from '../src/services/csvImport.js'
import { importPlan } from '../src/services/importService.js'
import { buildCsv } from '../src/services/exportService.js'
import { createVehicleService } from '../src/services/vehicleService.js'
import { createFuelEntryService } from '../src/services/fuelEntryService.js'
import { createExpenseService } from '../src/services/expenseService.js'

const today = '2026-10-15'

describe('CSV reading', () => {
  it('handles quotes, embedded delimiters, newlines and a BOM', () => {
    const { rows, delimiter } = parseCsv('﻿a,b,c\r\n1,"Engen, Main Rd","line1\nline2"\n2,"say ""hi""",')
    expect(delimiter).toBe(',')
    expect(rows).toEqual([['a', 'b', 'c'], ['1', 'Engen, Main Rd', 'line1\nline2'], ['2', 'say "hi"', '']])
  })

  it('detects semicolon files (Excel in South Africa often uses them)', () => {
    expect(parseCsv('Date;Litres;Price\n01/10/2026;40,5;30,25').delimiter).toBe(';')
  })

  it('reads dates in many formats and works out day/month order', () => {
    expect(detectDateOrder(['03/10/2026', '25/10/2026'])).toBe('dmy')
    expect(detectDateOrder(['10/03/2026', '10/25/2026'])).toBe('mdy')
    expect(parseDateValue('2026-10-03 08:30', 'dmy')).toBe('2026-10-03')
    expect(parseDateValue('03.10.26', 'dmy')).toBe('2026-10-03')
    expect(parseDateValue('3 Oct 2026')).toBe('2026-10-03')
    expect(parseDateValue('Oct 3, 2026')).toBe('2026-10-03')
    expect(parseDateValue('31/02/2026')).toBeNull()
  })

  it('maps cost descriptions to categories', () => {
    expect(['Insurance', 'Oil change', 'New tyres', 'Licence disc', 'N1 Toll', 'Parking', 'Car wash', 'Windscreen repair', 'Coffee'].map(guessCategory))
      .toEqual(['insurance', 'service', 'tyres', 'licence', 'tolls', 'parking', 'washing', 'repairs', 'other'])
  })
})

describe('import plans', () => {
  it("reads FuelBuddy's own export, including running costs", () => {
    const vehicles = [{ id: 1, name: 'Polo', registration: 'CA 1', fuelType: 'petrol', currentOdometer: 51000 }]
    const entries = [
      { vehicleId: 1, date: '2026-09-01', odometer: 50500, litres: 40, pricePerLitre: 26.92, totalCost: 1076.8, isFullTank: true, fuelStation: 'Engen, Main Rd', notes: null },
      { vehicleId: 1, date: '2026-09-15', odometer: 51000, litres: 12.5, pricePerLitre: 26.92, totalCost: 336.5, isFullTank: false, fuelStation: null, notes: 'Top-up' },
    ]
    const expenses = [{ vehicleId: 1, date: '2026-09-20', category: 'tolls', amount: 57, odometer: null, description: 'Huguenot' }]
    const plan = buildImportPlan(buildCsv(vehicles, entries, { expenses }))
    expect(plan.fillUps.map(({ date, odometer, litres, pricePerLitre, isFullTank, fuelStation, vehicle }) => ({ date, odometer, litres, pricePerLitre, isFullTank, fuelStation, vehicle }))).toEqual([
      { date: '2026-09-01', odometer: 50500, litres: 40, pricePerLitre: 26.92, isFullTank: true, fuelStation: 'Engen, Main Rd', vehicle: 'Polo' },
      { date: '2026-09-15', odometer: 51000, litres: 12.5, pricePerLitre: 26.92, isFullTank: false, fuelStation: null, vehicle: 'Polo' },
    ])
    expect(plan.costs).toMatchObject([{ date: '2026-09-20', category: 'tolls', amount: 57, description: 'Huguenot' }])
    expect(plan.skipped).toEqual([])
  })

  it('reads a South African spreadsheet with semicolons, decimal commas and rand amounts', () => {
    const csv = [
      'Datum;Kilometerstand;Liter;Bedrag;Volgemaak',
      '03/10/2026;61 240;42,10;R 1 273,53;ja',
      '25/09/2026;60 700;38,00;R 1 022,96;ja',
    ].join('\n')
    // Afrikaans-ish headers are not all recognised; the English ones below are.
    expect(buildImportPlan(csv).fillUps).toHaveLength(0)
    const english = csv.replace('Datum;Kilometerstand;Liter;Bedrag;Volgemaak', 'Date;Odometer;Litres;Amount;Full')
    const plan = buildImportPlan(english)
    expect(plan.fillUps.map((f) => [f.date, f.odometer, f.litres, f.pricePerLitre])).toEqual([
      ['2026-09-25', 60700, 38, 26.92],
      ['2026-10-03', 61240, 42.1, 30.25],
    ])
  })

  it('converts miles and US gallons, and builds odometer readings from trip distances', () => {
    const csv = ['Date,Miles,Gallons,Price per gallon', '2026-09-01,300,10,3.50', '2026-09-08,330,11,3.60'].join('\n')
    const plan = buildImportPlan(csv)
    expect(plan.units).toEqual({ distance: 'mi', volume: 'usgal' })
    expect(plan.fillUps.map((f) => [f.odometer, f.litres, f.pricePerLitre])).toEqual([
      [482.8, 37.85, 0.925],
      [1013.9, 41.64, 0.951],
    ])
    expect(plan.warnings.join(' ')).toMatch(/counted from zero/)
  })

  it('reports rows it cannot read', () => {
    const plan = buildImportPlan('Date,Odometer,Litres,Total\nnot a date,100,10,300\n2026-09-01,,10,300\n2026-09-02,200,10,\n2026-09-03,300,10,310')
    expect(plan.fillUps).toHaveLength(1)
    expect(plan.skipped.map((s) => s.reason)).toEqual(['Unreadable date "not a date"', 'Missing odometer or fuel amount', 'No price or total'])
  })
})

describe('importing into the database', () => {
  async function setup() {
    const db = await createTestDb()
    const vehicle = await createVehicleService(db).create(vehicleInput({ currentOdometer: '50000' }))
    return { db, vehicle }
  }
  const plan = () => buildImportPlan([
    'Date,Odometer,Litres,Price per litre,Full,Station',
    '2026-08-01,50500,40,25.58,1,Engen',
    '2026-08-20,51000,35,25.58,1,Shell',
    '2026-09-05,50900,30,26.92,1,Wrong odometer',
    '2026-09-10,51500,36,26.92,1,BP',
    '2026-12-01,52000,30,26.92,1,Future',
  ].join('\n'))

  it('adds fill-ups, skips bad rows and raises the vehicle odometer', async () => {
    const { db, vehicle } = await setup()
    const result = await importPlan(db, plan(), { vehicleId: vehicle.id }, { today })
    expect(result).toMatchObject({ fillUps: 3, duplicates: 0 })
    expect(result.rejected.map((r) => r.reason)).toEqual(['Odometer is out of order with other fill-ups', 'The date cannot be in the future.'])
    const entries = await createFuelEntryService(db).listByVehicle(vehicle.id)
    expect(entries.map((e) => e.odometer)).toEqual([50500, 51000, 51500])
    expect((await createVehicleService(db).getById(vehicle.id)).currentOdometer).toBe(51500)
  })

  it('does not import the same file twice', async () => {
    const { db, vehicle } = await setup()
    await importPlan(db, plan(), { vehicleId: vehicle.id }, { today })
    const again = await importPlan(db, plan(), { vehicleId: vehicle.id }, { today })
    expect(again).toMatchObject({ fillUps: 0, duplicates: 3 })
  })

  it('keeps existing fill-ups and refuses rows that contradict them', async () => {
    const { db, vehicle } = await setup()
    await createFuelEntryService(db, { today: () => today }).create(entryInput(vehicle.id, { date: '2026-08-10', odometer: '50800' }))
    const result = await importPlan(db, plan(), { vehicleId: vehicle.id }, { today })
    expect(result.fillUps).toBe(3)
  })

  it('creates a new vehicle and imports its running costs', async () => {
    const db = await createTestDb()
    const csv = [
      'Date,Odometer,Litres,Total cost', '2026-08-01,90500,40,1023.20', '',
      'Date,Category,Cost,Title', '2026-08-15,Service,2450,Major service', '2026-08-16,Insurance,650,August premium',
    ].join('\n')
    const result = await importPlan(db, buildImportPlan(csv), { newVehicle: { name: 'Hilux', fuelType: 'diesel' } }, { today })
    expect(result).toMatchObject({ fillUps: 1, costs: 2, rejected: [] })
    const vehicle = await createVehicleService(db).getById(result.vehicleId)
    expect(vehicle).toMatchObject({ name: 'Hilux', currentOdometer: 90500 })
    expect((await createExpenseService(db).listByVehicle(vehicle.id)).map((e) => e.category)).toEqual(['service', 'insurance'])
  })
})
