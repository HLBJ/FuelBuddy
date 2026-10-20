/**
 * Takes a photo (camera app) or picks one (photo picker) and reads its text on the
 * phone with ML Kit, through the app's native SlipScanner plugin. Nothing is uploaded,
 * and the app needs no camera or storage permission.
 */
export class TextCaptureError extends Error {}

let recognizer = null

/**
 * @param {{ title: string }} options title of the camera/gallery chooser
 * @returns {Promise<{ text: string, lines: Array }|null>} null when the user cancels
 */
export async function captureText({ title }) {
  const { Capacitor, registerPlugin } = await import('@capacitor/core')
  if (!Capacitor.isNativePlatform()) throw new TextCaptureError('Scanning works in the Android app.')
  const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera')
  let photo
  try {
    photo = await Camera.getPhoto({
      source: CameraSource.Prompt,
      resultType: CameraResultType.Uri,
      quality: 90,
      width: 2400,
      correctOrientation: true,
      promptLabelHeader: title,
      promptLabelPhoto: 'Choose from gallery',
      promptLabelPicture: 'Take photo',
    })
  } catch (error) {
    if (/cancel/i.test(error?.message || '')) return null
    throw error
  }
  recognizer ??= registerPlugin('SlipScanner')
  return recognizer.recognize({ path: photo.path })
}
