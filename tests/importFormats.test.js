import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildImportPlan } from '../src/services/csvImport.js'

// Fixtures are built from real export lines found in open-source importers and forums;
// see the comments in tests/fixtures/imports and docs/IMPORT_FORMATS.md.
const fixture = (name) => readFileSync(new URL(`./fixtures/imports/${name}`, import.meta.url), 'utf8')
const brief = (f) => [f.date, f.odometer, f.litres, f.pricePerLitre, f.isFullTank]

describe('real export formats', () => {
  it('Fuelio: sections, units from the vehicle, VolumePrice per litre, costs joined to categories', () => {
    const plan = buildImportPlan(fixture('fuelio.csv'))
    expect(plan.app).toBe('Fuelio')
    expect(plan.vehicleNames).toEqual(['Golf'])
    expect(plan.units).toEqual({ distance: 'mi', volume: 'l' })
    expect(plan.fillUps.map(brief)).toEqual([
      ['2024-03-10', 341948.6, 46.3, 1.449, true],
      ['2024-03-24', 342630.9, 45.12, 1.42, true],
    ])
    expect(plan.fillUps[0]).toMatchObject({ vehicle: 'Golf', fuelStation: 'Somerset - Sun all Service Station', missed: false })
    // The insurance row is a template (a reminder), not money spent.
    expect(plan.costs).toMatchObject([{ date: '2024-03-15', category: 'service', amount: 189.5, odometer: 342307.5, description: 'Annual service' }])
    expect(plan.skipped).toEqual([])
  })

  it('Drivvo: "Volume" is the litres (the "Fuel" column is the fuel name), Yes/No full tank', () => {
    const plan = buildImportPlan(fixture('drivvo.csv'))
    expect(plan.app).toBe('Drivvo')
    expect(plan.fillUps.map(brief)).toEqual([
      ['2019-10-09', 10995, 20, 6.15, true],
      ['2019-10-16', 11234, 9.5, 6.199, true],
    ])
    expect(plan.fillUps[1].fuelStation).toBe('Br Casa Forte')
    expect(plan.costs).toMatchObject([{ date: '2019-10-12', category: 'washing', amount: 25, odometer: 11100 }])
  })

  it('Fuelly app: miles and US gallons, "$" prices, thousands commas, service rows become costs', () => {
    const plan = buildImportPlan(fixture('fuelly-app.csv'))
    expect(plan.app).toBe('Fuelly')
    expect(plan.units).toEqual({ distance: 'mi', volume: 'usgal' })
    expect(plan.fillUps.map(brief)).toEqual([
      ['2020-01-21', 24434.7, 26.83, 1.083, true],
      ['2020-02-10', 26279, 29.94, 1.03, true],
    ])
    expect(plan.costs).toMatchObject([{ date: '2020-02-02', category: 'service', amount: 35.81, odometer: 25990.9, description: 'Spark Plugs' }])
    expect(plan.warnings).toContain('Miles and gallons were converted to km and litres.')
  })

  it('Fuelly website (metric): "price" is per litre, partial_fuelup marks partial fills', () => {
    const plan = buildImportPlan(fixture('fuelly-web.csv'))
    expect(plan.units).toEqual({ distance: 'km', volume: 'l' })
    expect(plan.fillUps.map(brief)).toEqual([
      ['2014-06-22', 200124, 5.35, 2.56, true],
      ['2014-07-05', 200840, 43.7, 2.49, true],
      ['2014-07-15', 201410, 20.1, 2.52, false],
    ])
    expect(plan.vehicleNames).toEqual(['Renault Laguna 2.2dT'])
  })

  it('aCar (South Africa): rand prices, units per row, day-first dates, thousands commas', () => {
    const plan = buildImportPlan(fixture('acar.csv'))
    expect(plan.app).toBe('aCar')
    expect(plan.dateOrder).toBe('dmy')
    expect(plan.fillUps.map(brief)).toEqual([
      ['2014-04-30', 134417, 46.85, 14.16, true],
      ['2014-05-14', 134982, 44.2, 14.16, true],
    ])
    expect(plan.fillUps[0]).toMatchObject({ vehicle: 'Renault', fuelStation: 'Engen' })
  })

  it('Spritmonitor (German): semicolons, decimal commas, total only, Tankart 2 = partial', () => {
    const plan = buildImportPlan(fixture('spritmonitor.csv'))
    expect(plan.app).toBe('Spritmonitor')
    expect(plan.fillUps.map(brief)).toEqual([
      ['2026-08-08', 199166, 22.23, 2.089, true],
      ['2026-08-20', 199705, 12.5, 2.088, false],
    ])
    expect(plan.fillUps[1]).toMatchObject({ fuelStation: 'Aral', notes: 'Halb voll' })
  })

  it('My Cars: units from preferences, "distance" is the odometer, cost_pos_curr is the total', () => {
    const csv = [
      '// mycar export file', '// export version: 2', '#entity: preferences', '##key,value',
      '"distanceUnit","miles"', '"fuelQuantityUnit","gallonsUS"', '"refuelDistanceType","odometer"', '',
      '#entity: refuel',
      '##car_name,refuelDate,quantity,quantity_2,quantity_extra_info,distance,price,price_2,note,refuel_type,fuel_station,fuel_subtype,fuel_type,drive_type,road_type,use_ac,use_trailer,avg_speed,computer_fuel_efficiency,pos_curr,pos_curr_rate,cost_def_curr,cost_pos_curr,payment_method,pictures',
      // First row verbatim from a real export (fuelly.com forum thread 19085); second in the same format.
      '"My Car","2016-04-30 10:23","13.68",,,"62022","2.159",,,"0","QuikTrip","87","0","Normal","Mixed","false","false",,,"USD","1.0","29.545914999999997","29.545914999999997","Credit card",',
      '"My Car","2016-05-12 18:02","12.10",,,"62340","2.199",,,"0","QuikTrip","87","0","Normal","Mixed","false","false",,,"USD","1.0","26.6079","26.6079","Credit card",',
    ].join('\n')
    const plan = buildImportPlan(csv)
    expect(plan.app).toBe('My Cars')
    expect(plan.fillUps.map(brief)).toEqual([
      ['2016-04-30', 99814.7, 51.78, 0.571, true],
      ['2016-05-12', 100326.5, 45.8, 0.581, true],
    ])
  })

  it('LubeLogger and Simply Auto layouts', () => {
    const lube = buildImportPlan('Date,Odometer,FuelConsumed,Cost,FuelEconomy,IsFillToFull,MissedFuelUp,Notes,Tags\n2026-09-01,50500,40,1076.8,0,True,False,,\n2026-09-15,51000,12.5,336.5,0,False,False,Top-up,')
    expect(lube.app).toBe('LubeLogger')
    expect(lube.fillUps.map(brief)).toEqual([['2026-09-01', 50500, 40, 26.92, true], ['2026-09-15', 51000, 12.5, 26.92, false]])

    const simply = buildImportPlan([
      'Row ID,Vehicle ID,Odometer,Qty,Partial Tank,Missed Fill Up,Total Cost,Distance Travelled,Eff,Octane,Fuel Brand,Filling Station,Notes,Day,Month,Year,Receipt Path,Latitude,Longitude,Record Type,Record Desc',
      '1,1,50500,40,0,0,1076.80,500,8.0,95,Engen,Main Rd,,1,9,2026,,,,0,Fuel Record',
      '2,1,50800,0,0,0,2450.00,0,0,,,,,10,9,2026,,,,1,Oil change',
    ].join('\n'))
    expect(simply.app).toBe('Simply Auto')
    expect(simply.fillUps.map(brief)).toEqual([['2026-09-01', 50500, 40, 26.92, true]])
    expect(simply.costs).toMatchObject([{ date: '2026-09-10', category: 'service', amount: 2450, description: 'Oil change' }])
  })
})
