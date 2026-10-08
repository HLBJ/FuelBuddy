/**
 * Ordered schema migrations.
 *
 * Rules:
 *  - Never edit a migration that has shipped; add a new one with the next version.
 *  - Versions must be consecutive integers starting at 1.
 *  - The applied version is tracked in `PRAGMA user_version`.
 */
export const migrations = [
  {
    version: 1,
    description: 'Initial schema: vehicles, fuel entries, settings',
    statements: [
      `CREATE TABLE IF NOT EXISTS vehicles (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        name             TEXT    NOT NULL CHECK (length(trim(name)) > 0),
        make             TEXT,
        model            TEXT,
        registration     TEXT,
        year             INTEGER,
        fuel_type        TEXT    NOT NULL DEFAULT 'petrol',
        tank_capacity    REAL CHECK (tank_capacity IS NULL OR tank_capacity > 0),
        current_odometer REAL    NOT NULL DEFAULT 0 CHECK (current_odometer >= 0),
        is_default       INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
        created_at       TEXT    NOT NULL,
        updated_at       TEXT    NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS fuel_entries (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        vehicle_id      INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
        date            TEXT    NOT NULL,
        odometer        REAL    NOT NULL CHECK (odometer >= 0),
        litres          REAL    NOT NULL CHECK (litres > 0),
        price_per_litre REAL    NOT NULL CHECK (price_per_litre >= 0),
        total_cost      REAL    NOT NULL CHECK (total_cost >= 0),
        fuel_station    TEXT,
        notes           TEXT,
        is_full_tank    INTEGER NOT NULL DEFAULT 1 CHECK (is_full_tank IN (0, 1)),
        created_at      TEXT    NOT NULL,
        updated_at      TEXT    NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_fuel_entries_vehicle_date
         ON fuel_entries (vehicle_id, date, odometer)`,
      `CREATE TABLE IF NOT EXISTS settings (
        key        TEXT PRIMARY KEY,
        value      TEXT,
        updated_at TEXT NOT NULL
      )`,
    ],
  },
]

export const LATEST_SCHEMA_VERSION = migrations[migrations.length - 1].version
