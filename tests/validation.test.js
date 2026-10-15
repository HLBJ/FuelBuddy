import { describe, expect, it } from 'vitest'
import { validateFuelEntry, validateVehicle } from '../src/services/validation.js'

const vehicle = (o = {}) => ({ name: 'Polo', fuelType: 'petrol', currentOdometer: '1000', ...o })
const entry = (o = {}) => ({ vehicleId: 1, date: '2026-10-01', odometer: '1500', litres: '40', pricePerLitre: '22.5', isFullTank: true, ...o })
const ctx = { today: '2026-10-08' }

describe('validateVehicle', () => {
  it('accepts a minimal vehicle and normalises values', () => {
    const r = validateVehicle(vehicle({ name: '  Polo  ', make: ' ', tankCapacity: '45,5', year: '2019' }), { currentYear: 2026 })
    expect(r.valid).toBe(true)
    expect(r.value).toMatchObject({ name: 'Polo', make: null, tankCapacity: 45.5, year: 2019, currentOdometer: 1000 })
  })

  it('requires a name and an odometer', () => {
    const r = validateVehicle({ name: '', currentOdometer: '' })
    expect(r.valid).toBe(false)
    expect(r.errors.name).toMatch(/required/i)
    expect(r.errors.currentOdometer).toMatch(/required/i)
  })

  it('enforces ranges and allowed values', () => {
    const r = validateVehicle(vehicle({ year: '2028', fuelType: 'electric', tankCapacity: '0', currentOdometer: '-1', name: 'x'.repeat(51), registration: 'y'.repeat(21) }), { currentYear: 2026 })
    expect(Object.keys(r.errors).sort()).toEqual(['currentOdometer', 'fuelType', 'name', 'registration', 'tankCapacity', 'year'])
    expect(validateVehicle(vehicle({ year: '2027' }), { currentYear: 2026 }).valid).toBe(true)
    expect(validateVehicle(vehicle({ year: '1899' }), { currentYear: 2026 }).errors.year).toBeTruthy()
    expect(validateVehicle(vehicle({ year: '2019.5' })).errors.year).toBeTruthy()
    expect(validateVehicle(vehicle({ tankCapacity: '1001' })).errors.tankCapacity).toBeTruthy()
  })

  it('does not allow the odometer below the latest fill-up', () => {
    const r = validateVehicle(vehicle({ currentOdometer: '1400' }), { maxEntryOdometer: 1500 })
    expect(r.errors.currentOdometer).toMatch(/lower than your latest fill-up/)
    expect(validateVehicle(vehicle({ currentOdometer: '1500' }), { maxEntryOdometer: 1500 }).valid).toBe(true)
  })
})

describe('validateFuelEntry', () => {
  it('accepts a valid entry and calculates total cost', () => {
    const r = validateFuelEntry(entry({ litres: '33,33', pricePerLitre: '21.999' }), ctx)
    expect(r.valid).toBe(true)
    expect(r.value).toMatchObject({ vehicleId: 1, date: '2026-10-01', odometer: 1500, litres: 33.33, pricePerLitre: 21.999, totalCost: 733.23, isFullTank: true })
  })

  it('defaults to a full tank unless explicitly false', () => {
    expect(validateFuelEntry(entry({ isFullTank: undefined }), ctx).value.isFullTank).toBe(true)
    expect(validateFuelEntry(entry({ isFullTank: false }), ctx).value.isFullTank).toBe(false)
  })

  it('rejects future and invalid dates', () => {
    expect(validateFuelEntry(entry({ date: '2026-10-09' }), ctx).errors.date).toMatch(/future/)
    expect(validateFuelEntry(entry({ date: '2026-02-30' }), ctx).errors.date).toBeTruthy()
    expect(validateFuelEntry(entry({ date: '' }), ctx).errors.date).toBeTruthy()
    expect(validateFuelEntry(entry({ date: '2026-10-08T10:00:00' }), ctx).value.date).toBe('2026-10-08')
  })

  it('requires litres > 0 and price >= 0', () => {
    expect(validateFuelEntry(entry({ litres: '0' }), ctx).errors.litres).toMatch(/greater than zero/)
    expect(validateFuelEntry(entry({ litres: '-2' }), ctx).errors.litres).toBeTruthy()
    expect(validateFuelEntry(entry({ litres: '' }), ctx).errors.litres).toMatch(/required/)
    expect(validateFuelEntry(entry({ pricePerLitre: '-0.01' }), ctx).errors.pricePerLitre).toMatch(/negative/)
    const free = validateFuelEntry(entry({ pricePerLitre: '0' }), ctx)
    expect(free.valid).toBe(true)
    expect(free.value.totalCost).toBe(0)
    expect(validateFuelEntry(entry({ pricePerLitre: 'abc' }), ctx).errors.pricePerLitre).toMatch(/number/)
  })

  it('keeps odometer readings monotonic using neighbour bounds', () => {
    const bounds = { min: 1200, max: 1800 }
    expect(validateFuelEntry(entry({ odometer: '1100' }), { ...ctx, bounds }).errors.odometer).toMatch(/lower than an earlier fill-up/)
    expect(validateFuelEntry(entry({ odometer: '1900' }), { ...ctx, bounds }).errors.odometer).toMatch(/higher than a later fill-up/)
    expect(validateFuelEntry(entry({ odometer: '1200' }), { ...ctx, bounds }).valid).toBe(true)
    expect(validateFuelEntry(entry({ odometer: '1800' }), { ...ctx, bounds }).valid).toBe(true)
    expect(validateFuelEntry(entry({ odometer: '-5' }), ctx).errors.odometer).toMatch(/negative/)
  })

  it('warns (without blocking) when the newest reading is below the vehicle odometer', () => {
    const r = validateFuelEntry(entry({ odometer: '900' }), { ...ctx, isLatest: true, vehicleOdometer: 1000 })
    expect(r.valid).toBe(true)
    expect(r.warnings.odometer).toMatch(/lower than the vehicle's current odometer/)
    expect(validateFuelEntry(entry({ odometer: '900' }), { ...ctx, isLatest: false, vehicleOdometer: 1000 }).warnings.odometer).toBeUndefined()
  })

  it('warns when litres exceed the tank capacity', () => {
    expect(validateFuelEntry(entry({ litres: '60' }), { ...ctx, tankCapacity: 45 }).warnings.litres).toBeTruthy()
    expect(validateFuelEntry(entry({ litres: '45' }), { ...ctx, tankCapacity: 45 }).warnings.litres).toBeUndefined()
  })

  it('limits text lengths and requires a vehicle', () => {
    const r = validateFuelEntry(entry({ vehicleId: '', fuelStation: 's'.repeat(81), notes: 'n'.repeat(501) }), ctx)
    expect(Object.keys(r.errors).sort()).toEqual(['fuelStation', 'notes', 'vehicleId'])
    expect(r.value).toBeNull()
  })
})
