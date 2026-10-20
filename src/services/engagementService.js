/**
 * Pure rules for engagement features: when to ask for a Play Store rating, when to
 * offer Pro, and the in-app Pro trial. All inputs are explicit so they can be tested.
 *
 * The trial is app-side because Google Play only offers free trials on
 * subscriptions, while FuelBuddy Pro is a one-time product. It is granted once per
 * install (stored in local settings) and simply expires — nothing is charged.
 */

export const ENGAGEMENT = Object.freeze({
  reviewAfterFillUps: 5,
  /** Advanced statistics become meaningful with 2 consumption segments (3 full tanks). */
  proNudgeMinSegments: 2,
  trialDays: 7,
})

const DAY_MS = 24 * 60 * 60 * 1000

/** Ask once, after the user has logged enough fill-ups to have seen the app's value. */
export function shouldAskForReview({ fillUpCount, reviewAskedAt }) {
  return !reviewAskedAt && fillUpCount >= ENGAGEMENT.reviewAfterFillUps
}

/** In-app trial state at `now` (ms). */
export function trialState(trialStartedAt, now = Date.now()) {
  const start = trialStartedAt ? Date.parse(trialStartedAt) : NaN
  if (!Number.isFinite(start)) return { used: false, active: false, daysLeft: 0, endsAt: null }
  const end = start + ENGAGEMENT.trialDays * DAY_MS
  const active = now >= start && now < end
  return {
    used: true,
    active,
    daysLeft: active ? Math.max(1, Math.ceil((end - now) / DAY_MS)) : 0,
    endsAt: new Date(end).toISOString(),
  }
}

/** Pro features are available when Pro is owned or the trial is running. */
export function hasProAccess({ isPro, trialStartedAt, now = Date.now() }) {
  return Boolean(isPro) || trialState(trialStartedAt, now).active
}

/** Offer Pro on the dashboard once advanced statistics have something to show. */
export function shouldShowProNudge({ isPro, trialStartedAt, segmentCount, nudgeDismissedAt, now = Date.now() }) {
  if (isPro || nudgeDismissedAt) return false
  if (trialState(trialStartedAt, now).active) return false
  return segmentCount >= ENGAGEMENT.proNudgeMinSegments
}
