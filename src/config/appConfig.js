/** Non-secret application configuration. */
export const appConfig = Object.freeze({
  appName: 'FuelBuddy',
  version: '1.0.0',
  locale: 'en-ZA',
  defaultCurrency: 'ZAR',
  /** Currencies selectable in Settings. Data is currency-neutral; this affects display. */
  supportedCurrencies: Object.freeze([{ code: 'ZAR', label: 'South African Rand (R)' }]),
})
