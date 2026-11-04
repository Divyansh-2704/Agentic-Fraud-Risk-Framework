import { Link, useNavigate } from 'react-router-dom'
import { ROLES } from '../../../shared/src/index'
import { useApi } from '../api'
import { useMe } from '../components/Layout'
import { Card, DataTable, fmtAed, Kpi } from '../components/ui'
import { alertCols } from './AlertQueue'
import { caseCols } from './CaseList'

/** FR-LP-01: landing page with sections for Alerts, Fraud cases and Reports & dashboards; content follows access rights (FR-LP-02). */
export function Home() {
  const me = useMe()
  const nav = useNavigate()
  const myAlerts = useApi<any>('/alerts?scope=live&mine=1')
  const myCases = useApi<any>('/cases?scope=live&view=mine')
  const pool = useApi<any>('/cases?scope=live&view=pool')
  const dash = useApi<any>('/dashboard')
  const k = dash.data?.kpis
  return (
    <>
      <section className="hero">
        <div>
          <span className="eyebrow">Agentic Fraud Risk Framework</span>
          <h1>Good day, {me.name.split(' ')[0]}. Detect, decide and close fraud with <span className="hl">one controlled workflow</span></h1>
          <p>From the moment a rule fires to the final report: alerts, maker-checker cases, FP&amp;I investigation and post-closure in one place. Signed in as <b>{me.roles.map((r) => ROLES[r]).join(', ')}</b> · entities {me.entities.join(', ')} (Chinese wall applies).</p>
          <div className="row">
            <Link to="/process" className="btn btn-accent">View the end-to-end process</Link>
            <Link to="/alerts" className="btn btn-outline">Open alert queue</Link>
          </div>
        </div>
        <img src="/hero-analytics.png" alt="" />
      </section>
      <div className="stack">
        <div className="kpis">
          <Kpi label="My open alerts" value={myAlerts.data?.rows.length ?? '…'} onClick={() => nav('/alerts')} tone="accent" />
          <Kpi label="My cases" value={myCases.data?.rows.length ?? '…'} onClick={() => nav('/cases')} tone="accent" />
          <Kpi label="Waiting in my pool" value={pool.data?.rows.length ?? '…'} onClick={() => nav('/cases')} />
          <Kpi label="Overdue alerts" value={k?.overdueAlerts ?? '…'} tone="alarm" onClick={() => nav('/dashboards')} />
          <Kpi label="Held transactions" value={k?.heldTxns ?? '…'} onClick={() => nav('/prevention')} />
          <Kpi label="Net loss (visible cases)" value={k ? fmtAed(k.netLossAed) : '…'} sub={k ? `Recovered ${fmtAed(k.recoveredAed)}` : ''} onClick={() => nav('/dashboards')} />
        </div>

        <div className="grid g2">
          <Card title={<>Stage A · Alerts <span className="badge">FAMS</span></>} actions={<Link to="/alerts" className="btn btn-sm">Open queue</Link>} pad={false}>
            <div className="card-pad small muted" style={{ paddingBottom: 0 }}>“This rule fired. Is it fraud, and what do we do right now?”</div>
            <DataTable rows={(myAlerts.data?.rows ?? []).slice(0, 6)} cols={alertCols.filter((c) => ['id', 'customer_name', 'priority', 'status', 'tat_ms'].includes(c.key))} onRow={(a) => nav(`/alerts/${a.id}`)} empty="No alerts assigned to you." />
          </Card>
          <Card title={<>Stage B · Fraud cases <span className="badge">FCMS</span></>} actions={<Link to="/cases" className="btn btn-sm">Open cases</Link>} pad={false}>
            <div className="card-pad small muted" style={{ paddingBottom: 0 }}>“It is fraud. Who checks it, who investigates, who approves, how do we close and report it?”</div>
            <DataTable rows={[...(myCases.data?.rows ?? []), ...(pool.data?.rows ?? [])].slice(0, 6)} cols={caseCols.filter((c) => ['id', 'customer_name', 'status', 'assigned_name', 'tat_ms'].includes(c.key))} onRow={(c) => nav(`/cases/${c.id}`)} empty="Nothing assigned to you or waiting in your pool." />
          </Card>
        </div>

        <div className="grid g3">
          <Card title="Who does what">
            <table className="tbl">
              <tbody>
                {[['Fraud Ops / Governance / HR analyst', 'Work the alert, record precautionary steps, decide FP or Confirmed Fraud, create a case'], ['Fraud Ops Maker', 'Prepare and submit the case'], ['Fraud Ops Checker', 'Approve (then routing), Reject, Return'], ['FP&I Investigator', 'Return to Maker, Approve Advance Fee Scam, or investigate and submit'], ['FP&I Reviewer', 'Return, Approve and Close, Send to Approver'], ['FP&I Approver', 'Return, Approve'], ['HR / Governance', 'Investigate and close whistleblower cases'], ['Super user', 'Assign, re-open, disable a case, see everything']].map(([r, d]) => <tr key={r}><td style={{ fontWeight: 600, width: '42%' }}>{r}</td><td className="small">{d}</td></tr>)}
              </tbody>
            </table>
          </Card>
          <Card title="Golden control rule">
            <div className="alert-box warn">The person who creates or prepares something can never be the one who checks or approves it (FR-CASE-030, FR-CASE-085). The system enforces this on every pick-up and every routing action.</div>
            <div className="hr" />
            <div className="small muted">Every routing action needs a comment. Back-and-forth is unlimited and recorded in the audit trail. A draft can be deleted only if it was never returned.</div>
          </Card>
          <Card title="Reports & dashboards" actions={<Link to="/dashboards" className="btn btn-sm">Open</Link>}>
            {k ? (
              <dl className="kv"><dt>Open alerts</dt><dd>{k.openAlerts}</dd><dt>Open cases</dt><dd>{k.openCases}</dd><dt>Closed cases</dt><dd>{k.closedCases}</dd><dt>False-positive rate</dt><dd>{k.fpRate}%</dd><dt>Avg alert TAT</dt><dd>{k.avgAlertTatH} h</dd></dl>
            ) : '…'}
            <div className="hr" />
            <Link to="/agents" className="small">12 AI agents are mapped to this process (planned) →</Link>
          </Card>
        </div>
      </div>
    </>
  )
}
