import { getDb } from '../database/database.js'
import { createVehicleService } from './vehicleService.js'
import { createFuelEntryService } from './fuelEntryService.js'
import { createSettingsRepository } from '../repositories/settingsRepository.js'
import { createMonetizationService, createNativeBillingAdapter } from './monetizationService.js'
import { createReminderService } from './reminderService.js'
import { createLogbookService } from './logbookService.js'
import { reminderNotifier } from './notificationService.js'
import { parseBackup, restoreBackup, shareBackup } from './backupService.js'
import { appConfig } from '../config/appConfig.js'

/**
 * Composition root: wires services to the open database. Views use these
 * services (via the store) and never touch SQL directly.
 */
let services = null

export async function createAppServices() {
  const db = getDb()
  const settings = createSettingsRepository(db)
  const billing = await createNativeBillingAdapter().catch(() => null)
  services = {
    vehicles: createVehicleService(db),
    fuel: createFuelEntryService(db),
    reminders: createReminderService(db, { notifier: reminderNotifier }),
    logbook: createLogbookService(db),
    settings,
    monetization: createMonetizationService({ billing, settings }),
    /**
     * Settings → Delete all data: removes every vehicle with its fill-ups, reminders
     * and trips. Preferences (theme, onboarding) and the Pro purchase are kept.
     */
    async deleteAllData() {
      await db.transaction(async (tx) => {
        for (const table of ['logbook_years', 'trips', 'reminders', 'fuel_entries', 'vehicles']) await tx.run(`DELETE FROM ${table}`)
      })
      await reminderNotifier.cancelAll().catch(() => {})
    },
    backup: {
      share: () => shareBackup(db, { appVersion: appConfig.version }),
      /** Replaces all data with a backup file's contents; the caller reloads the app. */
      async restore(text) {
        const summary = await restoreBackup(db, parseBackup(text))
        await reminderNotifier.cancelAll().catch(() => {})
        return summary
      },
    },
  }
  return services
}

export function useServices() {
  if (!services) throw new Error('App services are not ready yet.')
  return services
}
