// Small helper to construct file URLs consistently for the mobile app
// Use RELATIVE paths by default so Vite dev proxy handles cross-origin.
// Only use absolute when VITE_API_BASE is explicitly provided.

const RAW = (import.meta.env?.VITE_API_BASE ?? '').toString().trim()
const BASE = RAW ? RAW.replace(/\/$/, '') : ''

export function apiBase() {
  return BASE
}

export function buildFileUrl(input) {
  if (!input) return ''
  const id = typeof input === 'string' ? input : input.id
  const url = typeof input === 'string' ? '' : (input.url || '')
  if (id) return BASE ? `${BASE}/api/files/${id}` : `/api/files/${id}`
  // If we only have a url, return as-is if absolute or already rooted
  if (!url) return ''
  if (/^https?:\/\//i.test(url) || url.startsWith('/')) return url
  return BASE ? `${BASE}/${url.replace(/^\/?/, '')}` : `/${url.replace(/^\/?/, '')}`
}
