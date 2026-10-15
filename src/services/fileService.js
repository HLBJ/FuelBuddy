/**
 * Saves a generated file. On the phone it is written to the app cache and handed to
 * the Android share sheet (Google Drive, email, Files…); in the browser it downloads.
 *
 * @param {string|Uint8Array} content text, or bytes for binary files such as PDFs
 * @param {string} fileName
 * @param {{ mimeType: string, title: string }} options
 * @returns {Promise<{ fileName: string, method: 'share'|'download' }>}
 */
export async function saveFile(content, fileName, { mimeType, title }) {
  const { Capacitor } = await import('@capacitor/core')
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
    const { Share } = await import('@capacitor/share')
    const binary = content instanceof Uint8Array
    const written = await Filesystem.writeFile({
      path: fileName,
      data: binary ? bytesToBase64(content) : content,
      directory: Directory.Cache,
      ...(binary ? {} : { encoding: Encoding.UTF8 }),
    })
    await Share.share({ title, files: [written.uri], dialogTitle: title })
    return { fileName, method: 'share' }
  }

  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return { fileName, method: 'download' }
}

function bytesToBase64(bytes) {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

/** True when the user closed the share sheet without choosing anything. */
export function isShareCancelled(error) {
  return /cancel/i.test(error?.message || '')
}
