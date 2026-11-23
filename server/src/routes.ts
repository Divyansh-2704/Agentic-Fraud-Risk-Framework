import cors from 'cors'
import express, { type NextFunction, type Request, type Response } from 'express'
import type { User } from '../../shared/src/index.js'
import { AGENTS, AGENT_GUARDRAILS, ALERT_STATUSES, CASE_STATUSES, DROPDOWNS, PRECAUTION_CATALOGUE, RISK_CATEGORIES, CHECKLIST_TEMPLATES, ALERT_SUBCLASS, PREVENTION_DECISIONS, POST_TASK_TYPES } from '../../shared/src/index.js'
import { all, get, getConfig, initDb, loadFile, refreshCache, setConfig } from './db.js'
import * as A from './services/alerts.js'
import * as C from './services/cases.js'
import { getUser, hasRole, HttpError, listUsers, forbidden, bad, notFound, canSeeCase, emailVisibleTo } from './services/common.js'
import { dashboard, processCounts } from './services/dashboard.js'
import { buildCaseReport } from './services/report.js'
import { scenarioRecordIds } from '../../shared/src/scenarios.js'
import { seedAll } from './seed.js'

declare global { namespace Express { interface Request { user: User } } }

type H = (req: Request, res: Response) => unknown
const h = (fn: H) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    const out = await fn(req, res)
    if (out !== undefined && !res.headersSent) res.json(out)
  } catch (e) { next(e) }
}

const CONFIG_KEYS = ['routingRules', 'afsThresholdAed', 'slaMinutes', 'caseSlaDays', 'maxReschedules', 'rescheduleHours', 'historyAlerts', 'txnMonths', 'eddAlertDays', 'archiveDays', 'reminderDays', 'autoAllocate', 'scenarios', 'precautionMapping', 'checklistByCategory', 'reportableByCategory', 'holidays']

export function createApp() {
  const app = express()
  app.use(cors())
  app.use(express.json({ limit: '60mb' })) // FR-CASE-025: large evidence files (base64)

  // Every API request sees the latest users + configuration (cached per server instance between requests).
  app.use('/api', async (_req, _res, next) => { try { await initDb(); await refreshCache(); next() } catch (e) { next(e) } })

  app.get('/api/health', (_req, res) => res.json({ ok: true }))
  app.get('/api/users', h(() => listUsers()))

  // Demo authentication: the client sends X-User (SSO is out of scope for the prototype).
  app.use('/api', (req, _res, next) => {
    const u = getUser(String(req.header('x-user') ?? ''))
    if (!u) return next(new HttpError(401, 'Choose a user (X-User header).'))
    req.user = u
    next()
  })

  app.get('/api/me', h((req) => req.user))
  app.get('/api/meta', h(() => ({
    alertStatuses: ALERT_STATUSES, caseStatuses: CASE_STATUSES, dropdowns: DROPDOWNS, precautions: PRECAUTION_CATALOGUE, riskCategories: RISK_CATEGORIES,
    checklistTemplates: CHECKLIST_TEMPLATES, alertSubclass: ALERT_SUBCLASS, preventionDecisions: PREVENTION_DECISIONS, postTaskTypes: POST_TASK_TYPES,
    emailTemplates: Object.entries(A.ALERT_EMAIL_TEMPLATES).map(([id, t]) => ({ id, ...t })),
  })))

  // ---------- Test-scenario pack ----------
  app.get('/api/scenarios/status', h(async () => {
    const rows = [...await all<{ id: string; status: string }>('SELECT id, status FROM alerts'), ...await all<{ id: string; status: string }>('SELECT id, status FROM cases')]
    const st = new Map(rows.map((r) => [r.id, r.status]))
    return Object.fromEntries(scenarioRecordIds().map((id) => [id, st.get(id) ?? null]))
  }))
  app.post('/api/admin/reset', h(async (req) => {
    if (!hasRole(req.user, 'SUPER_USER')) throw forbidden('Only a super user can reset the demo data.')
    await seedAll()
    return { ok: true }
  }))

  // ---------- Config (FR-CASE-035 "X" configurable by FP&I; others super user) ----------
  app.get('/api/config', h(() => Object.fromEntries(CONFIG_KEYS.map((k) => [k, getConfig(k, null)]))))
  app.put('/api/config/:key', h(async (req) => {
    const key = req.params.key
    if (!CONFIG_KEYS.includes(key)) throw notFound('Unknown config key')
    const fpiAllowed = ['afsThresholdAed', 'routingRules', 'checklistByCategory']
    if (!hasRole(req.user, 'SUPER_USER') && !(fpiAllowed.includes(key) && hasRole(req.user, 'FPI_APPROVER', 'FPI_REVIEWER'))) throw forbidden('Not allowed to change this setting.')
    await setConfig(key, req.body.value, req.user.id)
    return { ok: true }
  }))

  // ---------- Alerts ----------
  app.get('/api/alerts', h((req) => A.listAlerts(req.user, req.query as any)))
  app.post('/api/alerts/ingest', h(async (req) => { // DSP real-time API (FR-ALT-01)
    if (!hasRole(req.user, 'SUPER_USER')) throw forbidden('Only the integration user can ingest alerts.')
    return { id: await A.ingestAlert(req.body) }
  }))
  app.post('/api/alerts/assign', h((req) => A.assignAlerts(req.user, req.body.ids ?? [], req.body.toUserId)))
  app.get('/api/alerts/:id', h((req) => A.alertWorkspace(req.user, req.params.id)))
  app.post('/api/alerts/:id/act', h((req) => A.alertAct(req.user, req.params.id, req.body)))
  app.put('/api/alerts/:id/precautions', h((req) => A.updatePrecautions(req.user, req.params.id, req.body.steps ?? [])))
  app.put('/api/alerts/:id', h((req) => A.updateAlertFields(req.user, req.params.id, req.body)))
  app.post('/api/alerts/:id/email', h((req) => A.sendAlertEmail(req.user, req.params.id, req.body.template)))
  app.post('/api/alerts/:id/case', h(async (req) => {
    const a = await get('SELECT * FROM alerts WHERE id = ?', req.params.id)
    if (!a) throw notFound()
    if (a.serviced_by !== req.user.id && !hasRole(req.user, 'SUPER_USER')) throw forbidden('Only the analyst who decided the alert can create its case.')
    return { caseId: await C.createCaseFromAlert(req.user, req.params.id) }
  }))
  app.post('/api/alerts/:id/evidence', h((req) => C.addEvidence(req.user, { alertId: req.params.id }, req.body)))
  app.post('/api/jobs/daily-sla-summary', h((req) => {
    if (!hasRole(req.user, 'SUPER_USER', 'MANAGER')) throw forbidden('Managers only.')
    return A.dailySlaSummary()
  }))

  // ---------- Cases ----------
  app.get('/api/cases', h((req) => C.listCases(req.user, req.query as any)))
  app.post('/api/cases', h(async (req) => ({ id: await C.createCase(req.user, req.body) })))
  app.post('/api/integrations/crm-sr', h(async (req) => { // auto creation from a CRM service request (FR-CASE-01)
    if (!hasRole(req.user, 'SUPER_USER')) throw forbidden('Integration user only.')
    return { id: await C.createCase(req.user, { cif: req.body.cif, srNumber: req.body.srNumber, description: req.body.description }, { system: true }) }
  }))
  app.get('/api/cases/:id', h((req) => C.getCaseFull(req.user, req.params.id)))
  app.put('/api/cases/:id', h((req) => C.saveCase(req.user, req.params.id, req.body)))
  app.delete('/api/cases/:id', h((req) => C.deleteDraft(req.user, req.params.id)))
  app.post('/api/cases/:id/claim', h((req) => C.claimCase(req.user, req.params.id, req.body?.toUserId)))
  app.post('/api/cases/:id/transition', h((req) => C.transitionCase(req.user, req.params.id, req.body.action, String(req.body.comment ?? ''))))
  app.post('/api/cases/:id/disable', h((req) => C.setDisabled(req.user, req.params.id, !!req.body.disabled, req.body.comment)))
  app.get('/api/cases/:id/txn-search', h((req) => C.searchCaseTransactions(req.params.id, req.query as any)))
  app.post('/api/cases/:id/transactions', h((req) => C.addCaseTransactions(req.user, req.params.id, req.body.txnIds ?? [])))
  app.put('/api/cases/:id/transactions/:rid', h((req) => C.updateCaseTransaction(req.user, req.params.id, Number(req.params.rid), req.body)))
  app.delete('/api/cases/:id/transactions/:rid', h((req) => C.removeCaseTransaction(req.user, req.params.id, Number(req.params.rid))))
  app.get('/api/lookup/:kind/:ref', h((req) => C.lookupParty(req.params.kind, req.params.ref)))
  app.post('/api/cases/:id/parties', h((req) => C.addParty(req.user, req.params.id, req.body)))
  app.put('/api/cases/:id/parties/:pid', h((req) => C.updateParty(req.user, req.params.id, Number(req.params.pid), req.body)))
  app.delete('/api/cases/:id/parties/:pid', h((req) => C.removeParty(req.user, req.params.id, Number(req.params.pid))))
  app.post('/api/cases/:id/checklist', h((req) => C.addChecklistItem(req.user, req.params.id, req.body)))
  app.put('/api/cases/:id/checklist/:cid', h((req) => C.updateChecklistItem(req.user, req.params.id, req.params.cid, req.body)))
  app.delete('/api/cases/:id/checklist/:cid', h((req) => C.removeChecklistItem(req.user, req.params.id, req.params.cid)))
  app.post('/api/cases/:id/log', h((req) => C.addLog(req.user, req.params.id, req.body)))
  app.put('/api/cases/:id/log/:lid', h((req) => C.updateLog(req.user, req.params.id, Number(req.params.lid), req.body)))
  app.post('/api/cases/:id/evidence', h((req) => C.addEvidence(req.user, { caseId: req.params.id }, req.body)))
  app.post('/api/cases/:id/investigators', h((req) => C.addCoInvestigator(req.user, req.params.id, req.body.userId, req.body.stage ?? 'INVESTIGATION')))
  app.post('/api/cases/:id/investigators/done', h((req) => C.markCoDone(req.user, req.params.id, req.body.stage ?? 'INVESTIGATION', req.body.done !== false)))
  app.post('/api/cases/:id/recoveries', h((req) => C.createRecovery(req.user, req.params.id, req.body)))
  app.post('/api/cases/:id/recoveries/:rid/decide', h((req) => C.decideRecovery(req.user, req.params.id, Number(req.params.rid), !!req.body.approve, String(req.body.comment ?? ''))))
  app.get('/api/cases/:id/report.docx', h(async (req, res) => { // FR-CASE-061/062: on-demand report in Word
    const full = await C.getCaseFull(req.user, req.params.id)
    const buf = await buildCaseReport(full)
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.id}-investigation-report.docx"`)
    res.send(buf)
  }))

  app.get('/api/evidence/:id/download', h(async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id)) throw notFound('No such evidence item.')
    const e = await get('SELECT * FROM evidence WHERE id = ?', id)
    if (!e || !e.path) throw notFound('No file stored for this evidence item.')
    if (e.case_id) { const c = await get('SELECT * FROM cases WHERE id = ?', e.case_id); if (c && !canSeeCase(req.user, c)) throw forbidden('Chinese wall.') }
    const buf = await loadFile(e.path)
    if (!buf) throw notFound('File missing')
    res.setHeader('Content-Type', e.mime || 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename="${String(e.name).replace(/"/g, '')}"`)
    res.send(buf)
  }))

  app.get('/api/post-tasks', h((req) => C.listPostTasks(req.user)))
  app.put('/api/post-tasks/:id', h((req) => C.updatePostTask(req.user, req.params.id, req.body)))
  app.get('/api/calendar', h((req) => C.calendar(req.user)))
  app.get('/api/outbox', h(async (req) => {
    const rows = await all('SELECT * FROM outbox ORDER BY ts DESC, id DESC LIMIT 1000')
    // Managers / super user see everything; others see mail sent to them or to their team mailbox (fraud.ops@, fpi.team@, hr.governance@).
    return (hasRole(req.user, 'SUPER_USER', 'MANAGER') ? rows : rows.filter((r) => emailVisibleTo(req.user, r))).slice(0, 300)
  }))
  // Type-ahead for the global search box: top matches across cases and alerts (live and history), Chinese wall applied.
  app.get('/api/search/suggest', h(async (req) => {
    const q = String(req.query.q ?? '').trim()
    if (q.length < 2) return []
    const cases = [...(await C.listCases(req.user, { scope: 'live', q })).rows, ...(await C.listCases(req.user, { scope: 'history', q })).rows]
    const alerts = [...(await A.listAlerts(req.user, { scope: 'live', q })).rows, ...(await A.listAlerts(req.user, { scope: 'history', q })).rows] as any[]
    const exact = (id: string) => (id.toLowerCase() === q.toLowerCase() ? 0 : id.toLowerCase().includes(q.toLowerCase()) ? 1 : 2)
    return [
      ...cases.map((c: any) => ({ kind: 'Case', id: c.id, label: `${c.id} · ${c.customer_name ?? 'No customer'}`, sub: c.status, rank: exact(c.id) })),
      ...alerts.map((a: any) => ({ kind: 'Alert', id: a.id, label: `${a.id} · ${a.customer_name}`, sub: a.status, rank: exact(a.id) })),
    ].sort((x, y) => x.rank - y.rank).slice(0, 8).map(({ rank: _r, ...rest }) => rest)
  }))
  app.get('/api/dashboard', h((req) => dashboard(req.user, req.query as any)))
  app.get('/api/process-counts', h((req) => processCounts(req.user)))

  // ---------- AI agents (Sheet 8): registry only in v1; the agent layer plugs in here later ----------
  app.get('/api/agents', h(async () => {
    const reg = new Map((await all('SELECT id, status FROM agent_registry')).map((r) => [r.id, r.status]))
    return { guardrails: AGENT_GUARDRAILS, agents: AGENTS.map((a) => ({ ...a, status: reg.get(a.id) ?? 'planned' })), runs: await all('SELECT * FROM agent_runs ORDER BY ts DESC LIMIT 50') }
  }))
  app.post('/api/agents/:id/run', h((req, res) => {
    if (!AGENTS.find((a) => a.id === req.params.id)) throw notFound('Unknown agent')
    res.status(501)
    return { error: 'Agent layer not enabled in this release. The tool contract is defined in /api/agents and will be wired to Claude tool use in the next phase.' }
  }))
  app.post('/api/assistant/ask', h((_req, res) => { res.status(501); return { error: 'Gen AI Q&A is not enabled in this release.' } }))

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err instanceof HttpError ? err.status : 500
    if (status === 500) console.error(err)
    res.status(status).json({ error: err.message ?? 'Server error' })
  })
  return app
}
export { bad }
