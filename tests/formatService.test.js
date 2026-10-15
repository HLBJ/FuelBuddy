import { describe, expect, it } from 'vitest'
import {
  formatConsumption,
  formatCostPerKm,
  formatCurrency,
  formatDistance,
  formatMonth,
  toInputValue,
} from '../src/services/formatService.js'

// en-ZA uses non-breaking/narrow spaces as group separators; normalise for assertions.
const plain = (s) => s.replace(/[  ]/g, ' ')

describe('formatService', () => {
  it('formats Rand amounts for South Africa', () => {
    expect(plain(formatCurrency(1774.25))).toBe('R 1 774,25')
    expect(plain(formatCurrency(0))).toBe('R 0,00')
    expect(plain(formatCurrency(59, 'ZAR', { decimals: 0 }))).toBe('R 59')
  })

  it('shows a dash instead of NaN/Infinity/null', () => {
    for (const bad of [null, undefined, NaN, Infinity]) {
      expect(formatCurrency(bad)).toBe('—')
      expect(formatConsumption(bad)).toBe('—')
      expect(formatDistance(bad)).toBe('—')
      expect(formatCostPerKm(bad)).toBe('—')
    }
  })

  it('formats units', () => {
    expect(plain(formatConsumption(7.456))).toBe('7,5 L/100 km')
    expect(plain(formatDistance(50500))).toBe('50 500 km')
    expect(plain(formatCostPerKm(2.35))).toBe('R 2,35/km')
    expect(formatMonth('2026-10')).toMatch(/October 2026/)
  })

  it('prefills inputs with plain dot-decimal numbers', () => {
    expect(toInputValue(23.5)).toBe('23.5')
    expect(toInputValue(null)).toBe('')
  })
})
