import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, useAct, useApi } from '../api'
import { AiVerdictBadge, aiVerdictValue } from '../components/AiVerdict'
import { KpiFilters, type KpiFilter } from '../components/KpiFilters'
import { hasRole, useMe } from '../components/Layout'
import { Badge, DataTable, fmtAed, fmtDateTime, fmtDur, Loading, Modal, PreventionChip, PriorityBadge, StatusBadge, Tabs, type Col } from '../components/ui'

export const alertCols: Col<any>[] = [
  { key: 'id', label: 'Alert ID', render: (a) => <span className="mono" style={{ fontWeight: 600 }}>{a.id}</span> },
  { key: 'rule', label: 'Rule ID / name', value: (a) => `${a.rule_id} ${a.rule_name}`, render: (a) => <div><div className="mono small">{a.rule_id}</div><div>{a.rule_name}</div></div> },
  { key: 'cif', label: 'CIF', render: (a) => <span className="mono">{a.cif}</span> },
  { key: 'customer_name', label: 'Name' },
  { key: 'category', label: 'Category', render: (a) => a.category === 'Prevention' ? <PreventionChip c={a.prevention_colour} /> : <Badge tone="outline">Detection</Badge> },
  { key: 'typology', label: 'Fraud typology' },
  { key: 'risk_score', label: 'Score', render: (a) => <b>{a.risk_score}</b> },
  { key: 'priority', label: 'Priority', render: (a) => <PriorityBadge p={a.priority} /> },
  { key: 'ai', label: 'AI verdict', value: (a) => aiVerdictValue(a.ai), render: (a) => <AiVerdictBadge ai={a.ai} /> },
  { key: 'created_at', label: 'Date of alert', render: (a) => fmtDateTime(a.created_at) },
  { key: 'assigned_name', label: 'Assigned to', render: (a) => a.assigned_name ? <div>{a.assigned_name}<div className="small muted">{fmtDateTime(a.assigned_at)}</div></div> : <span className="muted">Unassigned</span> },
  { key: 'status', label: 'Status', render: (a) => <div className="stack" style={{ gap: 3 }}><StatusBadge s={a.status} />{a.archived && <Badge tone="grey">Archived</Badge>}{a.case_id &&<span className="small mono">{a.case_id}</span>}</div> },
  { key: 'tat_ms', label: 'TAT', render: (a) => <span style={{ color: a.overdue ? 'var(--red)' : undefined, fontWeight: a.overdue ? 700 : 400 }}>{fmtDur(a.tat_ms)}{a.overdue && <div className="small">Overdue +{fmtDur(a.overdue_ms)}</div>}</span> },
]

export function AlertQueue() {
  const me = useMe()
  const nav = useNavigate()
  const act = useAct()
  const [tab, setTab] = useState('all')
  const [scope, setScope] = useState('live')
  const [mine, setMine] = useState(false)
  const [q, setQ] = useState('')
  const [kf, setKf] = useState<KpiFilter>({})
  const [sel, setSel] = useState<Set<string>>(new Set())
  const params = new URLSearchParams({ scope, ...(tab !== 'all' ? { tab } : {}), ...(mine ? { mine: '1' } : {}), ...(q ? { q } : {}), ...Object.fromEntries(Object.entries(kf).filter(([, v]) => v)) as any })
  const data = useApi<any>(`/alerts?${params}`)
  const canWork = hasRole(me, 'FO_ANALYST', 'GOVERNANCE', 'HR')
  const canRebalance = hasRole(me, 'MANAGER', 'SUPER_USER')
  const [rebal, setRebal] = useState(false)
  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs">Stage A · Alert management (FAMS, BRD section 4)</div>
          <h1>Alert queue</h1>
          <p>Alerts from DSP / SAS are ingested, enriched and triaged into department queues. Prevention alerts are always at the top.</p>
        </div>
        <div className="row">
          {canRebalance && <button className="btn" onClick={() => setRebal(true)}>Rebalance workload</button>}
          {canWork && <button className="btn btn-accent" disabled={!sel.size} onClick={async () => { const r = await act(() => api('/alerts/assign', { method: 'POST', body: { ids: [...sel] } }), `${sel.size} alert(s) assigned to you`); if (r) setSel(new Set()) }}>Assign {sel.size || ''} to me</button>}
        </div>
      </div>
      <div className="stack">
        <div className="row between">
          <Tabs value={tab} onChange={setTab} tabs={[{ id: 'all', label: 'All' }, { id: 'realtime', label: 'Real time' }, { id: 't1', label: 'T+1' }]} />
          <div className="row">
            <input className="input" style={{ width: 280 }} placeholder="Fuzzy search: CIF, name, alert, SR, EID…" value={q} onChange={(e) => setQ(e.target.value)} />
            <label className="check"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> My alerts</label>
            <Tabs value={scope} onChange={(s) => { setScope(s); setKf({}) }} tabs={[{ id: 'live', label: 'Live / ongoing' }, { id: 'history', label: 'History' }]} />
          </div>
        </div>
        <KpiFilters kpis={data.data?.kpis} value={kf} onChange={setKf} />
        <div className="card">
          {data.isLoading ? <Loading /> : (
            <DataTable cols={alertCols} rows={data.data?.rows ?? []} onRow={(a) => nav(`/alerts/${a.id}`)} selectable={canWork && scope === 'live'} selected={sel} onSelect={setSel}
              exportName={`alerts-${scope}`} rowClass={(a) => (a.overdue ? 'overdue' : '')} empty="No alerts match these filters." />
          )}
        </div>
      </div>
      {rebal && <RebalanceModal onClose={() => setRebal(false)} />}
    </>
  )
}

/** Manager / super user: preview, then apply, the balanced redistribution of unstarted alerts. */
function RebalanceModal({ onClose }: { onClose: () => void }) {
  const act = useAct()
  const [plan, setPlan] = useState<any>(null)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  useEffect(() => { api('/alerts/rebalance', { method: 'POST', body: { apply: false } }).then(setPlan, (e) => setErr(e.message)) }, [])
  const apply = async () => { const r = await act(() => api('/alerts/rebalance', { method: 'POST', body: { apply: true } }), 'Workload rebalanced'); if (r) { setPlan(r); setDone(true) } }
  const mix = (l: any) => ['High', 'Medium', 'Low'].map((p) => l.priority[p] ?? 0).join(' / ')
  const rows = plan?.analysts.filter((x: any) => x.before.total || x.after.total) ?? []
  return (
    <Modal title="Rebalance alert workload" wide onClose={onClose}
      footer={<>{!done && <button className="btn btn-accent" disabled={!plan?.moves.length} onClick={apply}>Move {plan?.moves.length ?? ''} alert(s)</button>}<button className="btn" onClick={onClose}>{done ? 'Close' : 'Cancel'}</button></>}>
      {err ? <div className="alert-box error">{err}</div> : !plan ? <Loading /> : (
        <div className="stack">
          <p className="small muted" style={{ margin: 0 }}>Open alerts are shared so each analyst has the same number, then the same High / Medium / Low mix, then a mix of fraud typologies. Only alerts nobody has started are moved; alerts of one customer stay with one analyst.</p>
          {done && <div className="alert-box info">Done: {plan.moves.length} alert(s) moved. Each analyst can see them under My alerts.</div>}
          <table className="tbl">
            <thead><tr><th>Analyst</th><th>Queue</th><th>Open alerts now</th><th>{done ? 'Open alerts after' : 'After rebalance'}</th><th>High / Medium / Low after</th><th>Typologies after</th></tr></thead>
            <tbody>{rows.map((x: any) => (
              <tr key={x.analyst}><td><b>{x.name}</b></td><td className="small">{x.dept}</td><td>{x.before.total}</td><td><b>{x.after.total}</b></td><td>{mix(x.after)}</td>
                <td className="small">{Object.entries(x.after.typology).sort((p: any, q: any) => q[1] - p[1]).map(([t, n]) => `${t} ${n}`).join(' · ') || '–'}</td></tr>
            ))}</tbody>
          </table>
          <div className="small muted">{plan.movable} unstarted open alert(s) can move · {plan.moves.length} will change analyst.</div>
          {plan.moves.length > 0 && (
            <details><summary className="small">Show the {plan.moves.length} move(s)</summary>
              <table className="tbl" style={{ marginTop: 6 }}><thead><tr><th>Alert</th><th>Customer</th><th>Priority</th><th>Typology</th><th>From</th><th>To</th></tr></thead>
                <tbody>{plan.moves.map((m: any) => <tr key={m.id}><td className="mono">{m.id}</td><td>{m.customer}</td><td><PriorityBadge p={m.priority} /></td><td>{m.typology}</td><td>{m.fromName ?? <span className="muted">Unassigned</span>}</td><td><b>{m.toName}</b></td></tr>)}</tbody></table>
            </details>
          )}
        </div>
      )}
    </Modal>
  )
}
