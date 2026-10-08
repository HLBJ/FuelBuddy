/**
 * Monetization configuration — the ONLY place store/ad identifiers live.
 *
 * Nothing here is a secret. Real values are supplied at release time through Vite
 * environment variables (see `.env.example`), never committed:
 *
 *   VITE_PLAY_PRO_PRODUCT_ID   Google Play in-app product ID for FuelBuddy Pro
 *   VITE_ADMOB_BANNER_ID       production AdMob banner ad unit ID
 *   VITE_ADS_USE_TEST_IDS      "false" only for the production release build
 *
 * The AdMob *application* ID is an Android manifest value — see
 * `android/app/build.gradle` (ADMOB_APP_ID) and docs/RELEASE.md.
 */
const env = import.meta.env || {}

/** Google's published AdMob test banner unit (safe for development; earns nothing). */
export const ADMOB_TEST_BANNER_ID = 'ca-app-pub-3940256099942544/6300978111'

const useTestAds = env.VITE_ADS_USE_TEST_IDS !== 'false'

export const monetizationConfig = Object.freeze({
  pro: Object.freeze({
    /** Empty until the owner creates the product in Google Play Console. */
    productId: (env.VITE_PLAY_PRO_PRODUCT_ID || '').trim(),
    /**
     * Shown only when Google Play has not supplied a localized price (e.g. offline or
     * not yet configured). Play's price always wins. Change freely — no logic depends on it.
     */
    fallbackDisplayPrice: Object.freeze({ amount: 59, currency: 'ZAR' }),
    features: Object.freeze(['adFree', 'advancedStatistics']),
  }),
  ads: Object.freeze({
    enabled: true,
    useTestIds: useTestAds,
    bannerAdId: useTestAds ? ADMOB_TEST_BANNER_ID : (env.VITE_ADMOB_BANNER_ID || '').trim(),
  }),
})

export function isProProductConfigured(config = monetizationConfig) {
  return Boolean(config.pro.productId)
}
