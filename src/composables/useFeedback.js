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

  async function toast(message, color = 'dark', duration = 2200) {
    // Sit above the tab bar when it is on screen so it never hides navigation.
    const tabBar = document.getElementById('fb-tab-bar')
    const anchor = tabBar && tabBar.offsetParent !== null ? tabBar : undefined
    const t = await toastController.create({ message, duration, color, position: 'bottom', positionAnchor: anchor })
    await t.present()
  }

  return {
    confirm,
    toast,
    success: (message) => toast(message, 'success'),
    error: (message) => toast(message, 'danger', 3500),
  }
}
