export async function apiGet(url) {
	try {
		const r = await fetch(url)
		const j = await r.json()
		return { ok: !!j.ok, data: j }
	} catch (e) {
		return { ok: false, error: String(e) }
	}
}
export async function apiPost(url, body) {
	try {
		const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
		const j = await r.json()
		return { ok: !!j.ok, data: j }
	} catch (e) {
		return { ok: false, error: String(e) }
	}
}
export async function apiDelete(url) {
	try {
		const r = await fetch(url, { method: 'DELETE' })
		const j = await r.json()
		return { ok: !!j.ok, data: j }
	} catch (e) {
		return { ok: false, error: String(e) }
	}
}

export const api = {
	customersGet: async (id) => {
		const r = await apiGet('/api/customers/'+encodeURIComponent(id))
		if (!r.ok) throw new Error(r.error || 'fetch failed')
		// server returns { ok:true, item }
		return r.data.item || null
	},
	customersSave: async (payload) => {
		const r = await apiPost('/api/customers', payload)
		if (!r.ok) throw new Error(r.error || 'save failed')
		return r.data.item || null
	},
	customersDelete: async (id) => {
		const r = await apiDelete('/api/customers/'+encodeURIComponent(id))
		if (!r.ok) throw new Error(r.error || 'delete failed')
		return true
	}
}
