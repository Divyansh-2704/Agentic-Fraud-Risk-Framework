import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, useAct, useApi } from '../api'
import { KpiFilters, type KpiFilter } from '../components/KpiFilters'
import { hasRole, useMe } from '../components/Layout'
import { Badge, DataTable, fmtAed, fmtDateTime, fmtDur, Loading, PreventionChip, PriorityBadge, StatusBadge, Tabs, type Col } from '../components/ui'

export const alertCols: Col<any>[] = [
  { key: 'id', label: 'Alert ID', render: (a) => <span className="mono" style={{ fontWeight: 600 }}>{a.id}</span> },
  { key: 'rule', label: 'Rule ID / name', value: (a) => `${a.rule_id} ${a.rule_name}`, render: (a) => <div><div className="mono small">{a.rule_id}</div><div>{a.rule_name}</div></div> },
  { key: 'cif', label: 'CIF', render: (a) => <span className="mono">{a.cif}</span> },
  { key: 'customer_name', label: 'Name' },
  { key: 'category', label: 'Category', render: (a) => a.category === 'Prevention' ? <PreventionChip c={a.prevention_colour} /> : <Badge tone="outline">Detection</Badge> },
  { key: 'typology', label: 'Fraud typology' },
  { key: 'risk_score', label: 'Score', render: (a) => <b>{a.risk_score}</b> },
  { key: 'priority', label: 'Priority', render: (a) => <PriorityBadge p={a.priority} /> },
  { key: 'created_at', label: 'Date of alert', render: (a) => fmtDateTime(a.created_at) },
  { key: 'assigned_name', label: 'Assigned to', render: (a) => a.assigned_name ? <div>{a.assigned_name}<div className="small muted">{fmtDateTime(a.assigned_at)}</div></div> : <span className="muted">Unassigned</span> },
  { key: 'status', label: 'Status', render: (a) => <div className="stack" style={{ gap: 3 }}><StatusBadge s={a.status} />{a.case_id && <span className="small mono">{a.case_id}</span>}</div> },
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
  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs">Stage A · Alert management (FAMS, BRD section 4)</div>
          <h1>Alert queue</h1>
          <p>Alerts from DSP / SAS are ingested, enriched and triaged into department queues. Prevention alerts are always at the top.</p>
        </div>
        <div className="row">
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
    </>
  )
}
