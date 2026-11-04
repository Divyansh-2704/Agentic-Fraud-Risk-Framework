import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CASE_ACTION_LABELS, type CaseAction } from '../../../shared/src/index'
import { api, download, useAct, useApi } from '../api'
import { AiAssist } from '../components/AiAssist'
import { hasRole, useMe } from '../components/Layout'
import { Badge, Card, CommentModal, ErrorBox, Field, fmtAed, fmtDateTime, fmtDur, Loading, PriorityBadge, Select, StatusBadge } from '../components/ui'
import { ownerLabel } from './CaseList'
import * as S from './caseSections'

const STD_STAGES = ['Fraud Ops Maker', 'Fraud Ops Checker', 'FP&I Investigator', 'FP&I Reviewer', 'FP&I Approver', 'Closed']
function stageIndex(c: any) {
  if (c.closed) return 5
  switch (c.owner) { case 'FO_MAKER': return 0; case 'FO_CHECKER': return 1; case 'FPI_INVESTIGATOR': return 2; case 'FPI_REVIEWER': return 3; case 'FPI_APPROVER': return 4; default: return 0 }
}

type Sec = { id: string; label: string; group: string; badge?: string | number }

export function CaseWorkspace() {
  const { id } = useParams()
  const q = useApi<any>(`/cases/${id}`)
  if (q.isLoading) return <Loading />
  if (q.error) return <ErrorBox error={q.error} />
  return <CaseView full={q.data} />
}

function CaseView({ full }: { full: any }) {
  const me = useMe()
  const act = useAct()
  const c = full.case
  const init = useMemo<S.Draft>(() => ({ fields: { cif: c.cif, complexity: c.complexity, risk_l1: c.risk_l1, risk_l2: c.risk_l2, risk_title: c.risk_title, sr_number: c.sr_number }, data: full.data }), [full])
  const [draft, setDraft] = useState<S.Draft>(init)
  useEffect(() => setDraft(init), [init])
  const dirty = JSON.stringify(draft) !== JSON.stringify(init)
  const isCo = full.investigators.some((i: any) => i.user_id === me.id && i.role === 'Co' && !i.done)
  const editable = !!full.canEdit || (isCo && !c.frozen)
  const wb = c.type === 'WHISTLEBLOWER'
  const reachedFpi = !!c.investigator_id || ['Approved for Investigation', 'Investigation in progress', 'Review in progress', 'Pending Approval', 'Final report generated and closed', 'Case re-opened'].includes(c.status) || (c.status === 'Return for re-work' && c.owner === 'FPI_INVESTIGATOR')
  const sections: Sec[] = wb
    ? [{ id: 'details', label: 'Case details', group: 'Whistleblower' }, { id: 'parties', label: 'Parties (staff / third party)', group: 'Whistleblower', badge: full.parties.length }, { id: 'evidence', label: 'Evidence vault', group: 'Whistleblower', badge: full.evidence.length }, { id: 'diary', label: 'Diary of activity log', group: 'Whistleblower' }, { id: 'report', label: 'Investigation report', group: 'Whistleblower' }, { id: 'audit', label: 'Audit trail', group: 'Record' }, { id: 'diff', label: 'Show Diff', group: 'Record' }]
    : [
      { id: 'details', label: 'Fraud case details', group: 'Fraud Ops' }, { id: 'customer', label: 'Customer details', group: 'Fraud Ops' }, { id: 'source', label: 'Source details', group: 'Fraud Ops' },
      { id: 'risk', label: 'Risk classification', group: 'Fraud Ops' }, { id: 'txns', label: 'Transaction details', group: 'Fraud Ops', badge: full.transactions.length }, { id: 'finsum', label: 'Financial summary', group: 'Fraud Ops' },
      { id: 'actions', label: 'Mandatory actions', group: 'Fraud Ops', badge: full.data.precautions?.length }, { id: 'parties', label: 'Parties involved', group: 'Fraud Ops', badge: full.parties.length }, { id: 'rec', label: 'Recommendation', group: 'Fraud Ops' },
      { id: 'evidence', label: 'Documents / evidence vault', group: 'Fraud Ops', badge: full.evidence.length },
      ...(reachedFpi ? [
        { id: 'checklist', label: 'Checklist', group: 'Investigation', badge: `${full.checklist.filter((i: any) => i.status === 'Completed').length}/${full.checklist.length}` },
        { id: 'diary', label: 'Diary of activity log', group: 'Investigation', badge: full.activityLog.length }, { id: 'impact', label: 'Financial impact', group: 'Investigation' },
        { id: 'fpirec', label: 'Investigator recommendation', group: 'Investigation' }, { id: 'joint', label: 'Joint investigation', group: 'Investigation', badge: full.investigators.filter((i: any) => i.role === 'Co').length || undefined },
        { id: 'report', label: 'Fraud investigation report', group: 'Investigation' },
      ] : []),
      { id: 'audit', label: 'Audit trail', group: 'Record' }, { id: 'diff', label: 'Show Diff', group: 'Record', badge: full.diffs.length || undefined },
      { id: 'post', label: 'Post-closure activity', group: 'Record', badge: full.postTasks.length || undefined },
    ]
  const defaultSec = c.owner === 'FPI_INVESTIGATOR' && reachedFpi && !wb ? 'checklist' : 'details'
  const [sec, setSec] = useState(defaultSec)
  const save = () => act(() => api(`/cases/${c.id}`, { method: 'PUT', body: draft }), 'Saved')
  const props: S.SecProps = { full, draft, setDraft, editable }
  const canWork = editable
  const groups = [...new Set(sections.map((s) => s.group))]
  const idx = stageIndex(c)

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs"><Link to={wb ? '/whistleblower' : '/cases'}>{wb ? 'Whistleblower cases' : 'Fraud cases'}</Link> / {c.id}</div>
          <h1 className="row">{c.id} <StatusBadge s={c.status} /> <PriorityBadge p={c.priority} /> {wb && <Badge tone="orange">Whistleblower</Badge>} {c.frozen && <Badge tone="grey">Frozen</Badge>} {c.disabled && <Badge tone="red">Disabled</Badge>}</h1>
          <p>{c.customer_name ?? 'No customer yet'} {c.cif && <>· CIF <span className="mono">{c.cif}</span></>} · {c.entity} · {c.risk_l1 ?? 'Unclassified'}{c.risk_title ? ` / ${c.risk_title}` : ''} · {c.complexity ?? '–'} · TAT {fmtDur(c.tat_ms)}</p>
        </div>
        <div className="row">
          {!wb && <button className="btn" onClick={() => act(() => download(`/cases/${c.id}/report.docx`, `${c.id}-report.docx`), 'Report downloaded')}>Report (.docx)</button>}
        </div>
      </div>
      {!wb ? (
        <div className="stage-bar" style={{ marginBottom: 16 }}>
          {STD_STAGES.map((s, i) => <div key={s} className={`stage ${i < idx ? 'done' : i === idx ? 'current' : ''}`}>{s}{i === 5 && c.closed ? `: ${c.status.replace('Final report generated and closed', 'final report')}` : ''}</div>)}
        </div>
      ) : (
        <div className="stage-bar" style={{ marginBottom: 16 }}>
          {['FP&I creates (Draft)', 'HR / Governance investigate', 'Closed'].map((s, i) => { const wi = c.status === 'Draft' ? 0 : c.status === 'Under Investigation' ? 1 : 2; return <div key={s} className={`stage ${i < wi ? 'done' : i === wi ? 'current' : ''}`}>{s}</div> })}
        </div>
      )}
      {c.status === 'Return for re-work' && <div className="alert-box error" style={{ marginBottom: 12 }}>Returned for rework to the {ownerLabel(c.owner)}. See the latest comment in the audit trail: “{full.audit.find((a: any) => /return/i.test(a.action))?.comment}”</div>}
      <div className="ws">
        <nav className="sidepanel card card-pad" aria-label="Case sections">
          {groups.map((g) => (
            <div key={g}>
              <div className="kpi-label" style={{ margin: '8px 12px 4px' }}>{g}</div>
              {sections.filter((s) => s.group === g).map((s) => <button key={s.id} className={`sp ${sec === s.id ? 'on' : ''}`} onClick={() => setSec(s.id)}><span>{s.label}</span>{s.badge ? <span className="badge badge-outline">{s.badge}</span> : null}</button>)}
            </div>
          ))}
        </nav>
        <div className="stack">
          {dirty && editable && (
            <div className="alert-box warn" style={{ position: 'sticky', top: 66, zIndex: 5, justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Unsaved changes. You can save a draft even if mandatory fields are missing (FR-CASE-026).</span>
              <div className="row"><button className="btn btn-sm" onClick={() => setDraft(init)}>Discard</button><button className="btn btn-sm btn-primary" onClick={save}>Save draft</button></div>
            </div>
          )}
          {!editable && !c.frozen && <div className="alert-box info">Read-only: {c.assigned_to ? `assigned to ${c.assigned_name}` : `waiting in the ${ownerLabel(c.owner)} pool`}.</div>}
          {sec === 'details' && <S.DetailsSection {...props} />}
          {sec === 'customer' && <S.CustomerSection {...props} />}
          {sec === 'source' && <S.SourceSection {...props} />}
          {sec === 'risk' && <S.RiskSection {...props} />}
          {sec === 'txns' && <S.TransactionsSection {...props} />}
          {sec === 'finsum' && <S.FinancialSummarySection {...props} />}
          {sec === 'actions' && <S.MandatoryActionsSection {...props} />}
          {sec === 'parties' && <S.PartiesSection {...props} canEditParties={canWork} />}
          {sec === 'rec' && <S.FoRecommendationSection {...props} />}
          {sec === 'evidence' && <S.EvidenceSection {...props} canWork={canWork} />}
          {sec === 'checklist' && <S.ChecklistSection {...props} canWork={canWork} />}
          {sec === 'diary' && <S.DiarySection {...props} canWork={canWork} />}
          {sec === 'impact' && <S.FinancialImpactSection {...props} />}
          {sec === 'fpirec' && <S.FpiRecommendationSection {...props} />}
          {sec === 'joint' && <S.JointSection full={full} />}
          {sec === 'report' && <S.ReportSection {...props} />}
          {sec === 'audit' && <S.AuditSection full={full} />}
          {sec === 'diff' && <S.DiffSection full={full} />}
          {sec === 'post' && <S.PostClosureSection full={full} />}
        </div>
        <div className="stack rail">
          <ActionRail full={full} dirty={dirty} save={save} />
          <AiAssist compact surface={c.closed ? 'post-closure' : c.owner === 'FO_MAKER' ? 'case-maker' : c.owner === 'FO_CHECKER' ? 'case-checker' : c.owner === 'FPI_INVESTIGATOR' ? 'investigation' : c.owner === 'FPI_REVIEWER' || c.owner === 'FPI_APPROVER' ? 'review' : 'global'} />
        </div>
      </div>
    </>
  )
}

const TONE: Partial<Record<CaseAction, 'primary' | 'accent' | 'danger'>> = {
  checker_reject: 'danger', checker_return: 'danger', inv_return: 'danger', rev_return: 'danger', app_return: 'danger',
  submit: 'accent', checker_approve: 'accent', inv_submit: 'accent', rev_send_approver: 'accent', app_approve: 'accent', rev_approve_close: 'primary', inv_approve_afs: 'primary', wb_route: 'accent', wb_close: 'accent', reopen: 'primary',
}

function ActionRail({ full, dirty, save }: { full: any; dirty: boolean; save: () => Promise<unknown> }) {
  const me = useMe()
  const act = useAct()
  const nav = useNavigate()
  const users = useApi<any[]>(hasRole(me, 'SUPER_USER', 'MANAGER') ? '/users' : null)
  const c = full.case
  const [pending, setPending] = useState<CaseAction | null>(null)
  const [assignee, setAssignee] = useState('')
  const v = full.validation
  const doTransition = async (action: CaseAction, comment: string) => {
    if (dirty) await save()
    await act(() => api(`/cases/${c.id}/transition`, { method: 'POST', body: { action, comment } }), CASE_ACTION_LABELS[action])
    setPending(null)
  }
  const atMaker = c.owner === 'FO_MAKER' && !c.closed
  const atInv = c.owner === 'FPI_INVESTIGATOR' && c.assigned_to
  return (
    <Card title="Workflow">
      <div className="stack">
        <dl className="kv" style={{ gridTemplateColumns: '92px 1fr', fontSize: 12.5 }}>
          <dt>Desk</dt><dd>{ownerLabel(c.owner)}</dd>
          <dt>Assigned</dt><dd>{c.assigned_name ?? <span className="muted">In pool</span>}</dd>
          <dt>Created by</dt><dd>{full.people.creator} <span className="muted small">({c.origin})</span></dd>
          {full.people.maker && <><dt>Maker</dt><dd>{full.people.maker}</dd></>}
          {full.people.checker && <><dt>Checker</dt><dd>{full.people.checker}</dd></>}
          {full.people.investigator && <><dt>Investigator</dt><dd>{full.people.investigator}</dd></>}
          {full.people.reviewer && <><dt>Reviewer</dt><dd>{full.people.reviewer}</dd></>}
          {full.people.approver && <><dt>Approver</dt><dd>{full.people.approver}</dd></>}
          {full.alert && <><dt>From alert</dt><dd><Link to={`/alerts/${full.alert.id}`} className="mono">{full.alert.id}</Link></dd></>}
          {c.returned_count > 0 && <><dt>Rework loops</dt><dd style={{ color: 'var(--red)' }}>{c.returned_count}</dd></>}
          {c.routing_note && <><dt>Routing</dt><dd className="small">{c.routing_note}</dd></>}
        </dl>
        {full.canClaim && <button className="btn btn-accent" onClick={() => act(() => api(`/cases/${c.id}/claim`, { method: 'POST' }), 'Case assigned to you')}>Pick up from {ownerLabel(c.owner)} pool</button>}
        {!c.assigned_to && !full.canClaim && full.claimBlockedReason && c.owner !== 'NONE' && /Separation/.test(full.claimBlockedReason) && <div className="alert-box error small">{full.claimBlockedReason}</div>}
        {atMaker && c.assigned_to === me.id && v.missingMandatory.length > 0 && <div className="alert-box warn small"><div><b>Before submitting:</b> {v.missingMandatory.join(', ')}</div></div>}
        {atInv && c.assigned_to === me.id && (v.financialErrors.length > 0 || !v.hasRecommendation || v.jointPending.INVESTIGATION.length > 0) && (
          <div className="alert-box warn small"><div>{v.financialErrors.map((e: string) => <div key={e}>• {e}</div>)}{!v.hasRecommendation && <div>• Investigator recommendation required</div>}{v.jointPending.INVESTIGATION.length > 0 && <div>• Waiting for co-investigators: {v.jointPending.INVESTIGATION.join(', ')}</div>}</div></div>
        )}
        {c.owner === 'FO_CHECKER' && full.routingPreview && <div className="alert-box info small"><div><b>If approved:</b> {full.routingPreview.explanation}</div></div>}
        {full.actions.length > 0 && <div className="kpi-label">Your actions</div>}
        {full.actions.map((a: CaseAction) => <button key={a} className={`btn btn-${TONE[a] ?? 'primary'}`} style={{ justifyContent: 'center' }} onClick={() => setPending(a)}>{CASE_ACTION_LABELS[a]}</button>)}
        {c.status === 'Draft' && c.returned_count === 0 && (c.created_by === me.id || hasRole(me, 'SUPER_USER')) && <button className="btn btn-danger btn-sm" onClick={async () => { if (confirm(`Delete draft ${c.id}?`)) { const r = await act(() => api(`/cases/${c.id}`, { method: 'DELETE' }), 'Draft deleted'); if (r) nav('/cases') } }}>Delete draft</button>}
        {hasRole(me, 'SUPER_USER', 'MANAGER') && !c.closed && (
          <>
            <div className="hr" />
            <div className="kpi-label">Supervisor</div>
            <Field label={`Assign within ${ownerLabel(c.owner)} desk`}><Select value={assignee} onChange={setAssignee} options={(users.data ?? []).map((u) => ({ value: u.id, label: u.name }))} /></Field>
            <button className="btn btn-sm" disabled={!assignee} onClick={() => act(() => api(`/cases/${c.id}/claim`, { method: 'POST', body: { toUserId: assignee } }), 'Case assigned')}>Assign</button>
          </>
        )}
        {hasRole(me, 'SUPER_USER') && <button className="btn btn-sm btn-danger" onClick={() => { const comment = prompt(c.disabled ? 'Reason to enable:' : 'Reason to disable this case:'); if (comment) act(() => api(`/cases/${c.id}/disable`, { method: 'POST', body: { disabled: !c.disabled, comment } }), c.disabled ? 'Case enabled' : 'Case disabled') }}>{c.disabled ? 'Enable case' : 'Disable case'}</button>}
        {c.closed && <div className="alert-box ok small">Closed {fmtDateTime(c.closed_at)}{c.report_email_at && <> · final report emailed {fmtDateTime(c.report_email_at)}</>}. Net loss {fmtAed(full.data.financialImpact.net)}.</div>}
      </div>
      {pending && (
        <CommentModal title={CASE_ACTION_LABELS[pending]} confirm={CASE_ACTION_LABELS[pending]} tone={TONE[pending] ?? 'primary'} onClose={() => setPending(null)} onConfirm={(cm) => doTransition(pending, cm)}>
          {pending === 'checker_approve' && full.routingPreview && <div className="alert-box info small">{full.routingPreview.explanation}</div>}
          {['rev_approve_close', 'app_approve', 'inv_approve_afs', 'wb_close'].includes(pending) && <div className="alert-box warn small">The final report will be generated and emailed to stakeholders, and the case will be closed and frozen.</div>}
          {pending === 'app_return' && [c.risk_l1, c.risk_l2].includes('Advance Fee Scam') && <div className="alert-box warn small">Advance Fee Scam: a return goes back to the Fraud Ops Maker (FR-CASE-075).</div>}
          {dirty && <div className="small muted">Your unsaved edits will be saved first.</div>}
        </CommentModal>
      )}
    </Card>
  )
}
