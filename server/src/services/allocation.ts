// Balanced alert allocation (FR-ALT-047/048 + FR-ALT-012), used when an alert arrives and by the manager's Rebalance.
// Rules, in order:
//   1. Equal totals: the analyst with the fewest open alerts (existing + new) gets the next one.
//   2. Priority mix: on a tie, the analyst with the fewest open alerts of that priority (High / Medium / Low).
//   3. Typology mix: still tied, the analyst with the fewest open alerts of that fraud typology.
// Alerts of the same customer stay with one analyst, so they can still be decided together (FR-ALT-011).
// Rebalance only moves alerts nobody has started working on.
import type { User } from '../../../shared/src/index.js'
import { all, insert, nowIso, tx, update, type Row } from '../db.js'
import { bad, forbidden, hasRole, listUsers, userName } from './common.js'

const DEPT_ROLE = { FRAUD_OPS: 'FO_ANALYST', GOVERNANCE: 'GOVERNANCE', HR: 'HR' } as const
/** Statuses an unstarted alert can be in; anything else (EDD, referred, re-scheduled, closed) means work has begun. */
const MOVABLE_STATUSES = ['Yet to start', 'WIP', 'Hold']
const ASSIGNMENT_EVENT = /^(Picked from queue|Assigned to |Auto-allocated|Rebalanced)/

export interface Load { total: number; priority: Record<string, number>; typology: Record<string, number> }
const emptyLoad = (): Load => ({ total: 0, priority: {}, typology: {} })
const typologyOf = (a: Row) => String(a.typology ?? a.alert_type ?? 'Unknown')

/** Analysts who may work alerts of this department and entity (same rule as the Chinese wall). */
export function eligibleAnalysts(dept: string, entity: string): User[] {
  const role = DEPT_ROLE[dept as keyof typeof DEPT_ROLE]
  if (!role) return []
  return listUsers().filter((u) => u.roles.includes(role) && u.entities.includes(entity as any)).sort((a, b) => a.id.localeCompare(b.id))
}

function addToLoad(load: Load, alerts: Row[]) {
  for (const a of alerts) {
    load.total++
    load.priority[a.priority] = (load.priority[a.priority] ?? 0) + 1
    load.typology[typologyOf(a)] = (load.typology[typologyOf(a)] ?? 0) + 1
  }
}

/** Open-alert workload per analyst (alerts of every department count: it is one person's workload). */
export async function currentLoads(exclude: Set<string> = new Set()): Promise<Map<string, Load>> {
  const rows = await all("SELECT id, assigned_to, priority, typology, alert_type FROM alerts WHERE assigned_to IS NOT NULL AND status <> 'Closed'")
  const loads = new Map<string, Load>()
  for (const a of rows) {
    if (exclude.has(a.id)) continue
    if (!loads.has(a.assigned_to)) loads.set(a.assigned_to, emptyLoad())
    addToLoad(loads.get(a.assigned_to)!, [a])
  }
  return loads
}

/** Picks the analyst for a group of alerts (one customer) by the three rules above; ties fall back to a stable order. */
export function pickAnalyst(candidates: User[], loads: Map<string, Load>, group: Row[]): User | null {
  if (!candidates.length) return null
  const score = (u: User) => {
    const l = loads.get(u.id) ?? emptyLoad()
    return [l.total, group.reduce((s, a) => s + (l.priority[a.priority] ?? 0), 0), group.reduce((s, a) => s + (l.typology[typologyOf(a)] ?? 0), 0)]
  }
  const scored = candidates.map((u, i) => ({ u, s: [...score(u), i] }))
  scored.sort((x, y) => { for (let k = 0; k < x.s.length; k++) if (x.s[k] !== y.s[k]) return x.s[k] - y.s[k]; return 0 })
  return scored[0].u
}

/** Analyst for a newly arrived alert: the customer's current analyst if there is one, otherwise the balanced pick. */
export async function analystForNewAlert(a: Row): Promise<string | null> {
  const candidates = eligibleAnalysts(a.dept, a.entity)
  if (!candidates.length) return null
  const sameCustomer = await all("SELECT assigned_to FROM alerts WHERE cif = ? AND dept = ? AND id <> ? AND status <> 'Closed' AND assigned_to IS NOT NULL ORDER BY created_at", a.cif, a.dept, a.id)
  const owner = sameCustomer.map((r) => r.assigned_to).find((uid) => candidates.some((c) => c.id === uid))
  if (owner) return owner
  return pickAnalyst(candidates, await currentLoads(new Set([a.id])), [a])?.id ?? null
}

/** True when nobody has worked the alert yet: no decision, no analyst action, no edits, notes or evidence. */
async function unstartedIds(alerts: Row[]): Promise<Set<string>> {
  if (!alerts.length) return new Set()
  const ids = alerts.map((a) => a.id)
  const marks = (sql: string) => all<{ alert_id: string }>(sql.replace('$IDS', ids.map(() => '?').join(',')), ...ids)
  const touched = new Set<string>()
  for (const e of await all<{ alert_id: string; action: string }>(`SELECT alert_id, action FROM alert_events WHERE actor <> 'system' AND alert_id IN (${ids.map(() => '?').join(',')})`, ...ids)) {
    if (!ASSIGNMENT_EVENT.test(e.action)) touched.add(e.alert_id)
  }
  for (const r of await marks('SELECT DISTINCT alert_id FROM evidence WHERE alert_id IN ($IDS)')) touched.add(r.alert_id)
  const created = new Map(alerts.map((a) => [a.id, a.created_at]))
  for (const r of await all<{ alert_id: string; updated_at: string }>(`SELECT alert_id, MAX(updated_at) AS updated_at FROM alert_actions WHERE alert_id IN (${ids.map(() => '?').join(',')}) GROUP BY alert_id`, ...ids)) {
    if (r.updated_at > created.get(r.alert_id)!) touched.add(r.alert_id)
  }
  return new Set(alerts.filter((a) => !touched.has(a.id) && !a.decision && !a.edd_sr && !a.fpi_referral && !a.notes && !a.ref_ids
    && a.potential_savings === null && !a.linked_account && Number(a.reschedule_count ?? 0) === 0).map((a) => a.id))
}

/**
 * The greedy pass equalises totals but can leave the priority or typology mix uneven (e.g. Low 1 / 3 / 2), because
 * those rules only break ties. This pass swaps two same-sized customer groups between analysts whenever that makes
 * the mix more even; totals never change. Imbalance = sum of squared counts per analyst (priority weighted above
 * typology), which is smallest when counts are spread evenly.
 */
function improveBySwaps(placed: { g: Row[]; to: string }[], loads: Map<string, Load>, candidatesFor: (a: Row) => User[]) {
  const sq = (n: number) => n * n
  const cost = (l: Load) => Object.values(l.priority).reduce((s, n) => s + 10 * sq(n), 0) + Object.values(l.typology).reduce((s, n) => s + sq(n), 0)
  const shift = (l: Load, g: Row[], sign: 1 | -1) => {
    for (const a of g) {
      l.total += sign
      l.priority[a.priority] = (l.priority[a.priority] ?? 0) + sign
      l.typology[typologyOf(a)] = (l.typology[typologyOf(a)] ?? 0) + sign
    }
  }
  const eligible = placed.map((p) => new Set(candidatesFor(p.g[0]).map((u) => u.id)))
  for (let round = 0; round < 50; round++) {
    let improved = false
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const x = placed[i], y = placed[j]
        if (x.to === y.to || x.g.length !== y.g.length || !eligible[i].has(y.to) || !eligible[j].has(x.to)) continue
        const lx = loads.get(x.to)!, ly = loads.get(y.to)!
        const before = cost(lx) + cost(ly)
        shift(lx, x.g, -1); shift(lx, y.g, 1); shift(ly, y.g, -1); shift(ly, x.g, 1)
        if (cost(lx) + cost(ly) < before) { [x.to, y.to] = [y.to, x.to]; improved = true; continue }
        shift(lx, y.g, -1); shift(lx, x.g, 1); shift(ly, x.g, -1); shift(ly, y.g, 1) // undo
      }
    }
    if (!improved) break
  }
}

export interface RebalanceMove { id: string; cif: string; customer: string; priority: string; typology: string; from: string | null; fromName: string | null; to: string; toName: string }
export interface RebalanceRow { analyst: string; name: string; dept: string; before: Load; after: Load }

/**
 * Redistributes every unstarted open alert by the rules above. With apply = false it only returns the plan (preview).
 * Started alerts never move; unstarted alerts of a customer whose other alert is already being worked go to that analyst.
 */
export async function rebalance(u: User, apply: boolean) {
  if (!hasRole(u, 'MANAGER', 'SUPER_USER')) throw forbidden('Only a Fraud Ops manager or super user can rebalance the alert queue.')
  const open = await all(`SELECT * FROM alerts WHERE status <> 'Closed' ORDER BY created_at, id`)
  const candidatesFor = (a: Row) => eligibleAnalysts(a.dept, a.entity)
  const movableAll = open.filter((a) => MOVABLE_STATUSES.includes(a.status) && candidatesFor(a).length > 0)
  const unstarted = await unstartedIds(movableAll)
  const movable = movableAll.filter((a) => unstarted.has(a.id))
  const before = await currentLoads()
  const loads = await currentLoads(new Set(movable.map((a) => a.id))) // fixed workload only

  // Group the movable alerts by department + customer.
  const groups = new Map<string, Row[]>()
  for (const a of movable) { const k = `${a.dept}|${a.cif}`; groups.set(k, [...(groups.get(k) ?? []), a]) }
  const fixedOwner = new Map<string, string>()
  for (const a of open) if (a.assigned_to && !unstarted.has(a.id)) fixedOwner.set(`${a.dept}|${a.cif}`, a.assigned_to)

  const plan = new Map<string, string>()
  // Customers already being worked: their unstarted alerts follow the analyst working them.
  for (const [k, g] of groups) {
    const owner = fixedOwner.get(k)
    if (owner && candidatesFor(g[0]).some((c) => c.id === owner)) {
      for (const a of g) plan.set(a.id, owner)
      if (!loads.has(owner)) loads.set(owner, emptyLoad())
      addToLoad(loads.get(owner)!, g)
      groups.delete(k)
    }
  }
  // Largest groups and highest priorities first, so the last (smallest) placements even out the totals.
  const rank: Record<string, number> = { High: 0, Medium: 1, Low: 2 }
  const ordered = [...groups.values()].sort((x, y) => y.length - x.length
    || Math.min(...x.map((a) => rank[a.priority] ?? 3)) - Math.min(...y.map((a) => rank[a.priority] ?? 3))
    || String(x[0].created_at).localeCompare(String(y[0].created_at)))
  const placed: { g: Row[]; to: string }[] = []
  for (const g of ordered) {
    const pick = pickAnalyst(candidatesFor(g[0]), loads, g)
    if (!pick) continue
    placed.push({ g, to: pick.id })
    if (!loads.has(pick.id)) loads.set(pick.id, emptyLoad())
    addToLoad(loads.get(pick.id)!, g)
  }
  improveBySwaps(placed, loads, candidatesFor)
  for (const { g, to } of placed) for (const a of g) plan.set(a.id, to)

  const moves: RebalanceMove[] = movable.filter((a) => plan.get(a.id) && plan.get(a.id) !== a.assigned_to).map((a) => ({
    id: a.id, cif: a.cif, customer: a.customer_name, priority: a.priority, typology: typologyOf(a),
    from: a.assigned_to ?? null, fromName: userName(a.assigned_to), to: plan.get(a.id)!, toName: userName(plan.get(a.id))!,
  }))
  const analysts = listUsers().filter((x) => Object.values(DEPT_ROLE).some((r) => x.roles.includes(r)))
  const table: RebalanceRow[] = analysts.map((x) => ({ analyst: x.id, name: x.name, dept: x.dept, before: before.get(x.id) ?? emptyLoad(), after: loads.get(x.id) ?? emptyLoad() }))

  if (apply) {
    if (!moves.length) throw bad('The queue is already balanced: no unstarted alert needs to move.')
    const ts = nowIso()
    await tx(async () => {
      for (const m of moves) {
        const a = movable.find((x) => x.id === m.id)!
        const status = a.status === 'Yet to start' ? 'WIP' : a.status
        await update('alerts', 'id', m.id, { assigned_to: m.to, assigned_at: ts, status })
        await insert('alert_events', { alert_id: m.id, ts, actor: u.id, action: `Rebalanced: ${m.fromName ? `moved from ${m.fromName} to` : 'assigned to'} ${m.toName}`, from_status: a.status, to_status: status, comment: null })
      }
    })
  }
  return { applied: apply, movable: movable.length, moves, analysts: table }
}
