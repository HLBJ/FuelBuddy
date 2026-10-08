export function nowIso() {
  return new Date().toISOString()
}

export function toNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function toBool(value) {
  return value === 1 || value === true || value === '1'
}

export function toNullableText(value) {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return text === '' ? null : text
}
