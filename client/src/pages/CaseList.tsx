import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, useAct, useApi } from '../api'
import { KpiFilters, type KpiFilter } from '../components/KpiFilters'
import { hasRole, useMe } from '../components/Layout'
import { Badge, DataTable, Field, fmtDateTime, fmtDur, Loading, Modal, PriorityBadge, StatusBadge, Tabs, type Col } from '../components/ui'

const OWNER_LABEL: Record<string, string> = { FO_MAKER: 'Fraud Ops Maker', FO_CHECKER: 'Fraud Ops Checker', FPI_INVESTIGATOR: 'FP&I Investigator', FPI_REVIEWER: 'FP&I Reviewer', FPI_APPROVER: 'FP&I Approver', HR_GOV: 'HR / Governance', NONE: '–' }
export const ownerLabel = (o: string) => OWNER_LABEL[o] ?? o

export const caseCols: Col<any>[] = [
  { key: 'id', label: 'Case ID', render: (c) => <div><span className="mono" style={{ fontWeight: 600 }}>{c.id}</span>{c.type === 'WHISTLEBLOWER' && <div><Badge tone="orange">Whistleblower</Badge></div>}</div> },
  { key: 'entity', label: 'Entity' },
  { key: 'cif', label: 'CIF', render: (c) => <span className="mono">{c.cif ?? '–'}</span> },
  { key: 'customer_name', label: 'Name', render: (c) => c.customer_name ?? '–' },
  { key: 'risk', label: 'Fraud typology / risk', value: (c) => `${c.risk_l1 ?? ''} ${c.typology ?? ''}`, render: (c) => <div><div>{c.risk_l1 ?? <span className="muted">Unclassified</span>}</div><div className="small muted">{c.risk_title ?? c.typology ?? ''}</div></div> },
  { key: 'risk_score', label: 'Score', render: (c) => c.risk_score ?? '–' },
  { key: 'priority', label: 'Priority', render: (c) => <PriorityBadge p={c.priority} /> },
  { key: 'created_at', label: 'Created', render: (c) => fmtDateTime(c.created_at) },
  { key: 'owner', label: 'Desk', render: (c) => <span className="small">{ownerLabel(c.owner)}</span> },
  { key: 'assigned_name', label: 'Assigned to', render: (c) => c.assigned_name ? <div>{c.assigned_name}<div className="small muted">{fmtDateTime(c.assigned_at)}</div></div> : <span className="muted">In pool</span> },
  { key: 'status', label: 'Case status', render: (c) => <div className="stack" style={{ gap: 3 }}><StatusBadge s={c.status} />{c.returned_count > 0 && <span className="small" style={{ color: 'var(--red)' }}>↺ returned {c.returned_count}×</span>}</div> },
  { key: 'tat_ms', label: 'TAT', render: (c) => <span style={{ color: c.overdue ? 'var(--red)' : undefined }}>{fmtDur(c.tat_ms)}</span> },
]

export function CaseList({ whistleblower }: { whistleblower?: boolean }) {
  const me = useMe()
  const nav = useNavigate()
  const [view, setView] = useState('work')
  const [q, setQ] = useState('')
  const [kf, setKf] = useState<KpiFilter>({})
  const [creating, setCreating] = useState(false)
  const scope = view === 'history' ? 'history' : 'live'
  const params = new URLSearchParams({ scope, ...(view === 'mine' ? { view: 'mine' } : view === 'pool' ? { view: 'pool' } : {}), ...(whistleblower ? { type: 'WHISTLEBLOWER' } : {}), ...(q ? { q } : {}), ...Object.fromEntries(Object.entries(kf).filter(([, v]) => v)) as any })
  const data = useApi<any>(`/cases?${params}`)
  const canCreate = whistleblower ? me.roles.some((r) => r.startsWith('FPI_')) : hasRole(me, 'FO_MAKER', 'FO_ANALYST', 'FPI_INVESTIGATOR', 'FPI_REVIEWER', 'FPI_APPROVER')
  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs">Stage B · Fraud case management (FCMS, BRD section 5)</div>
          <h1>{whistleblower ? 'Whistleblower cases' : 'Fraud cases'}</h1>
          <p>{whistleblower ? 'FP&I creates the case and routes it to HR / Governance, who investigate and close it. Fraud Ops is skipped (Sheet 6).' : 'Maker prepares → a different Checker approves → routing rules close or send to FP&I → Investigator → Reviewer → Approver → final report.'}</p>
        </div>
        {canCreate && <button className="btn btn-accent" onClick={() => setCreating(true)}>+ New {whistleblower ? 'whistleblower ' : ''}case</button>}
      </div>
      <div className="stack">
        <div className="row between">
          <Tabs value={view} onChange={(v) => { setView(v); setKf({}) }} tabs={[{ id: 'work', label: 'All live' }, { id: 'mine', label: 'Assigned to me' }, { id: 'pool', label: 'My pool (to pick up)' }, { id: 'history', label: 'History' }]} />
          <input className="input" style={{ width: 300 }} placeholder="Fuzzy search: CIF, name, case, SR, EID, TL…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <KpiFilters kpis={data.data?.kpis} value={kf} onChange={setKf} />
        <div className="card">
          {data.isLoading ? <Loading /> : <DataTable cols={caseCols} rows={data.data?.rows ?? []} onRow={(c) => nav(`/cases/${c.id}`)} exportName={`cases-${view}`} rowClass={(c) => (c.overdue ? 'overdue' : '')} empty={view === 'pool' ? 'Nothing waiting in your pool.' : 'No cases match.'} />}
        </div>
      </div>
      {creating && <NewCase whistleblower={whistleblower} onClose={() => setCreating(false)} />}
    </>
  )
}

function NewCase({ whistleblower, onClose }: { whistleblower?: boolean; onClose: () => void }) {
  const me = useMe()
  const act = useAct()
  const nav = useNavigate()
  const [cif, setCif] = useState('')
  const [desc, setDesc] = useState('')
  const fromFpi = me.roles.some((r) => r.startsWith('FPI_')) && !whistleblower
  return (
    <Modal title={whistleblower ? 'New whistleblower case' : 'New fraud case (manual)'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!desc.trim()} onClick={async () => { const r = await act(() => api<{ id: string }>('/cases', { method: 'POST', body: { type: whistleblower ? 'WHISTLEBLOWER' : 'STANDARD', cif: cif || undefined, description: desc } }), 'Case created'); if (r) nav(`/cases/${r.id}`) }}>Create case</button></>}>
      <div className="stack">
        {fromFpi && <div className="alert-box info">As FP&amp;I, this sends the case to the Fraud Ops Maker pool for initial checks and precautionary steps (FR-CASE-02). Fraud Ops is emailed.</div>}
        {whistleblower && <div className="alert-box info">Whistleblower cases skip Fraud Ops. Attach documents, then route to HR / Governance.</div>}
        {!whistleblower && <Field label="Customer CIF" hint="Customer details are sourced automatically from core banking."><input className="input" value={cif} onChange={(e) => setCif(e.target.value)} placeholder="e.g. 1007919" /></Field>}
        <Field label={whistleblower ? 'Allegation / report' : 'Case description'} req><textarea maxLength={5000} value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
      </div>
    </Modal>
  )
}
