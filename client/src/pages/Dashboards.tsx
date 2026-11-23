import { Fragment, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ENTITIES } from '../../../shared/src/index'
import { api, useAct, useApi } from '../api'
import { AiAssist } from '../components/AiAssist'
import { hasRole, useMe } from '../components/Layout'
import { Card, exportXlsx, Field, fmtAed, fmtDateTime, Kpi, Loading, Select, Tabs } from '../components/ui'

// Auronova categorical palette (indigo, amber, lavender, bronze), validated with the dataviz validator
// (light surface: all checks pass; contrast WARN relieved by value labels + table view). Fixed order, never cycled.
const C = { a: '#4A52B0', b: '#E89B1C', c: '#8C93D9', d: '#A8661B' }
const axis = { fontSize: 11, fill: '#5d6185' }
const grid = <CartesianGrid stroke="#eceef8" vertical={false} />
const tip = { contentStyle: { borderRadius: 4, border: '1px solid #e4e7f4', fontSize: 12 }, cursor: { fill: 'rgba(74,82,176,0.06)' } }

/** FR-CASE-0138..0149: pre-defined dashboards, filters, table + chart views, Excel export, TAT per actor. */
export function Dashboards() {
  const me = useMe()
  const act = useAct()
  const nav = useNavigate()
  const users = useApi<any[]>('/users')
  const [f, setF] = useState({ from: '', to: '', entity: '', user: '' })
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const q = useApi<any>(`/dashboard?${new URLSearchParams(Object.fromEntries(Object.entries(f).filter(([, v]) => v)))}`)
  const d = q.data
  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs">Insight</div>
          <h1>Reports & dashboards</h1>
          <p>Real-time, filtered by your Chinese-wall access. TAT excludes weekends and configured holidays.</p>
        </div>
        {hasRole(me, 'MANAGER', 'SUPER_USER') && <button className="btn btn-accent" onClick={() => act(() => api('/jobs/daily-sla-summary', { method: 'POST' }), 'Daily SLA breach summary emailed (cc managers)')}>Send daily SLA breach email</button>}
      </div>
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <Field label="From"><input className="input" type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
          <Field label="To"><input className="input" type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
          <div style={{ width: 140 }}><Field label="Entity"><Select value={f.entity} onChange={(v) => setF({ ...f, entity: v })} placeholder="All" options={ENTITIES} /></Field></div>
          <div style={{ width: 210 }}><Field label="User"><Select value={f.user} onChange={(v) => setF({ ...f, user: v })} placeholder="All users" options={(users.data ?? []).map((u) => ({ value: u.id, label: u.name }))} /></Field></div>
          <span className="spacer" />
          <Tabs value={view} onChange={(v) => setView(v as any)} tabs={[{ id: 'chart', label: 'Charts' }, { id: 'table', label: 'Tables' }]} />
        </div>
      </div>
      {!d ? <Loading /> : (
        <div className="stack">
          <div className="kpis">
            <Kpi label="Open alerts" value={d.kpis.openAlerts} onClick={() => nav('/alerts')} />
            <Kpi label="Overdue alerts" value={d.kpis.overdueAlerts} tone="alarm" onClick={() => nav('/alerts')} />
            <Kpi label="Held transactions" value={d.kpis.heldTxns} onClick={() => nav('/prevention')} />
            <Kpi label="Open cases" value={d.kpis.openCases} onClick={() => nav('/cases')} />
            <Kpi label="Closed cases" value={d.kpis.closedCases} />
            <Kpi label="False-positive rate" value={`${d.kpis.fpRate}%`} sub="of closed alerts" tone="accent" />
            <Kpi label="Avg alert TAT" value={`${d.kpis.avgAlertTatH} h`} />
            <Kpi label="Net loss" value={fmtAed(d.kpis.netLossAed)} sub={`Recovered ${fmtAed(d.kpis.recoveredAed)}`} tone="accent" />
          </div>
          <div className="grid g2">
            <Panel title="Alert volume: last 14 days" view={view} rows={d.trend} cols={[['date', 'Date'], ['detection', 'Detection'], ['prevention', 'Prevention']]} name="alert-trend">
              <BarChart data={d.trend} barGap={2}>{grid}<XAxis dataKey="date" tick={axis} tickLine={false} axisLine={false} /><YAxis tick={axis} tickLine={false} axisLine={false} allowDecimals={false} width={28} /><Tooltip {...tip} /><Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="detection" name="Detection" stackId="a" fill={C.a} stroke="#fff" strokeWidth={2} /><Bar dataKey="prevention" name="Prevention" stackId="a" fill={C.b} radius={[4, 4, 0, 0]} stroke="#fff" strokeWidth={2} /></BarChart>
            </Panel>
            <Panel title="Cases by status" view={view} rows={d.casesByStatus} cols={[['name', 'Status'], ['value', 'Cases']]} name="cases-status" onRow={() => nav('/cases')}>
              <HBar data={d.casesByStatus} fill={C.a} onClick={() => nav('/cases')} />
            </Panel>
            <Panel title="Average business hours spent per stage (TAT per actor, FR-CASE-0141)" view={view} rows={d.tatByStage} cols={[['stage', 'Stage'], ['avgHours', 'Avg hours'], ['count', 'Transitions']]} name="tat-stage">
              <HBar data={d.tatByStage.map((s: any) => ({ name: s.stage, value: s.avgHours }))} fill={C.b} unit=" h" />
            </Panel>
            <Panel title="Cases by risk category (L1)" view={view} rows={d.casesByRisk} cols={[['name', 'Risk category'], ['value', 'Cases']]} name="cases-risk">
              <HBar data={d.casesByRisk} fill={C.a} />
            </Panel>
          </div>
          <div className="grid g2">
            <Card title="Rule precision: feedback to DSP" pad={false} actions={<button className="btn btn-sm" onClick={() => exportXlsx(d.rulePrecision, 'rule-precision')}>Export</button>}>
              <table className="tbl"><thead><tr><th>Rule</th><th>Closed</th><th>Fraud</th><th>False +ve</th><th title="Closed in the last 7 days (of which false positive)">Last 7 days</th><th>Last decision</th><th style={{ width: 140 }}>Precision</th></tr></thead>
                <tbody>{d.rulePrecision.map((r: any) => <tr key={r.rule}><td><span className="mono small">{r.rule}</span><div className="small muted">{r.name}</div></td><td>{r.closed}</td><td>{r.fraud}</td><td>{r.fp}</td><td className="small">{r.closed7d ? <>{r.closed7d} closed<div className="muted">{r.fp7d} false +ve</div></> : <span className="muted">–</span>}</td><td className="small">{fmtDateTime(r.lastDecisionAt)}</td><td><Meter pct={r.precision} /></td></tr>)}</tbody></table>
              <div className="small muted" style={{ padding: '8px 12px' }}>Use the date filter above to compare periods; "Last 7 days" shows how recent decisions moved each rule.</div>
            </Card>
            <Card title="TAT per actor (business hours)" pad={false} actions={<button className="btn btn-sm" onClick={() => exportXlsx(d.tatByActor, 'tat-by-actor')}>Export</button>}>
              <table className="tbl"><thead><tr><th>Actor</th><th>Actions</th><th>Avg hours per stage</th></tr></thead>
                <tbody>{d.tatByActor.map((r: any) => <tr key={r.actor}><td>{r.actor}</td><td>{r.actions}</td><td>{r.avgHours}</td></tr>)}</tbody></table>
            </Card>
          </div>
          <div className="grid g3">
            <Card title="Prevention MI (FR-ALT-055)">
              <dl className="kv"><dt>Held now</dt><dd>{d.preventionMi.held}</dd><dt>SLA breached</dt><dd style={{ color: 'var(--red)' }}>{d.preventionMi.breached}</dd><dt>Avg time to decide</dt><dd>{d.preventionMi.avgDecisionMin} min</dd>
                {d.preventionMi.colour.map((c: any) => <Fragment key={c.name}><dt>Code {c.name}</dt><dd>{c.value}</dd></Fragment>)}
                {d.preventionMi.decided.map((c: any) => <Fragment key={`d-${c.name}`}><dt>Decided: {c.name}</dt><dd>{c.value}</dd></Fragment>)}</dl>
            </Card>
            <Card title="Open workload by user" pad={false}>
              <table className="tbl"><thead><tr><th>User</th><th>Alerts</th><th>Cases</th></tr></thead><tbody>{d.workload.map((w: any) => <tr key={w.user}><td>{w.user}</td><td>{w.alerts}</td><td>{w.cases}</td></tr>)}</tbody></table>
            </Card>
            <Card title="Pending & overdue (FR-CASE-0146)" pad={false}>
              <table className="tbl"><thead><tr><th>Alert</th><th>Customer</th><th>Overdue</th></tr></thead>
                <tbody>{d.overdueList.map((o: any) => <tr key={o.id} className="clickable" onClick={() => nav(`/alerts/${o.id}`)}><td className="mono small">{o.id}</td><td>{o.customer}<div className="small muted">{o.category} · {o.assigned ?? 'unassigned'}</div></td><td style={{ color: 'var(--red)', fontWeight: 600 }}>+{o.overdueH}h</td></tr>)}</tbody></table>
            </Card>
          </div>
          <Card title="Financial impact across visible cases">
            <div className="kpis">{[['Attempted', d.financial.attempted], ['Successful', d.financial.successful], ['Gross loss', d.financial.gross], ['Recovered', d.financial.recovery], ['Net loss', d.financial.net]].map(([l, v]) => <Kpi key={l as string} label={l as string} value={fmtAed(v)} />)}</div>
          </Card>
          <AiAssist surface="dashboard" />
        </div>
      )}
    </>
  )
}

function Panel({ title, view, rows, cols, name, children, onRow }: { title: string; view: 'chart' | 'table'; rows: any[]; cols: [string, string][]; name: string; children: ReactNode; onRow?: () => void }) {
  return (
    <Card title={title} actions={<button className="btn btn-sm btn-ghost" onClick={() => exportXlsx(rows.map((r) => Object.fromEntries(cols.map(([k, l]) => [l, r[k]]))), name)}>Export</button>}>
      {!rows.length ? <div className="empty">No data for these filters.</div> : view === 'chart'
        ? <div style={{ height: 260 }}><ResponsiveContainer>{children as any}</ResponsiveContainer></div>
        : <table className="tbl"><thead><tr>{cols.map(([, l]) => <th key={l}>{l}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i} className={onRow ? 'clickable' : ''} onClick={onRow}>{cols.map(([k]) => <td key={k}>{r[k]}</td>)}</tr>)}</tbody></table>}
    </Card>
  )
}

// ResponsiveContainer injects width/height into its direct child; forward them to the chart.
function HBar({ data, fill, unit = '', onClick, width, height }: { data: { name: string; value: number }[]; fill: string; unit?: string; onClick?: () => void; width?: number; height?: number }) {
  return (
    <BarChart width={width} height={height} data={data} layout="vertical" margin={{ left: 8, right: 28 }}>
      <CartesianGrid stroke="#eceef8" horizontal={false} />
      <XAxis type="number" tick={axis} tickLine={false} axisLine={false} allowDecimals={false} />
      <YAxis type="category" dataKey="name" tick={axis} tickLine={false} axisLine={false} width={170} />
      <Tooltip {...tip} formatter={(v: any) => [`${v}${unit}`, '']} />
      <Bar dataKey="value" fill={fill} radius={[0, 4, 4, 0]} barSize={14} onClick={onClick} label={{ position: 'right', fontSize: 11, fill: '#1c2045', formatter: (v: any) => `${v}${unit}` }} style={{ cursor: onClick ? 'pointer' : 'default' }} />
    </BarChart>
  )
}

const Meter = ({ pct }: { pct: number }) => (
  <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
    <div style={{ flex: 1, height: 6, background: 'var(--blue-100)', borderRadius: 3 }}><div style={{ width: `${pct}%`, height: 6, borderRadius: 3, background: pct < 30 ? 'var(--orange)' : 'var(--blue-500)' }} /></div>
    <span className="small" style={{ width: 34, textAlign: 'right' }}>{pct}%</span>
  </div>
)
