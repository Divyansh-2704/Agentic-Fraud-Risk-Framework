import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, useAct, useApi } from '../api'
import { AiAssist } from '../components/AiAssist'
import { Badge, Card, Field, Loading, Modal, Select, StatusBadge, Tabs } from '../components/ui'

/** Sheet 7: after closure the final report triggers tasks for other teams (OpenPages, FIU STR, issues), tracked to a reference. */
export function PostClosure() {
  const q = useApi<any[]>('/post-tasks')
  const [tab, setTab] = useState('open')
  const [sel, setSel] = useState<any>(null)
  if (q.isLoading) return <Loading />
  const rows = (q.data ?? []).filter((t) => (tab === 'open' ? t.status !== 'Completed' : t.status === 'Completed'))
  const cols = ['Op Risk Event', 'Central Bank STR', 'Generic Issue', 'Non-Generic Issue']
  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs">Stage B · After closure (BRD 5.9, 5.14)</div>
          <h1>Post-closure tasks</h1>
          <p>Categorised from the final recommendation and allocated to task owners, who can delegate. Each task needs the reference ID and date returned by OpenPages or the FIU system.</p>
        </div>
        <Tabs value={tab} onChange={setTab} tabs={[{ id: 'open', label: 'Open' }, { id: 'done', label: 'Completed' }]} />
      </div>
      <div className="grid g4">
        {cols.map((type) => (
          <div key={type} className="stack">
            <div className="row between"><h3>{type}</h3><Badge>{rows.filter((t) => t.type === type).length}</Badge></div>
            {rows.filter((t) => t.type === type).map((t) => (
              <button key={t.id} className="card card-pad" style={{ textAlign: 'left', cursor: 'pointer', font: 'inherit' }} onClick={() => setSel(t)}>
                <div className="row between"><span className="mono small">{t.id}</span><StatusBadge s={t.status} /></div>
                <div style={{ fontWeight: 600, marginTop: 6 }}>{t.customer_name ?? t.case_id}</div>
                <div className="small muted">{t.owner_team}{t.assigned_name ? ` · ${t.assigned_name}` : ''} · due {t.target_date}</div>
                {t.ref_id && <div className="small mono" style={{ marginTop: 4 }}>{t.ref_id}</div>}
              </button>
            ))}
            {!rows.some((t) => t.type === type) && <div className="empty small" style={{ padding: 16 }}>None</div>}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 16 }}><AiAssist surface="post-closure" /></div>
      {sel && <TaskModal t={sel} onClose={() => setSel(null)} />}
    </>
  )
}

function TaskModal({ t, onClose }: { t: any; onClose: () => void }) {
  const act = useAct()
  const users = useApi<any[]>('/users')
  const [ref, setRef] = useState({ ref_id: t.ref_id ?? '', ref_date: t.ref_date ?? '' })
  const [deleg, setDeleg] = useState('')
  const [details, setDetails] = useState<Record<string, any>>(t.details)
  const go = async (body: any, msg: string) => { const r = await act(() => api(`/post-tasks/${t.id}`, { method: 'PUT', body }), msg); if (r) onClose() }
  const done = t.status === 'Completed'
  return (
    <Modal wide title={<>{t.type} · <span className="mono">{t.id}</span></>} onClose={onClose} footer={!done && <>
      <button className="btn" onClick={() => go({ action: 'save', details }, 'Saved')}>Save fields</button>
      <button className="btn btn-primary" onClick={() => go({ action: 'push', details }, `Pushed to ${t.details.system}`)} disabled={!!t.ref_id}>Push to {t.details.system} (simulated)</button>
      <button className="btn btn-accent" disabled={!ref.ref_id || !ref.ref_date} onClick={() => go({ action: 'complete', ...ref }, 'Task completed')}>Complete task</button>
    </>}>
      <div className="stack">
        <div className="row"><Link to={`/cases/${t.case_id}`} className="mono">{t.case_id}</Link><span className="muted">·</span><span>{t.owner_team}</span><StatusBadge s={t.status} /></div>
        <div className="alert-box info small">Fields are pre-filled from the final report and recommendation. The Post-Closure Agent (planned) will propose these and draft the STR narrative.</div>
        <div className="form-grid">
          {Object.entries(details).filter(([k]) => k !== 'system').map(([k, v]) => (
            <Field key={k} label={k.replace(/([A-Z])/g, ' $1')}>
              {k === 'narrativeDraft' || k === 'recommendation' || k === 'description'
                ? <textarea disabled={done} value={String(v ?? '')} onChange={(e) => setDetails({ ...details, [k]: e.target.value })} />
                : <input className="input" disabled={done} value={String(v ?? '')} onChange={(e) => setDetails({ ...details, [k]: e.target.value })} />}
            </Field>
          ))}
        </div>
        <div className="hr" />
        <div className="form-grid">
          <Field label="Reference ID" req><input className="input mono" disabled={done} value={ref.ref_id} onChange={(e) => setRef({ ...ref, ref_id: e.target.value })} /></Field>
          <Field label="Reference date" req><input className="input" type="date" disabled={done} value={ref.ref_date} onChange={(e) => setRef({ ...ref, ref_date: e.target.value })} /></Field>
          {!done && <Field label="Delegate to"><div className="row" style={{ flexWrap: 'nowrap' }}><Select value={deleg} onChange={setDeleg} options={(users.data ?? []).map((u) => ({ value: u.id, label: u.name }))} /><button className="btn btn-sm" disabled={!deleg} onClick={() => go({ action: 'delegate', assigned_to: deleg }, 'Task delegated')}>Delegate</button></div></Field>}
        </div>
        {t.type === 'Central Bank STR' && <div className="alert-box warn small">STR content is never shared with the customer.</div>}
      </div>
    </Modal>
  )
}
