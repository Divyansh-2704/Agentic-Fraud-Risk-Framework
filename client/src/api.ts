import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useToast } from './components/ui'

const USER_KEY = 'fcms.user'
export function getUserId() {
  try { return localStorage.getItem(USER_KEY) ?? 'u-aisha' } catch { return 'u-aisha' }
}
export function setUserId(id: string) {
  try { localStorage.setItem(USER_KEY, id) } catch { /* ignore */ }
}

export class ApiError extends Error { constructor(public status: number, message: string) { super(message) } }

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', 'X-User': getUserId() },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })
  const isJson = res.headers.get('content-type')?.includes('json')
  const data = isJson ? await res.json() : await res.text()
  if (!res.ok) throw new ApiError(res.status, (data as any)?.error ?? `Request failed (${res.status})`)
  return data as T
}

export async function download(path: string, filename: string) {
  const res = await fetch(`/api${path}`, { headers: { 'X-User': getUserId() } })
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new ApiError(res.status, d.error ?? 'Download failed') }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** Query scoped to the current user (cache is cleared when the user switches). */
export function useApi<T = any>(path: string | null, opts: { refetchInterval?: number } = {}) {
  return useQuery<T>({ queryKey: [getUserId(), path], queryFn: () => api<T>(path!), enabled: !!path, refetchInterval: opts.refetchInterval })
}

/** Run a mutation, toast the outcome, refresh all queries. */
export function useAct() {
  const qc = useQueryClient()
  const toast = useToast()
  return async <T,>(fn: () => Promise<T>, success?: string): Promise<T | undefined> => {
    try {
      const r = await fn()
      if (success) toast(success)
      await qc.invalidateQueries()
      return r
    } catch (e: any) {
      toast(e.message ?? 'Something went wrong', true)
      return undefined
    }
  }
}
