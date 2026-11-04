import { Link, useNavigate } from 'react-router-dom'
import { useApi } from '../api'
import { Card } from '../components/ui'

/** Interactive version of "1. Big Picture" (the agentic flow workbook) with live counts per station. */
type N = { id: string; x: number; y: number; w: number; h: number; label: string[]; kind: 'sys' | 'step' | 'decision' | 'end'; count?: number; to?: string; agent?: number[] }

export function ProcessMap() {
  const nav = useNavigate()
  const c = useApi<any>('/process-counts', { refetchInterval: 20000 }).data ?? {}
  const nodes: N[] = [
    { id: 'in', x: 40, y: 18, w: 450, h: 52, kind: 'sys', label: ['INPUT SYSTEMS', 'DSP / SAS, Feature Store, Finacle, Cards, CRM, HRMS, PH, BPM, Maktaba'] },
    { id: 'n1', x: 110, y: 110, w: 300, h: 46, kind: 'step', label: ['1. Alert ingested + enriched', '(unique Alert ID)'], count: c.ingested, to: '/alerts', agent: [1] },
    { id: 'n2', x: 110, y: 186, w: 300, h: 46, kind: 'step', label: ['2. Triage + routing', '(L1/L2, Fraud Ops / Governance / HR queue)'], count: c.queue, to: '/alerts', agent: [2] },
    { id: 'n3', x: 110, y: 262, w: 300, h: 46, kind: 'step', label: ['3. Analyst works the alert', '(precautionary steps, EDD SR, notes)'], count: c.working, to: '/alerts', agent: [3, 5] },
    { id: 'd4', x: 175, y: 330, w: 170, h: 84, kind: 'decision', label: ['4. Final', 'decision'], to: '/alerts', agent: [4] },
    { id: 'ca', x: 60, y: 486, w: 160, h: 40, kind: 'end', label: ['Close alert'], count: c.closedAlerts, to: '/alerts' },
    { id: 'ms', x: 620, y: 262, w: 330, h: 46, kind: 'step', label: ['Manual case start', '(Fraud Ops, FP&I, CRM service request)'], to: '/cases' },
    { id: 'n5', x: 600, y: 376, w: 300, h: 44, kind: 'step', label: ['5. Fraud Ops MAKER prepares case'], count: c.maker, to: '/cases', agent: [6] },
    { id: 'd6', x: 655, y: 456, w: 190, h: 84, kind: 'decision', label: ['6. Fraud Ops', 'CHECKER'], count: c.checker, to: '/cases', agent: [7] },
    { id: 'n7', x: 600, y: 586, w: 300, h: 44, kind: 'step', label: ['7. FP&I INVESTIGATOR'], count: c.investigator, to: '/cases', agent: [8] },
    { id: 'd8', x: 780, y: 668, w: 180, h: 84, kind: 'decision', label: ['8. FP&I', 'REVIEWER'], count: c.reviewer, to: '/cases', agent: [9] },
    { id: 'd9', x: 560, y: 760, w: 180, h: 84, kind: 'decision', label: ['9. FP&I', 'APPROVER'], count: c.approver, to: '/cases', agent: [9] },
    { id: 'n10', x: 560, y: 880, w: 360, h: 46, kind: 'end', label: ['10. Final report emailed,', 'case closed + frozen'], count: (c.closedFinal ?? 0) + (c.closedByRule ?? 0), to: '/cases' },
    { id: 'n11', x: 560, y: 956, w: 360, h: 46, kind: 'step', label: ['11. Post-completion tasks + recovery', '(OpenPages, STR in FIU, blacklist)'], count: c.postTasks, to: '/post-closure', agent: [10] },
    { id: 'out', x: 60, y: 1040, w: 460, h: 52, kind: 'sys', label: ['OUTPUTS', 'Decision to DSP + CRM, Outlook, OpenPages, Maktaba, EDP, dashboards'], to: '/dashboards', agent: [11] },
  ]
  const n = Object.fromEntries(nodes.map((x) => [x.id, x]))
  const cx = (id: string) => n[id].x + n[id].w / 2, cy = (id: string) => n[id].y + n[id].h / 2
  const top = (id: string) => [cx(id), n[id].y] as const, bot = (id: string) => [cx(id), n[id].y + n[id].h] as const
  const left = (id: string) => [n[id].x, cy(id)] as const, right = (id: string) => [n[id].x + n[id].w, cy(id)] as const
  type P = readonly [number, number]
  const edges: { d: string; red?: boolean; label?: string; lx?: number; ly?: number }[] = [
    { d: path(bot('in'), top('n1')) }, { d: path(bot('n1'), top('n2')) }, { d: path(bot('n2'), top('n3')) }, { d: path(bot('n3'), top('d4')) },
    { d: `M${cx('d4') - 60},${cy('d4') + 18} Q 150 470 ${cx('ca')},${n.ca.y}`, label: `False positive (${c.falsePositive ?? 0})`, lx: 70, ly: 455 },
    { d: `M${right('d4')[0]},${cy('d4')} Q 520 380 ${left('n5')[0]},${cy('n5')}`, label: `Confirmed fraud + case (${c.confirmed ?? 0})`, lx: 380, ly: 352 },
    { d: path(bot('ms'), [cx('n5') + 60, n.n5.y]) }, { d: path(bot('n5'), top('d6')) },
    { d: `M${cx('d6') - 60},${cy('d6') - 22} Q 590 430 ${n.n5.x + 30},${n.n5.y + n.n5.h}`, red: true, label: 'Return', lx: 560, ly: 445 },
    { d: path(bot('d6'), top('n7')), label: 'Approve + routing rules', lx: 760, ly: 568 },
    { d: `M${right('d6')[0]},${cy('d6')} Q 990 600 ${right('n10')[0]},${cy('n10')}`, label: 'Reject / close by rule', lx: 880, ly: 520 },
    { d: `M${right('n7')[0] - 40},${n.n7.y + n.n7.h} Q 860 650 ${cx('d8')},${n.d8.y}`, label: 'Submit', lx: 870, ly: 655 },
    { d: `M${cx('d8') - 30},${n.d8.y + 14} Q 820 640 ${right('n7')[0] - 90},${n.n7.y + n.n7.h}`, red: true, label: 'Rework', lx: 770, ly: 648 },
    { d: `M${left('d8')[0]},${cy('d8')} Q 700 720 ${cx('d9') + 30},${n.d9.y}`, label: 'Send to Approver', lx: 650, ly: 735 },
    { d: `M${cx('d9') - 30},${n.d9.y + 12} Q 560 690 ${n.n7.x + 40},${n.n7.y + n.n7.h}`, red: true, label: 'Rework', lx: 540, ly: 690 },
    { d: path(bot('d9'), [cx('d9'), n.n10.y]), label: 'Approve', lx: 660, ly: 868 },
    { d: `M${cx('d8')},${n.d8.y + n.d8.h} Q 870 820 ${cx('n10') + 120},${n.n10.y}`, label: 'Approve and close', lx: 880, ly: 830 },
    { d: path(bot('n10'), top('n11')) },
    { d: `M${left('n11')[0]},${cy('n11')} Q 470 1000 ${right('out')[0] - 60},${n.out.y}` },
    { d: `M${cx('ca')},${n.ca.y + n.ca.h} L ${cx('ca')},${n.out.y}` },
  ]
  function path(a: P, b: P) { return `M${a[0]},${a[1]} L${b[0]},${b[1]}` }
  const fill = { sys: '#ffffff', step: 'var(--blue-100)', decision: 'var(--orange-50)', end: 'var(--orange-100)' }
  const stroke = { sys: 'var(--navy)', step: 'var(--navy)', decision: 'var(--orange)', end: 'var(--orange-700)' }
  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs">Overview</div>
          <h1>The whole process on one page</h1>
          <p>Read top to bottom: alerts come in (Stage A), real fraud becomes a case (Stage B), cases are closed and reported. Click a station to open its queue. Amber numbers are live counts.</p>
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 320px' }}>
        <Card pad={false}>
          <svg viewBox="0 0 1000 1110" style={{ width: '100%', display: 'block' }} role="img" aria-label="Fraud process map">
            <defs>
              <marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#7a7e9c" /></marker>
              <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#c62828" /></marker>
            </defs>
            <rect x="40" y="92" width="450" height="340" rx="14" fill="none" stroke="var(--navy)" strokeDasharray="6 5" />
            <text x="56" y="86" fontSize="13" fontWeight="700" fill="var(--navy)" stroke="#fff" strokeWidth={5} paintOrder="stroke">STAGE A · ALERT MANAGEMENT (FAMS, Section 4)</text>
            <rect x="540" y="360" width="440" height="500" rx="14" fill="none" stroke="var(--navy)" strokeDasharray="6 5" />
            <text x="556" y="354" fontSize="13" fontWeight="700" fill="var(--navy)" stroke="#fff" strokeWidth={5} paintOrder="stroke">STAGE B · FRAUD CASE MANAGEMENT (FCMS, Section 5)</text>
            {edges.map((e, i) => (
              <g key={i}>
                <path d={e.d} fill="none" stroke={e.red ? '#c62828' : '#7a7e9c'} strokeWidth={e.red ? 2.2 : 1.4} markerEnd={`url(#${e.red ? 'arr' : 'ar'})`} />
                {e.label && <text x={e.lx} y={e.ly} fontSize="11" fill={e.red ? '#c62828' : '#1c2045'}>{e.label}</text>}
              </g>
            ))}
            {nodes.map((x) => (
              <g key={x.id} className="pm-node" onClick={() => x.to && nav(x.to)} tabIndex={0} role="link" aria-label={x.label.join(' ')} onKeyDown={(e) => e.key === 'Enter' && x.to && nav(x.to)}>
                {x.kind === 'decision'
                  ? <polygon points={`${x.x + x.w / 2},${x.y} ${x.x + x.w},${x.y + x.h / 2} ${x.x + x.w / 2},${x.y + x.h} ${x.x},${x.y + x.h / 2}`} fill={fill[x.kind]} stroke={stroke[x.kind]} strokeWidth="1.6" />
                  : <rect x={x.x} y={x.y} width={x.w} height={x.h} rx={x.kind === 'sys' ? 3 : 12} fill={fill[x.kind]} stroke={stroke[x.kind]} strokeWidth="1.6" />}
                {x.label.map((l, i) => <text key={i} x={x.x + x.w / 2} y={x.y + x.h / 2 + (i - (x.label.length - 1) / 2) * 15 + 4} textAnchor="middle" fontSize={i === 0 ? 13 : 11} fontWeight={i === 0 ? 650 : 400} fill="var(--navy-900)">{l}</text>)}
                {typeof x.count === 'number' && (
                  <g><circle cx={x.x + x.w - (x.kind === 'decision' ? x.w / 2 - 50 : 4)} cy={x.y + (x.kind === 'decision' ? 16 : 0)} r="14" fill="var(--orange)" /><text x={x.x + x.w - (x.kind === 'decision' ? x.w / 2 - 50 : 4)} y={x.y + (x.kind === 'decision' ? 20 : 4)} textAnchor="middle" fontSize="11.5" fontWeight="700" fill="var(--navy-900)">{x.count}</text></g>
                )}
                {x.agent?.map((a, i) => (
                  <g key={a} onClick={(e) => { e.stopPropagation(); nav('/agents') }}>
                    <circle cx={x.x - 16 - i * 26} cy={x.y + x.h / 2} r="11" fill="#fff" stroke="var(--blue-500)" strokeDasharray="3 2" />
                    <text x={x.x - 16 - i * 26} y={x.y + x.h / 2 + 4} textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--blue-500)">{a}</text>
                  </g>
                ))}
              </g>
            ))}
          </svg>
        </Card>
        <div className="stack">
          <Card title="Legend">
            <div className="stack small">
              <div className="row"><svg width="34" height="18"><rect x="1" y="1" width="32" height="16" rx="3" fill="#fff" stroke="var(--navy)" /></svg> Other system (input / output)</div>
              <div className="row"><svg width="34" height="18"><rect x="1" y="1" width="32" height="16" rx="7" fill="var(--blue-100)" stroke="var(--navy)" /></svg> Step</div>
              <div className="row"><svg width="34" height="20"><polygon points="17,1 33,10 17,19 1,10" fill="var(--orange-50)" stroke="var(--orange)" /></svg> Decision</div>
              <div className="row"><svg width="34" height="18"><rect x="1" y="1" width="32" height="16" rx="7" fill="var(--orange-100)" stroke="var(--orange-700)" /></svg> End / closure</div>
              <div className="row"><svg width="34" height="10"><line x1="0" y1="5" x2="34" y2="5" stroke="#c62828" strokeWidth="2.2" /></svg> Return for rework</div>
              <div className="row"><svg width="34" height="24"><circle cx="17" cy="12" r="10" fill="#fff" stroke="var(--blue-500)" strokeDasharray="3 2" /></svg> AI agent idea (planned)</div>
              <div className="row"><span className="badge badge-accent">12</span> Live count</div>
            </div>
          </Card>
          <Card title="Stations">
            <table className="tbl small"><tbody>
              {[['1', 'Alert in', 'DSP / SAS rule fires; ingested, enriched, Alert ID', '/alerts'], ['2', 'Alert decided', 'Analyst decides False Positive or Confirmed Fraud', '/alerts'], ['3', 'Case checked', 'Maker prepares, a different Checker approves; routing rules decide', '/cases'], ['4', 'Case investigated', 'FP&I Investigator, Reviewer and Approver sign off', '/cases'], ['5', 'Closed and reported', 'Final report emailed, frozen, post-completion and recovery', '/post-closure']].map(([n_, s, d, to]) => <tr key={n_}><td><b>{n_}</b></td><td><Link to={to}>{s}</Link><div className="muted">{d}</div></td></tr>)}
            </tbody></table>
          </Card>
          <div className="alert-box warn small">Golden rule: whoever creates or prepares something never checks or approves it (FR-CASE-030, 085).</div>
        </div>
      </div>
    </>
  )
}
