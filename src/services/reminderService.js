import { createReminderRepository } from '../repositories/reminderRepository.js'
import { createVehicleRepository } from '../repositories/vehicleRepository.js'
import { NotFoundError, ValidationError } from '../database/errors.js'
import { parseDecimal, roundTo } from './numberUtils.js'
import { isValidIsoDate, toIsoDate } from './dateUtils.js'

export const REMINDER_TYPES = Object.freeze([
  { value: 'licence', label: 'Licence disc renewal', defaultTitle: 'Renew licence disc' },
  { value: 'service', label: 'Service', defaultTitle: 'Vehicle service' },
  { value: 'tyres', label: 'Tyres', defaultTitle: 'Check or replace tyres' },
  { value: 'other', label: 'Other', defaultTitle: '' },
])

export const REMINDER_RULES = Object.freeze({
  titleLength: 60,
  notesLength: 300,
  dueSoonDays: 14,
  dueSoonKm: 500,
  notifyDaysBefore: 7,
  notifyHour: 9,
})

const DAY_MS = 24 * 60 * 60 * 1000

/** Validates reminder form input. Needs a due date, a due odometer, or both. */
export function validateReminder(input, { today = toIsoDate() } = {}) {
  const errors = {}
  const vehicleId = Number(input.vehicleId)
  if (!Number.isInteger(vehicleId) || vehicleId <= 0) errors.vehicleId = 'Choose a vehicle.'
  const type = REMINDER_TYPES.some((t) => t.value === input.type) ? input.type : null
  if (!type) errors.type = 'Choose a reminder type.'
  const title = String(input.title ?? '').trim()
  if (!title) errors.title = 'Give the reminder a name.'
  else if (title.length > REMINDER_RULES.titleLength) errors.title = `Keep the name under ${REMINDER_RULES.titleLength} characters.`

  const rawDate = String(input.dueDate ?? '').trim().slice(0, 10)
  const dueDate = rawDate || null
  if (dueDate && !isValidIsoDate(dueDate)) errors.dueDate = 'Enter a valid date.'

  const rawOdo = String(input.dueOdometer ?? '').trim()
  let dueOdometer = null
  if (rawOdo) {
    const n = parseDecimal(rawOdo)
    if (n === null || n < 0) errors.dueOdometer = 'Enter the odometer reading in km.'
    else dueOdometer = roundTo(n, 0)
  }
  if (!dueDate && dueOdometer === null && !errors.dueDate && !errors.dueOdometer) {
    errors.dueDate = 'Set a due date, an odometer reading, or both.'
  }
  const notes = String(input.notes ?? '').trim()
  if (notes.length > REMINDER_RULES.notesLength) errors.notes = `Keep notes under ${REMINDER_RULES.notesLength} characters.`

  const valid = Object.keys(errors).length === 0
  return { valid, errors, value: valid ? { vehicleId, type, title, dueDate, dueOdometer, notes: notes || null } : null, today }
}

/**
 * 'done' | 'overdue' | 'due-soon' | 'upcoming' for a reminder, given today's date
 * and the vehicle's current odometer. The more urgent of date and distance wins.
 */
export function reminderStatus(reminder, { today = toIsoDate(), currentOdometer = null } = {}) {
  if (reminder.doneAt) return 'done'
  const ranks = []
  if (reminder.dueDate) {
    const days = Math.round((Date.parse(reminder.dueDate) - Date.parse(today)) / DAY_MS)
    ranks.push(days < 0 ? 2 : days <= REMINDER_RULES.dueSoonDays ? 1 : 0)
  }
  if (reminder.dueOdometer !== null && Number.isFinite(currentOdometer)) {
    const kmLeft = reminder.dueOdometer - currentOdometer
    ranks.push(kmLeft <= 0 ? 2 : kmLeft <= REMINDER_RULES.dueSoonKm ? 1 : 0)
  }
  const worst = Math.max(0, ...ranks)
  return ['upcoming', 'due-soon', 'overdue'][worst]
}

/** Same date next year (29 Feb → 28 Feb), for annual licence disc renewals. */
export function nextYear(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number)
  const date = new Date(y + 1, m - 1, d)
  if (date.getMonth() !== m - 1) date.setDate(0)
  return toIsoDate(date)
}

/** Stable notification ids per reminder (two per reminder: early warning and due day). */
export const notificationIds = (reminderId) => [reminderId * 10 + 1, reminderId * 10 + 2]

/**
 * Local notifications to schedule for a date-based reminder: 7 days before and on
 * the due date, at 09:00 local time, skipping anything already in the past.
 */
export function notificationPlan(reminder, vehicleName, now = new Date()) {
  if (reminder.doneAt || !reminder.dueDate) return []
  const [y, m, d] = reminder.dueDate.split('-').map(Number)
  const at = (offsetDays) => new Date(y, m - 1, d - offsetDays, REMINDER_RULES.notifyHour, 0, 0)
  const [earlyId, dueId] = notificationIds(reminder.id)
  const subject = `${reminder.title} · ${vehicleName}`
  return [
    { id: earlyId, at: at(REMINDER_RULES.notifyDaysBefore), title: 'Coming up in a week', body: subject },
    { id: dueId, at: at(0), title: 'Due today', body: subject },
  ].filter((n) => n.at > now)
}

/**
 * Reminder use-cases. `notifier` (optional) keeps scheduled local notifications in
 * sync: { sync(reminder, vehicleName), cancel(reminderId) }.
 */
export function createReminderService(db, { notifier = null, today = () => toIsoDate() } = {}) {
  const repo = createReminderRepository(db)
  const vehicles = createVehicleRepository(db)

  async function vehicleName(id) {
    return (await vehicles.getById(id))?.name || 'your vehicle'
  }

  async function sync(reminder) {
    if (notifier && reminder) await notifier.sync(reminder, await vehicleName(reminder.vehicleId)).catch(() => {})
  }

  async function requireReminder(id) {
    const r = await repo.getById(id)
    if (!r) throw new NotFoundError('That reminder no longer exists.')
    return r
  }

  return {
    listByVehicle: (vehicleId) => repo.listByVehicle(vehicleId),
    getById: (id) => repo.getById(id),

    /** Open reminders for a vehicle with their status, most urgent first. */
    async upcoming(vehicleId, currentOdometer) {
      const order = { overdue: 0, 'due-soon': 1, upcoming: 2 }
      return (await repo.listByVehicle(vehicleId))
        .filter((r) => !r.doneAt)
        .map((r) => ({ ...r, status: reminderStatus(r, { today: today(), currentOdometer }) }))
        .sort((a, b) => order[a.status] - order[b.status])
    },

    async create(input) {
      const { valid, errors, value } = validateReminder(input, { today: today() })
      if (!valid) throw new ValidationError(errors)
      if (!(await vehicles.getById(value.vehicleId))) throw new ValidationError({ vehicleId: 'That vehicle no longer exists.' })
      const created = await repo.create(value)
      await sync(created)
      return created
    },

    async update(id, input) {
      await requireReminder(id)
      const { valid, errors, value } = validateReminder(input, { today: today() })
      if (!valid) throw new ValidationError(errors)
      const updated = await repo.update(id, value)
      await sync(updated)
      return updated
    },

    /**
     * Marks a reminder done. Licence discs renew yearly, so a follow-up reminder
     * for the same date next year is created automatically.
     * @returns {Promise<{ done: object, next: object|null }>}
     */
    async complete(id) {
      const r = await requireReminder(id)
      const done = await repo.markDone(id)
      if (notifier) await notifier.cancel(id).catch(() => {})
      let next = null
      if (r.type === 'licence' && r.dueDate) {
        next = await repo.create({ ...r, dueDate: nextYear(r.dueDate), dueOdometer: null })
        await sync(next)
      }
      return { done, next }
    },

    async delete(id) {
      await requireReminder(id)
      await repo.delete(id)
      if (notifier) await notifier.cancel(id).catch(() => {})
      return true
    },

    /** Re-schedules notifications for every open reminder (e.g. after a reinstall). */
    async resyncAll() {
      for (const r of await repo.listOpen()) await sync(r)
    },
  }
}
