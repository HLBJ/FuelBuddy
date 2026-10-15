import { describe, expect, it } from 'vitest'
import { createTestDb, vehicleInput } from './helpers/testDatabase.js'
import { ENGAGEMENT, hasProAccess, shouldAskForReview, shouldShowProNudge, trialState } from '../src/services/engagementService.js'
import {
  REMINDER_RULES, createReminderService, nextYear, notificationIds, notificationPlan, reminderStatus, validateReminder,
} from '../src/services/reminderService.js'
import { createVehicleService } from '../src/services/vehicleService.js'
import { getSchemaVersion, runMigrations } from '../src/database/migrator.js'
import { LATEST_SCHEMA_VERSION, migrations } from '../src/database/migrations/index.js'
import { createVehicleRepository } from '../src/repositories/vehicleRepository.js'

const DAY = 24 * 60 * 60 * 1000

describe('engagement rules', () => {
  it('asks for a rating once, after enough fill-ups', () => {
    expect(shouldAskForReview({ fillUpCount: ENGAGEMENT.reviewAfterFillUps - 1, reviewAskedAt: null })).toBe(false)
    expect(shouldAskForReview({ fillUpCount: ENGAGEMENT.reviewAfterFillUps, reviewAskedAt: null })).toBe(true)
    expect(shouldAskForReview({ fillUpCount: 50, reviewAskedAt: '2026-10-01T00:00:00Z' })).toBe(false)
  })

  it('runs a 7-day trial once', () => {
    const start = Date.parse('2026-10-01T08:00:00Z')
    expect(trialState(null)).toEqual({ used: false, active: false, daysLeft: 0, endsAt: null })
    expect(trialState('2026-10-01T08:00:00Z', start + 1 * DAY)).toMatchObject({ used: true, active: true, daysLeft: 6 })
    expect(trialState('2026-10-01T08:00:00Z', start + 6.9 * DAY)).toMatchObject({ active: true, daysLeft: 1 })
    expect(trialState('2026-10-01T08:00:00Z', start + 7 * DAY)).toMatchObject({ used: true, active: false, daysLeft: 0 })
    expect(trialState('garbage').used).toBe(false)
  })

  it('grants Pro features for a purchase or an active trial only', () => {
    const now = Date.parse('2026-10-03T00:00:00Z')
    expect(hasProAccess({ isPro: true, trialStartedAt: null, now })).toBe(true)
    expect(hasProAccess({ isPro: false, trialStartedAt: '2026-10-01T00:00:00Z', now })).toBe(true)
    expect(hasProAccess({ isPro: false, trialStartedAt: '2026-09-01T00:00:00Z', now })).toBe(false)
    expect(hasProAccess({ isPro: false, trialStartedAt: null, now })).toBe(false)
  })

  it('offers Pro when trends become meaningful, until dismissed', () => {
    const base = { isPro: false, trialStartedAt: null, nudgeDismissedAt: null, segmentCount: 2, now: Date.parse('2026-10-03T00:00:00Z') }
    expect(shouldShowProNudge(base)).toBe(true)
    expect(shouldShowProNudge({ ...base, segmentCount: 1 })).toBe(false)
    expect(shouldShowProNudge({ ...base, isPro: true })).toBe(false)
    expect(shouldShowProNudge({ ...base, nudgeDismissedAt: '2026-10-02' })).toBe(false)
    expect(shouldShowProNudge({ ...base, trialStartedAt: '2026-10-02T00:00:00Z' })).toBe(false) // trial running
    expect(shouldShowProNudge({ ...base, trialStartedAt: '2026-09-01T00:00:00Z' })).toBe(true) // trial over: offer purchase
  })
})

describe('reminder rules', () => {
  const input = (o = {}) => ({ vehicleId: 1, type: 'service', title: 'Major service', dueDate: '2026-12-01', dueOdometer: '', notes: '', ...o })

  it('needs a date or an odometer reading', () => {
    expect(validateReminder(input()).valid).toBe(true)
    expect(validateReminder(input({ dueDate: '', dueOdometer: '60 000' })).value).toMatchObject({ dueDate: null, dueOdometer: 60000 })
    expect(validateReminder(input({ dueDate: '', dueOdometer: '' })).errors.dueDate).toMatch(/due date, an odometer reading, or both/)
    expect(validateReminder(input({ dueDate: '2026-02-30' })).errors.dueDate).toMatch(/valid date/)
    expect(validateReminder(input({ dueOdometer: '-5' })).errors.dueOdometer).toBeTruthy()
    expect(validateReminder(input({ title: ' ', type: 'bogus', vehicleId: '' })).errors).toMatchObject({ title: expect.any(String), type: expect.any(String), vehicleId: expect.any(String) })
  })

  it('works out status from date and distance, most urgent wins', () => {
    const today = '2026-10-15'
    expect(reminderStatus({ dueDate: '2026-12-31', dueOdometer: null }, { today })).toBe('upcoming')
    expect(reminderStatus({ dueDate: '2026-10-29', dueOdometer: null }, { today })).toBe('due-soon') // 14 days
    expect(reminderStatus({ dueDate: '2026-10-14', dueOdometer: null }, { today })).toBe('overdue')
    expect(reminderStatus({ dueDate: null, dueOdometer: 60000 }, { today, currentOdometer: 59600 })).toBe('due-soon')
    expect(reminderStatus({ dueDate: null, dueOdometer: 60000 }, { today, currentOdometer: 60010 })).toBe('overdue')
    expect(reminderStatus({ dueDate: '2027-06-01', dueOdometer: 60000 }, { today, currentOdometer: 60100 })).toBe('overdue')
    expect(reminderStatus({ dueDate: null, dueOdometer: 60000 }, { today, currentOdometer: null })).toBe('upcoming')
    expect(reminderStatus({ doneAt: '2026-10-01', dueDate: '2026-01-01' }, { today })).toBe('done')
  })

  it('renews licence discs on the same date next year', () => {
    expect(nextYear('2026-10-15')).toBe('2027-10-15')
    expect(nextYear('2028-02-29')).toBe('2029-02-28')
  })

  it('plans a week-before and a due-day notification at 09:00, skipping the past', () => {
    const r = { id: 7, title: 'Renew licence disc', dueDate: '2026-11-20', doneAt: null }
    const plan = notificationPlan(r, 'Polo', new Date(2026, 9, 15, 12))
    expect(plan.map((n) => n.id)).toEqual(notificationIds(7))
    expect(plan[0].at).toEqual(new Date(2026, 10, 13, REMINDER_RULES.notifyHour))
    expect(plan[1].at).toEqual(new Date(2026, 10, 20, REMINDER_RULES.notifyHour))
    expect(plan[1].body).toBe('Renew licence disc · Polo')
    expect(notificationPlan(r, 'Polo', new Date(2026, 10, 16)).map((n) => n.title)).toEqual(['Due today'])
    expect(notificationPlan({ ...r, doneAt: 'x' }, 'Polo')).toEqual([])
    expect(notificationPlan({ ...r, dueDate: null }, 'Polo')).toEqual([])
  })
})

describe('reminder service with real SQLite', () => {
  async function setup() {
    const db = await createTestDb()
    const vehicle = await createVehicleService(db).create(vehicleInput({ currentOdometer: '59000' }))
    const calls = []
    const notifier = { sync: async (r, name) => calls.push(['sync', r.id, name]), cancel: async (id) => calls.push(['cancel', id]) }
    const service = createReminderService(db, { notifier, today: () => '2026-10-15' })
    return { db, vehicle, service, calls }
  }

  it('creates, lists by urgency and keeps notifications in sync', async () => {
    const { vehicle, service, calls } = await setup()
    const later = await service.create({ vehicleId: vehicle.id, type: 'licence', title: 'Renew licence disc', dueDate: '2027-03-01' })
    const soon = await service.create({ vehicleId: vehicle.id, type: 'service', title: 'Service', dueOdometer: '59 400' })
    const list = await service.upcoming(vehicle.id, 59000)
    expect(list.map((r) => [r.id, r.status])).toEqual([[soon.id, 'due-soon'], [later.id, 'upcoming']])
    expect(calls).toContainEqual(['sync', later.id, 'Polo'])
  })

  it('rolls a completed licence disc reminder over to next year', async () => {
    const { vehicle, service, calls } = await setup()
    const r = await service.create({ vehicleId: vehicle.id, type: 'licence', title: 'Renew licence disc', dueDate: '2026-10-20' })
    const { done, next } = await service.complete(r.id)
    expect(done.doneAt).toBeTruthy()
    expect(next).toMatchObject({ type: 'licence', dueDate: '2027-10-20', doneAt: null })
    expect(calls).toContainEqual(['cancel', r.id])
    const other = await service.create({ vehicleId: vehicle.id, type: 'tyres', title: 'Tyres', dueOdometer: '80000' })
    expect((await service.complete(other.id)).next).toBeNull()
  })

  it('rejects invalid input and missing vehicles, and deletes with the vehicle', async () => {
    const { db, vehicle, service } = await setup()
    await expect(service.create({ vehicleId: vehicle.id, type: 'service', title: 'x' })).rejects.toMatchObject({ name: 'ValidationError' })
    await expect(service.create({ vehicleId: 999, type: 'service', title: 'x', dueDate: '2027-01-01' })).rejects.toMatchObject({ name: 'ValidationError' })
    await service.create({ vehicleId: vehicle.id, type: 'service', title: 'Service', dueDate: '2027-01-01' })
    await createVehicleService(db).delete(vehicle.id)
    expect(await service.listByVehicle(vehicle.id)).toEqual([])
    await expect(service.delete(12345)).rejects.toMatchObject({ name: 'NotFoundError' })
  })
})

describe('schema upgrade from 1', () => {
  it('adds reminders to an existing database without losing data', async () => {
    const db = await createTestDb({ migrate: false })
    await runMigrations(db, migrations.slice(0, 1))
    const v = await createVehicleRepository(db).create({ name: 'Old car', fuelType: 'petrol', currentOdometer: 1000, isDefault: true })
    expect(await getSchemaVersion(db)).toBe(1)
    const result = await runMigrations(db)
    expect(result).toMatchObject({ from: 1, to: LATEST_SCHEMA_VERSION, applied: [2, 3] })
    expect((await createVehicleRepository(db).getById(v.id)).name).toBe('Old car')
    const cols = (await db.query('PRAGMA table_info(reminders)')).map((c) => c.name)
    expect(cols).toEqual(expect.arrayContaining(['vehicle_id', 'type', 'title', 'due_date', 'due_odometer', 'done_at']))
    await expect(db.run("INSERT INTO reminders (vehicle_id, type, title, created_at, updated_at) VALUES (?, 'x', 'no due', 'a', 'a')", [v.id])).rejects.toThrow()
  })
})

import { routeForDeepLink, routeForNotification } from '../src/services/deepLinks.js'

describe('deep links', () => {
  it('maps widget and shortcut links to routes', () => {
    expect(routeForDeepLink('fuelbuddy://add-fillup')).toBe('/entries/new')
    expect(routeForDeepLink('fuelbuddy://route/')).toBe('/trip/route')
    expect(routeForDeepLink('FUELBUDDY://Reminders?x=1')).toBe('/reminders')
    expect(routeForDeepLink('fuelbuddy://settings/delete-all')).toBeNull()
    expect(routeForDeepLink('https://evil.example/add-fillup')).toBeNull()
    expect(routeForDeepLink(null)).toBeNull()
  })

  it('only follows in-app notification paths', () => {
    expect(routeForNotification({ url: '/reminders/12/edit' })).toBe('/reminders/12/edit')
    expect(routeForNotification({ url: 'https://evil.example' })).toBeNull()
    expect(routeForNotification({ url: '/settings' })).toBeNull()
    expect(routeForNotification(undefined)).toBeNull()
  })
})
