import { notificationIds, notificationPlan } from './reminderService.js'

/**
 * Local (on-device) notifications for reminders via @capacitor/local-notifications.
 * Nothing leaves the phone. Notifications are scheduled inexactly (no exact-alarm
 * permission), which is fine for "licence disc due" style reminders.
 */
const CHANNEL_ID = 'reminders'
let channelReady = false

// Resolves to { ln } rather than the plugin itself: Capacitor plugin proxies answer
// every property, including `then`, so awaiting a bare proxy never settles.
async function plugin() {
  const { Capacitor } = await import('@capacitor/core')
  if (!Capacitor.isNativePlatform()) return null
  const { LocalNotifications } = await import('@capacitor/local-notifications')
  if (!channelReady) {
    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: 'Reminders',
      description: 'Licence disc, service and tyre reminders',
      importance: 3,
    }).catch(() => {})
    channelReady = true
  }
  return { ln: LocalNotifications }
}

let pendingRequest = null

/**
 * Asks for notification permission (Android 13+) if not yet decided. It settles only
 * once the user answers the system dialog, so don't hold up other work on it. One
 * request at a time; concurrent callers share it.
 */
export function ensureNotificationPermission() {
  pendingRequest ??= (async () => {
    const { ln } = (await plugin()) || {}
    if (!ln) return false
    let status = await ln.checkPermissions()
    if (status.display === 'prompt' || status.display === 'prompt-with-rationale') status = await ln.requestPermissions()
    return status.display === 'granted'
  })().finally(() => { pendingRequest = null })
  return pendingRequest
}

export const reminderNotifier = {
  async cancel(reminderId) {
    const { ln } = (await plugin()) || {}
    if (!ln) return
    await ln.cancel({ notifications: notificationIds(reminderId).map((id) => ({ id })) })
  },

  async sync(reminder, vehicleName) {
    const { ln } = (await plugin()) || {}
    if (!ln) return
    await this.cancel(reminder.id)
    const plan = notificationPlan(reminder, vehicleName)
    if (!plan.length) return
    const { display } = await ln.checkPermissions()
    if (display !== 'granted') return
    await ln.schedule({
      notifications: plan.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        channelId: CHANNEL_ID,
        schedule: { at: n.at, allowWhileIdle: true },
        // We don't hold SCHEDULE_EXACT_ALARM; without this the plugin opens the
        // "Alarms & reminders" settings screen and the call never completes.
        isExactNotification: false,
        extra: { url: `/reminders/${reminder.id}/edit` },
      })),
    })
  },
}
