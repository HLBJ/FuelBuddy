import { nowIso, toNullableText, toNumberOrNull } from './rowMapping.js'

const COLUMNS = 'id, vehicle_id, type, title, due_date, due_odometer, notes, done_at, created_at, updated_at'

export function mapReminderRow(row) {
  if (!row) return null
  return {
    id: Number(row.id),
    vehicleId: Number(row.vehicle_id),
    type: row.type,
    title: row.title,
    dueDate: row.due_date ?? null,
    dueOdometer: toNumberOrNull(row.due_odometer),
    notes: row.notes ?? null,
    doneAt: row.done_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** Data access for `reminders`. Validation lives in reminderService. */
export function createReminderRepository(executor) {
  return {
    async listByVehicle(vehicleId) {
      const rows = await executor.query(
        `SELECT ${COLUMNS} FROM reminders WHERE vehicle_id = ? ORDER BY done_at IS NOT NULL, due_date IS NULL, due_date, due_odometer, id`,
        [vehicleId],
      )
      return rows.map(mapReminderRow)
    },

    async listOpen() {
      const rows = await executor.query(`SELECT ${COLUMNS} FROM reminders WHERE done_at IS NULL ORDER BY id`)
      return rows.map(mapReminderRow)
    },

    async getById(id) {
      const rows = await executor.query(`SELECT ${COLUMNS} FROM reminders WHERE id = ?`, [id])
      return mapReminderRow(rows[0])
    },

    async create(r) {
      const ts = nowIso()
      const { lastId } = await executor.run(
        `INSERT INTO reminders (vehicle_id, type, title, due_date, due_odometer, notes, done_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
        [r.vehicleId, r.type, r.title.trim(), r.dueDate || null, toNumberOrNull(r.dueOdometer), toNullableText(r.notes), ts, ts],
      )
      return this.getById(lastId)
    },

    async update(id, r) {
      await executor.run(
        `UPDATE reminders SET vehicle_id = ?, type = ?, title = ?, due_date = ?, due_odometer = ?, notes = ?, updated_at = ?
         WHERE id = ?`,
        [r.vehicleId, r.type, r.title.trim(), r.dueDate || null, toNumberOrNull(r.dueOdometer), toNullableText(r.notes), nowIso(), id],
      )
      return this.getById(id)
    },

    async markDone(id, doneAt = nowIso()) {
      await executor.run('UPDATE reminders SET done_at = ?, updated_at = ? WHERE id = ?', [doneAt, nowIso(), id])
      return this.getById(id)
    },

    async delete(id) {
      const { changes } = await executor.run('DELETE FROM reminders WHERE id = ?', [id])
      return changes > 0
    },
  }
}
