/**
 * Where FuelBuddy looks for newer toll tariffs than the ones it ships with: the owner's
 * public Google Drive copy of src/data/toll-tariffs-za.json (replace it via "Manage versions"
 * so the link never changes). VITE_TOLL_TARIFFS_URL overrides it. See docs/TOLL_TARIFFS.md.
 */
export const DEFAULT_TOLL_TARIFFS_URL = 'https://drive.google.com/file/d/1n0rWUEGmB3ljcZUn1j1d4dtvFZn6lWn_/view?usp=sharing'

export const tollTariffsConfig = Object.freeze({
  remoteUrl: import.meta.env?.VITE_TOLL_TARIFFS_URL || DEFAULT_TOLL_TARIFFS_URL,
  refreshHours: 24,
  timeoutMs: 8000,
})
