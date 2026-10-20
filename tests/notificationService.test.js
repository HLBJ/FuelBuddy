import { describe, expect, it, vi } from 'vitest'

// Mimics a Capacitor native plugin: a Proxy that answers every property with a method,
// including `then`, which rejects ("not implemented") instead of resolving.
const calls = []
const scheduled = []
const permission = { display: 'granted' }
const pluginProxy = new Proxy({}, {
  get: (_, name) => (...args) => {
    calls.push(name)
    if (name === 'schedule') scheduled.push(...args[0].notifications)
    if (name === 'then') return args[1]?.(new Error('"LocalNotifications.then()" is not implemented on android'))
    if (name === 'checkPermissions' || name === 'requestPermissions') return Promise.resolve(permission)
    return Promise.resolve()
  },
})

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }))
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: pluginProxy }))

const { ensureNotificationPermission, reminderNotifier } = await import('../src/services/notificationService.js')

const settles = (promise) => Promise.race([promise.then(() => 'settled'), new Promise((r) => setTimeout(() => r('hung'), 500))])

describe('notification service on a native plugin proxy', () => {
  it('does not hang awaiting the plugin', async () => {
    expect(await settles(ensureNotificationPermission())).toBe('settled')
    const reminder = { id: 3, title: 'Renew licence disc', dueDate: '2099-01-10', doneAt: null }
    expect(await settles(reminderNotifier.sync(reminder, 'Polo'))).toBe('settled')
    expect(calls).toContain('schedule')
    expect(calls).not.toContain('then')
    // No exact-alarm permission is declared, so every notification must be inexact.
    expect(scheduled.map((n) => n.isExactNotification)).toEqual([false, false])
  })

  it('shares one permission request between concurrent callers', async () => {
    permission.display = 'prompt'
    calls.length = 0
    await Promise.all([ensureNotificationPermission(), ensureNotificationPermission()])
    expect(calls.filter((c) => c === 'requestPermissions')).toHaveLength(1)
  })
})
