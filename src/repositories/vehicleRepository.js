import { nowIso, toBool, toNullableText, toNumberOrNull } from './rowMapping.js'

const COLUMNS = `id, name, make, model, registration, year, fuel_type, tank_capacity,
  current_odometer, is_default, catalog_key, toll_class, created_at, updated_at`

export function mapVehicleRow(row) {
  if (!row) return null
  return {
    id: Number(row.id),
    name: row.name,
    make: row.make ?? null,
    model: row.model ?? null,
    registration: row.registration ?? null,
    year: toNumberOrNull(row.year),
    fuelType: row.fuel_type,
    tankCapacity: toNumberOrNull(row.tank_capacity),
    currentOdometer: toNumberOrNull(row.current_odometer) ?? 0,
    isDefault: toBool(row.is_default),
    catalogKey: row.catalog_key ?? null,
    tollClass: toNumberOrNull(row.toll_class) ?? 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * Data access for the `vehicles` table. Performs no business validation — callers
 * (vehicleService) validate first. `executor` is the database driver or a
 * transaction handle; both expose `query` and `run`.
 */
export function createVehicleRepository(executor) {
  return {
    async list() {
      const rows = await executor.query(
        `SELECT ${COLUMNS} FROM vehicles ORDER BY is_default DESC, name COLLATE NOCASE ASC, id ASC`,
      )
      return rows.map(mapVehicleRow)
    },

    async getById(id) {
      const rows = await executor.query(`SELECT ${COLUMNS} FROM vehicles WHERE id = ?`, [id])
      return mapVehicleRow(rows[0])
    },

    async getDefault() {
      const rows = await executor.query(
        `SELECT ${COLUMNS} FROM vehicles WHERE is_default = 1 ORDER BY id LIMIT 1`,
      )
      return mapVehicleRow(rows[0])
    },

    async count() {
      const rows = await executor.query('SELECT COUNT(*) AS n FROM vehicles')
      return Number(rows[0]?.n ?? 0)
    },

    async create(vehicle) {
      const timestamp = nowIso()
      const { lastId } = await executor.run(
        `INSERT INTO vehicles (name, make, model, registration, year, fuel_type, tank_capacity,
           current_odometer, is_default, catalog_key, toll_class, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          vehicle.name.trim(),
          toNullableText(vehicle.make),
          toNullableText(vehicle.model),
          toNullableText(vehicle.registration),
          toNumberOrNull(vehicle.year),
          vehicle.fuelType,
          toNumberOrNull(vehicle.tankCapacity),
          toNumberOrNull(vehicle.currentOdometer) ?? 0,
          vehicle.isDefault ? 1 : 0,
          toNullableText(vehicle.catalogKey),
          vehicle.tollClass ?? 1,
          timestamp,
          timestamp,
        ],
      )
      return this.getById(lastId)
    },

    async update(id, vehicle) {
      await executor.run(
        `UPDATE vehicles SET name = ?, make = ?, model = ?, registration = ?, year = ?,
           fuel_type = ?, tank_capacity = ?, current_odometer = ?, catalog_key = ?, toll_class = ?, updated_at = ?
         WHERE id = ?`,
        [
          vehicle.name.trim(),
          toNullableText(vehicle.make),
          toNullableText(vehicle.model),
          toNullableText(vehicle.registration),
          toNumberOrNull(vehicle.year),
          vehicle.fuelType,
          toNumberOrNull(vehicle.tankCapacity),
          toNumberOrNull(vehicle.currentOdometer) ?? 0,
          toNullableText(vehicle.catalogKey),
          vehicle.tollClass ?? 1,
          nowIso(),
          id,
        ],
      )
      return this.getById(id)
    },

    async updateOdometer(id, odometer) {
      await executor.run('UPDATE vehicles SET current_odometer = ?, updated_at = ? WHERE id = ?', [
        odometer,
        nowIso(),
        id,
      ])
    },

    /** Makes `id` the only default vehicle. */
    async setDefault(id) {
      await executor.run('UPDATE vehicles SET is_default = 0 WHERE is_default = 1 AND id <> ?', [id])
      await executor.run('UPDATE vehicles SET is_default = 1, updated_at = ? WHERE id = ?', [
        nowIso(),
        id,
      ])
    },

    async delete(id) {
      const { changes } = await executor.run('DELETE FROM vehicles WHERE id = ?', [id])
      return changes > 0
    },

    async deleteAll() {
      await executor.run('DELETE FROM vehicles')
    },
  }
}
