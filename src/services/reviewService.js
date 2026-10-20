import { shouldAskForReview } from './engagementService.js'

/**
 * Requests Google Play's in-app review sheet once the user has logged enough
 * fill-ups. Google decides whether the sheet is actually shown (and rate-limits
 * it), so FuelBuddy asks at most once and never nags.
 * @param {{ settings, fuel }} services
 */
export async function maybeAskForReview(services) {
  try {
    const [reviewAskedAt, all] = await Promise.all([services.settings.get('reviewAskedAt'), services.fuel.listAll()])
    if (!shouldAskForReview({ fillUpCount: all.length, reviewAskedAt })) return false
    const { Capacitor } = await import('@capacitor/core')
    if (!Capacitor.isNativePlatform()) return false
    await services.settings.set('reviewAskedAt', new Date().toISOString())
    const { InAppReview } = await import('@capacitor-community/in-app-review')
    await InAppReview.requestReview()
    return true
  } catch {
    return false // a rating prompt must never disturb the user
  }
}
