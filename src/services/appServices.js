import { getDb } from '../database/database.js'
import { createVehicleService } from './vehicleService.js'
import { createFuelEntryService } from './fuelEntryService.js'
import { createSettingsRepository } from '../repositories/settingsRepository.js'
import { createMonetizationService, createNativeBillingAdapter } from './monetizationService.js'
import { createReminderService } from './reminderService.js'
import { reminderNotifier } from './notificationService.js'

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
    settings,
    monetization: createMonetizationService({ billing, settings }),
    /**
     * Settings → Delete all data: removes every vehicle and fill-up. Preferences
     * (theme, onboarding) and the Pro purchase are kept.
     */
    async deleteAllData() {
      await db.transaction(async (tx) => {
        await tx.run('DELETE FROM fuel_entries')
        await tx.run('DELETE FROM vehicles')
      })
    },
  }
  return services
}

export function useServices() {
  if (!services) throw new Error('App services are not ready yet.')
  return services
}
