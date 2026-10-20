/**
 * Monetization configuration — the ONLY place store/ad identifiers live.
 *
 * None of these are secrets (they are readable in any published APK). Values come
 * from Vite environment files:
 *
 *   VITE_PLAY_PRO_PRODUCT_ID   Google Play in-app product ID for FuelBuddy Pro
 *   VITE_ADMOB_BANNER_ID       production AdMob banner ad unit ID (.env.production)
 *   VITE_ADS_USE_TEST_IDS      "false" in .env.production only
 *
 * Real ads are served ONLY by production-mode builds (`npm run cap:sync:release`).
 * Development builds (`npm run dev`, `npm run cap:sync`) always use Google's test
 * IDs, so the owner never sees — or taps — live ads while developing (AdMob policy).
 *
 * The AdMob *application* ID is an Android manifest value: release builds use the
 * real ID and debug builds Google's sample ID — see `android/app/build.gradle`.
 */
const env = import.meta.env || {}

/** Google's published AdMob test banner unit (safe for development; earns nothing). */
export const ADMOB_TEST_BANNER_ID = 'ca-app-pub-3940256099942544/6300978111'

/**
 * Ads configuration for a Vite env object. Real IDs require ALL of: production mode,
 * VITE_ADS_USE_TEST_IDS === 'false', and a banner ID. Anything else uses test IDs.
 */
export function resolveAdsConfig(viteEnv = {}) {
  const realBanner = (viteEnv.VITE_ADMOB_BANNER_ID || '').trim()
  const useReal = viteEnv.MODE === 'production' && viteEnv.VITE_ADS_USE_TEST_IDS === 'false' && Boolean(realBanner)
  return Object.freeze({
    enabled: true,
    useTestIds: !useReal,
    bannerAdId: useReal ? realBanner : ADMOB_TEST_BANNER_ID,
  })
}

export const monetizationConfig = Object.freeze({
  pro: Object.freeze({
    /** Empty until the owner creates the product in Google Play Console. */
    productId: (env.VITE_PLAY_PRO_PRODUCT_ID || '').trim(),
    /**
     * Shown only when Google Play has not supplied a localized price (e.g. offline or
     * not yet configured). Play's price always wins. Change freely — no logic depends on it.
     */
    fallbackDisplayPrice: Object.freeze({ amount: 59, currency: 'ZAR' }),
    features: Object.freeze(['adFree', 'advancedStatistics', 'costOfDriving', 'logbookExport']),
  }),
  ads: resolveAdsConfig(env),
})

export function isProProductConfigured(config = monetizationConfig) {
  return Boolean(config.pro.productId)
}
