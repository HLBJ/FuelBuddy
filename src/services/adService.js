import { monetizationConfig } from '../config/monetization.js'

/**
 * Banner advertising for the free tier (Google AdMob).
 *
 * - Never shown to Pro users, never on the web preview.
 * - Development builds use Google's published test ad unit (no revenue, no
 *   policy risk). Production IDs come from configuration only.
 * - Every failure (offline, no fill, consent declined) is swallowed: ads must never
 *   affect the core app.
 * - Layout: the banner is docked at the very bottom of the screen, directly above
 *   the system navigation bar (the plugin measures its margin from there), and the
 *   tab bar is lifted above it. While a banner is showing, <html> gets the
 *   `fb-ad-visible` class and `--fb-ad-height`; when none loads (offline, Pro, ad
 *   blocker) both are cleared and the tab bar returns to the bottom. Ads therefore
 *   never cover app content.
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
 * Layout state for a banner height reported by the ad SDK. Heights that are not a
 * positive number (failed load, hidden, removed) mean "no banner".
 * @returns {{ visible: boolean, height: number }}
 */
export function bannerLayout(height) {
  const px = Number.isFinite(height) && height > 0 ? Math.round(height) : 0
  return { visible: px > 0, height: px }
}

function setAdHeight(px) {
  const layout = bannerLayout(px)
  const root = document.documentElement
  root.style.setProperty('--fb-ad-height', `${layout.height}px`)
  root.classList.toggle('fb-ad-visible', layout.visible)
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

/** Shows the banner docked at the bottom of the screen, below the tab bar. */
export async function showBanner() {
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
      margin: 0,
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
