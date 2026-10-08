import { computed, reactive, readonly } from 'vue'
import { initDatabase } from '../database/database.js'
import { createAppServices, useServices } from '../services/appServices.js'
import { applyTheme } from '../services/themeService.js'
import { SETTING_DEFAULTS } from '../repositories/settingsRepository.js'

/**
 * Shared application state. Holds the vehicle list, the active vehicle, settings
 * and Pro status; `revision` increments after every data change so views can
 * reload what they display.
 */
const state = reactive({
  status: 'idle', // idle | loading | ready | error
  error: null,
  settings: { ...SETTING_DEFAULTS },
  vehicles: [],
  activeVehicleId: null,
  isPro: false,
  revision: 0,
})

let startPromise = null

export function startApp() {
  if (!startPromise) {
    state.status = 'loading'
    startPromise = (async () => {
      try {
        await initDatabase()
        const services = await createAppServices()
        state.settings = await services.settings.getAll()
        applyTheme(state.settings.theme)
        state.isPro = Boolean(state.settings.proUnlocked)
        await refreshVehicles()
        state.status = 'ready'
        // Re-verify Pro with Google Play in the background; never blocks start-up.
        services.monetization.refreshEntitlement().then((r) => { state.isPro = r.isPro }).catch(() => {})
      } catch (error) {
        console.error('FuelBuddy failed to start', error)
        state.error = error
        state.status = 'error'
        startPromise = null
      }
    })()
  }
  return startPromise
}

export async function refreshVehicles() {
  const vehicles = await useServices().vehicles.list()
  state.vehicles = vehicles
  if (!vehicles.some((v) => v.id === state.activeVehicleId)) {
    state.activeVehicleId = (vehicles.find((v) => v.isDefault) || vehicles[0])?.id ?? null
  }
}

export function setActiveVehicle(id) {
  if (state.vehicles.some((v) => v.id === id)) state.activeVehicleId = id
}

/** Call after any create/update/delete so dependent views reload. */
export async function notifyDataChanged() {
  await refreshVehicles()
  state.revision += 1
}

export async function updateSetting(key, value) {
  await useServices().settings.set(key, value)
  state.settings = { ...state.settings, [key]: value }
  if (key === 'theme') applyTheme(value)
}

export function setPro(isPro) {
  state.isPro = Boolean(isPro)
}

export function useAppStore() {
  return {
    state: readonly(state),
    activeVehicle: computed(() => state.vehicles.find((v) => v.id === state.activeVehicleId) || null),
    currency: computed(() => state.settings.currency || 'ZAR'),
  }
}
