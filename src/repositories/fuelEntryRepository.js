import { nowIso, toBool, toNullableText, toNumberOrNull } from './rowMapping.js'

const COLUMNS = `id, vehicle_id, date, odometer, litres, price_per_litre, total_cost,
  fuel_station, notes, is_full_tank, created_at, updated_at`

// Chronological order used everywhere: date, then odometer, then insertion order.
const CHRONOLOGICAL = 'date ASC, odometer ASC, id ASC'
const REVERSE_CHRONOLOGICAL = 'date DESC, odometer DESC, id DESC'

export function mapFuelEntryRow(row) {
  if (!row) return null
  return {
    id: Number(row.id),
    vehicleId: Number(row.vehicle_id),
    date: row.date,
    odometer: toNumberOrNull(row.odometer),
    litres: toNumberOrNull(row.litres),
    pricePerLitre: toNumberOrNull(row.price_per_litre),
    totalCost: toNumberOrNull(row.total_cost),
    fuelStation: row.fuel_station ?? null,
    notes: row.notes ?? null,
    isFullTank: toBool(row.is_full_tank),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * Data access for `fuel_entries`. No business validation here — see
 * fuelEntryService. `executor` is the driver or a transaction handle.
 */
export function createFuelEntryRepository(executor) {
  return {
    /** Entries for one vehicle, oldest first (the order calculations expect). */
    async listByVehicle(vehicleId) {
      const rows = await executor.query(
        `SELECT ${COLUMNS} FROM fuel_entries WHERE vehicle_id = ? ORDER BY ${CHRONOLOGICAL}`,
        [vehicleId],
      )
      return rows.map(mapFuelEntryRow)
    },

    /** Most recent entries for one vehicle, newest first. */
    async listRecent(vehicleId, limit = 5) {
      const rows = await executor.query(
        `SELECT ${COLUMNS} FROM fuel_entries WHERE vehicle_id = ?
         ORDER BY ${REVERSE_CHRONOLOGICAL} LIMIT ?`,
        [vehicleId, limit],
      )
      return rows.map(mapFuelEntryRow)
    },

    async listAll() {
      const rows = await executor.query(
        `SELECT ${COLUMNS} FROM fuel_entries ORDER BY vehicle_id ASC, ${CHRONOLOGICAL}`,
      )
      return rows.map(mapFuelEntryRow)
    },

    async getById(id) {
      const rows = await executor.query(`SELECT ${COLUMNS} FROM fuel_entries WHERE id = ?`, [id])
      return mapFuelEntryRow(rows[0])
    },

    async countByVehicle(vehicleId) {
      const rows = await executor.query(
        'SELECT COUNT(*) AS n FROM fuel_entries WHERE vehicle_id = ?',
        [vehicleId],
      )
      return Number(rows[0]?.n ?? 0)
    },

    async maxOdometer(vehicleId) {
      const rows = await executor.query(
        'SELECT MAX(odometer) AS m FROM fuel_entries WHERE vehicle_id = ?',
        [vehicleId],
      )
      return toNumberOrNull(rows[0]?.m)
    },

    /**
     * Odometer bounds for an entry on `date`: the highest reading recorded on an
     * earlier date and the lowest reading recorded on a later date.
     * `excludeId` skips the entry being edited.
     */
    async getOdometerBounds(vehicleId, date, excludeId = null) {
      const exclude = excludeId ?? -1
      const before = await executor.query(
        `SELECT MAX(odometer) AS m FROM fuel_entries
         WHERE vehicle_id = ? AND date < ? AND id <> ?`,
        [vehicleId, date, exclude],
      )
      const after = await executor.query(
        `SELECT MIN(odometer) AS m FROM fuel_entries
         WHERE vehicle_id = ? AND date > ? AND id <> ?`,
        [vehicleId, date, exclude],
      )
      return {
        min: toNumberOrNull(before[0]?.m),
        max: toNumberOrNull(after[0]?.m),
      }
    },

    async create(entry) {
      const timestamp = nowIso()
      const { lastId } = await executor.run(
        `INSERT INTO fuel_entries (vehicle_id, date, odometer, litres, price_per_litre, total_cost,
           fuel_station, notes, is_full_tank, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entry.vehicleId,
          entry.date,
          entry.odometer,
          entry.litres,
          entry.pricePerLitre,
          entry.totalCost,
          toNullableText(entry.fuelStation),
          toNullableText(entry.notes),
          entry.isFullTank ? 1 : 0,
          timestamp,
          timestamp,
        ],
      )
      return this.getById(lastId)
    },

    async update(id, entry) {
      await executor.run(
        `UPDATE fuel_entries SET vehicle_id = ?, date = ?, odometer = ?, litres = ?,
           price_per_litre = ?, total_cost = ?, fuel_station = ?, notes = ?, is_full_tank = ?,
           updated_at = ?
         WHERE id = ?`,
        [
          entry.vehicleId,
          entry.date,
          entry.odometer,
          entry.litres,
          entry.pricePerLitre,
          entry.totalCost,
          toNullableText(entry.fuelStation),
          toNullableText(entry.notes),
          entry.isFullTank ? 1 : 0,
          nowIso(),
          id,
        ],
      )
      return this.getById(id)
    },

    async delete(id) {
      const { changes } = await executor.run('DELETE FROM fuel_entries WHERE id = ?', [id])
      return changes > 0
    },

    async deleteAll() {
      await executor.run('DELETE FROM fuel_entries')
    },
  }
}
