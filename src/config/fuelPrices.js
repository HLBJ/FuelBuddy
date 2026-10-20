/**
 * Where FuelBuddy looks for newer fuel prices than the ones it ships with: the owner's
 * public Google Drive file (replace it via "Manage versions" so this link never changes).
 * VITE_FUEL_PRICES_URL overrides it. See docs/FUEL_PRICES.md.
 */
export const DEFAULT_FUEL_PRICES_URL = 'https://drive.google.com/file/d/1QGH-Pi4a18hqCM4tIy1LXvKNHkt8zh2g/view?usp=sharing'

export const fuelPricesConfig = Object.freeze({
  remoteUrl: import.meta.env?.VITE_FUEL_PRICES_URL || DEFAULT_FUEL_PRICES_URL,
  refreshHours: 6,
  timeoutMs: 8000,
})
