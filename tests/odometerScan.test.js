import { describe, expect, it } from 'vitest'
import { parseOdometer } from '../src/services/odometerScanService.js'

const line = (text, top, height = 30) => ({ text, left: 100, right: 400, top, bottom: top + height })

describe('odometer reading', () => {
  it('prefers the number next to an ODO label over trip meters and range', () => {
    const lines = [line('TRIP A 456.7 km', 100), line('ODO', 200, 24), line('76 344 km', 204, 40), line('Range 512 km', 300), line('14:32', 20), line('21°C', 20)]
    expect(parseOdometer({ lines }, { lastOdometer: 76074 })).toEqual({ best: 76344, candidates: [76344, 512] })
  })

  it('uses the history when there is no label', () => {
    const lines = [line('123456', 100, 40), line('612', 160), line('76420', 220, 36)]
    // 123 456 is longer, but 76 420 fits the last reading of 76 074.
    expect(parseOdometer({ lines }, { lastOdometer: 76074 }).best).toBe(76420)
    expect(parseOdometer({ lines }).best).toBe(123456) // without history the longest wins
  })

  it('ignores clocks, temperatures and readings below the last fill-up', () => {
    const lines = [line('12:45', 50), line('18 °C', 80), line('65 000', 120), line('76 500', 160)]
    expect(parseOdometer({ lines }, { lastOdometer: 76074 })).toMatchObject({ best: 76500 })
  })

  it('reads from plain text and returns nothing when there is no number', () => {
    expect(parseOdometer({ text: 'ODO 152,030 km' }).best).toBe(152030)
    expect(parseOdometer({ text: 'Check engine' })).toEqual({ best: null, candidates: [] })
  })
})
