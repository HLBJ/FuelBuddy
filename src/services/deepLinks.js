/**
 * Maps external links (home-screen widget, app-icon shortcuts, notifications) to
 * in-app routes. Only known destinations are accepted; anything else is ignored.
 *
 *   fuelbuddy://add-fillup   → /entries/new
 *   fuelbuddy://route        → /trip/route
 *   fuelbuddy://reminders    → /reminders
 */
const ROUTES = Object.freeze({
  'add-fillup': '/entries/new',
  route: '/trip/route',
  reminders: '/reminders',
})

export function routeForDeepLink(url) {
  if (typeof url !== 'string') return null
  const match = /^fuelbuddy:\/\/([a-z-]+)\/?(?:[?#].*)?$/i.exec(url.trim())
  return match ? ROUTES[match[1].toLowerCase()] || null : null
}

/** Notification payloads carry an in-app path; accept only our own routes. */
export function routeForNotification(extra) {
  const url = extra?.url
  return typeof url === 'string' && /^\/(reminders|entries|tabs|trip)(\/[\w-]+)*$/.test(url) ? url : null
}
