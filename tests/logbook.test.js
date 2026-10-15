import { describe, expect, it } from 'vitest'
import { createTestDb, vehicleInput } from './helpers/testDatabase.js'
import { createVehicleService } from '../src/services/vehicleService.js'
import {
  createLogbookService, summariseLogbook, taxYearFor, taxYearLabel, taxYearRange, validateTrip,
} from '../src/services/logbookService.js'
import { buildLogbookCsv, buildLogbookPdf, logbookFileName } from '../src/services/logbookExport.js'

const trip = (o = {}) => ({
  vehicleId: 1, date: '2026-10-10', purpose: 'business', startOdometer: '50 000', endOdometer: '50 064',
  origin: 'Office', destination: 'ABC Ltd, Bellville', reason: 'Client meeting', notes: '', ...o,
})

describe('SA tax years', () => {
  it('run from 1 March to the end of February', () => {
    expect(taxYearFor('2026-02-28')).toBe(2026)
    expect(taxYearFor('2026-03-01')).toBe(2027)
    expect(taxYearRange(2027)).toEqual({ start: '2026-03-01', end: '2027-02-28' })
    expect(taxYearRange(2028).end).toBe('2028-02-29')
    expect(taxYearLabel(2028)).toBe('1 Mar 2027 – 29 Feb 2028')
  })
})

describe('trip validation', () => {
  const today = '2026-10-15'

  it('accepts a complete business trip', () => {
    expect(validateTrip(trip(), { today }).value).toMatchObject({ startOdometer: 50000, endOdometer: 50064, purpose: 'business' })
  })

  it('needs destination and reason for business, not for private', () => {
    const { errors } = validateTrip(trip({ destination: '', reason: ' ' }), { today })
    expect(errors.destination).toMatch(/SARS needs the destination/)
    expect(errors.reason).toMatch(/SARS needs the reason/)
    expect(validateTrip(trip({ purpose: 'private', destination: '', reason: '' }), { today }).valid).toBe(true)
  })

  it('rejects backwards readings, huge trips and future dates', () => {
    expect(validateTrip(trip({ endOdometer: '49 990' }), { today }).errors.endOdometer).toMatch(/higher/)
    expect(validateTrip(trip({ endOdometer: '60 000' }), { today }).errors.endOdometer).toMatch(/over 5000 km/)
    expect(validateTrip(trip({ date: '2026-10-16' }), { today }).errors.date).toMatch(/future/)
    expect(validateTrip(trip({ purpose: 'holiday', startOdometer: '' }), { today }).errors).toMatchObject({ purpose: expect.any(String), startOdometer: expect.any(String) })
  })
})

describe('logbook summary', () => {
  const trips = [
    { purpose: 'business', distance: 64 },
    { purpose: 'business', distance: 120.5 },
    { purpose: 'private', distance: 30 },
  ]

  it('uses the odometer readings for total and private km (SARS method)', () => {
    expect(summariseLogbook(trips, { openingOdometer: 40000, closingOdometer: 41000 })).toEqual({
      tripCount: 3, businessTrips: 2, businessKm: 184.5, privateKm: 815.5, totalKm: 1000, hasReadings: true, businessShare: 18.5, readingsTooLow: false,
    })
  })

  it('falls back to logged trips without readings, and flags impossible readings', () => {
    expect(summariseLogbook(trips)).toMatchObject({ totalKm: 214.5, privateKm: 30, hasReadings: false, businessShare: 86 })
    expect(summariseLogbook(trips, { openingOdometer: 40000, closingOdometer: 40100 }).readingsTooLow).toBe(true)
    expect(summariseLogbook([]).businessShare).toBeNull()
  })
})

describe('logbook service with real SQLite', () => {
  async function setup() {
    const db = await createTestDb()
    const vehicle = await createVehicleService(db).create(vehicleInput({ currentOdometer: '50000' }))
    const service = createLogbookService(db, { today: () => '2026-10-15' })
    return { db, vehicle, service }
  }

  it('logs trips, raises the vehicle odometer and suggests the next start', async () => {
    const { db, vehicle, service } = await setup()
    await service.create(trip({ vehicleId: vehicle.id }))
    await service.create(trip({ vehicleId: vehicle.id, date: '2026-10-11', startOdometer: '50064', endOdometer: '50094', purpose: 'private', destination: '', reason: '' }))
    expect(await service.suggestedStart(vehicle.id)).toBe(50094)
    expect((await createVehicleService(db).getById(vehicle.id)).currentOdometer).toBe(50094)

    const year = await service.year(vehicle.id, 2027)
    expect(year.trips.map((t) => t.date)).toEqual(['2026-10-11', '2026-10-10']) // newest first
    expect(year.summary).toMatchObject({ businessKm: 64, privateKm: 30, totalKm: 94, hasReadings: false })
    expect(year.suggested).toEqual({ openingOdometer: 50000, closingOdometer: 50094 })
    expect((await service.year(vehicle.id, 2026)).trips).toEqual([])
  })

  it('stores the tax year readings and validates them', async () => {
    const { vehicle, service } = await setup()
    await service.create(trip({ vehicleId: vehicle.id }))
    await service.setReadings(vehicle.id, 2027, { openingOdometer: '48 000', closingOdometer: '' })
    expect((await service.year(vehicle.id, 2027)).readings).toEqual({ openingOdometer: 48000, closingOdometer: null })
    await service.setReadings(vehicle.id, 2027, { openingOdometer: '48000', closingOdometer: '58000' })
    expect((await service.year(vehicle.id, 2027)).summary).toMatchObject({ totalKm: 10000, businessKm: 64, privateKm: 9936 })
    await expect(service.setReadings(vehicle.id, 2027, { openingOdometer: '5', closingOdometer: '4' })).rejects.toMatchObject({ name: 'ValidationError' })
  })

  it('updates and deletes trips', async () => {
    const { service, vehicle } = await setup()
    const t = await service.create(trip({ vehicleId: vehicle.id }))
    expect((await service.update(t.id, trip({ vehicleId: vehicle.id, endOdometer: '50100' }))).distance).toBe(100)
    await service.delete(t.id)
    await expect(service.delete(t.id)).rejects.toMatchObject({ name: 'NotFoundError' })
    await expect(service.create(trip({ vehicleId: 999 }))).rejects.toMatchObject({ name: 'ValidationError' })
  })
})

describe('logbook exports', () => {
  const vehicle = { name: 'Polo', make: 'Volkswagen', model: 'Polo Vivo', registration: 'CA 123-456' }
  const year = {
    taxYear: 2027,
    trips: [
      { date: '2026-10-11', startOdometer: 50064, endOdometer: 50094, distance: 30, purpose: 'private', origin: null, destination: null, reason: null },
      { date: '2026-10-10', startOdometer: 50000, endOdometer: 50064, distance: 64, purpose: 'business', origin: 'Office', destination: 'ABC Ltd, Bellville', reason: 'Client meeting – "Q4"' },
    ],
    readings: { openingOdometer: 48000, closingOdometer: null },
    summary: summariseLogbook([{ purpose: 'business', distance: 64 }, { purpose: 'private', distance: 30 }]),
  }

  it('builds a CSV with the summary and trips oldest first', () => {
    const csv = buildLogbookCsv(vehicle, year)
    expect(csv).toContain('Tax year,2027 (01/03/2026 - 28/02/2027)')
    expect(csv).toContain('Opening odometer (1 March),48 000 km')
    expect(csv).toContain('Closing odometer (end of February),Not recorded')
    const rows = csv.trim().split('\r\n')
    expect(rows.at(-2)).toBe('10/10/2026,50 000,50 064,64,Business,Office,"ABC Ltd, Bellville","Client meeting – ""Q4"""')
    expect(rows.at(-1)).toBe('11/10/2026,50 064,50 094,30,Private,,,')
    expect(logbookFileName(vehicle, 2027, 'pdf')).toBe('fuelbuddy-logbook-ca-123-456-2027.pdf')
  })

  it('builds a real PDF', async () => {
    const bytes = await buildLogbookPdf(vehicle, year, { generated: new Date(2026, 9, 15) })
    const text = new TextDecoder('latin1').decode(bytes)
    expect(text.startsWith('%PDF-')).toBe(true)
    expect(text).toContain('Travel logbook - tax year 2027')
    expect(text).toContain('ABC Ltd, Bellville')
    expect(text).toContain('Client meeting - "Q4"') // en dash flattened for the PDF font
    expect(text).toContain('Vehicle: Polo')
  })
})
