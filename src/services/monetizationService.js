import { isProProductConfigured, monetizationConfig } from '../config/monetization.js'

/**
 * FuelBuddy Pro entitlement and Google Play Billing integration.
 *
 * The billing adapter is injected so the decision logic can be tested without a
 * device. In the app it is created by `createNativeBillingAdapter()` around
 * @capgo/native-purchases (Google Play Billing Library). There is no server and no
 * receipt forgery path: Pro is granted only from a purchase Google Play reports as
 * PURCHASED, and the result is cached locally so Pro keeps working offline.
 */

// Google Play Purchase.PurchaseState values as reported by the plugin.
export const PLAY_PURCHASE_STATE = Object.freeze({ PURCHASED: '1', PENDING: '2' })

export const ENTITLEMENT = Object.freeze({ OWNED: 'owned', PENDING: 'pending', NONE: 'none' })

export const PRO_FEATURES = Object.freeze({
  AD_FREE: 'adFree',
  ADVANCED_STATISTICS: 'advancedStatistics',
  LOGBOOK_EXPORT: 'logbookExport',
})

/** Interprets Play purchases for the Pro product. */
export function resolveEntitlement(purchases, productId) {
  if (!productId) return ENTITLEMENT.NONE
  const matching = (purchases || []).filter((p) => p && p.productIdentifier === productId)
  const state = (p) => (p.purchaseState === undefined ? undefined : String(p.purchaseState))
  if (matching.some((p) => state(p) === PLAY_PURCHASE_STATE.PURCHASED)) return ENTITLEMENT.OWNED
  if (matching.some((p) => state(p) === PLAY_PURCHASE_STATE.PENDING)) return ENTITLEMENT.PENDING
  return ENTITLEMENT.NONE
}

export function isFeatureUnlocked(feature, isPro) {
  return Object.values(PRO_FEATURES).includes(feature) ? Boolean(isPro) : true
}

/** Display price: Google Play's localized price when known, else the configured fallback. */
export function displayPrice(product, config = monetizationConfig, formatCurrency) {
  if (product?.priceString) return product.priceString
  const { amount, currency } = config.pro.fallbackDisplayPrice
  return formatCurrency ? formatCurrency(amount, currency) : `${currency} ${amount}`
}

export class BillingUnavailableError extends Error {
  constructor(message) {
    super(message)
    this.name = 'BillingUnavailableError'
  }
}

/**
 * @param {object} deps
 * @param {object|null} deps.billing     adapter, or null when billing is unavailable
 * @param {object} deps.settings         settings repository (get/set)
 * @param {object} [deps.config]
 */
export function createMonetizationService({ billing, settings, config = monetizationConfig }) {
  const productId = config.pro.productId
  const configured = isProProductConfigured(config)

  async function setCached(value) {
    await settings.set('proUnlocked', value)
    return value
  }

  return {
    isConfigured: () => configured && Boolean(billing),

    unavailableReason() {
      if (!billing) return 'Purchases are only available in the Android app installed from Google Play.'
      if (!configured) return 'FuelBuddy Pro is not available for purchase yet.'
      return null
    },

    getCachedEntitlement: () => settings.get('proUnlocked'),

    /**
     * Re-checks ownership with Google Play. When Play cannot be reached the cached
     * entitlement is kept, so offline users never lose Pro.
     * @returns {Promise<{isPro: boolean, status: string, verified: boolean}>}
     */
    async refreshEntitlement() {
      const cached = Boolean(await settings.get('proUnlocked'))
      if (!billing || !configured) return { isPro: cached, status: cached ? ENTITLEMENT.OWNED : ENTITLEMENT.NONE, verified: false }
      try {
        const purchases = await billing.getPurchases()
        const status = resolveEntitlement(purchases, productId)
        const isPro = status === ENTITLEMENT.OWNED
        await setCached(isPro)
        return { isPro, status, verified: true }
      } catch {
        return { isPro: cached, status: cached ? ENTITLEMENT.OWNED : ENTITLEMENT.NONE, verified: false }
      }
    },

    async getProduct() {
      if (!billing || !configured) return null
      try {
        return await billing.getProduct(productId)
      } catch {
        return null
      }
    },

    /** @returns {Promise<{isPro: boolean, status: string}>} */
    async purchasePro() {
      const reason = this.unavailableReason()
      if (reason) throw new BillingUnavailableError(reason)
      const transaction = await billing.purchase(productId)
      const status = resolveEntitlement([transaction], productId)
      if (status === ENTITLEMENT.OWNED) await setCached(true)
      return { isPro: status === ENTITLEMENT.OWNED, status }
    },

    /** @returns {Promise<{isPro: boolean, status: string}>} */
    async restorePurchases() {
      const reason = this.unavailableReason()
      if (reason) throw new BillingUnavailableError(reason)
      await billing.restore()
      const purchases = await billing.getPurchases()
      const status = resolveEntitlement(purchases, productId)
      await setCached(status === ENTITLEMENT.OWNED)
      return { isPro: status === ENTITLEMENT.OWNED, status }
    },
  }
}

/**
 * Adapter over @capgo/native-purchases. Returns null off-device or when the
 * device's Play Store does not support billing.
 */
export async function createNativeBillingAdapter() {
  const { Capacitor } = await import('@capacitor/core')
  if (!Capacitor.isNativePlatform()) return null
  const { NativePurchases, PURCHASE_TYPE } = await import('@capgo/native-purchases')
  try {
    const { isBillingSupported } = await NativePurchases.isBillingSupported()
    if (!isBillingSupported) return null
  } catch {
    return null
  }
  return {
    async getPurchases() {
      const { purchases } = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.INAPP })
      return purchases || []
    },
    async getProduct(productIdentifier) {
      const { product } = await NativePurchases.getProduct({ productIdentifier, productType: PURCHASE_TYPE.INAPP })
      return product
    },
    purchase(productIdentifier) {
      return NativePurchases.purchaseProduct({
        productIdentifier,
        productType: PURCHASE_TYPE.INAPP,
        isConsumable: false,
        autoAcknowledgePurchases: true,
      })
    },
    restore: () => NativePurchases.restorePurchases(),
  }
}
