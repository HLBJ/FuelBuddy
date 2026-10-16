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
  {
    version: 2,
    description: 'Reminders (licence disc, service, tyres) per vehicle',
    statements: [
      `CREATE TABLE IF NOT EXISTS reminders (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        vehicle_id   INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
        type         TEXT    NOT NULL DEFAULT 'other',
        title        TEXT    NOT NULL CHECK (length(trim(title)) > 0),
        due_date     TEXT,
        due_odometer REAL CHECK (due_odometer IS NULL OR due_odometer >= 0),
        notes        TEXT,
        done_at      TEXT,
        created_at   TEXT    NOT NULL,
        updated_at   TEXT    NOT NULL,
        CHECK (due_date IS NOT NULL OR due_odometer IS NOT NULL)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_reminders_vehicle ON reminders (vehicle_id, done_at)`,
    ],
  },
  {
    version: 3,
    description: 'Travel logbook (SARS): trips and per-tax-year odometer readings',
    statements: [
      `CREATE TABLE IF NOT EXISTS trips (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        vehicle_id     INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
        date           TEXT    NOT NULL,
        start_odometer REAL    NOT NULL CHECK (start_odometer >= 0),
        end_odometer   REAL    NOT NULL CHECK (end_odometer >= start_odometer),
        purpose        TEXT    NOT NULL DEFAULT 'business' CHECK (purpose IN ('business', 'private')),
        origin         TEXT,
        destination    TEXT,
        reason         TEXT,
        notes          TEXT,
        created_at     TEXT    NOT NULL,
        updated_at     TEXT    NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_trips_vehicle_date ON trips (vehicle_id, date, start_odometer)`,
      // tax_year is the calendar year in which the SA tax year ends (2027 = 1 Mar 2026 – 28 Feb 2027).
      `CREATE TABLE IF NOT EXISTS logbook_years (
        vehicle_id       INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
        tax_year         INTEGER NOT NULL,
        opening_odometer REAL CHECK (opening_odometer IS NULL OR opening_odometer >= 0),
        closing_odometer REAL CHECK (closing_odometer IS NULL OR opening_odometer IS NULL OR closing_odometer >= opening_odometer),
        updated_at       TEXT    NOT NULL,
        PRIMARY KEY (vehicle_id, tax_year)
      )`,
    ],
  },
  {
    version: 4,
    description: 'Running costs (service, tyres, insurance, tolls…) for the true cost of driving',
    statements: [
      `CREATE TABLE IF NOT EXISTS expenses (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        vehicle_id  INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
        date        TEXT    NOT NULL,
        category    TEXT    NOT NULL DEFAULT 'other',
        amount      REAL    NOT NULL CHECK (amount >= 0),
        odometer    REAL CHECK (odometer IS NULL OR odometer >= 0),
        description TEXT,
        created_at  TEXT    NOT NULL,
        updated_at  TEXT    NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_expenses_vehicle_date ON expenses (vehicle_id, date)`,
    ],
  },
]

export const LATEST_SCHEMA_VERSION = migrations[migrations.length - 1].version
