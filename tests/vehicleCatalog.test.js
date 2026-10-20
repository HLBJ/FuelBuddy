import { describe, expect, it } from 'vitest'
import { compareWithRated, makes, modelsFor, prepareCatalog, suggestTank, variantsFor } from '../src/services/vehicleCatalog.js'

// Made-up entries to test the logic; the real data has its own checks below.
const list = prepareCatalog({
  vehicles: [
    { make: 'Volkswagen', model: 'Polo Vivo', years: '2018–2024', variant: '1.4 petrol', fuelType: 'petrol', tankLitres: 45, combinedL100: 5.9, cycle: 'NEDC' },
    { make: 'Volkswagen', model: 'Polo Vivo', years: '2018–2024', variant: '1.6 petrol', fuelType: 'petrol', tankLitres: 45, combinedL100: 6.2, cycle: 'NEDC' },
    { make: 'Toyota', model: 'Hilux', years: '2016–2024', variant: '2.4 GD-6 diesel', fuelType: 'diesel', tankLitres: 80, combinedL100: 7.6, cycle: 'NEDC' },
    { make: 'Toyota', model: 'Hilux', years: '2016–2024', variant: '2.7 petrol', fuelType: 'petrol', tankLitres: 80, combinedL100: 10.2, cycle: 'NEDC' },
    { make: 'Toyota', model: 'Corolla Cross', years: '2021–2026', variant: '1.8 petrol', fuelType: 'petrol', tankLitres: 47, combinedL100: 7.0, cycle: 'WLTP' },
    { make: 'Toyota', model: 'Corolla Cross', years: '2021–2026', variant: '1.8 hybrid', fuelType: 'hybrid', tankLitres: 36, combinedL100: 4.3, cycle: 'WLTP' },
  ],
})

describe('vehicle catalogue', () => {
  it('lists makes, models and variants, with loose matching', () => {
    expect(makes(list)).toEqual(['Toyota', 'Volkswagen'])
    expect(modelsFor('vw', list)).toEqual(['Polo Vivo'])
    expect(modelsFor('toyota', list)).toEqual(['Corolla Cross', 'Hilux'])
    expect(variantsFor('TOYOTA', 'hilux', list).map((v) => v.variant)).toEqual(['2.4 GD-6 diesel', '2.7 petrol'])
    expect(list[0].key).toBe('volkswagen-polo-vivo-1-4-petrol-2018-2024')
  })

  it('suggests a tank size when it is certain or the fuel type decides', () => {
    expect(suggestTank({ make: 'Volkswagen', model: 'Polo Vivo' }, list)).toMatchObject({ tankLitres: 45, certain: true })
    expect(suggestTank({ make: 'Toyota', model: 'Hilux' }, list)).toMatchObject({ tankLitres: 80, certain: true })
    expect(suggestTank({ make: 'Toyota', model: 'Corolla Cross', fuelType: 'hybrid' }, list)).toMatchObject({ tankLitres: 36, certain: false })
    expect(suggestTank({ make: 'Toyota', model: 'Corolla Cross', fuelType: 'diesel' }, list).options).toHaveLength(2)
    expect(suggestTank({ make: 'Toyota', model: 'Corolla Cross', catalogKey: list[4].key }, list)).toMatchObject({ tankLitres: 47, certain: true })
    expect(suggestTank({ make: 'Lada', model: 'Niva' }, list)).toBeNull()
  })

  it('compares measured consumption with the official figure, allowing for real-world driving', () => {
    expect(compareWithRated(6.9, list[0])).toEqual({ measured: 6.9, rated: 5.9, cycle: 'NEDC', diffPercent: 17, typicalMax: 40, verdict: 'typical' })
    expect(compareWithRated(5.5, list[0]).verdict).toBe('better')
    expect(compareWithRated(9.5, list[4])).toMatchObject({ diffPercent: 36, typicalMax: 25, verdict: 'high' })
    expect(compareWithRated(null, list[0])).toBeNull()
    expect(compareWithRated(6, { combinedL100: null })).toBeNull()
  })
})

import { createTestDb, vehicleInput } from './helpers/testDatabase.js'
import { createVehicleService } from '../src/services/vehicleService.js'

describe('vehicle catalogue match and toll class', () => {
  it('are saved with the vehicle and validated', async () => {
    const vehicles = createVehicleService(await createTestDb())
    const v = await vehicles.create(vehicleInput({ catalogKey: 'volkswagen-polo-vivo-1-4-petrol-2018-2024', tollClass: 2 }))
    expect(v).toMatchObject({ catalogKey: 'volkswagen-polo-vivo-1-4-petrol-2018-2024', tollClass: 2 })
    const updated = await vehicles.update(v.id, { ...vehicleInput(), catalogKey: 'Not A Key!', tollClass: 9 })
    expect(updated).toMatchObject({ catalogKey: null, tollClass: 1 })
  })
})
