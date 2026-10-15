/**
 * Where FuelBuddy looks for newer fuel prices than the ones it ships with. Leave
 * VITE_FUEL_PRICES_URL unset to use only the bundled prices. See docs/FUEL_PRICES.md.
 */
export const fuelPricesConfig = Object.freeze({
  remoteUrl: import.meta.env?.VITE_FUEL_PRICES_URL || null,
  refreshHours: 6,
  timeoutMs: 8000,
})
