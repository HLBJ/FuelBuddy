import { appConfig } from '../config/appConfig.js'

/**
 * Display formatting. The data model stores plain numbers; the currency code is a
 * setting, so supporting another currency only needs a new entry in appConfig.
 */
const locale = appConfig.locale
const cache = new Map()

function formatter(key, options) {
  if (!cache.has(key)) cache.set(key, new Intl.NumberFormat(locale, options))
  return cache.get(key)
}

const DASH = '—'

export function formatCurrency(amount, currency = appConfig.defaultCurrency, { decimals = 2 } = {}) {
  if (!Number.isFinite(amount)) return DASH
  return formatter(`cur-${currency}-${decimals}`, {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount)
}

export function formatNumber(value, decimals = 0) {
  if (!Number.isFinite(value)) return DASH
  return formatter(`num-${decimals}`, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value)
}

export const formatDistance = (km) => (Number.isFinite(km) ? `${formatNumber(km, 0)} km` : DASH)
export const formatLitres = (l, decimals = 2) => (Number.isFinite(l) ? `${formatNumber(l, decimals)} L` : DASH)
export const formatConsumption = (v) => (Number.isFinite(v) ? `${formatNumber(v, 1)} L/100 km` : DASH)
export const formatCostPerKm = (v, currency) => (Number.isFinite(v) ? `${formatCurrency(v, currency)}/km` : DASH)
export const formatPricePerLitre = (v, currency) => (Number.isFinite(v) ? `${formatCurrency(v, currency)}/L` : DASH)

function parseIsoDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d || 1)
}

export function formatDate(iso, style = 'medium') {
  if (!iso) return DASH
  const options = style === 'short' ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' }
  return new Intl.DateTimeFormat(locale, options).format(parseIsoDate(iso))
}

export function formatMonth(monthKey, style = 'long') {
  const options = style === 'short' ? { month: 'short' } : { month: 'long', year: 'numeric' }
  return new Intl.DateTimeFormat(locale, options).format(parseIsoDate(monthKey))
}

/** Plain number for pre-filling inputs (dot decimal, no grouping). */
export function toInputValue(value) {
  return Number.isFinite(value) ? String(value) : ''
}
