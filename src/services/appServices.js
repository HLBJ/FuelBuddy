import { getDb } from '../database/database.js'
import { createVehicleService } from './vehicleService.js'
import { createFuelEntryService } from './fuelEntryService.js'
import { createSettingsRepository } from '../repositories/settingsRepository.js'
import { createMonetizationService, createNativeBillingAdapter } from './monetizationService.js'
import { createReminderService } from './reminderService.js'
import { createLogbookService } from './logbookService.js'
import { createExpenseService } from './expenseService.js'
import { buildImportPlan } from './csvImport.js'
import { importPlan } from './importService.js'
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
  const vehicles = createVehicleService(db)
  const reminders = createReminderService(db, { notifier: reminderNotifier })
  services = {
    vehicles: {
      ...vehicles,
      /** Deletes the vehicle and everything recorded for it, and cancels its reminder notifications. */
      async delete(id) {
        const reminderIds = (await reminders.listByVehicle(id)).map((r) => r.id)
        await vehicles.delete(id)
        for (const reminderId of reminderIds) await reminderNotifier.cancel(reminderId).catch(() => {})
        return true
      },
    },
    fuel: createFuelEntryService(db),
    reminders,
    logbook: createLogbookService(db),
    expenses: createExpenseService(db),
    importer: {
      read: (text) => buildImportPlan(text),
      run: (plan, target) => importPlan(db, plan, target),
    },
    settings,
    monetization: createMonetizationService({ billing, settings }),
    /**
     * Settings → Delete all data: removes every vehicle with its fill-ups, reminders,
     * trips and running costs. Preferences (theme, onboarding) and the Pro purchase are kept.
     */
    async deleteAllData() {
      await db.transaction(async (tx) => {
        for (const table of ['expenses', 'logbook_years', 'trips', 'reminders', 'fuel_entries', 'vehicles']) await tx.run(`DELETE FROM ${table}`)
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
