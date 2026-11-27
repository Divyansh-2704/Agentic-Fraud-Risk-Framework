import { useState } from 'react'
import { useEffect } from 'react'
import { api, useAct, useApi } from '../api'
import { hasRole, useMe } from '../components/Layout'
import { Badge, Card, Loading, Tabs } from '../components/ui'

/** Sheet 8 "Where AI agents can help". Agent #4 (Disposition) is live; the others are the registry and tool contract. */
export function AgentHub() {
  const q = useApi<any>('/agents')
  const [phase, setPhase] = useState('all')
  if (q.isLoading) return <Loading />
  const { agents, guardrails } = q.data
  const list = agents.filter((a: any) => phase === 'all' || a.phase === phase)
  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs">AI agents</div>
          <h1>Agent hub</h1>
          <p>Twelve agents mapped to every hand-off where a person reads or types a lot. All are <b>recommend or draft only</b>: a person still decides, because the BRD keeps automatic precautionary actions out of scope.</p>
        </div>
        <Badge tone={q.data.ai.configured && q.data.ai.enabled ? 'ok' : 'orange'}>Disposition agent: {agents.find((a: any) => a.id === 'disposition')?.status}</Badge>
      </div>
      <div className="stack">
        <div className="alert-box info"><div><b>Guardrails for every agent:</b> {guardrails.join(' · ')}.</div></div>
        <DispositionCard />
        <Tabs value={phase} onChange={setPhase} tabs={[{ id: 'all', label: `All (${agents.length})` }, { id: 'Quick win', label: 'Quick wins' }, { id: 'Phase 2', label: 'Phase 2' }, { id: 'Phase 3', label: 'Phase 3' }]} />
        <div className="grid g3">
          {list.map((a: any) => (
            <div key={a.id} className="ai-slot" style={{ background: '#fff' }}>
              <div className="row between">
                <span className="badge badge-solid">#{a.n}</span>
                <div className="row" style={{ gap: 4 }}><Badge tone="orange">{a.autonomy}</Badge><Badge tone={a.phase === 'Quick win' ? 'accent' : ''}>{a.phase}</Badge></div>
              </div>
              <h3 style={{ marginTop: 10 }}>{a.name}</h3>
              <div className="small muted">Stage: {a.stage}</div>
              <p style={{ fontSize: 13, color: 'var(--text)' }}>{a.does}</p>
              <div className="small"><b>Why:</b> {a.why}</div>
              <div className="hr" />
              <div className="kpi-label" style={{ marginBottom: 4 }}>Planned tool calls</div>
              <div className="row" style={{ gap: 4 }}>{a.tools.map((t: string) => <code key={t} className="badge badge-outline">{t}()</code>)}</div>
              <div className="row between" style={{ marginTop: 10 }}><span className="small muted">Status: {a.status}</span>{a.id === 'disposition' ? <Badge tone={a.status === 'live' ? 'ok' : 'orange'}>{a.status === 'live' ? 'Live' : 'Ready'}</Badge> : <button className="btn btn-sm" disabled>Enable</button>}</div>
            </div>
          ))}
        </div>
        <div className="grid g2">
          <Card title="Gen AI Q&A (planned)">
            <p className="small muted" style={{ marginTop: 0 }}>Ask questions about alerts, cases, policies and the process. The answers will cite records. Not enabled in this release.</p>
            <div className="row"><input className="input" style={{ flex: 1 }} disabled placeholder="e.g. Which mule cases this month share a beneficiary IBAN?" /><button className="btn btn-primary" disabled>Ask</button></div>
          </Card>
          <Card title="How the agent layer plugs in">
            <ol className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
              <li>Each screen exposes an <b>AI assist</b> slot (dashed panels) bound to an agent ID.</li>
              <li><code>POST /api/agents/:id/run</code> will call Claude with the listed read-only tools, scoped by the user's Chinese-wall access.</li>
              <li>Every suggestion is logged to <code>agent_runs</code> with its tool calls and linked records.</li>
              <li>A person accepts, edits or rejects the suggestion; the maker-checker flow is unchanged.</li>
            </ol>
          </Card>
        </div>
      </div>
    </>
  )
}

const LABEL: Record<string, string> = { done: 'Analysed', queued: 'Queued', running: 'Running', not_configured: 'Waiting for API key', masking_unavailable: 'Masking unavailable', llm_error: 'LLM error', invalid_output: 'Unusable answer', failed: 'Failed' }

/** Live agent #4: pipeline, status of the analysis queue and the one-off backfill of existing alerts. */
function DispositionCard() {
  const me = useMe()
  const act = useAct()
  const canRun = hasRole(me, 'MANAGER', 'SUPER_USER')
  const st = useApi<any>('/ai/status', { refetchInterval: (q) => ((q.state.data as any)?.counts?.queued || (q.state.data as any)?.counts?.running ? 5000 : false) })
  const counts: Record<string, number> = st.data?.counts ?? {}
  // On Vercel each request has a time limit: while alerts are still queued, keep the worker going from this page.
  useEffect(() => {
    if (!canRun || !counts.queued || counts.running) return
    const t = setTimeout(() => { void api('/ai/process', { method: 'POST' }).then(() => st.refetch()) }, 8000)
    return () => clearTimeout(t)
  }, [canRun, counts.queued, counts.running])
  return (
    <Card title="#4 Disposition agent: verdict and evidence for every alert" actions={canRun && (
      <button className="btn btn-sm btn-accent" disabled={!st.data?.state.enabled} onClick={() => act(() => api('/ai/backfill', { method: 'POST' }).then((r: any) => r), 'Open alerts queued for analysis')}>Analyse all open alerts</button>
    )}>
      <ol className="small" style={{ margin: '0 0 10px', paddingLeft: 18, lineHeight: 1.7 }}>
        <li>A new alert arrives: the agent collects the alert, customer profile, 90 days of transactions, history, linked alerts and rule precision.</li>
        <li>The <b>Presidio masking service</b> replaces every name, CIF, IBAN, Emirates ID, passport, card, device and transaction ID with a placeholder such as &lt;PERSON_1&gt;. If masking fails, nothing is sent.</li>
        <li>The masked JSON goes to the LLM through <b>OpenRouter</b> ({st.data?.state.model ?? '…'}), which returns a verdict (Confirmed Fraud, False Positive or Inconclusive), a confidence and evidence citing record IDs.</li>
        <li>The answer is checked: strict format, every cited record must exist, and a verdict without verified evidence is downgraded to Inconclusive. Placeholders are swapped back to real values for the analyst only.</li>
      </ol>
      {st.data && (
        <div className="row" style={{ gap: 6 }}>
          <Badge tone={st.data.state.configured ? 'ok' : 'orange'}>API key {st.data.state.configured ? 'set' : 'missing'}</Badge>
          <Badge tone={st.data.masking.ok ? 'ok' : 'orange'}>Masking service {st.data.masking.ok ? 'running' : 'not reachable'}</Badge>
          {Object.entries(counts).map(([k, n]) => <Badge key={k} tone={k === 'done' ? 'solid' : k === 'queued' || k === 'running' ? '' : 'orange'}>{LABEL[k] ?? k}: {n}</Badge>)}
        </div>
      )}
    </Card>
  )
}
