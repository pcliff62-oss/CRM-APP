// API client helper
// - In local dev, Vite proxies "/api/*" to the backend (API_BASE defaults to "")
// - In deployed environments, set VITE_API_BASE to your API origin to prefix requests
//   e.g. https://your-cloud-run-url

export const API_BASE = import.meta.env.VITE_API_BASE || ''

export async function apiFetch(path, options) {
  const url = `${API_BASE}${path}`
  const res = await fetch(url, options)
  return res
}
