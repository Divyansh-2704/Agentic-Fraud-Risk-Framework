// Disposition agent (#4): recommends Confirmed Fraud / False Positive / Inconclusive for an alert, with evidence.
//
//   real alert data ──► Presidio masking service ──► masked JSON ──► LLM (OpenRouter) ──► masked answer
//                              │ token table stays here                                      │
//                              └──────────────── unmask (tokens -> real values) ◄────────────┘──► analyst
//
// Guardrails: nothing is sent unless masking succeeded and no known real value is left in the masked JSON (fails
// closed); the answer must match a strict schema; every evidence item must cite records that exist; a decisive verdict
// without verified evidence is downgraded to Inconclusive. The agent only recommends: the analyst still decides.
import { waitUntil } from '@vercel/functions'
import { ALERT_SUBCLASS, type User } from '../../../shared/src/index.js'
import { all, get, getConfig, insert, json, nowIso, outsideTx, run, type Row } from '../db.js'
import { PROMPT_VERSION, RESPONSE_SCHEMA, SYSTEM_PROMPT, userPrompt, VERDICTS, type Verdict } from './aiPrompt.js'
import { bad, canSeeAlert, forbidden, hasRole, notFound } from './common.js'

export interface AiConfig { enabled: boolean; autoAnalyse: boolean; model: string; reasoningEffort: 'none' | 'low' | 'medium' | 'high' }
export const AI_DEFAULTS: AiConfig = { enabled: true, autoAnalyse: true, model: 'anthropic/claude-sonnet-5.5', reasoningEffort: 'medium' }
const aiConfig = (): AiConfig => ({ ...AI_DEFAULTS, ...getConfig<Partial<AiConfig>>('aiAgent', {}) })

const OPENROUTER_BASE = () => (process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1').replace(/\/$/, '')
const maskingBase = () => { const u = process.env.MASKING_URL || 'http://127.0.0.1:5055/'; return u.endsWith('/') ? u : `${u}/` }
const disabledByEnv = () => !!process.env.AI_AGENT_DISABLED && process.env.AI_AGENT_DISABLED !== '0'
const STALE_RUNNING_MS = 5 * 60_000

export function aiState() {
  const cfg = aiConfig()
  return { configured: !!process.env.OPENROUTER_API_KEY, enabled: cfg.enabled && !disabledByEnv(), autoAnalyse: cfg.autoAnalyse, model: cfg.model, promptVersion: PROMPT_VERSION }
}

// ---------------------------------------------------------------- context (real data; masked before it leaves)
const daysMs = (d: number) => d * 86400_000
function ageBand(dob: string | null | undefined) {
  if (!dob) return null
  const age = Math.floor((Date.now() - new Date(dob).getTime()) / daysMs(365.25))
  if (!Number.isFinite(age)) return null
  const lo = Math.floor(age / 10) * 10
  return `${lo}-${lo + 9}`
}
const round = (n: number) => Math.round(n * 100) / 100

export async function buildContext(alertId: string) {
  const a = await get('SELECT * FROM alerts WHERE id = ?', alertId)
  if (!a) throw notFound('Alert not found')
  const cust = await get('SELECT * FROM customers WHERE cif = ?', a.cif)
  const alertTime = new Date(a.created_at).getTime()
  const since = new Date(alertTime - daysMs(90)).toISOString()
  const txns = await all('SELECT * FROM transactions WHERE cif = ? AND date >= ? ORDER BY date DESC LIMIT 200', a.cif, since)
  const before = txns.filter((t) => new Date(t.date).getTime() <= alertTime)
  const aed = before.filter((t) => t.currency === 'AED')
  const out = aed.filter((t) => t.amount < 0).map((t) => -t.amount)
  const inn = aed.filter((t) => t.amount > 0).map((t) => t.amount)
  const byCp = new Map<string, { count: number; total: number }>()
  for (const t of before) { const k = t.counterparty ?? 'Unknown'; const v = byCp.get(k) ?? { count: 0, total: 0 }; v.count++; v.total += t.amount; byCp.set(k, v) }
  const avgOut = out.length ? out.reduce((s, x) => s + x, 0) / out.length : 0
  const alerted = a.txn_ref ? await get('SELECT * FROM transactions WHERE id = ?', a.txn_ref) : undefined
  const benPrev = a.beneficiary_account ? await all('SELECT date, amount, currency FROM transactions WHERE iban = ? AND cif = ? AND date < ? ORDER BY date', a.beneficiary_account, a.cif, a.created_at) : []

  const linkedAlert = (r: Row) => ({ alert_id: r.id, other_cif: r.cif, customer_name: r.customer_name, created_at: r.created_at, typology: r.typology, status: r.status, decision: r.decision, sub_class: r.sub_class })
  const byDevice = a.device_id ? await all('SELECT * FROM alerts WHERE device_id = ? AND id <> ? ORDER BY created_at DESC LIMIT 10', a.device_id, a.id) : []
  const byBen = a.beneficiary_account ? await all('SELECT * FROM alerts WHERE beneficiary_account = ? AND id <> ? ORDER BY created_at DESC LIMIT 10', a.beneficiary_account, a.id) : []
  const benCases = a.beneficiary_account ? await all(`SELECT DISTINCT c.id, c.status, c.risk_l1, c.risk_l2, p.suspect, p.blacklist FROM case_parties p JOIN cases c ON c.id = p.case_id WHERE p.ref = ?
    UNION SELECT DISTINCT c.id, c.status, c.risk_l1, c.risk_l2, 0 AS suspect, 0 AS blacklist FROM case_transactions t JOIN cases c ON c.id = t.case_id WHERE t.beneficiary_account = ?`, a.beneficiary_account, a.beneficiary_account) : []
  const ruleClosed = await all("SELECT decision FROM alerts WHERE rule_id = ? AND status = 'Closed' AND decision IS NOT NULL AND id <> ?", a.rule_id, a.id)
  const confirmed = ruleClosed.filter((r) => r.decision === 'Confirmed Fraud').length

  return {
    alert: {
      alert_id: a.id, created_at: a.created_at, category: a.category, mode: a.mode,
      rule: { rule_id: a.rule_id, rule_name: a.rule_name, scenario_id: a.scenario_id, condition: a.rule_condition, decision_layer: a.decision_layer },
      alert_type: a.alert_type, typology: a.typology, risk_score: a.risk_score, priority: a.priority,
      txn_amount_aed: a.txn_amount, available_balance_aed: a.available_balance, account: a.account, txn_ref: a.txn_ref,
      alert_on: a.alert_on, alerted_entity_type: a.alerted_entity_type, device_id: a.device_id, beneficiary_account: a.beneficiary_account,
      prevention_colour: a.prevention_colour, transaction_held: !!a.held, sr_type: a.sr_type, data_quality_exceptions: json<string[]>(a.dq_exceptions, []),
      // Work already done on the alert (the alert's own decision is never sent, so the agent judges independently).
      edd_response: a.edd_response, fpi_referral_note: a.fpi_referral, fpi_response: a.fpi_response, analyst_notes: a.notes,
    },
    customer: cust ? {
      cif: cust.cif, name: cust.name, entity: cust.entity, segment: cust.segment, rm: cust.rm, eid: cust.eid, passport: cust.passport,
      trade_licence: cust.tl, nationality: cust.nationality, age_band: ageBand(cust.dob), accounts: json<string[]>(cust.accounts, []),
      cards: json<string[]>(cust.cards, []), linked_cifs: json<string[]>(cust.linked_cifs, []),
    } : { cif: a.cif, name: a.customer_name, note: 'Customer not found in the Feature Store.' },
    alerted_transaction: alerted ? { txn_id: alerted.id, date: alerted.date, type: alerted.type, amount: alerted.amount, currency: alerted.currency, balance_after: alerted.balance, counterparty: alerted.counterparty, counterparty_iban: alerted.iban, channel: alerted.channel, account: alerted.account } : null,
    transactions_90d: txns.map((t) => ({ txn_id: t.id, date: t.date, type: t.type, amount: t.amount, currency: t.currency, balance_after: t.balance, counterparty: t.counterparty, counterparty_iban: t.iban, channel: t.channel, account: t.account, after_alert: new Date(t.date).getTime() > alertTime })),
    transaction_summary: {
      window: '90 days before the alert', transactions: before.length, outflows_aed: out.length, total_outflow_aed: round(out.reduce((s, x) => s + x, 0)),
      avg_outflow_aed: round(avgOut), max_outflow_aed: round(Math.max(0, ...out)), inflows_aed: inn.length, total_inflow_aed: round(inn.reduce((s, x) => s + x, 0)),
      foreign_currency_transactions: before.length - aed.length, distinct_counterparties: byCp.size,
      alert_amount_vs_avg_outflow: avgOut ? round(Number(a.txn_amount ?? 0) / avgOut) : null,
      top_counterparties: [...byCp.entries()].sort((x, y) => y[1].count - x[1].count).slice(0, 6).map(([counterparty, v]) => ({ counterparty, count: v.count, net_amount: round(v.total) })),
    },
    beneficiary_history: a.beneficiary_account ? {
      beneficiary_account: a.beneficiary_account, previous_payments: benPrev.length,
      first_seen: benPrev[0]?.date ?? null, last_seen: benPrev.at(-1)?.date ?? null,
      note: benPrev.length ? 'The customer paid this beneficiary before the alert.' : 'No earlier payment from this customer to this beneficiary in the data.',
    } : null,
    prior_alerts: (await all('SELECT * FROM alerts WHERE cif = ? AND id <> ? ORDER BY created_at DESC LIMIT 10', a.cif, a.id)).map((r) => ({
      alert_id: r.id, created_at: r.created_at, rule_name: r.rule_name, typology: r.typology, risk_score: r.risk_score, status: r.status, decision: r.decision, sub_class: r.sub_class, rationale: r.rationale,
    })),
    customer_cases: (await all('SELECT id, type, status, risk_l1, risk_l2, typology, created_at FROM cases WHERE cif = ? ORDER BY created_at DESC LIMIT 10', a.cif)).map((c) => ({ case_id: c.id, type: c.type, status: c.status, risk_l1: c.risk_l1, risk_l2: c.risk_l2, typology: c.typology, created_at: c.created_at })),
    linked_by_device: byDevice.map(linkedAlert),
    linked_by_beneficiary: { alerts: byBen.map(linkedAlert), cases: benCases.map((c) => ({ case_id: c.id, status: c.status, risk_l1: c.risk_l1, risk_l2: c.risk_l2, beneficiary_marked_suspect: !!c.suspect, beneficiary_blacklisted: !!c.blacklist })) },
    rule_performance: { rule_id: a.rule_id, closed_alerts: ruleClosed.length, confirmed_fraud: confirmed, false_positive: ruleClosed.length - confirmed, precision: ruleClosed.length ? round(confirmed / ruleClosed.length) : null },
  }
}

// ---------------------------------------------------------------- masking (Presidio service)
export interface Masked { masked: any; mapping: Record<string, string>; stats: Record<string, number>; engine: string }

export async function maskWithPresidio(data: unknown): Promise<Masked> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (process.env.MASKING_SERVICE_TOKEN) headers['X-Masking-Token'] = process.env.MASKING_SERVICE_TOKEN
  let res: Response
  try {
    res = await fetch(new URL('mask', maskingBase()), { method: 'POST', headers, body: JSON.stringify({ data }), signal: AbortSignal.timeout(60_000) })
  } catch (e: any) {
    throw new AiError('masking_unavailable', `Masking service unreachable (${e?.cause?.code ?? e?.message ?? e}). Nothing was sent to the LLM.`)
  }
  if (!res.ok) throw new AiError('masking_unavailable', `Masking service returned ${res.status}. Nothing was sent to the LLM.`)
  const body = await res.json() as Masked
  // Fail closed: if any real value we know about is still in the masked JSON, do not send it.
  const text = JSON.stringify(body.masked)
  const leaked = Object.values(body.mapping ?? {}).filter((v) => v.length >= 4 && text.includes(v))
  if (leaked.length) throw new AiError('masking_unavailable', `Masking check failed (${leaked.length} value(s) still visible). Nothing was sent to the LLM.`)
  return body
}

export async function maskingHealth() {
  try {
    const r = await fetch(new URL('health', maskingBase()), { signal: AbortSignal.timeout(4000) })
    return r.ok ? { ok: true, ...(await r.json() as object) } : { ok: false, error: `HTTP ${r.status}` }
  } catch (e: any) { return { ok: false, error: String(e?.cause?.code ?? e?.message ?? e) } }
}

const TOKEN_RE = /<[A-Z][A-Z_]*_\d+>/g
/** Puts the real values back into the LLM answer (strings at any depth). */
export function unmask<T>(value: T, mapping: Record<string, string>): T {
  if (typeof value === 'string') return value.replace(TOKEN_RE, (t) => mapping[t] ?? t) as T
  if (Array.isArray(value)) return value.map((v) => unmask(v, mapping)) as T
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, unmask(v, mapping)])) as T
  return value
}

// ---------------------------------------------------------------- LLM call (OpenRouter)
class AiError extends Error { constructor(public code: 'not_configured' | 'masking_unavailable' | 'llm_error' | 'invalid_output', message: string) { super(message) } }

interface LlmReply { content: string; model: string; usage: unknown }
async function callOpenRouter(messages: { role: string; content: string }[], cfg: AiConfig, structured: boolean): Promise<LlmReply> {
  const body: Record<string, unknown> = { model: cfg.model, messages, max_tokens: 6000 }
  if (structured) {
    body.response_format = { type: 'json_schema', json_schema: { name: 'alert_disposition', strict: true, schema: RESPONSE_SCHEMA } }
    body.provider = { require_parameters: true }
  }
  if (cfg.reasoningEffort !== 'none') body.reasoning = { effort: cfg.reasoningEffort, exclude: true }
  else body.temperature = 0
  let res: Response
  try {
    res = await fetch(`${OPENROUTER_BASE()}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json', 'X-Title': 'Agentic Fraud Risk Framework (prototype)' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(180_000),
    })
  } catch (e: any) { throw new AiError('llm_error', `OpenRouter unreachable: ${e?.message ?? e}`) }
  const data: any = await res.json().catch(() => ({}))
  if (!res.ok || data.error) throw new AiError('llm_error', `OpenRouter ${res.status}: ${data.error?.message ?? 'request failed'}`)
  const content = data.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) throw new AiError('llm_error', 'OpenRouter returned an empty answer.')
  return { content, model: data.model ?? cfg.model, usage: data.usage ?? null }
}

// ---------------------------------------------------------------- validation + grounding
export interface Evidence { finding: string; direction: 'supports_fraud' | 'supports_false_positive' | 'neutral'; weight: 'strong' | 'moderate' | 'weak'; sources: string[]; verified?: boolean }
export interface AiResult {
  verdict: Verdict; confidence: number; summary: string; suggested_sub_classification: string; evidence: Evidence[]
  red_flags: string[]; mitigating_factors: string[]; missing_information: string[]; recommended_next_steps: string[]; draft_rationale: string
  guardrail_notes?: string[]
}

function parseJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  try { return JSON.parse(t) } catch { /* fall through */ }
  const s = t.indexOf('{'), e = t.lastIndexOf('}')
  if (s >= 0 && e > s) return JSON.parse(t.slice(s, e + 1))
  throw new Error('not JSON')
}

const strArr = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === 'string')
export function validateShape(o: any): string[] {
  const errs: string[] = []
  if (!o || typeof o !== 'object') return ['The answer is not a JSON object.']
  if (!VERDICTS.includes(o.verdict)) errs.push(`verdict must be one of ${VERDICTS.join(', ')}.`)
  if (!Number.isInteger(o.confidence) || o.confidence < 0 || o.confidence > 100) errs.push('confidence must be an integer 0-100.')
  for (const k of ['summary', 'suggested_sub_classification', 'draft_rationale']) if (typeof o[k] !== 'string') errs.push(`${k} must be a string.`)
  for (const k of ['red_flags', 'mitigating_factors', 'missing_information', 'recommended_next_steps']) if (!strArr(o[k])) errs.push(`${k} must be an array of strings.`)
  if (!Array.isArray(o.evidence) || !o.evidence.length) errs.push('evidence must be a non-empty array.')
  else o.evidence.forEach((e: any, i: number) => {
    if (typeof e?.finding !== 'string' || !e.finding.trim()) errs.push(`evidence[${i}].finding is missing.`)
    if (!['supports_fraud', 'supports_false_positive', 'neutral'].includes(e?.direction)) errs.push(`evidence[${i}].direction is invalid.`)
    if (!['strong', 'moderate', 'weak'].includes(e?.weight)) errs.push(`evidence[${i}].weight is invalid.`)
    if (!strArr(e?.sources) || !e.sources.length) errs.push(`evidence[${i}].sources must list at least one record ID or field path.`)
  })
  return errs
}

/** Record IDs (alerts, cases, transaction tokens...) and every field path present in the masked document. */
export function referenceIndex(doc: unknown) {
  const ids = new Set<string>()
  const paths = new Set<string>()
  const walk = (node: unknown, path: string) => {
    if (Array.isArray(node)) { if (path) paths.add(path); node.forEach((v) => walk(v, path)); return }
    if (node && typeof node === 'object') {
      if (path) paths.add(path)
      for (const [k, v] of Object.entries(node)) {
        if (['alert_id', 'case_id', 'txn_id', 'txn_ref'].includes(k) && typeof v === 'string') ids.add(v)
        walk(v, path ? `${path}.${k}` : k)
      }
      return
    }
    if (path) paths.add(path)
    if (typeof node === 'string') for (const m of node.match(TOKEN_RE) ?? []) ids.add(m)
  }
  walk(doc, '')
  return { ids, paths }
}

/** A source is valid if it names a record in the document or a field path that exists (array indexes ignored). */
export function sourceIsValid(src: string, ref: ReturnType<typeof referenceIndex>) {
  const s = src.trim()
  if (ref.ids.has(s)) return true
  const tokens = s.match(TOKEN_RE) ?? []
  const ids = s.match(/\b(?:ALT|FC|WB)-[A-Z0-9-]+\b/g) ?? []
  if ([...tokens, ...ids].some((t) => ref.ids.has(t))) return true
  const path = s.replace(/\[[^\]]*\]/g, '').replace(/^\$\.?/, '')
  return ref.paths.has(path)
}

export function applyGuardrails(raw: AiResult, ref: ReturnType<typeof referenceIndex>): AiResult {
  const r: AiResult = { ...raw, guardrail_notes: [] }
  r.evidence = raw.evidence.map((e) => ({ ...e, verified: e.sources.some((s) => sourceIsValid(s, ref)) }))
  const unverified = r.evidence.filter((e) => !e.verified).length
  if (unverified) r.guardrail_notes!.push(`${unverified} evidence item(s) cite records that are not in the alert data: treat them with care.`)
  if (r.verdict !== 'Inconclusive') {
    const dir = r.verdict === 'Confirmed Fraud' ? 'supports_fraud' : 'supports_false_positive'
    const backing = r.evidence.filter((e) => e.verified && e.direction === dir && e.weight !== 'weak').length
    if (backing < 2) {
      r.guardrail_notes!.push(`Downgraded from ${r.verdict} to Inconclusive: fewer than two verified, non-weak evidence items support it.`)
      r.verdict = 'Inconclusive'
      r.confidence = Math.min(r.confidence, 60)
    }
  }
  // The sub-classification must be one the decision form offers for this verdict (case-insensitive match), else blank.
  const allowed = r.verdict === 'Inconclusive' ? [] : ALERT_SUBCLASS[r.verdict]
  const wanted = String(r.suggested_sub_classification ?? '').trim().toLowerCase()
  r.suggested_sub_classification = allowed.find((x) => x.toLowerCase() === wanted) ?? ''
  return r
}

// ---------------------------------------------------------------- one analysis
async function saveRow(alertId: string, patch: Row) {
  const keys = Object.keys(patch)
  await run(`UPDATE ai_analyses SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE alert_id = ?`, ...keys.map((k) => patch[k]), alertId)
}

/** Runs the full pipeline for one alert and stores the outcome (also on failure). Assumes the row is claimed. */
export async function analyseAlert(alertId: string, actor = 'system') {
  const cfg = aiConfig()
  const started = Date.now()
  const tools = ['get_alert', 'get_customer_profile', 'get_transactions_90d', 'get_alert_history', 'get_linked_alerts', 'get_rule_precision', 'mask_with_presidio', 'llm_disposition']
  try {
    if (!process.env.OPENROUTER_API_KEY) throw new AiError('not_configured', 'No OpenRouter API key: set OPENROUTER_API_KEY to switch the AI agent on.')
    const context = await buildContext(alertId)
    const m = await maskWithPresidio(context)
    const ref = referenceIndex(m.masked)
    const messages = [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userPrompt(m.masked) }]
    let reply: LlmReply
    try { reply = await callOpenRouter(messages, cfg, true) } catch (e) {
      // Some providers reject structured outputs or reasoning: retry once with the schema in the prompt only.
      if (!(e instanceof AiError) || e.code !== 'llm_error') throw e
      reply = await callOpenRouter(messages, { ...cfg, reasoningEffort: 'none' }, false)
    }
    let parsed: any, errors: string[]
    try { parsed = parseJson(reply.content); errors = validateShape(parsed) } catch { errors = ['The answer was not valid JSON.'] }
    if (errors.length) { // one repair attempt
      reply = await callOpenRouter([...messages, { role: 'assistant', content: reply.content }, { role: 'user', content: `Your answer failed validation:\n- ${errors.join('\n- ')}\nReturn the corrected JSON object only.` }], cfg, true)
      try { parsed = parseJson(reply.content); errors = validateShape(parsed) } catch { errors = ['The answer was not valid JSON.'] }
      if (errors.length) throw new AiError('invalid_output', `The model's answer did not match the required format: ${errors.slice(0, 3).join(' ')}`)
    }
    const guarded = applyGuardrails(parsed as AiResult, ref)
    const result = unmask(guarded, m.mapping)
    await saveRow(alertId, {
      status: 'done', verdict: result.verdict, confidence: result.confidence, model: reply.model, prompt_version: PROMPT_VERSION,
      result: JSON.stringify(result), masked_input: JSON.stringify(m.masked), masked_output: JSON.stringify(guarded), mask_stats: JSON.stringify({ ...m.stats, engine: m.engine }),
      error: null, finished_at: nowIso(), duration_ms: Date.now() - started, usage: JSON.stringify(reply.usage),
    })
    await insert('agent_runs', { agent_id: 'disposition', ts: nowIso(), actor, target_type: 'alert', target_id: alertId, tool_calls: JSON.stringify(tools), output: `${result.verdict} (${result.confidence}%)`, status: 'done' })
  } catch (e: any) {
    const code = e instanceof AiError ? e.code : 'failed'
    if (!(e instanceof AiError)) console.error(`AI analysis of ${alertId} failed:`, e)
    await saveRow(alertId, { status: code, error: String(e?.message ?? e), finished_at: nowIso(), duration_ms: Date.now() - started, model: cfg.model, prompt_version: PROMPT_VERSION })
    if (code !== 'not_configured') await insert('agent_runs', { agent_id: 'disposition', ts: nowIso(), actor, target_type: 'alert', target_id: alertId, tool_calls: JSON.stringify(tools), output: String(e?.message ?? e).slice(0, 300), status: code })
  }
  return getAnalysisRow(alertId)
}

// ---------------------------------------------------------------- queue (pre-analysis on arrival)
async function upsertQueued(alertId: string) {
  await run(`INSERT INTO ai_analyses (alert_id, status, requested_at, attempts) VALUES (?, 'queued', ?, 0)
    ON CONFLICT (alert_id) DO UPDATE SET status = 'queued', requested_at = excluded.requested_at, error = NULL`, alertId, nowIso())
}

/** Called on ingestion: queue the alert and start the background worker (no-op when the agent is switched off). */
export async function enqueueAnalysis(alertId: string) {
  const s = aiState()
  if (!s.enabled || !s.autoAnalyse) return
  await upsertQueued(alertId)
  kick()
}

/** Claims the next queued (or stale running) alert atomically, so several server instances never analyse one twice. */
async function claimNext(): Promise<string | null> {
  const stale = new Date(Date.now() - STALE_RUNNING_MS).toISOString()
  const r = await get<{ alert_id: string }>(`UPDATE ai_analyses SET status = 'running', started_at = ?, attempts = attempts + 1
    WHERE alert_id = (SELECT alert_id FROM ai_analyses WHERE status = 'queued' OR (status = 'running' AND started_at < ?) ORDER BY requested_at LIMIT 1 FOR UPDATE SKIP LOCKED)
    RETURNING alert_id`, nowIso(), stale)
  return r?.alert_id ?? null
}

let draining: Promise<number> | null = null
/** Works through the queue with a few parallel workers until it is empty or the time budget is used up. */
export function drainQueue(budgetMs = 240_000, workers = 3): Promise<number> {
  if (draining) return draining
  const until = Date.now() + budgetMs
  let done = 0
  const worker = async () => {
    while (Date.now() < until) {
      const id = await claimNext()
      if (!id) return
      await analyseAlert(id)
      done++
    }
  }
  draining = Promise.all(Array.from({ length: workers }, worker)).then(() => done).finally(() => { draining = null })
  return draining
}

/** Starts draining in the background. On Vercel, waitUntil keeps the function alive after the response is sent. */
export function kick() {
  if (!aiState().enabled) return
  // Run outside any open transaction of the caller (e.g. the seed), on its own pooled connections.
  const p = outsideTx(() => drainQueue()).catch((e) => { console.error('AI queue error:', e); return 0 })
  waitUntil(p)
}

// ---------------------------------------------------------------- read / API helpers
async function getAnalysisRow(alertId: string): Promise<Row | null> {
  const r = await get('SELECT * FROM ai_analyses WHERE alert_id = ?', alertId)
  if (!r) return null
  const parse = (s: string | null) => json<any>(s, null)
  return { ...r, result: parse(r.result), masked_input: parse(r.masked_input), masked_output: parse(r.masked_output), mask_stats: parse(r.mask_stats), usage: parse(r.usage) }
}

export async function getAnalysis(u: User, alertId: string) {
  const a = await get('SELECT * FROM alerts WHERE id = ?', alertId)
  if (!a) throw notFound('Alert not found')
  if (!canSeeAlert(u, a)) throw forbidden('Chinese wall: you cannot view this alert.')
  return { state: aiState(), analysis: await getAnalysisRow(alertId) }
}

/** Analyst clicks "Analyse now" / "Re-analyse": runs synchronously and returns the result. */
export async function analyseNow(u: User, alertId: string) {
  const a = await get('SELECT * FROM alerts WHERE id = ?', alertId)
  if (!a) throw notFound('Alert not found')
  if (!canSeeAlert(u, a)) throw forbidden('Chinese wall: you cannot view this alert.')
  if (!aiState().enabled) throw bad('The AI agent is switched off in Configuration.')
  const row = await get('SELECT status, started_at FROM ai_analyses WHERE alert_id = ?', alertId)
  if (row?.status === 'running' && Date.now() - new Date(row.started_at).getTime() < STALE_RUNNING_MS) throw bad('The analysis is already running: it will appear here in a moment.')
  await upsertQueued(alertId)
  await run("UPDATE ai_analyses SET status = 'running', started_at = ?, attempts = attempts + 1 WHERE alert_id = ?", nowIso(), alertId)
  await analyseAlert(alertId, u.id)
  return getAnalysis(u, alertId)
}

/** Verdict per alert for the queue's "AI verdict" column. */
export async function analysisSummaries() {
  const rows = await all<{ alert_id: string; status: string; verdict: string | null; confidence: number | null }>('SELECT alert_id, status, verdict, confidence FROM ai_analyses')
  return new Map(rows.map((r) => [r.alert_id, { status: r.status, verdict: r.verdict, confidence: r.confidence }]))
}

/** Manager / super user: queue every open alert that has no completed analysis yet (the one-off backfill). */
export async function backfill(u: User, opts: { includeClosed?: boolean; force?: boolean } = {}) {
  if (!hasRole(u, 'MANAGER', 'SUPER_USER')) throw forbidden('Only a manager or super user can start a bulk analysis.')
  if (!aiState().enabled) throw bad('The AI agent is switched off in Configuration.')
  const alerts = await all(`SELECT a.id FROM alerts a LEFT JOIN ai_analyses x ON x.alert_id = a.id
    WHERE ${opts.includeClosed ? '1 = 1' : "a.status <> 'Closed'"} AND (${opts.force ? '1 = 1' : "x.status IS NULL OR x.status NOT IN ('done', 'running', 'queued')"})`)
  for (const a of alerts) await upsertQueued(a.id)
  kick()
  return { queued: alerts.length }
}

export async function queueStatus() {
  const rows = await all<{ status: string; n: number }>('SELECT status, COUNT(*) AS n FROM ai_analyses GROUP BY status')
  return { state: aiState(), counts: Object.fromEntries(rows.map((r) => [r.status, Number(r.n)])), masking: await maskingHealth() }
}
