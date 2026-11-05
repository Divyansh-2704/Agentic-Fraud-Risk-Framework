import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SCENARIO_CUSTOMERS, SCENARIO_GROUPS, SCENARIOS, TEST_USERS, type Scenario } from '../../../shared/src/scenarios'
import { api, setUserId, useAct, useApi } from '../api'
import { hasRole, useMe } from '../components/Layout'
import { Badge, Card, StatusBadge, Tabs } from '../components/ui'

const recordPath = (id: string) => (id.startsWith('ALT-') ? `/alerts/${id}` : `/cases/${id}`)
const NO_RECORD_START: Record<string, string> = { 'TC-C01': '/cases', 'TC-X02': '/alerts', 'TC-X03': '/process' }
const userName = (id: string) => TEST_USERS[id]?.name ?? id

/** Test-scenario pack: every alert / case situation of the agentic flow workbook, with fixed-ID records to start from. */
export function Scenarios() {
  const me = useMe()
  const act = useAct()
  const qc = useQueryClient()
  const nav = useNavigate()
  const st = useApi<Record<string, string | null>>('/scenarios/status', { refetchInterval: 20000 })
  const [group, setGroup] = useState('all')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const start = (s: Scenario) => { setUserId(s.startAs); qc.clear(); nav(s.records[0] ? recordPath(s.records[0]) : NO_RECORD_START[s.id] ?? '/') }
  const goAs = (user: string, path: string) => { setUserId(user); qc.clear(); nav(path) }
  const needle = q.trim().toLowerCase()
  const list = SCENARIOS.filter((s) => (group === 'all' || s.group === group) && (!needle || `${s.id} ${s.title} ${s.records.join(' ')} ${s.brd}`.toLowerCase().includes(needle)))
  const statusOf = (s: Scenario) => {
    if (!s.records.length) return <Badge tone="outline">Tester creates the record</Badge>
    const cur = st.data?.[s.records[0]]
    if (cur === undefined) return null
    if (cur === null) return <Badge tone="grey">Not present (deleted or not seeded)</Badge>
    return cur === s.startStatus ? <Badge tone="ok">Ready</Badge> : <span className="row" style={{ gap: 4 }}><Badge tone="orange">Already run</Badge><StatusBadge s={cur} /></span>
  }
  const ready = SCENARIOS.filter((s) => s.records.length && st.data?.[s.records[0]] === s.startStatus).length
  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs">Overview · UAT</div>
          <h1>Test scenarios</h1>
          <p>{SCENARIOS.length} scripted scenarios covering every alert and case situation in the flow workbook (Sheets 2 to 7) and the BRD. Each has its own synthetic customer and a fixed-ID record (ALT-TC-…, FC-TC-…, WB-TC-…) placed at the start of the test. Click <b>Start</b> to switch to the right user and open the record, then follow the steps.</p>
        </div>
        <div className="stack" style={{ alignItems: 'flex-end', gap: 6 }}>
          <div className="small muted">{ready} of {SCENARIOS.filter((s) => s.records.length).length} seeded scenarios ready</div>
          {hasRole(me, 'SUPER_USER')
            ? <button className="btn btn-accent" onClick={() => { if (confirm('Reset ALL demo data to the seeded state? Everything done since the last reset is lost.')) act(async () => { await api('/admin/reset', { method: 'POST' }); qc.clear() }, 'Demo data reset: all scenarios are ready') }}>Reset demo data</button>
            : <button className="btn btn-outline" onClick={() => goAs('u-super', '/scenarios')}>Switch to System Administrator to reset</button>}
        </div>
      </div>
      <div className="stack">
        <div className="row between">
          <Tabs value={group} onChange={setGroup} tabs={[{ id: 'all', label: 'All' }, ...SCENARIO_GROUPS.map((g) => ({ id: g, label: `${g.split(' · ')[0]} · ${g.split(' · ')[1].split(/[ ,]/)[0]}` }))]} />
          <input className="input" style={{ width: 280 }} placeholder="Search scenario, record or BRD ref…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {SCENARIO_GROUPS.filter((g) => list.some((s) => s.group === g)).map((g) => (
          <Card key={g} title={g} pad={false}>
            <div className="table-wrap"><table className="tbl">
              <thead><tr><th style={{ width: 82 }}>ID</th><th>Scenario</th><th style={{ width: 110 }}>Type</th><th style={{ width: 150 }}>Start as</th><th style={{ width: 150 }}>Record</th><th style={{ width: 170 }}>State</th><th style={{ width: 150 }} /></tr></thead>
              <tbody>
                {list.filter((s) => s.group === g).flatMap((s) => [
                  <tr key={s.id}>
                    <td className="mono" style={{ fontWeight: 600 }}>{s.id}</td>
                    <td><div style={{ fontWeight: 600 }}>{s.title}</div><div className="small muted">Sheet {s.sheet} · {s.brd}</div></td>
                    <td><Badge tone={s.kind === 'End-to-end' ? 'accent' : s.kind === 'Control check' ? 'solid' : s.kind === 'Edge case' ? 'orange' : 'outline'}>{s.kind}</Badge></td>
                    <td className="small">{userName(s.startAs)}</td>
                    <td className="mono small">{s.records.join(', ') || '–'}</td>
                    <td>{statusOf(s)}</td>
                    <td><div className="row" style={{ flexWrap: 'nowrap' }}><button className="btn btn-sm btn-accent" onClick={() => start(s)}>Start</button><button className="btn btn-sm btn-ghost" onClick={() => setOpen(open === s.id ? null : s.id)}>{open === s.id ? 'Hide' : 'Steps'}</button></div></td>
                  </tr>,
                  open === s.id && (
                    <tr key={`${s.id}-steps`}><td colSpan={7} style={{ background: 'var(--blue-50)' }}>
                      <div className="stack" style={{ gap: 10, padding: '6px 4px' }}>
                        <div className="small"><b>Setup:</b> {s.setup}{s.customer && <> · Customer <b>{SCENARIO_CUSTOMERS[s.customer]?.name}</b> (CIF <span className="mono">{s.customer}</span>, {SCENARIO_CUSTOMERS[s.customer]?.entity})</>}</div>
                        <div className="small"><b>Flow:</b> {s.flow}</div>
                        <table className="tbl" style={{ background: 'var(--surface, #fff)' }}>
                          <thead><tr><th style={{ width: 30 }}>#</th><th style={{ width: 150 }}>Log in as</th><th style={{ width: 170 }}>Where</th><th>Do</th><th>Expected result</th></tr></thead>
                          <tbody>{s.steps.map((x, i) => (
                            <tr key={i}><td>{i + 1}</td><td className="small"><a href="#" onClick={(e) => { e.preventDefault(); goAs(x.as, s.records[0] ? recordPath(s.records[0]) : NO_RECORD_START[s.id] ?? '/') }} title="Switch to this user">{userName(x.as)}</a></td><td className="small">{x.at}</td><td className="small">{x.do}</td><td className="small">{x.expect}</td></tr>
                          ))}</tbody>
                        </table>
                        <div className="small"><b>Pass criteria:</b> {s.expected}</div>
                      </div>
                    </td></tr>
                  ),
                ])}
              </tbody>
            </table></div>
          </Card>
        ))}
        {!list.length && <div className="empty">No scenario matches.</div>}
      </div>
    </>
  )
}
