import { Link } from 'react-router-dom'
import { AGENTS, type AgentDef } from '../../../shared/src/index'

/** Placeholder slot where an AI agent (Sheet 8 of the flow) will plug in. v1 renders the contract only; agents are not live. */
export function AiAssist({ surface, compact }: { surface: AgentDef['surface']; compact?: boolean }) {
  const agents = AGENTS.filter((a) => a.surface === surface)
  if (!agents.length) return null
  return (
    <div className="ai-slot">
      <h4><span aria-hidden>✦</span> AI assist <span className="badge badge-outline">Planned</span></h4>
      {agents.map((a) => (
        <div key={a.id} style={{ marginTop: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 12.5 }}>#{a.n} {a.name} <span className="badge badge-orange" style={{ marginLeft: 4 }}>{a.autonomy}</span> <span className="badge">{a.phase}</span></div>
          {!compact && <p>{a.does}</p>}
          <button className="btn btn-sm" disabled title="Agent layer comes in the next phase">Run {a.name.split(' ')[0]} agent</button>
        </div>
      ))}
      <p style={{ marginBottom: 0, marginTop: 10 }}>Recommend / draft only: a person still decides. <Link to="/agents">See the agent map</Link></p>
    </div>
  )
}
