import type { Role, User } from '../../../shared/src/index.js'
import { cachedUserRows, insert, json, nowIso, type Row } from '../db.js'

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message) }
}
export const bad = (msg: string) => new HttpError(400, msg)
export const forbidden = (msg: string) => new HttpError(403, msg)
export const notFound = (msg = 'Not found') => new HttpError(404, msg)
/** A business rule refused the request (e.g. CRM rejects the EDD SR). Sent as 422 so it is not reported as a client error. */
export const refused = (msg: string) => new HttpError(422, msg)

export function rowToUser(r: Row): User {
  return { id: r.id, name: r.name, email: r.email, roles: json(r.roles, []), entities: json(r.entities, []), dept: r.dept }
}
// Users are served from the in-memory cache (refreshed per request, see db.ts refreshCache).
export const listUsers = () => cachedUserRows().map(rowToUser)
export function getUser(id: string | undefined | null): User | undefined {
  if (!id) return undefined
  const r = cachedUserRows().find((x) => x.id === id)
  return r ? rowToUser(r) : undefined
}
export const userName = (id: string | null | undefined) => (id ? getUser(id)?.name ?? id : null)
export const hasRole = (u: User, ...roles: Role[]) => roles.some((r) => u.roles.includes(r))
export const isFpi = (u: User) => u.roles.some((r) => r.startsWith('FPI_'))
export const isAdminish = (u: User) => hasRole(u, 'SUPER_USER', 'MANAGER')

// ---------- Team mailboxes (shared inboxes each user can read in the Email outbox) ----------
export const MAILBOX = {
  FRAUD_OPS: 'fraud.ops@auronova.example',
  FPI: 'fpi.team@auronova.example',
  HR_GOV: 'hr.governance@auronova.example',
} as const
export function teamMailboxes(u: User): string[] {
  const out = new Set<string>()
  if (hasRole(u, 'FO_ANALYST', 'FO_MAKER', 'FO_CHECKER', 'MANAGER')) out.add(MAILBOX.FRAUD_OPS)
  if (isFpi(u)) out.add(MAILBOX.FPI)
  if (hasRole(u, 'HR', 'GOVERNANCE')) out.add(MAILBOX.HR_GOV)
  return [...out]
}
/** Whether an outbox email is addressed to the user, directly or through one of their team mailboxes. */
export function emailVisibleTo(u: User, e: { to_addr?: string | null; cc?: string | null }) {
  const addrs = `${e.to_addr ?? ''};${e.cc ?? ''}`.toLowerCase()
  return [u.email, ...teamMailboxes(u)].some((a) => addrs.includes(a.toLowerCase()))
}

// ---------- Chinese wall (FR-LP-02) ----------
export function canSeeAlert(u: User, a: Row) {
  if (hasRole(u, 'SUPER_USER')) return true
  if (!u.entities.includes(a.entity)) return false
  if (isFpi(u) || hasRole(u, 'MANAGER')) return true // FR-ALT-045: FP&I has view access to all alerts
  const deptRole: Record<string, Role> = { FRAUD_OPS: 'FO_ANALYST', GOVERNANCE: 'GOVERNANCE', HR: 'HR' }
  return u.roles.includes(deptRole[a.dept]) || (a.dept === 'FRAUD_OPS' && hasRole(u, 'FO_MAKER', 'FO_CHECKER'))
}
export function canSeeCase(u: User, c: Row) {
  if (hasRole(u, 'SUPER_USER')) return true
  if (!u.entities.includes(c.entity)) return false
  if (c.created_by === u.id) return true // the creator can always follow their own case (read-only once it moves on)
  if (c.type === 'WHISTLEBLOWER') return isFpi(u) || hasRole(u, 'HR', 'GOVERNANCE')
  return isFpi(u) || hasRole(u, 'MANAGER', 'FO_MAKER', 'FO_CHECKER', 'FO_ANALYST')
}

// ---------- Simulated Outlook (all system emails land here) ----------
export async function sendEmail(e: { to: string; cc?: string; subject: string; body: string; relatedType?: string; relatedId?: string; template?: string }) {
  await insert('outbox', { ts: nowIso(), to_addr: e.to, cc: e.cc ?? '', subject: e.subject, body: e.body, related_type: e.relatedType ?? null, related_id: e.relatedId ?? null, template: e.template ?? null })
}

/** Simple fuzzy match (FR-LP-008/009): substring, or every query token within edit distance 1-2 of some word. */
export function fuzzyMatch(q: string, ...fields: unknown[]) {
  const query = q.trim().toLowerCase()
  if (!query) return true
  const hay = fields.filter((f) => f !== null && f !== undefined).map(String).join(' ').toLowerCase()
  if (hay.includes(query)) return true
  const words = hay.split(/[\s,/()\-_.@]+/).filter(Boolean)
  return query.split(/\s+/).every((t) => words.some((w) => w.includes(t) || (t.length >= 4 && lev(t, w.slice(0, t.length + 1)) <= (t.length > 6 ? 2 : 1))))
}
function lev(a: string, b: string) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return dp[a.length][b.length]
}

export const ageBucket = (ms: number) => {
  const h = ms / 3600_000
  return h < 24 ? '< 1 day' : h < 72 ? '1-3 days' : h < 168 ? '3-7 days' : '> 7 days'
}
export const AGE_BUCKETS = ['< 1 day', '1-3 days', '3-7 days', '> 7 days']
