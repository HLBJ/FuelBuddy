/**
 * Applies the theme preference using Ionic's class-based dark palette
 * (`ion-palette-dark` on <html>). 'system' follows the OS setting live.
 */
let mediaQuery = null
let listener = null

function setDark(isDark) {
  document.documentElement.classList.toggle('ion-palette-dark', isDark)
  updateStatusBar()
}

// Headers and onboarding use the dark brand colour in both themes, so the status
// bar always needs light icons (Style.Dark = light content).
async function updateStatusBar() {
  try {
    const { Capacitor } = await import('@capacitor/core')
    if (!Capacitor.isNativePlatform()) return
    const { StatusBar, Style } = await import('@capacitor/status-bar')
    await StatusBar.setStyle({ style: Style.Dark })
  } catch {
    // Status bar styling is cosmetic.
  }
}

export function applyTheme(preference = 'system') {
  if (mediaQuery && listener) mediaQuery.removeEventListener('change', listener)
  mediaQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null
  listener = null

  if (preference === 'dark') return setDark(true)
  if (preference === 'light') return setDark(false)

  setDark(Boolean(mediaQuery?.matches))
  if (mediaQuery) {
    listener = (event) => setDark(event.matches)
    mediaQuery.addEventListener('change', listener)
  }
}
