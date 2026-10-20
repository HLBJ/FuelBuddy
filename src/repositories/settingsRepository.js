import { nowIso } from './rowMapping.js'

export const SETTING_DEFAULTS = Object.freeze({
  theme: 'system', // 'system' | 'light' | 'dark'
  currency: 'ZAR',
  onboardingComplete: false,
  proUnlocked: false,
  /** ISO timestamp when the one-time 7-day Pro trial started (null = never). */
  proTrialStartedAt: null,
  /** ISO timestamp when the Play Store rating prompt was requested (null = never). */
  reviewAskedAt: null,
  /** ISO timestamp when the dashboard Pro offer was dismissed (null = never). */
  proNudgeDismissedAt: null,
  /** Fuel price region and grades, for official prices and change alerts. */
  fuelRegion: 'inland', // 'inland' | 'coastal'
  petrolGrade: 'ulp95', // 'ulp93' | 'ulp95'
  dieselGrade: 'diesel50', // 'diesel50' | 'diesel500'
  fuelPriceAlerts: true,
  /** Last downloaded price file and when it was fetched (device-only, not backed up). */
  fuelPricesCache: null,
  fuelPricesFetchedAt: null,
  /** Last downloaded toll tariff file and when it was fetched (device-only, not backed up). */
  tollTariffsCache: null,
  tollTariffsFetchedAt: null,
})

/**
 * Key/value settings. Values are stored as JSON so booleans and numbers round-trip.
 * Unknown or corrupt values fall back to the defaults above.
 */
export function createSettingsRepository(executor) {
  function decode(key, raw) {
    if (raw === null || raw === undefined) return SETTING_DEFAULTS[key]
    try {
      return JSON.parse(raw)
    } catch {
      return SETTING_DEFAULTS[key]
    }
  }

  return {
    async get(key) {
      const rows = await executor.query('SELECT value FROM settings WHERE key = ?', [key])
      return rows.length ? decode(key, rows[0].value) : SETTING_DEFAULTS[key]
    },

    async getAll() {
      const rows = await executor.query('SELECT key, value FROM settings')
      const result = { ...SETTING_DEFAULTS }
      for (const row of rows) result[row.key] = decode(row.key, row.value)
      return result
    },

    async set(key, value) {
      await executor.run(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [key, JSON.stringify(value), nowIso()],
      )
      return value
    },

    async deleteAll() {
      await executor.run('DELETE FROM settings')
    },
  }
}
