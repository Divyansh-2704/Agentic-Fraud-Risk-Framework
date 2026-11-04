import { useState } from 'react'
import { DROPDOWNS, PRECAUTION_CATALOGUE, RISK_CATEGORIES } from '../../../shared/src/index'
import { api, download, useAct, useApi } from '../api'
import { EvidenceUpload } from '../components/Evidence'
import { useMe } from '../components/Layout'
import { Badge, Card, DataTable, Field, fmtAed, fmtDate, fmtDateTime, fmtNum, Modal, Select, StatusBadge } from '../components/ui'
import { EvidenceList } from './AlertWorkspace'

export type Draft = { fields: Record<string, any>; data: Record<string, any> }
export interface SecProps { full: any; draft: Draft; setDraft: (d: Draft) => void; editable: boolean }

const setData = (p: SecProps, section: string, key: string, v: unknown) => p.setDraft({ ...p.draft, data: { ...p.draft.data, [section]: { ...p.draft.data[section], [key]: v } } })
const setField = (p: SecProps, key: string, v: unknown) => p.setDraft({ ...p.draft, fields: { ...p.draft.fields, [key]: v } })

function Txt({ p, s, k, label, type = 'text', req, max }: { p: SecProps; s: string; k: string; label: string; type?: string; req?: boolean; max?: number }) {
  return <Field label={label} req={req}><input className="input" type={type} maxLength={max} disabled={!p.editable} value={p.draft.data[s]?.[k] ?? ''} onChange={(e) => setData(p, s, k, type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)} /></Field>
}
function Sel({ p, s, k, label, options, req }: { p: SecProps; s: string; k: string; label: string; options: string[]; req?: boolean }) {
  return <Field label={label} req={req}><Select disabled={!p.editable} value={p.draft.data[s]?.[k]} onChange={(v) => setData(p, s, k, v)} options={options} /></Field>
}
function Chk({ p, s, k, label }: { p: SecProps; s: string; k: string; label: string }) {
  return <label className="check"><input type="checkbox" disabled={!p.editable} checked={!!p.draft.data[s]?.[k]} onChange={(e) => setData(p, s, k, e.target.checked)} />{label}</label>
}

// ---------- Fraud Ops sections (FR-CASE-05..022) ----------
export function DetailsSection(p: SecProps) {
  const c = p.full.case
  const inv = ['FPI_INVESTIGATOR', 'FPI_REVIEWER', 'FPI_APPROVER', 'NONE'].includes(c.owner) && !['Draft', 'Submitted to FO Checker'].includes(c.status)
  return (
    <Card title="Fraud case details">
      <div className="form-grid">
        <Field label="Case ID"><input className="input mono" disabled value={c.id} /></Field>
        <Field label="Case creation date"><input className="input" disabled value={fmtDateTime(c.created_at)} /></Field>
        <Field label="Fraud type"><input className="input" disabled value={c.typology ?? '–'} /></Field>
        <Field label="Origin"><input className="input" disabled value={c.origin} /></Field>
        <Field label="Complexity L1 / L2" req hint="Can be changed during the investigation"><Select disabled={!p.editable} value={p.draft.fields.complexity} onChange={(v) => setField(p, 'complexity', v)} options={DROPDOWNS.complexity} /></Field>
        <Sel p={p} s="details" k="source" label="Source" options={DROPDOWNS.source} />
        <Field label="Customer complaint"><Chk p={p} s="details" k="customerComplaint" label="Yes, raised by customer" /></Field>
      </div>
      <div style={{ marginTop: 12 }}><Field label="Case description (max 5000 characters)" req><textarea maxLength={5000} rows={4} disabled={!p.editable} value={p.draft.data.details?.description ?? ''} onChange={(e) => setData(p, 'details', 'description', e.target.value)} /></Field></div>
      {(inv || c.type === 'WHISTLEBLOWER') && (
        <>
          <div className="hr" />
          <h3 style={{ marginBottom: 10 }}>Investigator fields (FR-CASE-040)</h3>
          <div className="form-grid">
            <Field label="Date reported to FP&I"><input className="input" disabled value={p.draft.data.investigation?.dateReportedToFpi ?? '–'} /></Field>
            <Txt p={p} s="investigation" k="unitBranch" label="Unit / Branch involved" />
            <div className="stack" style={{ gap: 6, paddingTop: 18 }}>
              <Chk p={p} s="investigation" k="isFraud" label="Fraud" />
              <Chk p={p} s="investigation" k="reportableMis" label="Reportable in MIS" />
              <Chk p={p} s="investigation" k="reportableOpRisk" label="Reportable in OpRisk system" />
            </div>
          </div>
        </>
      )}
      {c.type === 'WHISTLEBLOWER' && (
        <>
          <div className="hr" />
          <div className="form-grid">
            <Txt p={p} s="whistleblower" k="channel" label="Whistleblowing channel" />
            <Txt p={p} s="whistleblower" k="hrOutcome" label="HR / Governance outcome" />
          </div>
          <div style={{ marginTop: 10 }}><Field label="Allegation"><textarea disabled={!p.editable} value={p.draft.data.whistleblower?.allegation ?? ''} onChange={(e) => setData(p, 'whistleblower', 'allegation', e.target.value)} /></Field></div>
        </>
      )}
    </Card>
  )
}

export function CustomerSection(p: SecProps) {
  const c = p.full.case
  const cust = p.full.parties.find((x: any) => x.kind === 'Customer' && x.ref === c.cif)
  return (
    <Card title="Customer details">
      <div className="form-grid">
        <Field label="CIF" req hint="Name, segment and entity are sourced from core banking on save."><input className="input mono" disabled={!p.editable} value={p.draft.fields.cif ?? ''} onChange={(e) => setField(p, 'cif', e.target.value)} /></Field>
        <Field label="Name of the customer"><input className="input" disabled value={c.customer_name ?? '–'} /></Field>
        <Field label="Customer segment"><input className="input" disabled value={c.segment ?? '–'} /></Field>
        <Field label="Entity name"><input className="input" disabled value={c.entity} /></Field>
        <Sel p={p} s="customer" k="customerRole" label="Customer role" options={DROPDOWNS.customerRole} />
      </div>
      {cust && <dl className="kv" style={{ marginTop: 14 }}><dt>National ID</dt><dd className="mono">{cust.details.eid}</dd><dt>Passport</dt><dd className="mono">{cust.details.passport}</dd><dt>Accounts</dt><dd className="mono small">{cust.details.accounts?.join(', ')}</dd><dt>Cards</dt><dd className="mono small">{cust.details.cards?.join(', ')}</dd></dl>}
    </Card>
  )
}

export function SourceSection(p: SecProps) {
  return (
    <Card title="Source details">
      <div className="form-grid">
        <Sel p={p} s="sourceDetails" k="reportingChannel" label="Reporting channel" options={DROPDOWNS.reportingChannel} req />
        <Txt p={p} s="sourceDetails" k="dateReported" label="Date reported" type="date" req />
        <Txt p={p} s="sourceDetails" k="scamNumber" label="Scam reach-out number" max={15} />
        <Sel p={p} s="sourceDetails" k="scamMethod" label="Scam reach-out method" options={DROPDOWNS.scamMethod} />
        <Sel p={p} s="sourceDetails" k="scamType" label="Scam reach-out type" options={DROPDOWNS.scamType} />
        <Sel p={p} s="sourceDetails" k="compromiseSource" label="Source of compromise" options={DROPDOWNS.compromiseSource} />
        <Txt p={p} s="sourceDetails" k="firstFraudAt" label="Date / time of first fraud" type="datetime-local" />
        <Field label="SR number"><input className="input" disabled={!p.editable} value={p.draft.fields.sr_number ?? ''} onChange={(e) => setField(p, 'sr_number', e.target.value)} /></Field>
        <Txt p={p} s="sourceDetails" k="srReceivedAt" label="SR received time" type="datetime-local" />
        <Txt p={p} s="sourceDetails" k="srActionedAt" label="SR actioned time" type="datetime-local" />
      </div>
    </Card>
  )
}

export function RiskSection(p: SecProps) {
  const l1 = p.draft.fields.risk_l1, l2 = p.draft.fields.risk_l2
  const l2s = l1 ? Object.keys(RISK_CATEGORIES[l1] ?? {}) : []
  const titles = l1 && l2 ? RISK_CATEGORIES[l1]?.[l2] ?? [] : []
  return (
    <Card title="Risk classification">
      <div className="form-grid">
        <Field label="Risk Category (L1)" req><Select disabled={!p.editable} value={l1} onChange={(v) => p.setDraft({ ...p.draft, fields: { ...p.draft.fields, risk_l1: v, risk_l2: '', risk_title: '' } })} options={Object.keys(RISK_CATEGORIES)} /></Field>
        <Field label="Risk Category (L2)" req><Select disabled={!p.editable || !l1} value={l2} onChange={(v) => p.setDraft({ ...p.draft, fields: { ...p.draft.fields, risk_l2: v, risk_title: '' } })} options={l2s} /></Field>
        <Field label="Risk title" req><Select disabled={!p.editable || !l2} value={p.draft.fields.risk_title} onChange={(v) => setField(p, 'risk_title', v)} options={titles} /></Field>
      </div>
      {p.full.routingPreview && <div className="alert-box info" style={{ marginTop: 12 }}><div><b>Routing on Checker approval (FR-CASE-035):</b> {p.full.routingPreview.explanation}</div></div>}
    </Card>
  )
}

export function TransactionsSection(p: SecProps) {
  const act = useAct()
  const c = p.full.case
  const cust = p.full.parties.find((x: any) => x.kind === 'Customer' && x.ref === c.cif)
  const [q, setQ] = useState({ account: '', from: '', to: '' })
  const [search, setSearch] = useState<string | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const res = useApi<any[]>(search)
  return (
    <div className="stack">
      <Card title="Transaction details" pad={false} actions={<span className="small muted">Currency values frozen to the transaction date (FR-CASE-011)</span>}>
        <DataTable rows={p.full.transactions} cols={[
          { key: 'date', label: 'Date', render: (t) => fmtDate(t.date) }, { key: 'txn_id', label: 'Transaction ID', render: (t) => <span className="mono small">{t.txn_id}</span> },
          { key: 'account', label: 'Account', render: (t) => <span className="mono small">{t.account}</span> }, { key: 'type', label: 'Type' },
          { key: 'amount', label: 'Original', render: (t) => `${t.currency} ${fmtNum(t.amount)}` }, { key: 'amount_aed', label: 'AED', render: (t) => <b>{fmtNum(t.amount_aed)}</b> },
          { key: 'fx_rate', label: 'FX', render: (t) => t.fx_rate },
          { key: 'beneficiary_name', label: 'Beneficiary', render: (t) => <TxnDetails t={t} p={p} /> },
          { key: 'x', label: '', sortable: false, filter: false, render: (t) => p.editable && <button className="btn btn-sm btn-danger" onClick={() => act(() => api(`/cases/${c.id}/transactions/${t.id}`, { method: 'DELETE' }), 'Transaction removed')}>Remove</button> },
        ]} empty="No transactions selected yet." />
      </Card>
      {p.full.computed.txnSummary.length > 0 && (
        <Card title="Summary by transaction type (only amounts with impact, FR-CASE-014)">
          <table className="tbl"><thead><tr><th>Type</th><th>Count</th><th className="right">Amount (AED)</th></tr></thead>
            <tbody>{p.full.computed.txnSummary.map((s: any) => <tr key={s.type}><td>{s.type}</td><td>{s.count}</td><td className="right">{fmtNum(s.amount_aed)}</td></tr>)}<tr><td><b>Total</b></td><td><b>{p.full.computed.fraudulentTxnCount}</b></td><td className="right"><b>{fmtAed(p.full.computed.txnTotalAed)}</b></td></tr></tbody></table>
        </Card>
      )}
      {p.editable && (
        <Card title="Find and add transactions (Feature Store)">
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div style={{ width: 280 }}><Field label="Account"><Select value={q.account} onChange={(v) => setQ({ ...q, account: v })} placeholder="All accounts" options={cust?.details.accounts ?? []} /></Field></div>
            <Field label="From"><input className="input" type="date" value={q.from} onChange={(e) => setQ({ ...q, from: e.target.value })} /></Field>
            <Field label="To"><input className="input" type="date" value={q.to} onChange={(e) => setQ({ ...q, to: e.target.value })} /></Field>
            <button className="btn btn-primary" disabled={!c.cif} onClick={() => setSearch(`/cases/${c.id}/txn-search?${new URLSearchParams(q)}&t=${Date.now()}`)}>Search</button>
            <button className="btn btn-accent" disabled={!sel.size} onClick={async () => { await act(() => api(`/cases/${c.id}/transactions`, { method: 'POST', body: { txnIds: [...sel] } }), `${sel.size} transaction(s) added`); setSel(new Set()); setSearch(`/cases/${c.id}/txn-search?${new URLSearchParams(q)}&t=${Date.now()}`) }}>Add {sel.size || ''} selected</button>
          </div>
          {res.error && <div className="alert-box error" style={{ marginTop: 10 }}>{(res.error as any).message}</div>}
          {res.data && <div style={{ marginTop: 12 }}><DataTable rows={res.data} selectable selected={sel} onSelect={setSel} cols={[
            { key: 'date', label: 'Date', render: (t) => fmtDateTime(t.date) }, { key: 'id', label: 'Transaction ID', render: (t) => <span className="mono small">{t.id}</span> },
            { key: 'type', label: 'Type' }, { key: 'amount', label: 'Amount', render: (t) => `${t.currency} ${fmtNum(t.amount)}` }, { key: 'counterparty', label: 'Counterparty' }, { key: 'account', label: 'Account', render: (t) => <span className="mono small">{t.account}</span> }]} empty="No transactions (already selected ones are hidden)." /></div>}
        </Card>
      )}
    </div>
  )
}

function TxnDetails({ t, p }: { t: any; p: SecProps }) {
  const act = useAct()
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ beneficiary_account: t.beneficiary_account ?? '', beneficiary_name: t.beneficiary_name ?? '', counterparty_bank: t.counterparty_bank ?? '', country: t.country ?? '' })
  return (
    <>
      <a href="#" onClick={(e) => { e.preventDefault(); setOpen(true) }}>{t.beneficiary_name ?? 'Details'}</a>
      {open && (
        <Modal title={`Transaction ${t.txn_id}`} onClose={() => setOpen(false)} footer={p.editable && <button className="btn btn-primary" onClick={async () => { await act(() => api(`/cases/${p.full.case.id}/transactions/${t.id}`, { method: 'PUT', body: f }), 'Saved'); setOpen(false) }}>Save</button>}>
          <dl className="kv"><dt>Product type</dt><dd>{t.product}</dd><dt>Origination</dt><dd>{t.channel}</dd><dt>Channel type</dt><dd>{t.channel}</dd><dt>Transaction type</dt><dd>{t.type}</dd><dt>Payment instrument</dt><dd>{t.instrument}</dd><dt>Transfer category</dt><dd>{t.transfer_cat}</dd></dl>
          <div className="hr" />
          <div className="form-grid">
            {(['beneficiary_account', 'beneficiary_name', 'counterparty_bank', 'country'] as const).map((k) => <Field key={k} label={k.replace('_', ' ')}><input className="input" disabled={!p.editable} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>)}
          </div>
        </Modal>
      )}
    </>
  )
}

export function FinancialSummarySection(p: SecProps) {
  const fs = p.draft.data.financialSummary ?? {}
  return (
    <Card title="Financial summary (Fraud Ops, FR-CASE-015/016)">
      <div className="form-grid">
        <Txt p={p} s="financialSummary" k="balanceAtFraud" label="Balance at time of fraud (AED)" type="number" />
        <Txt p={p} s="financialSummary" k="amountLost" label="Amount lost (AED)" type="number" />
        <Txt p={p} s="financialSummary" k="amountSaved" label="Amount blocked / saved (AED)" type="number" />
        <Txt p={p} s="financialSummary" k="amountRecovered" label="Amount recovered (AED)" type="number" />
        <Txt p={p} s="financialSummary" k="preventedCount" label="Prevented fraud count" type="number" />
        <Txt p={p} s="financialSummary" k="amountWithdrawnAfter" label="Withdrawn from beneficiary after reporting (AED)" type="number" />
        <Field label="Number of fraudulent transactions"><input className="input" disabled value={p.full.computed.fraudulentTxnCount} /></Field>
        <Field label="Prevented fraud volume (saved + recovered)"><input className="input" disabled value={fmtAed(Number(fs.amountSaved || 0) + Number(fs.amountRecovered || 0))} /></Field>
      </div>
      <p className="small muted">Amounts are held in reporting currency (AED). Selected transactions keep both original currency and AED.</p>
    </Card>
  )
}

export function MandatoryActionsSection(p: SecProps) {
  const pre: any[] = p.draft.data.precautions ?? []
  const [add, setAdd] = useState('')
  const setPre = (v: any[]) => p.setDraft({ ...p.draft, data: { ...p.draft.data, precautions: v } })
  return (
    <div className="stack">
      <Card title="Mandatory actions (FR-CASE-017)">
        <div className="form-grid">
          <Chk p={p} s="mandatoryActions" k="reportedToPolice" label="Reported to police" />
          <Sel p={p} s="mandatoryActions" k="policeChannel" label="Channel of police reporting" options={['Call', 'Email', 'In person', 'eCrime portal']} />
          <Chk p={p} s="mandatoryActions" k="customerContacted" label="Customer contacted" />
          <Chk p={p} s="mandatoryActions" k="businessNotified" label="Business notified (auto email on save)" />
          <Chk p={p} s="mandatoryActions" k="fpiNotified" label="FP&I notified (auto email on save)" />
        </div>
      </Card>
      <Card title="Precautionary actions (inherited from the alert, FR-CASE-018..020)">
        {pre.length ? pre.map((x, i) => (
          <div key={i} className="row" style={{ padding: '6px 0', borderBottom: '1px solid #eef3f8' }}>
            <Badge tone="outline">{x.category}</Badge><b style={{ minWidth: 260 }}>{x.step}</b>
            {(PRECAUTION_CATALOGUE.find((s) => s.step === x.step)?.fields ?? []).map((f) => <input key={f} className="input" style={{ width: 160 }} placeholder={f} disabled={!p.editable} value={x.vals?.[f] ?? ''} onChange={(e) => setPre(pre.map((y, j) => (j === i ? { ...y, vals: { ...y.vals, [f]: e.target.value } } : y)))} />)}
            {p.editable && <button className="btn btn-sm btn-danger" onClick={() => setPre(pre.filter((_, j) => j !== i))}>Remove</button>}
          </div>
        )) : <div className="muted">None recorded.</div>}
        {p.editable && (
          <div className="row" style={{ marginTop: 10 }}>
            <div style={{ width: 380 }}><Select value={add} onChange={setAdd} placeholder="Add an action…" options={PRECAUTION_CATALOGUE.map((s) => ({ value: s.step, label: `${s.category}: ${s.step}` }))} /></div>
            <button className="btn btn-sm" disabled={!add} onClick={() => { const s = PRECAUTION_CATALOGUE.find((x) => x.step === add)!; setPre([...pre, { category: s.category, step: s.step, vals: {} }]); setAdd('') }}>Add</button>
          </div>
        )}
      </Card>
    </div>
  )
}

export function PartiesSection(p: SecProps & { canEditParties: boolean }) {
  const act = useAct()
  const me = useMe()
  const c = p.full.case
  const [kind, setKind] = useState('Customer')
  const [f, setF] = useState<any>({ ref: '', name: '', iban: '', bank: '', status: 'Active', statusDate: '', suspect: false, blacklist: false })
  const canStaff = me.roles.some((r) => r.startsWith('FPI_') || r === 'HR' || r === 'GOVERNANCE')
  const add = async () => {
    const body = kind === 'Third party' ? { kind, ref: f.iban || f.ref, name: f.name, suspect: f.suspect, blacklist: f.blacklist, details: { iban: f.iban, bankName: f.bank } }
      : kind === 'Staff' ? { kind, ref: f.ref, suspect: f.suspect, blacklist: f.blacklist, details: { status: f.status, statusDate: f.statusDate } }
        : { kind, ref: f.ref, suspect: f.suspect, blacklist: f.blacklist }
    const r = await act(() => api(`/cases/${c.id}/parties`, { method: 'POST', body }), `${kind} added`)
    if (r) setF({ ref: '', name: '', iban: '', bank: '', status: 'Active', statusDate: '', suspect: false, blacklist: false })
  }
  return (
    <div className="stack">
      <Card title="Parties involved: suspect / blacklist" pad={false}>
        <DataTable rows={p.full.parties} cols={[
          { key: 'kind', label: 'Type', render: (x) => <Badge tone={x.kind === 'Staff' ? 'orange' : x.kind === 'Third party' ? 'grey' : ''}>{x.kind}</Badge> },
          { key: 'name', label: 'Name' }, { key: 'ref', label: 'CIF / Staff ID / IBAN', render: (x) => <span className="mono small">{x.ref}</span> },
          { key: 'details', label: 'Details', sortable: false, filter: false, render: (x) => <span className="small muted">{x.kind === 'Staff' ? `${x.details.position ?? ''} · ${x.details.department ?? ''} · ${x.details.status ?? ''}` : x.kind === 'Customer' ? `EID ${x.details.eid ?? '–'} · ${x.details.nationality ?? ''}` : x.details.bankName ?? ''}</span> },
          { key: 'suspect', label: 'Suspect', render: (x) => <input type="checkbox" disabled={!p.canEditParties} checked={x.suspect} onChange={(e) => act(() => api(`/cases/${c.id}/parties/${x.id}`, { method: 'PUT', body: { suspect: e.target.checked } }), 'Updated')} /> },
          { key: 'blacklist', label: 'Blacklist', render: (x) => <input type="checkbox" disabled={!p.canEditParties} checked={x.blacklist} onChange={(e) => act(() => api(`/cases/${c.id}/parties/${x.id}`, { method: 'PUT', body: { blacklist: e.target.checked } }), 'Updated')} /> },
          { key: 'x', label: '', sortable: false, filter: false, render: (x) => p.canEditParties && <button className="btn btn-sm btn-danger" onClick={() => act(() => api(`/cases/${c.id}/parties/${x.id}`, { method: 'DELETE' }), 'Removed')}>Remove</button> },
        ]} empty="No parties recorded." />
      </Card>
      {p.canEditParties && (
        <Card title="Add a party">
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div style={{ width: 160 }}><Field label="Type"><Select value={kind} onChange={setKind} placeholder="" options={['Customer', ...(canStaff ? ['Staff'] : []), 'Third party']} /></Field></div>
            {kind !== 'Third party' && <Field label={kind === 'Staff' ? 'Staff ID (HRMS lookup)' : 'CIF (core banking lookup)'}><input className="input" value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })} placeholder={kind === 'Staff' ? 'e.g. S10231' : 'CIF'} /></Field>}
            {kind === 'Staff' && <><div style={{ width: 150 }}><Field label="Staff status"><Select value={f.status} onChange={(v) => setF({ ...f, status: v })} placeholder="" options={DROPDOWNS.staffStatus} /></Field></div>{f.status !== 'Active' && <Field label="Status date" req><input className="input" type="date" value={f.statusDate} onChange={(e) => setF({ ...f, statusDate: e.target.value })} /></Field>}</>}
            {kind === 'Third party' && <><Field label="Third-party name" req><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field><Field label="IBAN"><input className="input" value={f.iban} onChange={(e) => setF({ ...f, iban: e.target.value })} /></Field><Field label="Bank name"><input className="input" value={f.bank} onChange={(e) => setF({ ...f, bank: e.target.value })} /></Field></>}
            <label className="check"><input type="checkbox" checked={f.suspect} onChange={(e) => setF({ ...f, suspect: e.target.checked })} />Suspect</label>
            <label className="check"><input type="checkbox" checked={f.blacklist} onChange={(e) => setF({ ...f, blacklist: e.target.checked })} />Blacklist</label>
            <button className="btn btn-primary" onClick={add}>Add</button>
          </div>
          <p className="small muted">Customer and staff details are auto-populated from core banking and HRMS. Demo staff IDs: S10231, S11877, S09012.</p>
        </Card>
      )}
    </div>
  )
}

function RecFields({ p, s, str }: { p: SecProps; s: string; str?: boolean }) {
  return (
    <>
      <div className="form-grid">
        <Sel p={p} s={s} k="category" label="Category" options={DROPDOWNS.recCategory} req />
        <Sel p={p} s={s} k="type" label="Recommendation type" options={DROPDOWNS.recType} />
        <Sel p={p} s={s} k="issue" label="Issue" options={DROPDOWNS.recIssue} />
        <Sel p={p} s={s} k="action" label="Action" options={DROPDOWNS.recAction} />
      </div>
      <div style={{ marginTop: 12 }}><Field label="Recommendation" req={str}><textarea disabled={!p.editable} value={p.draft.data[s]?.text ?? ''} onChange={(e) => setData(p, s, 'text', e.target.value)} /></Field></div>
      {str && <div style={{ marginTop: 10 }}><Chk p={p} s={s} k="strRequired" label="Central Bank STR required (task allocated to Compliance on closure)" /></div>}
    </>
  )
}
export const FoRecommendationSection = (p: SecProps) => <Card title="Recommendation (Fraud Ops, FR-CASE-022)"><RecFields p={p} s="recommendation" /></Card>
export const FpiRecommendationSection = (p: SecProps) => (
  <Card title="Investigator recommendation (FR-CASE-058/059)">
    <RecFields p={p} s="fpiRecommendation" str />
    <p className="small muted">On closure this recommendation is mapped to post-completion tasks: Op Risk Event, Central Bank STR, Generic Issue, Non-Generic Issue.</p>
  </Card>
)

// ---------- FP&I sections (FR-CASE-039..062) ----------
export function FinancialImpactSection(p: SecProps) {
  const fi = p.draft.data.financialImpact ?? {}
  const n = (k: string) => Number(fi[k] || 0)
  const errs = [
    n('successful') + n('nearMiss') > n('attempted') && 'Successful fraud + Near miss must be ≤ Attempted fraud',
    n('potential') > n('successful') && 'Potential loss must be ≤ Successful fraud',
    n('recovery') > n('gross') && 'Recovery must be ≤ Gross loss',
  ].filter(Boolean) as string[]
  return (
    <Card title="Financial impact (FR-CASE-043..045)">
      <div className="form-grid">
        {[['attempted', 'Attempted fraud'], ['successful', 'Successful fraud'], ['nearMiss', 'Near miss'], ['potential', 'Potential loss'], ['gross', 'Gross loss'], ['recovery', 'Recovery'], ['exposure', 'Total exposure']].map(([k, l]) => <Txt key={k} p={p} s="financialImpact" k={k} label={`${l} (AED)`} type="number" />)}
        <Field label="Net loss (computed = gross − recovery)"><input className="input" disabled value={fmtAed(n('gross') - n('recovery'))} /></Field>
        <Txt p={p} s="financialImpact" k="memoRef" label="Memo ref no." />
      </div>
      {errs.length > 0 ? <div className="alert-box error" style={{ marginTop: 12 }}><div>{errs.map((e) => <div key={e}>✕ {e}</div>)}</div></div> : <div className="alert-box ok" style={{ marginTop: 12 }}>All financial validations pass.</div>}
      {!fi.memoRef && <div className="small" style={{ color: 'var(--orange-700)', marginTop: 6 }}>Please enter the Memo Ref Number.</div>}
    </Card>
  )
}

export function ChecklistSection(p: SecProps & { canWork: boolean }) {
  const act = useAct()
  const users = useApi<any[]>('/users')
  const c = p.full.case
  const fpi = (users.data ?? []).filter((u) => u.roles.some((r: string) => r.startsWith('FPI_') || r === 'HR' || r === 'GOVERNANCE'))
  const [title, setTitle] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const upd = (id: string, body: any) => act(() => api(`/cases/${c.id}/checklist/${id}`, { method: 'PUT', body }), 'Checklist updated')
  return (
    <Card title="Investigation checklist (generated from risk category, FR-CASE-046..055)" pad={false}>
      <div className="table-wrap"><table className="tbl">
        <thead><tr><th>ID</th><th>Item</th><th>Assigned to</th><th>Target date</th><th>Status</th><th>Log</th><th /></tr></thead>
        <tbody>
          {p.full.checklist.map((i: any) => {
            const logs = p.full.activityLog.filter((l: any) => l.checklist_id === i.id)
            return [
              <tr key={i.id}>
                <td className="mono small" title={i.id}>{i.id.split('-').pop()}</td>
                <td style={{ minWidth: 200 }}>{i.title}</td>
                <td style={{ width: 140 }}><Select disabled={!p.canWork} value={i.assigned_to} onChange={(v) => upd(i.id, { assigned_to: v })} options={fpi.map((u) => ({ value: u.id, label: u.name }))} /></td>
                <td style={{ width: 140 }}><input className="input" type="date" disabled={!p.canWork} value={i.target_date ?? ''} onChange={(e) => upd(i.id, { target_date: e.target.value })} /></td>
                <td><button className={`btn btn-sm ${i.status === 'Completed' ? 'btn-primary' : ''}`} disabled={!p.canWork} onClick={() => upd(i.id, { status: i.status === 'Completed' ? 'Open' : 'Completed' })}>{i.status === 'Completed' ? '✓ Done' : 'Open'}</button></td>
                <td><button className="btn btn-sm btn-ghost" onClick={() => setOpen(open === i.id ? null : i.id)}>{logs.length} entr{logs.length === 1 ? 'y' : 'ies'} {open === i.id ? '▲' : '▼'}</button></td>
                <td>{p.canWork && <button className="btn btn-sm btn-danger" onClick={() => act(() => api(`/cases/${c.id}/checklist/${i.id}`, { method: 'DELETE' }), 'Removed')}>✕</button>}</td>
              </tr>,
              open === i.id && <tr key={`${i.id}-log`}><td colSpan={7} style={{ background: 'var(--blue-50)' }}><LogEntries p={p} logs={logs} checklistId={i.id} /></td></tr>,
            ]
          })}
        </tbody>
      </table></div>
      {!p.full.checklist.length && <div className="empty">Checklist is generated when the investigator picks up the case.</div>}
      {p.canWork && (
        <div className="row card-pad">
          <input className="input" style={{ width: 420 }} placeholder="Add a checklist item…" value={title} onChange={(e) => setTitle(e.target.value)} list="cl-templates" />
          <datalist id="cl-templates">{['Obtain an understanding of the allegations', 'Review the account statement', 'Retrieve the video footages', 'Review staff file', 'Creating a Physical File'].map((t) => <option key={t} value={t} />)}</datalist>
          <button className="btn btn-sm btn-primary" disabled={!title.trim()} onClick={async () => { await act(() => api(`/cases/${c.id}/checklist`, { method: 'POST', body: { title } }), 'Item added'); setTitle('') }}>Add item</button>
        </div>
      )}
    </Card>
  )
}

function LogEntries({ p, logs, checklistId }: { p: SecProps & { canWork: boolean }; logs: any[]; checklistId?: string }) {
  const act = useAct()
  const c = p.full.case
  const [f, setF] = useState({ date: new Date().toISOString().slice(0, 10), description: '', finding: '', include_in_report: false })
  return (
    <div className="stack" style={{ gap: 8 }}>
      {logs.map((l) => (
        <div key={l.id} className="row" style={{ alignItems: 'flex-start', borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
          <span className="mono small" style={{ minWidth: 86 }}>{l.date}</span>
          <div style={{ flex: 1 }}><div>{l.description}</div>{l.finding && <div className="small"><b>Finding:</b> {l.finding}</div>}<div className="small muted">{l.actor_name}{l.checklist_id && !checklistId ? ` · ${l.checklist_id}` : ''}</div></div>
          <label className="check small"><input type="checkbox" disabled={!p.canWork} checked={l.include_in_report} onChange={(e) => act(() => api(`/cases/${c.id}/log/${l.id}`, { method: 'PUT', body: { include_in_report: e.target.checked } }), 'Updated')} />Include in final report</label>
        </div>
      ))}
      {p.canWork && (
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <Field label="Date"><input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <div style={{ flex: 2, minWidth: 220 }}><Field label="Log description"><input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field></div>
          <div style={{ flex: 2, minWidth: 220 }}><Field label="Finding"><input className="input" value={f.finding} onChange={(e) => setF({ ...f, finding: e.target.value })} /></Field></div>
          <label className="check small"><input type="checkbox" checked={f.include_in_report} onChange={(e) => setF({ ...f, include_in_report: e.target.checked })} />Include in final report</label>
          <button className="btn btn-sm btn-primary" disabled={!f.description.trim()} onClick={async () => { await act(() => api(`/cases/${c.id}/log`, { method: 'POST', body: { ...f, checklist_id: checklistId } }), 'Log entry added'); setF({ ...f, description: '', finding: '' }) }}>Add entry</button>
        </div>
      )}
    </div>
  )
}

export const DiarySection = (p: SecProps & { canWork: boolean }) => (
  <Card title="Diary of activity log (chronological, FR-CASE-055)"><LogEntries p={p} logs={p.full.activityLog} /></Card>
)

export function EvidenceSection(p: SecProps & { canWork: boolean }) {
  const c = p.full.case
  return (
    <Card title="Evidence vault (FR-CASE-056/057)">
      <EvidenceList items={p.full.evidence} />
      {!c.frozen && p.canWork && <EvidenceUpload path={`/cases/${c.id}/evidence`} checklist={p.full.checklist} />}
    </Card>
  )
}

export function ReportSection(p: SecProps) {
  const act = useAct()
  const c = p.full.case
  const findings = p.full.activityLog.filter((l: any) => l.include_in_report)
  return (
    <Card title="Fraud investigation report (FR-CASE-061/062)" actions={<button className="btn btn-accent" onClick={() => act(() => download(`/cases/${c.id}/report.docx`, `${c.id}-investigation-report.docx`), 'Report generated (Word)')}>Generate report (.docx)</button>}>
      <div className="stack">
        <div className="alert-box info">The report is built in Word from the case data, the findings ticked "Include in Final Report", the financial impact and the recommendation, so it can be edited. AI narrative drafting is planned for the Investigation Copilot (agent #8).</div>
        <dl className="kv"><dt>Findings included</dt><dd>{findings.length}</dd><dt>Final report email</dt><dd>{c.report_email_at ? fmtDateTime(c.report_email_at) : 'Not yet sent (sent on final approval)'}</dd></dl>
        {findings.map((l: any) => <div key={l.id} className="small">• {l.finding || l.description} <span className="muted">({l.date})</span></div>)}
      </div>
    </Card>
  )
}

export function AuditSection({ full }: { full: any }) {
  return (
    <Card title="Audit trail: workflow timeline incl. back-and-forth (FR-CASE-039)">
      <ul className="timeline">
        {full.audit.map((a: any) => (
          <li key={a.id} className={/return|reject/i.test(a.action) ? 'rework' : /closed|approved and|final/i.test(a.action) ? 'close' : ''}>
            <div><b>{a.action}</b> {a.from_status && a.to_status && a.from_status !== a.to_status && <><StatusBadge s={a.from_status} /> → <StatusBadge s={a.to_status} /></>}</div>
            <div className="t-when">{fmtDateTime(a.ts)} · {a.actor_name}</div>
            {a.comment && <div className="small" style={{ whiteSpace: 'pre-wrap', marginTop: 2 }}>{a.comment}</div>}
          </li>
        ))}
      </ul>
    </Card>
  )
}

export function DiffSection({ full }: { full: any }) {
  const rows = full.diffs.flatMap((d: any) => (d.changes ?? []).map((ch: any, i: number) => ({ id: `${d.id}-${i}`, ts: d.ts, who: d.actor_name, ...ch })))
  const show = (v: unknown) => (v === null || v === undefined || v === '' ? <span className="muted">–</span> : typeof v === 'object' ? <span className="mono small">{JSON.stringify(v).slice(0, 120)}</span> : String(v))
  return (
    <Card title="Show Diff: previous value vs new value" pad={false}>
      <DataTable rows={rows} exportName={`${full.case.id}-diff`} cols={[
        { key: 'ts', label: 'When', render: (r) => fmtDateTime(r.ts) }, { key: 'who', label: 'Who' }, { key: 'field', label: 'Field', render: (r) => <span className="mono small">{r.field}</span> },
        { key: 'from', label: 'Previous value', render: (r) => <span style={{ color: 'var(--red)' }}>{show(r.from)}</span> }, { key: 'to', label: 'New value', render: (r) => <span style={{ color: 'var(--navy)', fontWeight: 600 }}>{show(r.to)}</span> }]} empty="No edits recorded yet." />
    </Card>
  )
}

export function JointSection({ full }: { full: any }) {
  const me = useMe()
  const act = useAct()
  const users = useApi<any[]>('/users')
  const c = full.case
  const [u, setU] = useState('')
  const stage = ['Review in progress'].includes(c.status) ? 'REVIEW' : 'INVESTIGATION'
  const leadId = stage === 'REVIEW' ? c.reviewer_id : c.investigator_id
  const role = stage === 'REVIEW' ? 'FPI_REVIEWER' : 'FPI_INVESTIGATOR'
  const mineCo = full.investigators.find((i: any) => i.user_id === me.id && i.role === 'Co' && i.stage === stage)
  return (
    <Card title="Joint investigation (FR-CASE-088..092)">
      <p className="small muted" style={{ marginTop: 0 }}>The lead adds co-{stage === 'REVIEW' ? 'reviewers' : 'investigators'}. All update the case (audited). The lead can move the case on only when every co-worker has finished.</p>
      <table className="tbl"><thead><tr><th>Stage</th><th>Name</th><th>Role</th><th>Status</th></tr></thead>
        <tbody>{full.investigators.map((i: any) => <tr key={`${i.user_id}-${i.stage}`}><td>{i.stage}</td><td>{i.name}</td><td><Badge tone={i.role === 'Lead' ? 'solid' : 'outline'}>{i.role}</Badge></td><td>{i.role === 'Lead' ? '–' : i.done ? <Badge tone="ok">Finished</Badge> : <Badge tone="orange">Working</Badge>}</td></tr>)}</tbody></table>
      {leadId === me.id && !c.frozen && (
        <div className="row" style={{ marginTop: 12 }}>
          <div style={{ width: 260 }}><Select value={u} onChange={setU} placeholder={`Add co-${stage === 'REVIEW' ? 'reviewer' : 'investigator'}…`} options={(users.data ?? []).filter((x) => x.roles.includes(role) && x.id !== me.id).map((x) => ({ value: x.id, label: x.name }))} /></div>
          <button className="btn btn-sm btn-primary" disabled={!u} onClick={() => act(() => api(`/cases/${c.id}/investigators`, { method: 'POST', body: { userId: u, stage } }), 'Co-worker added and notified')}>Add</button>
        </div>
      )}
      {mineCo && <div className="row" style={{ marginTop: 12 }}><span>You are a co-{stage === 'REVIEW' ? 'reviewer' : 'investigator'} on this case.</span><button className={`btn btn-sm ${mineCo.done ? '' : 'btn-accent'}`} onClick={() => act(() => api(`/cases/${c.id}/investigators/done`, { method: 'POST', body: { stage, done: !mineCo.done } }), mineCo.done ? 'Re-opened your work' : 'Marked your part as finished')}>{mineCo.done ? 'Re-open my part' : 'Mark my part finished'}</button></div>}
    </Card>
  )
}

export function PostClosureSection({ full }: { full: any }) {
  const me = useMe()
  const act = useAct()
  const c = full.case
  const [f, setF] = useState({ amount: '', mode: '', date: new Date().toISOString().slice(0, 10), comment: '', suspect: false, blacklist: false })
  const pending = full.recoveries.find((r: any) => r.status === 'Pending')
  const canMake = me.roles.some((r) => ['FO_MAKER', 'FPI_INVESTIGATOR', 'SUPER_USER'].includes(r))
  const canCheck = me.roles.some((r) => ['FO_CHECKER', 'FPI_REVIEWER', 'FPI_APPROVER', 'SUPER_USER'].includes(r))
  return (
    <div className="stack">
      <Card title="Post-completion tasks (FR-CASE-0118..0128)" pad={false}>
        <DataTable rows={full.postTasks} cols={[{ key: 'id', label: 'Task', render: (t) => <span className="mono small">{t.id}</span> }, { key: 'type', label: 'Category' }, { key: 'owner_team', label: 'Owner team' }, { key: 'status', label: 'Status', render: (t) => <StatusBadge s={t.status} /> }, { key: 'ref_id', label: 'Reference', render: (t) => t.ref_id ? <span className="mono">{t.ref_id} · {t.ref_date}</span> : '–' }, { key: 'target_date', label: 'Target' }]} empty={c.closed ? 'No tasks were derived from the recommendation.' : 'Tasks are allocated when the final report is released.'} />
      </Card>
      <Card title="Recovery, suspect & blacklist update: maker-checker (FR-CASE-0150..0155)">
        {!c.closed ? <div className="muted">Available after the case is closed.</div> : (
          <div className="stack">
            {pending && (
              <div className="alert-box warn" style={{ justifyContent: 'space-between' }}>
                <div>Pending: <b>{fmtAed(pending.amount)}</b> via {pending.mode} on {pending.date} by {pending.maker_name}. {pending.comment}</div>
                {canCheck && pending.maker_id !== me.id && <div className="row"><button className="btn btn-sm btn-primary" onClick={() => act(() => api(`/cases/${c.id}/recoveries/${pending.id}/decide`, { method: 'POST', body: { approve: true, comment: 'Verified against bank credit advice' } }), 'Recovery approved: main case updated')}>Approve</button><button className="btn btn-sm btn-danger" onClick={() => act(() => api(`/cases/${c.id}/recoveries/${pending.id}/decide`, { method: 'POST', body: { approve: false, comment: 'Evidence insufficient' } }), 'Recovery rejected')}>Reject</button></div>}
                {pending.maker_id === me.id && <span className="small">Waiting for a different checker.</span>}
              </div>
            )}
            {!pending && canMake && (
              <div className="row" style={{ alignItems: 'flex-end' }}>
                <Field label="Amount recovered (AED)" req><input className="input" type="number" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
                <div style={{ width: 210 }}><Field label="Mode of recovery" req><Select value={f.mode} onChange={(v) => setF({ ...f, mode: v })} options={DROPDOWNS.recoveryMode} /></Field></div>
                <Field label="Date" req><input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
                <div style={{ flex: 1, minWidth: 200 }}><Field label="Comment"><input className="input" value={f.comment} onChange={(e) => setF({ ...f, comment: e.target.value })} /></Field></div>
                <label className="check"><input type="checkbox" checked={f.suspect} onChange={(e) => setF({ ...f, suspect: e.target.checked })} />Suspect</label>
                <label className="check"><input type="checkbox" checked={f.blacklist} onChange={(e) => setF({ ...f, blacklist: e.target.checked })} />Blacklist</label>
                <button className="btn btn-accent" disabled={!f.amount || !f.mode} onClick={() => act(() => api(`/cases/${c.id}/recoveries`, { method: 'POST', body: { ...f, amount: Number(f.amount) } }), 'Recovery submitted for checker approval')}>Submit for approval</button>
              </div>
            )}
            <table className="tbl"><thead><tr><th>Date</th><th>Amount</th><th>Mode</th><th>Maker</th><th>Checker</th><th>Status</th></tr></thead>
              <tbody>{full.recoveries.map((r: any) => <tr key={r.id}><td>{r.date}</td><td>{fmtAed(r.amount)}</td><td>{r.mode}</td><td>{r.maker_name}</td><td>{r.checker_name ?? '–'}</td><td><StatusBadge s={r.status} /></td></tr>)}</tbody></table>
          </div>
        )}
      </Card>
    </div>
  )
}
