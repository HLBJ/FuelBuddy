import { alertController, toastController } from '@ionic/vue'

/** Consistent confirmation dialogs and toasts. */
export function useFeedback() {
  async function confirm({ header, message, confirmText = 'Confirm', destructive = false }) {
    const alert = await alertController.create({
      header,
      message,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: confirmText, role: 'confirm', cssClass: destructive ? 'fb-alert-danger' : undefined },
      ],
    })
    await alert.present()
    const { role } = await alert.onDidDismiss()
    return role === 'confirm'
  }

  function visibleTabBar() {
    const tabBar = document.getElementById('fb-tab-bar')
    return tabBar && tabBar.offsetParent !== null ? tabBar : undefined
  }

  // Success toasts usually follow a save + navigate back to a tab. Wait briefly for
  // the tab bar to become visible so the toast is anchored above it, not over it.
  async function waitForTabBar(timeoutMs = 450) {
    const start = performance.now()
    while (performance.now() - start < timeoutMs) {
      const bar = visibleTabBar()
      if (bar) return bar
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    return undefined
  }

  async function toast(message, color = 'dark', duration = 2200, { waitForTabs = false } = {}) {
    // Sit above the tab bar when it is on screen so it never hides navigation.
    const anchor = waitForTabs ? await waitForTabBar() : visibleTabBar()
    const t = await toastController.create({ message, duration, color, position: 'bottom', positionAnchor: anchor })
    await t.present()
  }

  return {
    confirm,
    toast,
    success: (message) => toast(message, 'success', 2200, { waitForTabs: true }),
    error: (message) => toast(message, 'danger', 3500),
  }
}
