import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ALERT_SUBCLASS, PRECAUTION_CATALOGUE, PREVENTION_DECISIONS } from '../../../shared/src/index'
import { api, useAct, useApi } from '../api'
import { AiVerdictCard, AiVerdictRail } from '../components/AiVerdict'
import { EvidenceUpload } from '../components/Evidence'
import { hasRole, useMe } from '../components/Layout'
import { Badge, Card, CommentModal, DataTable, ErrorBox, Field, fmtAed, fmtDate, fmtDateTime, fmtDur, Loading, Modal, PreventionChip, PriorityBadge, Select, StatusBadge } from '../components/ui'

export function AlertWorkspace() {
  const { id } = useParams()
  const ws = useApi<any>(`/alerts/${id}`)
  const meta = useApi<any>('/meta')
  if (ws.isLoading) return <Loading />
  if (ws.error) return <ErrorBox error={ws.error} />
  const d = ws.data
  const a = d.alert
  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs"><Link to="/alerts">Alert queue</Link> / {a.id}</div>
          <h1 className="row">{a.id} <StatusBadge s={a.status} /> <PriorityBadge p={a.priority} /> {a.category === 'Prevention' ? <PreventionChip c={a.prevention_colour} /> : <Badge tone="outline">Detection · {a.mode}</Badge>} {a.held && <Badge tone="grey">Transaction HELD</Badge>}</h1>
          <p>{a.customer_name} · CIF <span className="mono">{a.cif}</span> · {a.alert_type} · {a.review_team} queue · {a.level} ({a.complexity})</p>
        </div>
        <div className="stack" style={{ alignItems: 'flex-end', gap: 4 }}>
          <div className="small muted">TAT (re-schedule time excluded)</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: a.overdue ? 'var(--red)' : 'var(--navy)' }}>{fmtDur(a.tat_ms)} <span className="small muted">/ SLA {fmtDur(a.sla_ms)}</span></div>
          {a.overdue && <Badge tone="red">Overdue by {fmtDur(a.overdue_ms)}</Badge>}
        </div>
      </div>
      <div className="ws">
        <nav className="sidepanel card card-pad" aria-label="Alert sections">
          {[['ai', 'AI recommendation'], ['alert', 'Alert record'], ['customer', 'Customer'], ['history', `Last ${d.history.length} alerts`], ['txns', 'Transactions (3 months)'], ['accounts', 'Other accounts'], ['steps', 'Precautionary steps'], ['notes', 'Notes & references'], ['evidence', 'Evidence'], ['activity', 'Activity & emails']].map(([k, l]) => <a key={k} href={`#${k}`}>{l}</a>)}
        </nav>
        <div className="stack">
          {a.dq_exceptions.length > 0 && <div className="alert-box warn"><b>Data quality exception:</b> missing {a.dq_exceptions.join(', ')} (FR-ALT-03)</div>}
          {d.sameCustomerOpen.length > 0 && <div className="alert-box info">{d.sameCustomerOpen.length} other open alert(s) for this customer: {d.sameCustomerOpen.map((x: any) => <Link key={x.id} to={`/alerts/${x.id}`} className="mono" style={{ marginRight: 8 }}>{x.id}</Link>)}. You can decide them together (FR-ALT-011).</div>}
          <AiVerdictCard alertId={a.id} />
          <AlertRecord d={d} />
          <Card title="Customer" id="customer">
            {d.customer ? (
              <dl className="kv">
                <dt>Name</dt><dd>{d.customer.name}</dd><dt>CIF</dt><dd className="mono">{d.customer.cif}</dd><dt>Entity</dt><dd>{d.customer.entity}</dd>
                <dt>Segment</dt><dd>{d.customer.segment}</dd><dt>RM</dt><dd>{d.customer.rm ?? '–'}</dd><dt>National ID</dt><dd className="mono">{d.customer.eid}</dd>
                <dt>Passport</dt><dd className="mono">{d.customer.passport}</dd><dt>Trade licence</dt><dd>{d.customer.tl ?? '–'}</dd><dt>Nationality</dt><dd>{d.customer.nationality}</dd>
                <dt>Linked CIFs</dt><dd>{d.customer.linked_cifs.length ? d.customer.linked_cifs.join(', ') : 'None'}</dd>
              </dl>
            ) : <div className="muted">Customer not found in Feature Store.</div>}
          </Card>
          <Card title={`Last ${d.history.length} alerts for this customer`} id="history" pad={false}>
            <DataTable rows={d.history} onRow={(x) => window.location.assign(`/alerts/${x.id}`)} cols={[
              { key: 'id', label: 'Alert', render: (x) => <span className="mono">{x.id}</span> }, { key: 'rule_name', label: 'Rule' }, { key: 'created_at', label: 'Date', render: (x) => fmtDate(x.created_at) },
              { key: 'status', label: 'Status', render: (x) => <StatusBadge s={x.status} /> }, { key: 'decision', label: 'Decision', render: (x) => x.decision ? `${x.decision} / ${x.sub_class}` : '–' }]} empty="No previous alerts." />
          </Card>
          <Card title="Transactions: last 3 months (Feature Store)" id="txns" pad={false}>
            <DataTable rows={d.transactions} maxHeight={420} exportName={`${a.id}-transactions`} rowClass={(t) => (t.id === a.txn_ref ? 'sel' : '')} cols={[
              { key: 'id', label: 'Transaction ID', render: (t) => <span className="mono small">{t.id}</span> }, { key: 'date', label: 'Date', render: (t) => fmtDateTime(t.date) },
              { key: 'type', label: 'Type' }, { key: 'balance', label: 'Balance', render: (t) => fmtAed(t.balance) },
              { key: 'amount', label: 'Amount', render: (t) => <b style={{ color: t.amount < 0 ? 'var(--navy-900)' : 'var(--ok)' }}>{t.currency} {t.amount.toLocaleString()}</b> },
              { key: 'account', label: 'Account / IBAN', render: (t) => <span className="mono small">{t.account}</span> }, { key: 'counterparty', label: 'Counterparty' }]} />
          </Card>
          <Card title="Other accounts of the customer (CIF / linked CIFs)" id="accounts" pad={false}>
            <DataTable rows={d.otherAccounts.map((o: any) => ({ ...o, id: o.account }))} cols={[{ key: 'cif', label: 'CIF' }, { key: 'name', label: 'Name' }, { key: 'account', label: 'Account', render: (o) => <span className="mono">{o.account}</span> }, { key: 'entity', label: 'Entity' }]} />
          </Card>
          <Precautions d={d} />
          <NotesCard d={d} />
          <Card title="Evidence" id="evidence">
            <EvidenceList items={d.evidence} />
            {a.status !== 'Closed' && a.assigned_to && <EvidenceUpload path={`/alerts/${a.id}/evidence`} />}
          </Card>
          <Card title="Activity log & system emails" id="activity">
            <ul className="timeline">
              {d.events.map((e: any) => <li key={e.id} className={e.to_status === 'Closed' ? 'close' : ''}><div><b>{e.action}</b> {e.to_status && e.from_status !== e.to_status && <StatusBadge s={e.to_status} />}</div><div className="t-when">{fmtDateTime(e.ts)} · {e.actor_name}</div>{e.comment && <div className="small" style={{ whiteSpace: 'pre-wrap' }}>{e.comment}</div>}</li>)}
            </ul>
            {d.emails.length > 0 && <><div className="hr" /><h3>Emails ({d.emails.length})</h3>{d.emails.map((m: any) => <div key={m.id} className="small" style={{ marginTop: 6 }}><b>{m.subject}</b> · to {m.to_addr} · {fmtDateTime(m.ts)}</div>)}</>}
          </Card>
        </div>
        <div className="stack rail">
          <ActionPanel d={d} meta={meta.data} />
          <AiVerdictRail alertId={a.id} />
        </div>
      </div>
    </>
  )
}

function AlertRecord({ d }: { d: any }) {
  const a = d.alert
  const [raw, setRaw] = useState(false)
  return (
    <Card title="Alert record" id="alert" actions={<button className="btn btn-sm btn-ghost" onClick={() => setRaw(true)}>Raw DSP payload</button>}>
      <dl className="kv">
        <dt>Alert date / time</dt><dd>{fmtDateTime(a.created_at)}</dd><dt>Risk score</dt><dd><b>{a.risk_score}</b></dd>
        <dt>Scenario</dt><dd>{a.scenario_id}: {a.scenario_desc}</dd><dt>Rule</dt><dd>{a.rule_id}: {a.rule_name}</dd>
        <dt>Rule condition</dt><dd className="mono small">{a.rule_condition || '–'}</dd><dt>Decision layer</dt><dd>{a.decision_layer || '–'}</dd>
        <dt>Alert type / typology</dt><dd>{a.alert_type} / {a.typology}</dd><dt>Transaction amount</dt><dd><b>{fmtAed(a.txn_amount)}</b></dd>
        <dt>Available balance</dt><dd>{a.available_balance === null ? '–' : fmtAed(a.available_balance)}</dd><dt>Account</dt><dd className="mono">{a.account}</dd>
        <dt>Transaction ref</dt><dd className="mono">{a.txn_ref ?? '–'}</dd><dt>Alert on</dt><dd>{a.alert_on}</dd>
        <dt>Alerted entity type</dt><dd><Badge tone="orange">{a.alerted_entity_type}</Badge></dd><dt>Device ID</dt><dd className="mono">{a.device_id ?? '–'}</dd>
        <dt>Beneficiary account</dt><dd className="mono">{a.beneficiary_account ?? '–'}</dd><dt>EDD SR / status</dt><dd>{a.edd_sr ? `${a.edd_sr} · ${a.sr_status}` : '–'}</dd>
        <dt>Re-schedules</dt><dd>{a.reschedule_count} / 3</dd><dt>Serviced by</dt><dd>{a.serviced_by ?? '–'}</dd>
        {a.decision && <><dt>Decision</dt><dd><b>{a.decision}</b> / {a.sub_class}<div className="small">{a.rationale}</div></dd></>}
        {a.fpi_referral && <><dt>FP&amp;I referral</dt><dd className="small">{a.fpi_referral}</dd></>}
        {a.fpi_response && <><dt>FP&amp;I response</dt><dd className="small"><b>{a.fpi_response}</b></dd></>}
        {a.edd_response && <><dt>EDD outcome (CRM)</dt><dd className="small"><b>{a.edd_response}</b></dd></>}
        {a.case_id && <><dt>Case</dt><dd><Link to={`/cases/${a.case_id}`} className="mono">{a.case_id}</Link></dd></>}
      </dl>
      {raw && <Modal title="Raw payload from rule engine (immutable, FR-ALT-05)" onClose={() => setRaw(false)} wide><pre className="mono" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{JSON.stringify(d.rawPayload, null, 2)}</pre></Modal>}
    </Card>
  )
}

function Precautions({ d }: { d: any }) {
  const me = useMe()
  const act = useAct()
  const a = d.alert
  const editable = a.assigned_to === me.id && a.status !== 'Closed'
  const [rows, setRows] = useState<any[]>(d.actions)
  const [add, setAdd] = useState('')
  useEffect(() => setRows(d.actions), [d.actions])
  const dirty = JSON.stringify(rows) !== JSON.stringify(d.actions)
  const cats = useMemo(() => [...new Set(rows.map((r) => r.category))], [rows])
  return (
    <Card title="Precautionary steps already taken" id="steps" actions={editable && <button className="btn btn-sm btn-primary" disabled={!dirty} onClick={() => act(() => api(`/alerts/${a.id}/precautions`, { method: 'PUT', body: { steps: rows } }), 'Precautionary steps saved')}>Save steps</button>}>
      <p className="small muted" style={{ marginTop: 0 }}>Pre-filled from the alert type (FR-ALT-021). Untick a step that does not apply. Add more from the catalogue (FR-ALT-019/020). Automatic precautionary actions are out of scope: record what was done.</p>
      {cats.map((cat) => (
        <div key={cat} style={{ marginBottom: 10 }}>
          <div className="kpi-label" style={{ marginBottom: 4 }}>{cat}</div>
          {rows.map((r, i) => r.category !== cat ? null : (
            <div key={r.id ?? `n${i}`} className="row" style={{ padding: '6px 0', borderBottom: '1px solid #eef3f8', alignItems: 'flex-start' }}>
              <label className="check" style={{ minWidth: 280 }}><input type="checkbox" disabled={!editable} checked={r.selected} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, selected: e.target.checked } : x)))} />{r.step}{r.prefilled && <Badge tone="outline">pre-filled</Badge>}</label>
              {(PRECAUTION_CATALOGUE.find((s) => s.step === r.step)?.fields ?? []).map((f) => (
                <input key={f} className="input" style={{ width: 170 }} placeholder={f} disabled={!editable || !r.selected} type={f === 'Date' ? 'date' : 'text'} value={r.vals?.[f] ?? ''} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, vals: { ...x.vals, [f]: e.target.value } } : x)))} />
              ))}
            </div>
          ))}
        </div>
      ))}
      {!rows.length && <div className="muted">No steps recorded.</div>}
      {editable && (
        <div className="row" style={{ marginTop: 8 }}>
          <div style={{ width: 380 }}><Select value={add} onChange={setAdd} placeholder="Add a precautionary step…" options={PRECAUTION_CATALOGUE.filter((s) => !rows.some((r) => r.step === s.step)).map((s) => ({ value: s.step, label: `${s.category}: ${s.step}` }))} /></div>
          <button className="btn btn-sm" disabled={!add} onClick={() => { const s = PRECAUTION_CATALOGUE.find((x) => x.step === add)!; setRows([...rows, { category: s.category, step: s.step, selected: true, prefilled: false, vals: {} }]); setAdd('') }}>Add</button>
        </div>
      )}
    </Card>
  )
}

function NotesCard({ d }: { d: any }) {
  const me = useMe()
  const act = useAct()
  const a = d.alert
  const editable = a.assigned_to === me.id && a.status !== 'Closed'
  const [f, setF] = useState({ notes: a.notes ?? '', ref_ids: a.ref_ids ?? '', potential_savings: a.potential_savings ?? '', linked_account: a.linked_account ?? '' })
  return (
    <Card title="Notes, references & potential savings" id="notes" actions={editable && <button className="btn btn-sm btn-primary" onClick={() => act(() => api(`/alerts/${a.id}`, { method: 'PUT', body: { ...f, potential_savings: f.potential_savings === '' ? null : Number(f.potential_savings) } }), 'Saved')}>Save</button>}>
      <div className="form-grid">
        <Field label="Potential savings (AED)"><input className="input" type="number" disabled={!editable} value={f.potential_savings} onChange={(e) => setF({ ...f, potential_savings: e.target.value })} /></Field>
        <Field label="Reference IDs (RMFC, Siebel CRM…)"><input className="input" disabled={!editable} value={f.ref_ids} onChange={(e) => setF({ ...f, ref_ids: e.target.value })} /></Field>
        <Field label="Linked account found"><input className="input" disabled={!editable} value={f.linked_account} onChange={(e) => setF({ ...f, linked_account: e.target.value })} /></Field>
      </div>
      <div style={{ marginTop: 12 }}><Field label="Analyst notes"><textarea disabled={!editable} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field></div>
    </Card>
  )
}

export function EvidenceList({ items }: { items: any[] }) {
  if (!items.length) return <div className="muted small">No documents attached.</div>
  return (
    <table className="tbl"><thead><tr><th>Folder</th><th>Document</th><th>Source</th><th>Uploaded</th></tr></thead>
      <tbody>{items.map((e) => <tr key={e.id}><td>{e.folder}</td><td>{e.path ? <a href="#" onClick={(ev) => { ev.preventDefault(); import('../api').then((m) => m.download(`/evidence/${e.id}/download`, e.name)) }}>{e.name}</a> : e.name}{e.checklist_id && <div className="small muted">Checklist {e.checklist_id}</div>}</td><td><Badge tone={e.source === 'Maktaba' ? 'orange' : e.source === 'System' ? 'solid' : 'outline'}>{e.source}</Badge></td><td className="small">{fmtDateTime(e.uploaded_at)}<div className="muted">{e.uploaded_by_name ?? e.uploaded_by}</div></td></tr>)}</tbody>
    </table>
  )
}

function ActionPanel({ d, meta }: { d: any; meta: any }) {
  const me = useMe()
  const nav = useNavigate()
  const act = useAct()
  const a = d.alert
  const [modal, setModal] = useState<null | 'refer' | 'reassign' | 'fpi'>(null)
  const [decision, setDecision] = useState('')
  const [sub, setSub] = useState('')
  const [rationale, setRationale] = useState('')
  const [also, setAlso] = useState<string[]>([])
  const [target, setTarget] = useState('')
  const mine = a.assigned_to === me.id
  const deptRole = a.dept === 'FRAUD_OPS' ? 'FO_ANALYST' : a.dept === 'GOVERNANCE' ? 'GOVERNANCE' : 'HR'
  const canWork = hasRole(me, deptRole)
  const isFpi = me.roles.some((r) => r.startsWith('FPI_'))
  const run = (body: any, msg: string) => act(() => api(`/alerts/${a.id}/act`, { method: 'POST', body }), msg)
  const isPrev = a.category === 'Prevention'
  const subs = isPrev ? (PREVENTION_DECISIONS as any)[decision] ?? [] : (ALERT_SUBCLASS as any)[decision] ?? []
  const groupable = d.sameCustomerOpen.filter((x: any) => !x.assigned_to || x.assigned_to === me.id).filter((x: any) => x.category === a.category)

  return (
    <Card title="Actions">
      <div className="stack">
        {a.status === 'Closed' ? (
          <>
            <div className="alert-box ok">Closed: <b>{a.decision}</b> / {a.sub_class}. Decision sent back to DSP and CRM.</div>
            {a.case_id ? <Link className="btn btn-primary" to={`/cases/${a.case_id}`}>Open case {a.case_id}</Link>
              : (a.decision === 'Confirmed Fraud' || a.decision === 'Reject') && (a.serviced_by === me.id) && <button className="btn btn-accent" onClick={async () => { const r = await act(() => api(`/alerts/${a.id}/case`, { method: 'POST' }), 'Case created and FP&I notified'); if (r) nav(`/cases/${(r as any).caseId}`) }}>Create a case for investigation</button>}
          </>
        ) : !a.assigned_to ? (
          a.status === 'Re-scheduled'
            ? <>{canWork && <button className="btn btn-primary" onClick={() => run({ kind: 'requeue' }, 'Moved back to current queue')}>Move back to current queue</button>}<div className="small muted">Back in the queue on {fmtDateTime(a.reschedule_until)}. TAT is paused.</div></>
            : canWork ? <button className="btn btn-accent" onClick={() => act(() => api('/alerts/assign', { method: 'POST', body: { ids: [a.id] } }), 'Alert assigned to you')}>Assign to me</button>
              : <div className="muted small">Only the {a.review_team} team can work this alert.</div>
        ) : !mine ? (
          <>
            <div className="small">Assigned to <b>{a.assigned_name}</b> since {fmtDateTime(a.assigned_at)}.</div>
            {a.status === 'Referred to FP&I' && isFpi && <button className="btn btn-accent" onClick={() => setModal('fpi')}>Respond to referral</button>}
            {hasRole(me, 'MANAGER', 'SUPER_USER') && <ReassignAny a={a} />}
          </>
        ) : (
          <>
            {a.status === 'Referred to FP&I' && <div className="alert-box warn">Waiting for FP&amp;I feedback. Raising an EDD SR and the final decision unlock once FP&amp;I responds.</div>}
            {a.status === 'EDD raised' && <div className="alert-box info">EDD SR <b className="mono">{a.edd_sr}</b> open in CRM since {fmtDate(a.edd_raised_at)}.<button className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={() => run({ kind: 'edd_response' }, 'EDD outcome fetched from CRM')}>Fetch CRM outcome (simulated)</button></div>}
            {!isPrev && (
              <div>
                <div className="kpi-label" style={{ marginBottom: 6 }}>In-progress actions</div>
                <div className="row">
                  {a.status !== 'Referred to FP&I' && <button className="btn btn-sm" disabled={!['WIP', 'EDD responded'].includes(a.status)} onClick={() => run({ kind: 'edd' }, 'EDD SR raised in CRM')}>Raise EDD SR</button>}
                  <button className="btn btn-sm" onClick={() => run({ kind: 'sendback' }, 'Sent back to queue')}>Send back to queue</button>
                  <button className="btn btn-sm" disabled={a.reschedule_count >= 3} onClick={() => run({ kind: 'reschedule' }, 'Re-scheduled +24h, TAT paused')}>Re-schedule +24h ({a.reschedule_count}/3)</button>
                  <button className="btn btn-sm" onClick={() => setModal('reassign')}>Re-assign</button>
                  {a.status !== 'Referred to FP&I' && <button className="btn btn-sm" onClick={() => setModal('refer')}>Refer to FP&amp;I</button>}
                </div>
              </div>
            )}
            <div className="hr" />
            <div className="kpi-label">{isPrev ? 'Disposition (prevention)' : 'Final decision'}</div>
            <Field label="Decision" req><Select value={decision} onChange={(v) => { setDecision(v); setSub('') }} options={isPrev ? ['Approve', 'Reject'] : ['False Positive', 'Confirmed Fraud']} /></Field>
            <Field label={isPrev ? 'Reason' : 'Sub-classification'} req><Select value={sub} onChange={setSub} options={subs} disabled={!decision} /></Field>
            <Field label={isPrev ? 'Description' : 'Rationale'} req><textarea value={rationale} onChange={(e) => setRationale(e.target.value)} placeholder="Mandatory on every disposition" /></Field>
            {groupable.length > 0 && (
              <Field label="Apply the same decision to other alerts of this customer">
                {groupable.map((x: any) => <label key={x.id} className="check"><input type="checkbox" checked={also.includes(x.id)} onChange={(e) => setAlso(e.target.checked ? [...also, x.id] : also.filter((y) => y !== x.id))} /> <span className="mono">{x.id}</span> {x.rule_name}</label>)}
              </Field>
            )}
            {isPrev && decision === 'Approve' && a.held && <div className="small muted">Approve releases the held transaction.</div>}
            <button className="btn btn-primary" disabled={!decision || !sub || !rationale.trim() || ['Referred to FP&I', 'Re-scheduled'].includes(a.status)} onClick={() => run(isPrev ? { kind: 'prevention_decide', decision, reason: sub, description: rationale, alsoIds: also } : { kind: 'decide', decision, subClass: sub, rationale, alsoIds: also }, 'Decision recorded and sent to DSP + CRM')}>Submit decision</button>
            <div className="hr" />
            <div className="kpi-label">Pre-populated emails (FR-ALT-056)</div>
            <div className="row">{meta?.emailTemplates?.map((t: any) => <button key={t.id} className="btn btn-sm btn-ghost" style={{ whiteSpace: 'normal', textAlign: 'left' }} onClick={() => act(() => api(`/alerts/${a.id}/email`, { method: 'POST', body: { template: t.id } }), `Email sent: ${t.subject}`)}>✉ {t.step}</button>)}</div>
          </>
        )}
      </div>
      {modal === 'refer' && <CommentModal title="Refer to FP&I for feedback" label="Note for FP&I" confirm="Refer" onClose={() => setModal(null)} onConfirm={async (note) => { await run({ kind: 'refer_fpi', note }, 'Referred to FP&I (email sent)'); setModal(null) }} />}
      {modal === 'fpi' && <FpiResponse a={a} onClose={() => setModal(null)} />}
      {modal === 'reassign' && (
        <Modal title="Re-assign alert" onClose={() => setModal(null)} footer={<><button className="btn" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" disabled={!target} onClick={async () => { await run({ kind: 'reassign', toUserId: target }, 'Alert re-assigned'); setModal(null) }}>Re-assign</button></>}>
          <Field label="Analyst"><Select value={target} onChange={setTarget} options={d.analysts.map((u: any) => ({ value: u.id, label: u.name }))} /></Field>
        </Modal>
      )}
    </Card>
  )
}

function FpiResponse({ a, onClose }: { a: any; onClose: () => void }) {
  const act = useAct()
  const [backTo, setBackTo] = useState<'sender' | 'queue'>('sender')
  return (
    <CommentModal title={`Respond to referral on ${a.id}`} label="FP&I response" confirm="Send response" onClose={onClose} onConfirm={async (response) => { await act(() => api(`/alerts/${a.id}/act`, { method: 'POST', body: { kind: 'fpi_response', response, backTo } }), 'Response sent to Fraud Ops'); onClose() }}>
      <div className="alert-box info small">{a.fpi_referral}</div>
      <Field label="Send back to"><Select value={backTo} onChange={(v) => setBackTo(v as any)} placeholder="" options={[{ value: 'sender', label: 'The analyst who referred it' }, { value: 'queue', label: 'The common queue' }]} /></Field>
    </CommentModal>
  )
}

function ReassignAny({ a }: { a: any }) {
  const users = useApi<any[]>('/users')
  const act = useAct()
  const [t, setT] = useState('')
  return (
    <div className="row">
      <div style={{ flex: 1 }}><Select value={t} onChange={setT} placeholder="Assign to analyst…" options={(users.data ?? []).filter((u) => u.dept === a.dept).map((u) => ({ value: u.id, label: u.name }))} /></div>
      <button className="btn btn-sm" disabled={!t} onClick={() => act(() => api('/alerts/assign', { method: 'POST', body: { ids: [a.id], toUserId: t } }), 'Assigned')}>Assign</button>
    </div>
  )
}
