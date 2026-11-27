import { useEffect, useState } from 'react'
import { api, useAct, useApi } from '../api'
import { hasRole, useMe } from '../components/Layout'
import { Card, Field, Loading, Select } from '../components/ui'

/** Names shown to the user when a setting is saved (never the internal key). */
const CONFIG_LABELS: Record<string, string> = {
  routingRules: 'Case routing table', afsThresholdAed: 'Advance Fee Scam threshold X', slaMinutes: 'Alert SLA', caseSlaDays: 'Case SLA',
  maxReschedules: 'Maximum re-schedules', rescheduleHours: 'Re-schedule delay', historyAlerts: 'Historical alerts shown', txnMonths: 'Transaction history window',
  eddAlertDays: 'EDD notification threshold', archiveDays: 'Archive period', reminderDays: 'Calendar reminder period', holidays: 'Holiday list',
  autoAllocate: 'Auto-allocation', aiAgent: 'AI agent settings',
}

/** Parameterised rules (routing table FR-CASE-035, the "X" threshold, SLAs, re-schedule limits, etc.). */
export function ConfigPage() {
  const me = useMe()
  const act = useAct()
  const q = useApi<any>('/config')
  const ai = useApi<any>('/ai/status')
  const [cfg, setCfg] = useState<any>(null)
  useEffect(() => { if (q.data) setCfg(structuredClone(q.data)) }, [q.data])
  if (q.isLoading || !cfg) return <Loading />
  const isSuper = hasRole(me, 'SUPER_USER')
  const fpiCan = isSuper || hasRole(me, 'FPI_APPROVER', 'FPI_REVIEWER')
  const save = (key: string) => act(() => api(`/config/${key}`, { method: 'PUT', body: { value: cfg[key] } }), `${CONFIG_LABELS[key] ?? key} saved`)
  const num = (key: string, label: string, can = isSuper) => (
    <div className="row" style={{ alignItems: 'flex-end' }}>
      <Field label={label}><input className="input" type="number" style={{ width: 160 }} disabled={!can} value={cfg[key] ?? ''} onChange={(e) => setCfg({ ...cfg, [key]: Number(e.target.value) })} /></Field>
      {can && <button className="btn btn-sm" onClick={() => save(key)}>Save</button>}
    </div>
  )
  return (
    <>
      <div className="page-head"><div><div className="crumbs">Admin</div><h1>Configuration</h1><p>Business parameters the BRD requires to be configurable. FP&amp;I can change the routing rules and the Advance Fee Scam threshold "X". Everything else belongs to the super user. In production, changes go through IT change management.</p></div></div>
      <div className="stack">
        <Card title="Case routing on Checker approval (FR-CASE-035)" actions={fpiCan && <button className="btn btn-sm btn-primary" onClick={() => save('routingRules')}>Save routing table</button>}>
          <table className="tbl">
            <thead><tr><th>Rule</th><th>When Risk Category L1/L2 is…</th><th>Action</th><th>Email to (each team gets only its own cases)</th></tr></thead>
            <tbody>
              {cfg.routingRules.map((r: any, i: number) => (
                <tr key={r.id}>
                  <td><b>{r.id}</b><div className="small muted">{r.label}</div></td>
                  <td><input className="input" disabled={!fpiCan || !r.categories.length} value={r.categories.join(', ') || 'All other cases'} onChange={(e) => { const rr = [...cfg.routingRules]; rr[i] = { ...r, categories: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) }; setCfg({ ...cfg, routingRules: rr }) }} /></td>
                  <td style={{ width: 210 }}><Select disabled={!fpiCan} value={r.action} placeholder="" onChange={(v) => { const rr = [...cfg.routingRules]; rr[i] = { ...r, action: v }; setCfg({ ...cfg, routingRules: rr }) }} options={[{ value: 'close_email', label: 'Close + email team' }, { value: 'close', label: 'Close' }, { value: 'threshold', label: 'Close if ≤ X, else investigate' }, { value: 'investigate', label: 'FP&I Investigator pool' }]} /></td>
                  <td>{r.action === 'close_email' && r.emailByCategory
                    ? <div className="stack" style={{ gap: 4 }}>{Object.entries(r.emailByCategory as Record<string, string>).map(([cat, to]) => (
                        <label key={cat} className="row small" style={{ gap: 6, flexWrap: 'nowrap' }}><span style={{ width: 120 }}>{cat}</span><input className="input" disabled={!fpiCan} value={to} onChange={(e) => { const rr = [...cfg.routingRules]; rr[i] = { ...r, emailByCategory: { ...r.emailByCategory, [cat]: e.target.value } }; setCfg({ ...cfg, routingRules: rr }) }} /></label>
                      ))}</div>
                    : <input className="input" disabled={!fpiCan || r.action !== 'close_email'} value={r.emailTo ?? ''} onChange={(e) => { const rr = [...cfg.routingRules]; rr[i] = { ...r, emailTo: e.target.value }; setCfg({ ...cfg, routingRules: rr }) }} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 12 }}>{num('afsThresholdAed', 'Advance Fee Scam threshold "X" (AED)', fpiCan)}</div>
        </Card>
        <div className="grid g2">
          <Card title="Alert SLA (minutes, FR-ALT-064)" actions={isSuper && <button className="btn btn-sm btn-primary" onClick={() => save('slaMinutes')}>Save</button>}>
            <div className="form-grid">{Object.entries(cfg.slaMinutes).map(([k, v]) => <Field key={k} label={k}><input className="input" type="number" disabled={!isSuper} value={v as number} onChange={(e) => setCfg({ ...cfg, slaMinutes: { ...cfg.slaMinutes, [k]: Number(e.target.value) } })} /></Field>)}</div>
          </Card>
          <Card title="Case SLA (days by complexity)" actions={isSuper && <button className="btn btn-sm btn-primary" onClick={() => save('caseSlaDays')}>Save</button>}>
            <div className="form-grid">{Object.entries(cfg.caseSlaDays).map(([k, v]) => <Field key={k} label={k}><input className="input" type="number" disabled={!isSuper} value={v as number} onChange={(e) => setCfg({ ...cfg, caseSlaDays: { ...cfg.caseSlaDays, [k]: Number(e.target.value) } })} /></Field>)}</div>
          </Card>
        </div>
        <Card title="Limits & windows">
          <div className="grid g3">
            {num('maxReschedules', 'Max re-schedules per alert')}
            {num('rescheduleHours', 'Re-schedule delay (hours)')}
            {num('historyAlerts', 'Historical alerts shown in workspace')}
            {num('txnMonths', 'Transaction history (months)')}
            {num('eddAlertDays', 'Notify when EDD open (days)')}
            {num('archiveDays', 'Archive to history after (days)')}
            {num('reminderDays', 'Calendar reminder (days before)')}
          </div>
        </Card>
        <div className="grid g2">
          <Card title="Scenario → department and complexity (FR-ALT-04, 08, 09)">
            <table className="tbl"><thead><tr><th>Scenario</th><th>Department</th><th>Complexity</th></tr></thead>
              <tbody>{Object.entries(cfg.scenarios).map(([k, v]: any) => <tr key={k}><td className="mono">{k}</td><td>{v.dept}</td><td>{v.complexity} ({v.complexity === 'High' ? 'L2' : 'L1'})</td></tr>)}</tbody></table>
          </Card>
          <Card title="Alert type → pre-filled precautionary steps (FR-ALT-021)">
            <table className="tbl"><tbody>{Object.entries(cfg.precautionMapping).map(([k, v]: any) => <tr key={k}><td style={{ width: 170 }}><b>{k === '*' ? 'Default' : k}</b></td><td className="small">{v.join(' · ')}</td></tr>)}</tbody></table>
          </Card>
        </div>
        <div className="grid g2">
          <Card title="Alert allocation on arrival (FR-ALT-047/048)" actions={isSuper && <button className="btn btn-sm btn-primary" onClick={() => save('autoAllocate')}>Save</button>}>
            <div className="stack" style={{ gap: 6 }}>
              {(['prevention', 'detection'] as const).map((k) => (
                <label key={k} className="check"><input type="checkbox" disabled={!isSuper} checked={!!cfg.autoAllocate?.[k]} onChange={(e) => setCfg({ ...cfg, autoAllocate: { ...cfg.autoAllocate, [k]: e.target.checked } })} /> Auto-allocate {k} alerts when they arrive</label>
              ))}
              <div className="small muted">Balanced rules: the analyst with the fewest open alerts first, then the fewest of the same priority, then the fewest of the same fraud typology. Alerts of one customer stay with one analyst. Managers can redistribute unstarted alerts with Rebalance workload on the alert queue.</div>
            </div>
          </Card>
          <Card title="AI disposition agent" actions={isSuper && <button className="btn btn-sm btn-primary" onClick={() => save('aiAgent')}>Save</button>}>
            {(() => {
              const v = { enabled: true, autoAnalyse: true, model: 'anthropic/claude-sonnet-5.5', fallbackModel: 'baidu/ernie-5.5-flash-preview:free', reasoningEffort: 'medium', ...(cfg.aiAgent ?? {}) }
              const set = (patch: object) => setCfg({ ...cfg, aiAgent: { ...v, ...patch } })
              const st = ai.data
              return (
                <div className="stack" style={{ gap: 8 }}>
                  <label className="check"><input type="checkbox" disabled={!isSuper} checked={v.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> AI agent switched on</label>
                  <label className="check"><input type="checkbox" disabled={!isSuper} checked={v.autoAnalyse} onChange={(e) => set({ autoAnalyse: e.target.checked })} /> Analyse every new alert when it arrives</label>
                  <div className="row" style={{ alignItems: 'flex-end' }}>
                    <Field label="OpenRouter model"><input className="input" style={{ width: 280 }} list="ai-models" disabled={!isSuper} value={v.model} onChange={(e) => set({ model: e.target.value.trim() })} /></Field>
                    <datalist id="ai-models">{['anthropic/claude-sonnet-5.5', 'anthropic/claude-opus-5.5', 'anthropic/claude-haiku-5.5', 'baidu/ernie-5.5-flash-preview:free'].map((m) => <option key={m} value={m} />)}</datalist>
                    <Field label="Reasoning effort"><Select disabled={!isSuper} value={v.reasoningEffort} placeholder="" onChange={(x) => set({ reasoningEffort: x })} options={['none', 'low', 'medium', 'high'].map((x) => ({ value: x, label: x }))} /></Field>
                  </div>
                  <Field label="Fallback model (used when the main model cannot answer, e.g. no OpenRouter credits; empty = off)"><input className="input" style={{ width: 360 }} list="ai-models" disabled={!isSuper} value={v.fallbackModel} onChange={(e) => set({ fallbackModel: e.target.value.trim() })} /></Field>
                  {st && <div className="small">
                    <div>API key: {st.state.configured ? <b style={{ color: 'var(--ok)' }}>set</b> : <b style={{ color: 'var(--orange-700)' }}>missing: add OPENROUTER_API_KEY to the server settings</b>}</div>
                    <div>Presidio masking service: {st.masking.ok ? <b style={{ color: 'var(--ok)' }}>running ({st.masking.spacy_model})</b> : <b style={{ color: 'var(--orange-700)' }}>not reachable: nothing is sent to the LLM until it runs</b>}</div>
                  </div>}
                </div>
              )
            })()}
          </Card>
        </div>
        <Card title="Holidays excluded from TAT (FR-CASE-0142)" actions={isSuper && <button className="btn btn-sm btn-primary" onClick={() => save('holidays')}>Save</button>}>
          <input className="input" disabled={!isSuper} value={cfg.holidays.join(', ')} onChange={(e) => setCfg({ ...cfg, holidays: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
          <div className="small muted" style={{ marginTop: 6 }}>Format YYYY-MM-DD, comma separated. Saturday and Sunday are always excluded.</div>
        </Card>
      </div>
    </>
  )
}
