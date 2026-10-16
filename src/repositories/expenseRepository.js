import { nowIso, toNullableText, toNumberOrNull } from './rowMapping.js'

const COLUMNS = 'id, vehicle_id, date, category, amount, odometer, description, created_at, updated_at'

export function mapExpenseRow(row) {
  if (!row) return null
  return {
    id: Number(row.id),
    vehicleId: Number(row.vehicle_id),
    date: row.date,
    category: row.category,
    amount: toNumberOrNull(row.amount),
    odometer: toNumberOrNull(row.odometer),
    description: row.description ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** Data access for `expenses` (running costs). Validation lives in expenseService. */
export function createExpenseRepository(executor) {
  const values = (e) => [e.vehicleId, e.date, e.category, e.amount, toNumberOrNull(e.odometer), toNullableText(e.description)]

  return {
    /** A vehicle's running costs, oldest first, optionally between two dates (inclusive). */
    async listByVehicle(vehicleId, { from = '0000-00-00', to = '9999-12-31' } = {}) {
      const rows = await executor.query(
        `SELECT ${COLUMNS} FROM expenses WHERE vehicle_id = ? AND date >= ? AND date <= ? ORDER BY date, id`,
        [vehicleId, from, to],
      )
      return rows.map(mapExpenseRow)
    },

    async listAll() {
      const rows = await executor.query(`SELECT ${COLUMNS} FROM expenses ORDER BY vehicle_id, date, id`)
      return rows.map(mapExpenseRow)
    },

    async getById(id) {
      const rows = await executor.query(`SELECT ${COLUMNS} FROM expenses WHERE id = ?`, [id])
      return mapExpenseRow(rows[0])
    },

    async create(expense) {
      const now = nowIso()
      const { lastId } = await executor.run(
        `INSERT INTO expenses (vehicle_id, date, category, amount, odometer, description, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [...values(expense), now, now],
      )
      return this.getById(lastId)
    },

    async update(id, expense) {
      await executor.run(
        `UPDATE expenses SET vehicle_id = ?, date = ?, category = ?, amount = ?, odometer = ?, description = ?, updated_at = ?
         WHERE id = ?`,
        [...values(expense), nowIso(), id],
      )
      return this.getById(id)
    },

    async delete(id) {
      const { changes } = await executor.run('DELETE FROM expenses WHERE id = ?', [id])
      return changes > 0
    },
  }
}
