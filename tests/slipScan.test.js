import { describe, expect, it } from 'vitest'
import { buildRows, findSlipDate, findStation, parseSlip } from '../src/services/slipScanService.js'

const today = '2026-10-15'
const text = (s) => ({ text: s.trim() })

describe('slip parsing', () => {
  it('reads a typical forecourt slip', () => {
    const slip = text(`
      ENGEN MAIN ROAD
      123 Main Road, Rondebosch
      VAT NO 4123456789
      DATE: 14/10/2026   TIME: 08:31
      PUMP 3   ULP95
      LITRES          40.25
      PRICE/L       R 30.25
      AMOUNT     R 1 217.56
      VAT INCL     R 158.81
      THANK YOU`)
    expect(parseSlip(slip, { today })).toEqual({
      litres: 40.25, pricePerLitre: 30.25, total: 1217.56, consistent: true,
      date: '2026-10-14', station: 'Engen Main Road', found: 5,
    })
  })

  it('reads "litres @ price" lines with comma decimals', () => {
    const slip = text(`
      SHELL ULTRA CITY N1 NORTH
      15-Oct-26 17:02
      ULP 95  38,50 L @ R30,25
      TOTAL DUE     R1 164,63
      CARD  ************1234`)
    expect(parseSlip(slip, { today })).toMatchObject({
      litres: 38.5, pricePerLitre: 30.25, total: 1164.63, date: '2026-10-15', station: 'Shell Ultra City N1 North', consistent: true,
    })
  })

  it('handles cents per litre and three-decimal litres', () => {
    const slip = text(`
      SASOL DELIGHT
      2026/10/12
      DIESEL 50PPM
      QTY 55.430 LTR
      3280 c/l
      SALE AMOUNT 1818.10`)
    expect(parseSlip(slip, { today })).toMatchObject({ litres: 55.43, pricePerLitre: 32.8, total: 1818.1, date: '2026-10-12', station: 'Sasol Delight' })
  })

  it('works out the litres from the total and price when they are missing', () => {
    const slip = text(`
      BP RIVONIA
      PRICE PER LITRE 30.25
      TOTAL R 907.50`)
    expect(parseSlip(slip, { today })).toMatchObject({ litres: 30, pricePerLitre: 30.25, total: 907.5, consistent: false })
  })

  it('ignores VAT, change and cash tendered', () => {
    const slip = text(`
      ASTRON ENERGY
      LITRES 20.00
      PRICE 29.88
      TOTAL 597.60
      CASH TENDERED 600.00
      CHANGE 2.40
      VAT 77.95`)
    expect(parseSlip(slip, { today })).toMatchObject({ litres: 20, pricePerLitre: 29.88, total: 597.6, consistent: true })
  })

  it('finds amounts that add up even without labels', () => {
    const slip = text(`
      FORECOURT 7
      40.25
      30.25
      1217.56`)
    expect(parseSlip(slip, { today })).toMatchObject({ litres: 40.25, pricePerLitre: 30.25, total: 1217.56, consistent: true })
  })

  it('returns nothing it is unsure of for a non-slip photo', () => {
    expect(parseSlip(text('Hello world\nPage 2 of 10'), { today })).toMatchObject({
      litres: null, pricePerLitre: null, total: null, date: null, station: null, found: 0,
    })
  })
})

describe('slip rows from recognised lines', () => {
  // ML Kit often returns the label column and the value column as separate blocks.
  const line = (text, left, top) => ({ text, left, top, right: left + 200, bottom: top + 30 })
  const lines = [
    line('CALTEX KENILWORTH', 100, 20),
    line('LITRES', 40, 200),
    line('PRICE/L', 40, 240),
    line('TOTAL', 40, 282),
    line('42.10', 600, 203),
    line('R30.25', 600, 243),
    line('R1273.53', 600, 279),
  ]

  it('rebuilds label/value rows by position', () => {
    expect(buildRows(lines)).toEqual(['CALTEX KENILWORTH', 'LITRES  42.10', 'PRICE/L  R30.25', 'TOTAL  R1273.53'])
  })

  it('straightens a tilted photo before grouping rows', () => {
    // Slip rotated 4° anticlockwise: the right-hand values sit ~40 px higher than their labels.
    const angle = -4
    const slope = Math.tan((angle * Math.PI) / 180)
    const tilted = (text, x, rowY, width = 200) => {
      const cy = rowY + (x + width / 2) * slope
      const h = 30 * Math.cos((angle * Math.PI) / 180) + width * Math.abs(slope)
      return { text, left: x, right: x + width, top: cy - h / 2, bottom: cy + h / 2, angle }
    }
    const rows = buildRows([
      tilted('LITRES', 40, 200, 120), tilted('40.25', 600, 200, 100),
      tilted('PRICE/L', 40, 245, 140), tilted('R 30.25', 600, 245, 130),
      tilted('AMOUNT', 40, 290, 130), tilted('R 1 217.56', 600, 290, 190),
    ])
    expect(rows).toEqual(['LITRES  40.25', 'PRICE/L  R 30.25', 'AMOUNT  R 1 217.56'])
  })

  it('parses the rebuilt rows', () => {
    expect(parseSlip({ lines }, { today })).toMatchObject({ litres: 42.1, pricePerLitre: 30.25, total: 1273.53, station: 'Caltex Kenilworth' })
  })
})

describe('slip dates and stations', () => {
  it('reads South African date formats and rejects future or ancient dates', () => {
    expect(findSlipDate(['03/10/26 14:22'], today)).toBe('2026-10-03') // day first
    expect(findSlipDate(['2026-10-01'], today)).toBe('2026-10-01')
    expect(findSlipDate(['12 Oct 2026'], today)).toBe('2026-10-12')
    expect(findSlipDate(['16/10/2026'], today)).toBeNull() // tomorrow
    expect(findSlipDate(['01/01/2020'], today)).toBeNull()
  })

  it('does not mistake a TOTAL line for the TotalEnergies brand', () => {
    expect(findStation(['TOTAL R 500.00'])).toBeNull()
    expect(findStation(['TotalEnergies Sea Point'])).toBe('Totalenergies Sea Point')
  })
})

describe('real ML Kit output', () => {
  it('reads a 3° tilted photo of an Engen slip, recognised on an Android emulator', async () => {
    const { default: recognised } = await import('./fixtures/mlkit-slip-engen-tilted.json')
    expect(parseSlip(recognised, { today })).toMatchObject({
      litres: 40.25, pricePerLitre: 30.25, total: 1217.56, consistent: true, date: '2026-10-14', station: 'Engen Main Road',
    })
    expect(buildRows(recognised.lines)).toContain('LITRES  40.25')
  })
})
