import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, useAct, useApi } from '../api'
import { Badge, Card, fmtDateTime, Modal, Tabs } from './ui'

/** Disposition agent (#4) output for one alert. The LLM only ever saw masked data; everything shown here is real data. */

type Verdict = 'Confirmed Fraud' | 'False Positive' | 'Inconclusive'
const TONE: Record<Verdict, 'red' | 'ok' | 'orange'> = { 'Confirmed Fraud': 'red', 'False Positive': 'ok', Inconclusive: 'orange' }
const STATUS_TEXT: Record<string, string> = {
  queued: 'Queued for analysis', running: 'Analysing…', not_configured: 'Needs API key', masking_unavailable: 'Masking unavailable',
  llm_error: 'LLM error', invalid_output: 'Unusable answer', failed: 'Failed',
}
const STATUS_HELP: Record<string, string> = {
  not_configured: 'The AI agent is ready but has no OpenRouter API key yet. Add OPENROUTER_API_KEY to the server settings, then run the analysis.',
  masking_unavailable: 'The Presidio masking service could not be reached or its check failed, so nothing was sent to the LLM. Try again when the service is running.',
  llm_error: 'The LLM call failed.',
  invalid_output: 'The model answered in a format that could not be validated, so it was discarded. Try again.',
  failed: 'The analysis failed unexpectedly. Try again.',
}

/** Compact badge for the queue's "AI verdict" column. */
export function AiVerdictBadge({ ai }: { ai: { status: string; verdict: Verdict | null; confidence: number | null } | null }) {
  if (!ai) return <span className="muted small">Not analysed</span>
  if (ai.status === 'done' && ai.verdict) return <span className="stack" style={{ gap: 2 }}><Badge tone={TONE[ai.verdict]}>{ai.verdict}</Badge><span className="small muted">{ai.confidence}% confidence</span></span>
  return <span className={`small ${['queued', 'running'].includes(ai.status) ? 'muted' : ''}`} style={ai.status === 'running' || ai.status === 'queued' ? undefined : { color: 'var(--orange-700)' }}>{STATUS_TEXT[ai.status] ?? ai.status}</span>
}
/** Sort / filter / export value for the column. */
export const aiVerdictValue = (ai: any) => (!ai ? 'Not analysed' : ai.status === 'done' ? `${ai.verdict} ${String(ai.confidence).padStart(3, '0')}%` : STATUS_TEXT[ai.status] ?? ai.status)

function useAnalysis(alertId: string) {
  const isBusy = (d: any) => ['queued', 'running'].includes(d?.analysis?.status)
  // Poll only while the background worker is busy with this alert.
  const q = useApi<any>(`/alerts/${alertId}/ai`, { refetchInterval: (query) => (isBusy(query.state.data) ? 4000 : false) })
  return { ...q, busy: isBusy(q.data) }
}

function Confidence({ value, tone }: { value: number; tone: string }) {
  const colour = tone === 'red' ? 'var(--red)' : tone === 'ok' ? 'var(--ok)' : 'var(--orange-700)'
  return (
    <div title={`${value}% confidence`}>
      <div className="row between small"><span className="muted">Confidence</span><b>{value}%</b></div>
      <div style={{ height: 6, background: 'var(--grey-50)', borderRadius: 3, overflow: 'hidden', marginTop: 3 }}><div style={{ width: `${value}%`, height: '100%', background: colour }} /></div>
    </div>
  )
}

function RunButton({ alertId, label, primary }: { alertId: string; label: string; primary?: boolean }) {
  const act = useAct()
  const [busy, setBusy] = useState(false)
  return (
    <button className={`btn btn-sm ${primary ? 'btn-primary' : ''}`} disabled={busy}
      onClick={async () => { setBusy(true); await act(() => api(`/alerts/${alertId}/ai/analyse`, { method: 'POST' }), 'AI analysis finished'); setBusy(false) }}>
      {busy ? 'Analysing… (up to a minute)' : label}
    </button>
  )
}

/** Right-rail summary on the alert page (replaces the former "AI assist: Planned" slot). */
export function AiVerdictRail({ alertId }: { alertId: string }) {
  const q = useAnalysis(alertId)
  const a = q.data?.analysis
  const state = q.data?.state
  const r = a?.status === 'done' ? a.result : null
  return (
    <div className="ai-slot" aria-label="AI recommendation">
      <h4><span aria-hidden>✦</span> AI recommendation <span className="badge badge-orange">Recommend only</span></h4>
      {q.isLoading ? <p>Loading…</p> : state && !state.enabled ? <p>The AI agent is switched off in Configuration.</p> : r ? (
        <div className="stack" style={{ gap: 8, marginTop: 8 }}>
          <div className="row between"><Badge tone={TONE[a.verdict as Verdict]}>{a.verdict}</Badge>{r.suggested_sub_classification && <span className="small muted">{r.suggested_sub_classification}</span>}</div>
          <Confidence value={a.confidence} tone={TONE[a.verdict as Verdict]} />
          <p style={{ margin: 0, color: 'var(--text)', fontSize: 13 }}>{r.summary}</p>
          {r.guardrail_notes?.length > 0 && <div className="small" style={{ color: 'var(--orange-700)' }}>⚠ {r.guardrail_notes[0]}</div>}
          {r.model_note && <div className="small muted">Answered by the fallback model {a.model}.</div>}
          <div className="row between"><a href="#ai">Evidence ({r.evidence.length}) ↓</a><RunButton alertId={alertId} label="Re-analyse" /></div>
        </div>
      ) : (
        <div className="stack" style={{ gap: 8, marginTop: 8 }}>
          <p style={{ margin: 0 }}>{!a ? 'This alert has not been analysed yet.' : STATUS_TEXT[a.status] ?? a.status}{a?.status === 'running' && <> · started {fmtDateTime(a.started_at)}</>}</p>
          {a?.error && <p className="small" style={{ margin: 0, color: 'var(--orange-700)' }}>{a.status === 'llm_error' || !STATUS_HELP[a.status] ? a.error : STATUS_HELP[a.status]}</p>}
          {!q.busy && <RunButton alertId={alertId} label="Analyse now" primary />}
        </div>
      )}
      <p style={{ marginBottom: 0, marginTop: 10 }}>Personal data is masked with Presidio before it reaches the model. You decide.</p>
    </div>
  )
}

const DIR: Record<string, { label: string; tone: 'red' | 'ok' | 'grey'; icon: string }> = {
  supports_fraud: { label: 'Points to fraud', tone: 'red', icon: '▲' },
  supports_false_positive: { label: 'Points to false positive', tone: 'ok', icon: '▼' },
  neutral: { label: 'Context', tone: 'grey', icon: '•' },
}

function Source({ s }: { s: string }) {
  const m = s.match(/\b(ALT|FC|WB)-[A-Z0-9-]+\b/)
  if (m) return <Link to={m[1] === 'ALT' ? `/alerts/${m[0]}` : `/cases/${m[0]}`} className="badge badge-outline mono">{s}</Link>
  return <code className="badge badge-outline">{s}</code>
}

function List({ title, items }: { title: string; items: string[] }) {
  if (!items?.length) return null
  return <div><div className="kpi-label" style={{ marginBottom: 4 }}>{title}</div><ul className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>{items.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
}

/** Full card in the main column: evidence with sources, flags, gaps, draft rationale and the audit view. */
export function AiVerdictCard({ alertId }: { alertId: string }) {
  const q = useAnalysis(alertId)
  const [audit, setAudit] = useState(false)
  const [tab, setTab] = useState('in')
  const [copied, setCopied] = useState(false)
  const a = q.data?.analysis
  if (!a || a.status !== 'done') return null
  const r = a.result
  const masked = Object.entries(a.mask_stats ?? {}).filter(([k]) => k !== 'engine').reduce((s, [, v]) => s + Number(v), 0)
  return (
    <Card id="ai" title={<span>✦ AI recommendation: <Badge tone={TONE[a.verdict as Verdict]}>{a.verdict}</Badge> <span className="small muted">{a.confidence}% confidence</span></span>}
      actions={<button className="btn btn-sm btn-ghost" onClick={() => setAudit(true)}>What the model saw</button>}>
      <p style={{ marginTop: 0 }}>{r.summary}</p>
      {r.model_note && <div className="alert-box info" style={{ marginBottom: 12 }}><div>{r.model_note}</div></div>}
      {r.guardrail_notes?.length > 0 && <div className="alert-box warn" style={{ marginBottom: 12 }}><div>{r.guardrail_notes.map((n: string, i: number) => <div key={i}>{n}</div>)}</div></div>}
      <div className="kpi-label" style={{ marginBottom: 6 }}>Evidence: check each point against the records</div>
      <div className="stack" style={{ gap: 8 }}>
        {r.evidence.map((e: any, i: number) => (
          <div key={i} style={{ border: '1px solid var(--border)', borderLeft: `3px solid ${DIR[e.direction]?.tone === 'red' ? 'var(--red)' : DIR[e.direction]?.tone === 'ok' ? 'var(--ok)' : 'var(--border)'}`, borderRadius: 6, padding: '8px 10px' }}>
            <div className="row" style={{ gap: 6, marginBottom: 4 }}>
              <Badge tone={DIR[e.direction]?.tone ?? 'grey'}>{DIR[e.direction]?.icon} {DIR[e.direction]?.label ?? e.direction}</Badge>
              <span className="small muted">{e.weight}</span>
              {!e.verified && <Badge tone="orange">Source not found in the data</Badge>}
            </div>
            <div style={{ fontSize: 13.5 }}>{e.finding}</div>
            <div className="row" style={{ gap: 4, marginTop: 6 }}><span className="small muted">Sources:</span>{e.sources.map((s: string, j: number) => <Source key={j} s={s} />)}</div>
          </div>
        ))}
      </div>
      <div className="grid g2" style={{ marginTop: 14 }}>
        <List title="Red flags" items={r.red_flags} />
        <List title="Mitigating factors" items={r.mitigating_factors} />
        <List title="Missing information" items={r.missing_information} />
        <List title="Recommended next steps" items={r.recommended_next_steps} />
      </div>
      <div style={{ marginTop: 14 }}>
        <div className="row between"><div className="kpi-label">Draft rationale{r.suggested_sub_classification ? ` · suggested sub-classification: ${r.suggested_sub_classification}` : ''}</div>
          <button className="btn btn-sm btn-ghost" onClick={async () => { try { await navigator.clipboard.writeText(r.draft_rationale); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* ignore */ } }}>{copied ? 'Copied' : 'Copy'}</button></div>
        <div className="small" style={{ background: 'var(--blue-50)', borderRadius: 6, padding: '8px 10px', marginTop: 4 }}>{r.draft_rationale}</div>
      </div>
      <div className="small muted" style={{ marginTop: 12 }}>
        {a.model} · {a.prompt_version} · analysed {fmtDateTime(a.finished_at)}{a.duration_ms ? ` in ${Math.round(a.duration_ms / 1000)} s` : ''} · {masked} personal-data values masked with {a.mask_stats?.engine ?? 'Presidio'} before the call. The model never saw real customer data.
      </div>
      {audit && (
        <Modal title="What the model saw (masked)" wide onClose={() => setAudit(false)}>
          <p className="small muted" style={{ marginTop: 0 }}>Exactly what was sent to and received from the LLM. Placeholders such as &lt;PERSON_1&gt; were swapped back to real values only inside this application.</p>
          <Tabs value={tab} onChange={setTab} tabs={[{ id: 'in', label: 'Sent to the model' }, { id: 'out', label: "Model's answer" }]} />
          <pre className="mono small" style={{ whiteSpace: 'pre-wrap', maxHeight: 520, overflow: 'auto', marginBottom: 0 }}>{JSON.stringify(tab === 'in' ? a.masked_input : a.masked_output, null, 2)}</pre>
        </Modal>
      )}
    </Card>
  )
}
