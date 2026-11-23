import { useNavigate } from 'react-router-dom'
import { useApi } from '../api'
import { AiAssist } from '../components/AiAssist'
import { Badge, Card, DataTable, fmtAed, fmtDateTime, fmtDur, Kpi, Loading, PreventionChip, StatusBadge } from '../components/ui'

/** Sheet 3: prevention alerts fire before money moves; they jump the queue and run on a tight SLA (BRD 4.6). */
export function PreventionDesk() {
  const nav = useNavigate()
  const live = useApi<any>('/alerts?scope=live&category=Prevention', { refetchInterval: 15000 })
  const hist = useApi<any>('/alerts?scope=history&category=Prevention')
  if (live.isLoading) return <Loading />
  const rows = live.data?.rows ?? []
  const held = rows.filter((a: any) => a.held)
  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs">Stage A · Prevention alerts (BRD 4.6)</div>
          <h1>Prevention desk</h1>
          <p>Unified work area, prioritised over detection and auto-allocated. Grey (step-up) transactions are held until an analyst decides. SLA breaches escalate to the Fraud Ops Manager at once.</p>
        </div>
      </div>
      <div className="stack">
        <div className="kpis">
          <Kpi label="Open prevention alerts" value={rows.length} />
          <Kpi label="Held transactions" value={held.length} sub={fmtAed(held.reduce((s: number, a: any) => s + a.txn_amount, 0))} tone="accent" />
          <Kpi label="SLA breached" value={rows.filter((a: any) => a.overdue).length} tone="alarm" sub="Escalated to manager" />
          <Kpi label="Decided (history)" value={hist.data?.rows.length ?? 0} />
        </div>
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr) 300px' }}>
          <Card title="Work area: ranked by SLA risk" pad={false}>
            <DataTable rows={[...rows].sort((a: any, b: any) => (b.tat_ms / b.sla_ms) - (a.tat_ms / a.sla_ms))} onRow={(a) => nav(`/alerts/${a.id}`)} rowClass={(a) => (a.overdue ? 'overdue' : '')} exportName="prevention-open" cols={[
              { key: 'id', label: 'Alert', render: (a) => <span className="mono" style={{ fontWeight: 600 }}>{a.id}</span> },
              { key: 'prevention_colour', label: 'Code', render: (a) => <PreventionChip c={a.prevention_colour} /> },
              { key: 'customer_name', label: 'Customer' },
              { key: 'rule_name', label: 'Rule' },
              { key: 'txn_amount', label: 'Amount', render: (a) => <b>{fmtAed(a.txn_amount)}</b> },
              { key: 'held', label: 'Held', render: (a) => (a.held ? <Badge tone="grey">HELD</Badge> : '–') },
              { key: 'assigned_name', label: 'Analyst', render: (a) => a.assigned_name ?? <span className="muted">Unassigned</span> },
              { key: 'status', label: 'Status', render: (a) => <StatusBadge s={a.status} /> },
              { key: 'sla', label: 'SLA', value: (a) => a.tat_ms / a.sla_ms, render: (a) => <SlaBar a={a} /> },
            ]} empty="No prevention alerts waiting." />
          </Card>
          <div className="stack">
            <AiAssist surface="prevention" />
            <Card title="Colour codes (FR-ALT-050)">
              <div className="stack small">
                <div><PreventionChip c="Green" /> Allowed to go: review for pattern only</div>
                <div><PreventionChip c="Red" /> Blocked by the decision layer</div>
                <div><PreventionChip c="Grey" /> Step-up: transaction HELD for due diligence</div>
              </div>
            </Card>
          </div>
        </div>
        <Card title="Recent decisions" pad={false}>
          <DataTable rows={[...(hist.data?.rows ?? [])].sort((a: any, b: any) => String(b.closed_at ?? '').localeCompare(String(a.closed_at ?? '')))} onRow={(a) => nav(`/alerts/${a.id}`)} cols={[
            { key: 'id', label: 'Alert', render: (a) => <span className="mono">{a.id}</span> }, { key: 'customer_name', label: 'Customer' }, { key: 'prevention_colour', label: 'Code', render: (a) => <PreventionChip c={a.prevention_colour} /> },
            { key: 'decision', label: 'Decision', render: (a) => <Badge tone={a.decision === 'Reject' ? 'accent' : 'solid'}>{a.decision}</Badge> }, { key: 'sub_class', label: 'Reason' },
            { key: 'closed_at', label: 'Decided', render: (a) => fmtDateTime(a.closed_at) }, { key: 'tat_ms', label: 'Time to decide', render: (a) => fmtDur(a.tat_ms) }]} empty="No decided prevention alerts yet." />
        </Card>
      </div>
    </>
  )
}

function SlaBar({ a }: { a: any }) {
  const pct = Math.min(100, Math.round((a.tat_ms / a.sla_ms) * 100))
  return (
    <div style={{ minWidth: 110 }}>
      <div style={{ height: 6, borderRadius: 3, background: 'var(--blue-100)' }}><div style={{ width: `${pct}%`, height: 6, borderRadius: 3, background: a.overdue ? 'var(--red)' : pct > 70 ? 'var(--orange)' : 'var(--navy)' }} /></div>
      <div className="small" style={{ color: a.overdue ? 'var(--red)' : 'var(--muted)' }}>{a.overdue ? `Breached +${fmtDur(a.overdue_ms)}` : `${fmtDur(a.sla_ms - a.tat_ms)} left`}</div>
    </div>
  )
}
