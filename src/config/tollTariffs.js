/**
 * Where FuelBuddy looks for newer toll tariffs than the ones it ships with: a public
 * Google Drive copy of src/data/toll-tariffs-za.json (replace it via "Manage versions"
 * so the link never changes). VITE_TOLL_TARIFFS_URL overrides it. See docs/TOLL_TARIFFS.md.
 */
export const DEFAULT_TOLL_TARIFFS_URL = null

export const tollTariffsConfig = Object.freeze({
  remoteUrl: import.meta.env?.VITE_TOLL_TARIFFS_URL || DEFAULT_TOLL_TARIFFS_URL,
  refreshHours: 24,
  timeoutMs: 8000,
})
