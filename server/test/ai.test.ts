// Disposition agent pipeline against local mock services (no real LLM, no Python needed):
// masking happens before the LLM call, the LLM never sees real values, the analyst sees real values, the answer is
// validated and grounded, and the agent fails closed when masking is unavailable.
import express from 'express'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, exec, get } from '../src/db.js'
import { resetDb, seedConfig, seedCustomers, seedUsers } from '../src/seed.js'
import * as A from '../src/services/alerts.js'
import * as AI from '../src/services/ai.js'
import { getUser } from '../src/services/common.js'

const U = (id: string) => getUser(id)!
const PII_KEYS = new Set(['name', 'customer_name', 'rm', 'cif', 'other_cif', 'linked_cifs', 'account', 'accounts', 'iban', 'beneficiary_account', 'counterparty_iban', 'eid', 'passport', 'trade_licence', 'nationality', 'cards', 'device_id', 'txn_id', 'txn_ref'])

/** Mock of masking-service/main.py: tokenises values under known PII keys (the real service also runs Presidio on text). */
function mockMask(data: unknown) {
  const mapping: Record<string, string> = {}
  const byValue = new Map<string, string>()
  const counters: Record<string, number> = {}
  const tok = (k: string, v: string) => {
    if (!byValue.has(v)) { const label = k.toUpperCase(); counters[label] = (counters[label] ?? 0) + 1; const t = `<${label}_${counters[label]}>`; byValue.set(v, t); mapping[t] = v }
    return byValue.get(v)!
  }
  const walk = (n: any, key?: string): any => Array.isArray(n) ? n.map((x) => walk(x, key))
    : n && typeof n === 'object' ? Object.fromEntries(Object.entries(n).map(([k, v]) => [k, walk(v, k)]))
    : n !== null && n !== undefined && key && PII_KEYS.has(key) ? tok(key === 'customer_name' ? 'name' : key, String(n)) : n
  const masked = walk(data)
  let text = JSON.stringify(masked)
  for (const [t, v] of Object.entries(mapping)) if (v.length >= 4) text = text.split(v).join(t) // free text (rationales, notes)
  return { masked: JSON.parse(text), mapping, stats: { PERSON: 1 }, engine: 'mock presidio' }
}

let maskUp = true
let llmMode: 'good' | 'ungrounded' | 'bad-then-good' | 'no-credits' | 'bad-key' | 'empty-once' | 'all-down' = 'good'
let llmCalls: any[] = []
let realValues: string[] = []
const servers: Server[] = []
const listen = (app: express.Express) => new Promise<string>((res) => { const s = app.listen(0, () => res(`http://127.0.0.1:${(s.address() as AddressInfo).port}`)); servers.push(s) })

function llmAnswer(masked: any) {
  const name = masked.customer.name
  const txn = masked.transactions_90d[0]?.txn_id
  if (llmMode === 'ungrounded') {
    return { verdict: 'Confirmed Fraud', confidence: 95, summary: 'Looks like fraud.', suggested_sub_classification: 'Scam-phishing',
      evidence: [{ finding: 'A huge transfer.', direction: 'supports_fraud', weight: 'strong', sources: ['TXN-DOES-NOT-EXIST'] }, { finding: 'Bad history.', direction: 'supports_fraud', weight: 'strong', sources: ['ALT-999999'] }],
      red_flags: [], mitigating_factors: [], missing_information: [], recommended_next_steps: [], draft_rationale: 'Fraud.' }
  }
  return { verdict: 'Confirmed Fraud', confidence: 88, summary: `${name} sent funds to a new beneficiary ${masked.alert.beneficiary_account}.`, suggested_sub_classification: 'external fraud',
    evidence: [
      { finding: `Alerted amount is ${masked.transaction_summary.alert_amount_vs_avg_outflow}x the average outflow.`, direction: 'supports_fraud', weight: 'strong', sources: ['transaction_summary.alert_amount_vs_avg_outflow', 'alert.txn_amount_aed'] },
      { finding: `Beneficiary ${masked.alert.beneficiary_account} was never paid before.`, direction: 'supports_fraud', weight: 'strong', sources: ['beneficiary_history.previous_payments'] },
      { finding: `Transaction ${txn} is consistent with history.`, direction: 'supports_false_positive', weight: 'weak', sources: [txn] },
    ],
    red_flags: ['New beneficiary'], mitigating_factors: [], missing_information: ['No call-back yet'], recommended_next_steps: [`Call ${name}`],
    draft_rationale: `${name} (${masked.customer.cif}) paid a new beneficiary; confirmed fraud indicators.` }
}

beforeAll(async () => {
  await resetDb(); await seedConfig(); await seedUsers(); await seedCustomers()
  const mask = express(); mask.use(express.json({ limit: '10mb' }))
  mask.get('/health', (_q, r) => r.json({ ok: true }))
  mask.post('/mask', (q, r) => (maskUp ? r.json(mockMask(q.body.data)) : r.status(503).json({ error: 'down' })))
  const llm = express(); llm.use(express.json({ limit: '10mb' }))
  llm.post('/chat/completions', (q, r) => {
    llmCalls.push(q.body)
    const main = q.body.model === 'anthropic/claude-sonnet-5.5'
    if (llmMode === 'no-credits' && main) return r.status(402).json({ error: { code: 402, message: 'Insufficient credits. This account never purchased credits.' } })
    if (llmMode === 'bad-key') return r.status(401).json({ error: { code: 401, message: 'User not found.' } })
    if (llmMode === 'all-down') return r.status(503).json({ error: { code: 503, message: 'No endpoints available' } })
    if (llmMode === 'empty-once' && llmCalls.length === 1) return r.json({ choices: [{ finish_reason: 'length', message: { content: '' } }] })
    const prompt = q.body.messages.map((m: any) => m.content).join('\n')
    const leaked = realValues.filter((v) => prompt.includes(v))
    if (leaked.length) return r.status(500).json({ error: { message: `REAL DATA LEAKED TO LLM: ${leaked.join(', ')}` } })
    const masked = JSON.parse(q.body.messages[1].content.split('<alert_data>\n')[1].split('\n</alert_data>')[0])
    const content = llmMode === 'bad-then-good' && llmCalls.length === 1 ? 'Sorry, here is my view: it is fraud.' : JSON.stringify(llmAnswer(masked))
    r.json({ model: q.body.model, choices: [{ message: { content } }], usage: { total_tokens: 1234 } })
  })
  process.env.MASKING_URL = await listen(mask)
  process.env.OPENROUTER_BASE_URL = await listen(llm)
  process.env.OPENROUTER_API_KEY = 'test-key'
  process.env.AI_AGENT_DISABLED = ''
  process.env.AI_RETRY_SCALE = '0' // no waiting between retries in tests
})
afterAll(async () => {
  process.env.AI_AGENT_DISABLED = '1'
  for (const s of servers) s.close()
  await closeDb()
})
beforeEach(async () => { maskUp = true; llmMode = 'good'; llmCalls = []; await exec('TRUNCATE ai_analyses, agent_runs RESTART IDENTITY') })

async function newAlert() {
  const c = (await get("SELECT * FROM customers WHERE entity = 'Retail' ORDER BY cif LIMIT 1"))!
  const id = await A.ingestAlert({ alertDateTime: new Date().toISOString(), riskScore: 91, category: 'Detection', scenarioId: 'SC-101', ruleId: 'DSP-R101', ruleName: 'New beneficiary', alertType: 'Account takeover', cif: c.cif, accountNumber: JSON.parse(c.accounts)[0], txnAmount: 25000, beneficiaryAccount: 'GB29BARC20040512345678', deviceId: 'DEV-55555' }, { skipAi: true })
  realValues = [c.name, c.cif, c.eid, c.passport, JSON.parse(c.accounts)[0], 'GB29BARC20040512345678', 'DEV-55555']
  return { id, cust: c }
}

describe('disposition agent', () => {
  it('sends only masked data to the LLM and shows the analyst real values', async () => {
    const { id, cust } = await newAlert()
    const { analysis } = await AI.analyseNow(U('u-aisha'), id)
    expect(llmCalls).toHaveLength(1) // the mock LLM returns 500 if it ever sees a real value
    expect(llmCalls[0].response_format.json_schema.strict).toBe(true)
    expect(llmCalls[0].model).toBe('anthropic/claude-sonnet-5.5')
    expect(analysis!.status).toBe('done')
    expect(analysis!.verdict).toBe('Confirmed Fraud')
    expect(analysis!.result.summary).toContain(cust.name) // unmasked for the analyst
    expect(analysis!.result.draft_rationale).toContain(cust.cif)
    expect(analysis!.result.suggested_sub_classification).toBe('External fraud') // normalised to the form's list
    expect(analysis!.result.evidence.every((e: any) => e.verified)).toBe(true)
    expect(JSON.stringify(analysis!.masked_input)).not.toContain(cust.name) // audit copy of what the LLM saw
    expect(JSON.stringify(analysis!.masked_output)).toContain('<NAME_1>')
    expect((await get("SELECT * FROM agent_runs WHERE target_id = ?", id))!.output).toBe('Confirmed Fraud (88%)')
  })

  it('downgrades a decisive verdict whose evidence cites records that do not exist', async () => {
    const { id } = await newAlert()
    llmMode = 'ungrounded'
    const { analysis } = await AI.analyseNow(U('u-aisha'), id)
    expect(analysis!.verdict).toBe('Inconclusive')
    expect(analysis!.confidence).toBeLessThanOrEqual(60)
    expect(analysis!.result.suggested_sub_classification).toBe('')
    expect(analysis!.result.guardrail_notes.join(' ')).toMatch(/Downgraded from Confirmed Fraud/)
    expect(analysis!.result.evidence.some((e: any) => e.verified)).toBe(false)
  })

  it('repairs an answer that is not valid JSON with one retry', async () => {
    const { id } = await newAlert()
    llmMode = 'bad-then-good'
    const { analysis } = await AI.analyseNow(U('u-aisha'), id)
    expect(llmCalls).toHaveLength(2)
    expect(llmCalls[1].messages.at(-1).content).toMatch(/failed validation/)
    expect(analysis!.status).toBe('done')
  })

  it('falls back to the free model when the OpenRouter account has no credits, and says so', async () => {
    const { id } = await newAlert()
    llmMode = 'no-credits'
    const { analysis } = await AI.analyseNow(U('u-aisha'), id)
    expect(llmCalls.map((c) => c.model)).toEqual(['anthropic/claude-sonnet-5.5', 'baidu/ernie-5.5-flash-preview:free']) // 402 is not retried
    expect(llmCalls[1].max_tokens).toBeGreaterThanOrEqual(16000) // room for reasoning + answer
    expect(analysis!.status).toBe('done')
    expect(analysis!.model).toBe('baidu/ernie-5.5-flash-preview:free')
    expect(analysis!.result.model_note).toMatch(/no credits.*402/)
  })

  it('retries an empty or cut-off answer on the same model', async () => {
    const { id } = await newAlert()
    llmMode = 'empty-once'
    const { analysis } = await AI.analyseNow(U('u-aisha'), id)
    expect(llmCalls.map((c) => c.model)).toEqual(['anthropic/claude-sonnet-5.5', 'anthropic/claude-sonnet-5.5'])
    expect(analysis!.status).toBe('done')
    expect(analysis!.result.model_note).toBeUndefined()
  })

  it('shows a clear error for a rejected API key (no fallback, no retries) and clears an earlier verdict', async () => {
    const { id } = await newAlert()
    expect((await AI.analyseNow(U('u-aisha'), id)).analysis!.verdict).toBe('Confirmed Fraud')
    llmMode = 'bad-key'; llmCalls = []
    const { analysis } = await AI.analyseNow(U('u-aisha'), id)
    expect(llmCalls).toHaveLength(1)
    expect(analysis!.status).toBe('llm_error')
    expect(analysis!.error).toMatch(/rejected the API key \(401\)/)
    expect([analysis!.verdict, analysis!.result]).toEqual([null, null])
  })

  it('reports both models when the main and fallback models are down after retries', async () => {
    const { id } = await newAlert()
    llmMode = 'all-down'
    const { analysis } = await AI.analyseNow(U('u-aisha'), id)
    expect(llmCalls).toHaveLength(6) // 3 attempts each
    expect(analysis!.status).toBe('llm_error')
    expect(analysis!.error).toMatch(/error 503 for anthropic\/claude-sonnet-5.5.*fallback model failed too.*ernie/)
  })

  it('fails closed: nothing is sent to the LLM when masking is unavailable', async () => {
    const { id } = await newAlert()
    maskUp = false
    const { analysis } = await AI.analyseNow(U('u-aisha'), id)
    expect(analysis!.status).toBe('masking_unavailable')
    expect(analysis!.error).toMatch(/Nothing was sent to the LLM/)
    expect(llmCalls).toHaveLength(0)
  })

  it('reports "not configured" without an API key', async () => {
    const { id } = await newAlert()
    const key = process.env.OPENROUTER_API_KEY
    delete process.env.OPENROUTER_API_KEY
    try {
      const { analysis, state } = await AI.analyseNow(U('u-aisha'), id)
      expect(state.configured).toBe(false)
      expect(analysis!.status).toBe('not_configured')
      expect(llmCalls).toHaveLength(0)
    } finally { process.env.OPENROUTER_API_KEY = key }
  })

  it('pre-analyses new alerts on arrival and shows the verdict in the queue', async () => {
    const c = (await get("SELECT * FROM customers WHERE entity = 'Retail' ORDER BY cif LIMIT 1 OFFSET 1"))!
    realValues = [c.name, c.cif]
    const id = await A.ingestAlert({ alertDateTime: new Date().toISOString(), riskScore: 70, category: 'Detection', scenarioId: 'SC-101', ruleId: 'DSP-R101', alertType: 'Account takeover', cif: c.cif, accountNumber: JSON.parse(c.accounts)[0], txnAmount: 900, beneficiaryAccount: 'GB29BARC20040599999999' })
    await AI.drainQueue()
    expect((await get('SELECT status FROM ai_analyses WHERE alert_id = ?', id))!.status).toBe('done')
    const q = await A.listAlerts(U('u-super'), { scope: 'live' })
    expect(q.rows.find((r: any) => r.id === id)!.ai).toMatchObject({ status: 'done', verdict: 'Confirmed Fraud', confidence: 88 })
  })

  it('respects the Chinese wall and the manager-only bulk run', async () => {
    const { id } = await newAlert()
    await expect(AI.getAnalysis(U('u-daniel'), id)).rejects.toThrow(/Chinese wall/)
    await expect(AI.backfill(U('u-aisha'))).rejects.toThrow(/manager or super user/)
    const r = await AI.backfill(U('u-hassan'))
    expect(r.queued).toBeGreaterThan(0)
    await AI.drainQueue()
    expect((await get("SELECT COUNT(*) AS n FROM ai_analyses WHERE status = 'done'"))!.n).toBe(r.queued)
  })
})

describe('helpers', () => {
  it('unmasks tokens at any depth and leaves unknown tokens', () => {
    expect(AI.unmask({ a: ['<PERSON_1> paid <IBAN_GB_1>', { b: '<X_9>' }] }, { '<PERSON_1>': 'Ann Lee', '<IBAN_GB_1>': 'GB29X' })).toEqual({ a: ['Ann Lee paid GB29X', { b: '<X_9>' }] })
  })
  it('accepts record IDs and real field paths as sources, rejects invented ones', () => {
    const ref = AI.referenceIndex({ alert: { alert_id: 'ALT-000001', risk_score: 80 }, transactions_90d: [{ txn_id: '<TXN_ID_1>', amount: 5 }], prior_alerts: [{ alert_id: 'ALT-000002' }] })
    for (const ok of ['ALT-000001', '<TXN_ID_1>', 'alert.risk_score', 'transactions_90d[0].amount', 'prior_alerts', 'see ALT-000002']) expect(AI.sourceIsValid(ok, ref), ok).toBe(true)
    for (const no of ['ALT-404', 'alert.made_up', '<TXN_ID_9>', 'customer.name']) expect(AI.sourceIsValid(no, ref), no).toBe(false)
  })
})
