import { apiFetch } from '../apiClient.js'

export type TaskListItem = {
  id: string
  title: string
  dueDate?: string
  completed?: boolean
  customerId?: string
}

// Read tasks via existing API endpoint; no schema or write changes.
export async function listTasks(): Promise<TaskListItem[]> {
  try {
    const res = await apiFetch('/api/tasks')
    if (!res.ok) return []
    const json = await res.json().catch(() => ({} as any))
    const items = Array.isArray(json?.items) ? json.items : (Array.isArray(json) ? json : [])
    return (items as any[]).map((t) => ({
      id: String(t?.id || ''),
      title: String(t?.title || ''),
      dueDate: (typeof t?.dueDate === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.test(t.dueDate)) ? t.dueDate : undefined,
      completed: String(t?.status || '').toLowerCase() === 'done',
      customerId: t?.customerId ? String(t.customerId) : undefined,
    }))
  } catch (e) {
    console.error('[listTasks] failed', e)
    return []
  }
}
