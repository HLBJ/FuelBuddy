import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from './helpers/testDatabase.js'
import { createSettingsRepository } from '../src/repositories/settingsRepository.js'
import {
  BillingUnavailableError,
  ENTITLEMENT,
  createMonetizationService,
  displayPrice,
  isFeatureUnlocked,
  resolveEntitlement,
} from '../src/services/monetizationService.js'
import { computeBannerOffset, shouldShowAds } from '../src/services/adService.js'
import { buildCsv, escapeCsvField, exportFileName } from '../src/services/exportService.js'

const config = (productId = 'fuelbuddy_pro') => ({
  pro: { productId, fallbackDisplayPrice: { amount: 59, currency: 'ZAR' }, features: ['adFree', 'advancedStatistics'] },
  ads: { enabled: true, useTestIds: true, bannerAdId: 'test-banner' },
})

/** In-memory stand-in for Google Play: owns a list of purchases. */
function fakePlay({ purchases = [], failGet = false, purchaseResult } = {}) {
  return {
    purchases,
    restored: false,
    async getPurchases() {
      if (failGet) throw new Error('offline')
      return this.purchases
    },
    async getProduct(id) {
      return { identifier: id, priceString: 'R 59,00' }
    },
    async purchase(id) {
      const tx = purchaseResult || { productIdentifier: id, purchaseState: '1' }
      this.purchases.push(tx)
      return tx
    },
    async restore() {
      this.restored = true
    },
  }
}

describe('entitlement rules', () => {
  it('only a PURCHASED Pro product grants Pro', () => {
    expect(resolveEntitlement([{ productIdentifier: 'fuelbuddy_pro', purchaseState: '1' }], 'fuelbuddy_pro')).toBe(ENTITLEMENT.OWNED)
    expect(resolveEntitlement([{ productIdentifier: 'fuelbuddy_pro', purchaseState: 1 }], 'fuelbuddy_pro')).toBe(ENTITLEMENT.OWNED)
    expect(resolveEntitlement([{ productIdentifier: 'fuelbuddy_pro', purchaseState: '2' }], 'fuelbuddy_pro')).toBe(ENTITLEMENT.PENDING)
    expect(resolveEntitlement([{ productIdentifier: 'other', purchaseState: '1' }], 'fuelbuddy_pro')).toBe(ENTITLEMENT.NONE)
    expect(resolveEntitlement([{ productIdentifier: 'fuelbuddy_pro', purchaseState: '1' }], '')).toBe(ENTITLEMENT.NONE)
    expect(resolveEntitlement(null, 'fuelbuddy_pro')).toBe(ENTITLEMENT.NONE)
  })

  it('gates only ad-free and advanced statistics (export and vehicles stay free)', () => {
    expect(isFeatureUnlocked('adFree', false)).toBe(false)
    expect(isFeatureUnlocked('advancedStatistics', false)).toBe(false)
    expect(isFeatureUnlocked('advancedStatistics', true)).toBe(true)
    expect(isFeatureUnlocked('csvExport', false)).toBe(true)
    expect(isFeatureUnlocked('multipleVehicles', false)).toBe(true)
  })

  it('prefers the Play Store price over the configured fallback', () => {
    expect(displayPrice({ priceString: 'R 64,99' }, config())).toBe('R 64,99')
    expect(displayPrice(null, config(), (a, c) => `${c}:${a}`)).toBe('ZAR:59')
  })

  it('never shows ads to Pro users or off-device', () => {
    expect(shouldShowAds({ isPro: false, isNative: true, config: config() })).toBe(true)
    expect(shouldShowAds({ isPro: true, isNative: true, config: config() })).toBe(false)
    expect(shouldShowAds({ isPro: false, isNative: false, config: config() })).toBe(false)
    const noId = { ...config(), ads: { enabled: true, bannerAdId: '' } }
    expect(shouldShowAds({ isPro: false, isNative: true, config: noId })).toBe(false)
  })
})

describe('banner placement', () => {
  it('sits directly on top of the tab bar, including its safe-area padding', () => {
    // 812px viewport, 56px tab bar + 24px gesture-bar inset at the bottom
    expect(computeBannerOffset({ top: 732, bottom: 812, height: 80 }, 812)).toBe(80)
    expect(computeBannerOffset({ top: 755.2, bottom: 812, height: 56.8 }, 812)).toBe(57)
  })

  it('subtracts the navigation-bar inset the ad plugin already measures from', () => {
    // Android 15 device: 814px viewport, 96px tab bar of which 39px is gesture-bar inset
    expect(computeBannerOffset({ top: 718, bottom: 814, height: 96 }, 814, 39)).toBe(57)
    expect(computeBannerOffset({ top: 718, bottom: 814, height: 96 }, 814, 0)).toBe(96)
    expect(computeBannerOffset({ top: 718, bottom: 814, height: 96 }, 814, NaN)).toBe(96)
  })

  it('rejects measurements taken before the tab bar is laid out', () => {
    // Seen on an Android 15 device: top=0 produced an 814px offset (banner mid-screen)
    expect(computeBannerOffset({ top: 0, bottom: 0, height: 0 }, 814)).toBeNull()
    expect(computeBannerOffset({ top: 0, bottom: 56, height: 56 }, 814)).toBeNull()
    expect(computeBannerOffset(null, 814)).toBeNull()
    expect(computeBannerOffset({ top: 700, bottom: 756, height: 56 }, 0)).toBeNull()
  })
})

describe('monetization service with real settings storage', () => {
  let settings
  beforeEach(async () => {
    settings = createSettingsRepository(await createTestDb())
  })

  it('cannot purchase when the product is not configured, and grants nothing', async () => {
    const service = createMonetizationService({ billing: fakePlay(), settings, config: config('') })
    expect(service.isConfigured()).toBe(false)
    expect(service.unavailableReason()).toMatch(/not available/)
    await expect(service.purchasePro()).rejects.toBeInstanceOf(BillingUnavailableError)
    expect(await settings.get('proUnlocked')).toBe(false)
  })

  it('cannot purchase without billing (web / sideload)', async () => {
    const service = createMonetizationService({ billing: null, settings, config: config() })
    await expect(service.restorePurchases()).rejects.toBeInstanceOf(BillingUnavailableError)
    expect(await service.getProduct()).toBeNull()
  })

  it('a completed purchase unlocks and persists Pro', async () => {
    const service = createMonetizationService({ billing: fakePlay(), settings, config: config() })
    expect(await service.purchasePro()).toEqual({ isPro: true, status: ENTITLEMENT.OWNED })
    expect(await settings.get('proUnlocked')).toBe(true)
  })

  it('a pending purchase does not unlock Pro', async () => {
    const play = fakePlay({ purchaseResult: { productIdentifier: 'fuelbuddy_pro', purchaseState: '2' } })
    const service = createMonetizationService({ billing: play, settings, config: config() })
    expect(await service.purchasePro()).toEqual({ isPro: false, status: ENTITLEMENT.PENDING })
    expect(await settings.get('proUnlocked')).toBe(false)
  })

  it('keeps cached Pro offline but revokes when Play reports no purchase', async () => {
    await settings.set('proUnlocked', true)
    const offline = createMonetizationService({ billing: fakePlay({ failGet: true }), settings, config: config() })
    expect(await offline.refreshEntitlement()).toMatchObject({ isPro: true, verified: false })
    expect(await settings.get('proUnlocked')).toBe(true)

    const refunded = createMonetizationService({ billing: fakePlay({ purchases: [] }), settings, config: config() })
    expect(await refunded.refreshEntitlement()).toMatchObject({ isPro: false, verified: true })
    expect(await settings.get('proUnlocked')).toBe(false)
  })

  it('restore unlocks an existing purchase', async () => {
    const play = fakePlay({ purchases: [{ productIdentifier: 'fuelbuddy_pro', purchaseState: '1' }] })
    const service = createMonetizationService({ billing: play, settings, config: config() })
    expect(await service.restorePurchases()).toMatchObject({ isPro: true })
    expect(play.restored).toBe(true)
    expect(await service.getCachedEntitlement()).toBe(true)
  })
})

describe('CSV export', () => {
  it('escapes fields per RFC 4180 and neutralises formulas', () => {
    expect(escapeCsvField('plain')).toBe('plain')
    expect(escapeCsvField('a,b')).toBe('"a,b"')
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""')
    expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"')
    expect(escapeCsvField('=SUM(A1)')).toBe("'=SUM(A1)")
    expect(escapeCsvField('@cmd')).toBe("'@cmd")
    expect(escapeCsvField(-5)).toBe('-5')
    expect(escapeCsvField(null)).toBe('')
  })

  it('builds a BOM-prefixed CSV with fill-ups and vehicles', () => {
    const vehicles = [{ id: 1, name: 'Polo', registration: 'CA 1', fuelType: 'petrol', currentOdometer: 51000, isDefault: true }]
    const entries = [{ vehicleId: 1, date: '2026-09-01', odometer: 50500, litres: 40, pricePerLitre: 23.5, totalCost: 940, isFullTank: true, fuelStation: 'Engen, Main Rd', notes: null }]
    const csv = buildCsv(vehicles, entries, { currency: 'ZAR' })
    expect(csv.startsWith('﻿')).toBe(true)
    const lines = csv.slice(1).split('\r\n')
    expect(lines[0]).toBe('FuelBuddy fill-ups')
    expect(lines[1]).toBe('Vehicle,Registration,Date,Odometer (km),Litres,Price per litre (ZAR),Total cost (ZAR),Full tank,Fuel station,Notes')
    expect(lines[2]).toBe('Polo,CA 1,2026-09-01,50500,40,23.5,940,Yes,"Engen, Main Rd",')
    expect(lines).toContain('FuelBuddy vehicles')
    expect(lines.find((l) => l.startsWith('Polo,,,CA 1'))).toBe('Polo,,,CA 1,,Petrol,,51000,Yes')
  })

  it('still produces headers with no data, and a dated file name', () => {
    const csv = buildCsv([], [])
    expect(csv).toContain('Vehicle,Registration,Date')
    expect(exportFileName(new Date(2026, 9, 8))).toBe('fuelbuddy-export-2026-10-08.csv')
  })
})
