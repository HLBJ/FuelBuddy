import { nowIso, toNullableText, toNumberOrNull } from './rowMapping.js'

const COLUMNS = `id, vehicle_id, date, start_odometer, end_odometer, purpose, origin, destination, reason, notes,
  created_at, updated_at`

export function mapTripRow(row) {
  if (!row) return null
  const start = toNumberOrNull(row.start_odometer)
  const end = toNumberOrNull(row.end_odometer)
  return {
    id: Number(row.id),
    vehicleId: Number(row.vehicle_id),
    date: row.date,
    startOdometer: start,
    endOdometer: end,
    distance: Math.round((end - start) * 10) / 10,
    purpose: row.purpose,
    origin: row.origin ?? null,
    destination: row.destination ?? null,
    reason: row.reason ?? null,
    notes: row.notes ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** Data access for logbook `trips` and per-tax-year odometer readings. Validation lives in logbookService. */
export function createTripRepository(executor) {
  const values = (t) => [
    t.vehicleId, t.date, t.startOdometer, t.endOdometer, t.purpose,
    toNullableText(t.origin), toNullableText(t.destination), toNullableText(t.reason), toNullableText(t.notes),
  ]

  return {
    /** Trips for a vehicle between two dates (inclusive), oldest first. */
    async listByVehicle(vehicleId, { from = '0000-00-00', to = '9999-12-31' } = {}) {
      const rows = await executor.query(
        `SELECT ${COLUMNS} FROM trips WHERE vehicle_id = ? AND date >= ? AND date <= ? ORDER BY date, start_odometer, id`,
        [vehicleId, from, to],
      )
      return rows.map(mapTripRow)
    },

    async getById(id) {
      const rows = await executor.query(`SELECT ${COLUMNS} FROM trips WHERE id = ?`, [id])
      return mapTripRow(rows[0])
    },

    async latest(vehicleId) {
      const rows = await executor.query(
        `SELECT ${COLUMNS} FROM trips WHERE vehicle_id = ? ORDER BY end_odometer DESC, date DESC, id DESC LIMIT 1`,
        [vehicleId],
      )
      return mapTripRow(rows[0])
    },

    async create(trip) {
      const now = nowIso()
      const { lastId } = await executor.run(
        `INSERT INTO trips (vehicle_id, date, start_odometer, end_odometer, purpose, origin, destination, reason, notes,
           created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [...values(trip), now, now],
      )
      return this.getById(lastId)
    },

    async update(id, trip) {
      await executor.run(
        `UPDATE trips SET vehicle_id = ?, date = ?, start_odometer = ?, end_odometer = ?, purpose = ?, origin = ?,
           destination = ?, reason = ?, notes = ?, updated_at = ? WHERE id = ?`,
        [...values(trip), nowIso(), id],
      )
      return this.getById(id)
    },

    async delete(id) {
      const { changes } = await executor.run('DELETE FROM trips WHERE id = ?', [id])
      return changes > 0
    },

    /** Lowest and highest odometer readings (trips and fill-ups) between two dates. */
    async odometerRange(vehicleId, from, to) {
      const rows = await executor.query(
        `SELECT MIN(low) AS low, MAX(high) AS high FROM (
           SELECT start_odometer AS low, end_odometer AS high FROM trips WHERE vehicle_id = ? AND date >= ? AND date <= ?
           UNION ALL
           SELECT odometer, odometer FROM fuel_entries WHERE vehicle_id = ? AND date >= ? AND date <= ?
         )`,
        [vehicleId, from, to, vehicleId, from, to],
      )
      return { low: toNumberOrNull(rows[0]?.low), high: toNumberOrNull(rows[0]?.high) }
    },

    async getYear(vehicleId, taxYear) {
      const rows = await executor.query(
        'SELECT opening_odometer, closing_odometer FROM logbook_years WHERE vehicle_id = ? AND tax_year = ?',
        [vehicleId, taxYear],
      )
      return {
        openingOdometer: toNumberOrNull(rows[0]?.opening_odometer),
        closingOdometer: toNumberOrNull(rows[0]?.closing_odometer),
      }
    },

    async setYear(vehicleId, taxYear, { openingOdometer, closingOdometer }) {
      await executor.run(
        `INSERT INTO logbook_years (vehicle_id, tax_year, opening_odometer, closing_odometer, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(vehicle_id, tax_year) DO UPDATE SET opening_odometer = excluded.opening_odometer,
           closing_odometer = excluded.closing_odometer, updated_at = excluded.updated_at`,
        [vehicleId, taxYear, openingOdometer, closingOdometer, nowIso()],
      )
      return this.getYear(vehicleId, taxYear)
    },
  }
}
