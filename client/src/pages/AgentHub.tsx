import { useState } from 'react'
import { useApi } from '../api'
import { Badge, Card, Loading, Tabs } from '../components/ui'

/** Sheet 8 "Where AI agents can help" + the Q&A answers. v1 is the registry and tool contract only: agents are not live yet. */
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
        <Badge tone="outline">Agent layer: next phase</Badge>
      </div>
      <div className="stack">
        <div className="alert-box info"><div><b>Guardrails for every agent:</b> {guardrails.join(' · ')}.</div></div>
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
              <div className="row between" style={{ marginTop: 10 }}><span className="small muted">Status: {a.status}</span><button className="btn btn-sm" disabled>Enable</button></div>
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
