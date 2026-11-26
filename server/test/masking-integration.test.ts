// Opt-in integration check: the REAL Presidio service (npm run dev:masking) + a mock LLM over every seeded alert.
// Every customer name, CIF, Emirates ID, passport, account, card, transaction ID and IBAN in the database is checked
// against every prompt. Run: MASKING_IT=1 npx vitest run test/masking-integration.test.ts
import express from 'express'
import type { AddressInfo } from 'node:net'
import { expect, it } from 'vitest'
import { all, closeDb, exec } from '../src/db.js'
import { seedAll } from '../src/seed.js'
import * as AI from '../src/services/ai.js'

it.skipIf(!process.env.MASKING_IT)('no real value reaches the LLM for any seeded alert', async () => {
  await seedAll()
  const real = new Set<string>()
  for (const c of await all('SELECT * FROM customers')) {
    for (const v of [c.name, c.cif, c.eid, c.passport, c.tl, c.dob, ...JSON.parse(c.accounts), ...JSON.parse(c.cards)]) if (v && String(v).length >= 5) real.add(String(v))
  }
  for (const t of await all('SELECT id, iban FROM transactions')) { real.add(t.id); if (t.iban) real.add(t.iban) }
  for (const a of await all('SELECT device_id, beneficiary_account, customer_name FROM alerts')) for (const v of [a.device_id, a.beneficiary_account, a.customer_name]) if (v && v !== 'UNKNOWN' && v.length >= 5) real.add(v)
  const leaks: string[] = []
  let calls = 0
  const llm = express(); llm.use(express.json({ limit: '20mb' }))
  llm.post('/chat/completions', (q, r) => {
    calls++
    const prompt = q.body.messages[1].content
    for (const v of real) if (prompt.includes(v)) leaks.push(v)
    const masked = JSON.parse(prompt.split('<alert_data>\n')[1].split('\n</alert_data>')[0])
    r.json({ model: 'mock', choices: [{ message: { content: JSON.stringify({ verdict: 'Inconclusive', confidence: 50, summary: `Customer ${masked.customer.name}.`, suggested_sub_classification: '', evidence: [{ finding: 'x', direction: 'neutral', weight: 'weak', sources: ['alert.risk_score'] }], red_flags: [], mitigating_factors: [], missing_information: [], recommended_next_steps: [], draft_rationale: `${masked.customer.name} ${masked.customer.cif}` }) } }] })
  })
  const srv = llm.listen(0)
  process.env.OPENROUTER_BASE_URL = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`
  process.env.OPENROUTER_API_KEY = 'mock'; process.env.AI_AGENT_DISABLED = ''
  process.env.MASKING_URL ||= 'http://127.0.0.1:5055/'
  const ids = (await all('SELECT id FROM alerts ORDER BY id')).map((r) => r.id)
  await exec('TRUNCATE ai_analyses')
  for (const id of ids) await exec(`INSERT INTO ai_analyses (alert_id, status, requested_at, attempts) VALUES ('${id}', 'queued', '2026-01-01', 0)`)
  const t0 = Date.now()
  while (await AI.drainQueue(600_000, 4)) { /* until empty */ }
  const st = await all('SELECT status, COUNT(*) AS n FROM ai_analyses GROUP BY status')
  const one = (await all("SELECT result, mask_stats FROM ai_analyses WHERE status = 'done' LIMIT 1"))[0]
  console.log(JSON.stringify({ alerts: ids.length, calls, seconds: (Date.now() - t0) / 1000, status: st, realValuesChecked: real.size, leaks: [...new Set(leaks)].slice(0, 20), unmaskedRationale: JSON.parse(one.result).draft_rationale, stats: one.mask_stats }, null, 1))
  srv.close(); process.env.AI_AGENT_DISABLED = '1'; await closeDb()
  expect(leaks).toEqual([])
  expect(st).toEqual([{ status: 'done', n: ids.length }])
}, 900_000)
