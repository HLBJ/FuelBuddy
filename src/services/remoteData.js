/**
 * Downloads small JSON data files (fuel prices, toll tariffs) from a hosted location such
 * as Google Drive, and keeps the last good copy for offline use.
 */
/**
 * Direct-download form of a hosted price file URL. Google Drive "share" links point to
 * a web page, so they are turned into Drive's download link; other URLs are unchanged.
 */
export function priceFileUrl(url) {
  if (!url) return null
  const drive = /drive\.google\.com\/(?:file\/d\/([\w-]{10,})|(?:open|uc)\?(?:[^#]*&)?id=([\w-]{10,}))/.exec(url)
  if (!drive) return url
  return `https://drive.usercontent.google.com/download?id=${drive[1] || drive[2]}&export=download&confirm=t`
}

/**
 * Downloads and parses JSON. On the phone this uses Capacitor's native HTTP, which is
 * not subject to CORS (Google Drive downloads don't allow cross-origin requests); the
 * browser preview uses fetch.
 */
export async function downloadJson(url, timeoutMs) {
  const { Capacitor, CapacitorHttp } = await import('@capacitor/core')
  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.get({ url, connectTimeout: timeoutMs, readTimeout: timeoutMs, responseType: 'text' })
    if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}`)
    return typeof response.data === 'string' ? JSON.parse(response.data) : response.data
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-cache' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Returns the cached copy of a hosted file, refreshing it when it's older than
 * `refreshHours`. Never throws: offline, a missing URL or a bad file all return the
 * last good copy (or null).
 *
 * @param {object} settings repository with get/set
 * @param {{ url: string|null, cacheKey: string, fetchedKey: string, refreshHours: number,
 *   timeoutMs: number, validate: (json) => any }} source `validate` throws on bad data
 * @returns {Promise<any|null>} the validated data
 */
export async function loadHostedJson(settings, source, { getJson = downloadJson, now = Date.now() } = {}) {
  let cached = null
  try {
    const raw = await settings.get(source.cacheKey)
    if (raw) cached = source.validate(raw)
  } catch {
    cached = null
  }
  const url = priceFileUrl(source.url)
  const fetchedAt = Date.parse((await settings.get(source.fetchedKey)) || '') || 0
  if (!url || now - fetchedAt < source.refreshHours * 3_600_000) return cached
  try {
    const json = await getJson(url, source.timeoutMs)
    const fresh = source.validate(json)
    await settings.set(source.cacheKey, json)
    await settings.set(source.fetchedKey, new Date(now).toISOString())
    return fresh
  } catch {
    return cached
  }
}
