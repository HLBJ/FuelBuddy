import { monetizationConfig } from '../config/monetization.js'

/**
 * Banner advertising for the free tier (Google AdMob).
 *
 * - Never shown to Pro users, never on the web preview.
 * - Development builds use Google's published test ad unit (no revenue, no
 *   policy risk). Production IDs come from configuration only.
 * - Every failure (offline, no fill, consent declined) is swallowed: ads must never
 *   affect the core app.
 * - The banner is a native overlay; its height is published through the
 *   `--fb-ad-height` CSS variable so screens can leave room for it.
 */

let admob = null
let initialised = false
let initPromise = null
let visible = false
let hidden = false
let bannerHeight = 0
let sizeListener = null

export function shouldShowAds({ isPro, isNative, config = monetizationConfig }) {
  return Boolean(isNative && !isPro && config.ads.enabled && config.ads.bannerAdId)
}

/**
 * Distance (CSS px) from the bottom of the screen at which the banner must sit so it
 * rests directly on top of the tab bar. Returns null while the tab bar has not been
 * laid out yet (zero height, or a position that cannot be the bottom bar) so the
 * caller can measure again instead of placing the banner mid-screen.
 * @param {{top: number, bottom: number, height: number}} rect tab bar bounding rect
 * @param {number} viewportHeight window.innerHeight
 */
export function computeBannerOffset(rect, viewportHeight) {
  if (!rect || !(rect.height > 0) || !(viewportHeight > 0)) return null
  const offset = viewportHeight - rect.top
  // A bottom tab bar (incl. its safe-area padding) never occupies a third of the screen.
  if (offset < rect.height - 1 || offset > viewportHeight / 3) return null
  return Math.round(offset)
}

function setAdHeight(px) {
  document.documentElement.style.setProperty('--fb-ad-height', `${Math.max(0, Math.round(px || 0))}px`)
}

async function ensureInitialised() {
  if (initialised) return true
  if (!initPromise) {
    initPromise = (async () => {
      const { Capacitor } = await import('@capacitor/core')
      if (!Capacitor.isNativePlatform()) return false
      const mod = await import('@capacitor-community/admob')
      admob = mod
      await mod.AdMob.initialize({ initializeForTesting: monetizationConfig.ads.useTestIds })

      // Google UMP consent: only ask when the SDK reports it is required.
      try {
        const info = await mod.AdMob.requestConsentInfo()
        if (info.isConsentFormAvailable && info.status === mod.AdmobConsentStatus.REQUIRED) {
          await mod.AdMob.showConsentForm()
        }
      } catch (error) {
        console.warn('FuelBuddy: consent request failed', error)
      }

      sizeListener = await mod.AdMob.addListener(mod.BannerAdPluginEvents.SizeChanged, (size) => {
        bannerHeight = size?.height || 0
        setAdHeight(visible && !hidden ? bannerHeight : 0)
      })
      initialised = true
      return true
    })().catch((error) => {
      console.warn('FuelBuddy: ads unavailable', error)
      initPromise = null
      return false
    })
  }
  return initPromise
}

/**
 * Shows the banner above the tab bar.
 * @param {number} bottomOffset distance in px from the bottom edge (tab bar height)
 */
export async function showBanner(bottomOffset = 0) {
  try {
    if (!(await ensureInitialised())) return
    const { AdMob, BannerAdSize, BannerAdPosition } = admob
    if (visible) {
      if (hidden) {
        hidden = false
        await AdMob.resumeBanner()
        setAdHeight(bannerHeight)
      }
      return
    }
    visible = true
    await AdMob.showBanner({
      adId: monetizationConfig.ads.bannerAdId,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin: Math.round(bottomOffset),
      isTesting: monetizationConfig.ads.useTestIds,
    })
  } catch (error) {
    visible = false
    setAdHeight(0)
    console.warn('FuelBuddy: banner failed', error)
  }
}

export async function hideBanner() {
  setAdHeight(0)
  if (!initialised || !visible || hidden) return
  hidden = true
  try {
    await admob.AdMob.hideBanner()
  } catch (error) {
    console.warn('FuelBuddy: hide banner failed', error)
  }
}

/** Removes the banner entirely (e.g. after upgrading to Pro). */
export async function removeBanner() {
  setAdHeight(0)
  if (!initialised) return
  visible = false
  hidden = false
  bannerHeight = 0
  try {
    await admob.AdMob.removeBanner()
  } catch (error) {
    console.warn('FuelBuddy: remove banner failed', error)
  }
}

export function disposeAds() {
  sizeListener?.remove?.()
  sizeListener = null
}
