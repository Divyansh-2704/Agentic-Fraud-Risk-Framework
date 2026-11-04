import type { DatabaseSync as DatabaseSyncT } from 'node:sqlite'
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Loaded via require so bundler-based tooling (Vitest / Vite 5) does not try to resolve "node:sqlite" itself.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')
type DatabaseSync = DatabaseSyncT

const here = dirname(fileURLToPath(import.meta.url))
export const DATA_DIR = process.env.FCMS_DATA_DIR ?? join(here, '..', 'data')
export const UPLOAD_DIR = join(DATA_DIR, 'uploads')
mkdirSync(UPLOAD_DIR, { recursive: true })

export const DB_PATH = process.env.FCMS_DB ?? join(DATA_DIR, 'fcms.db')

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT, email TEXT, roles TEXT, entities TEXT, dept TEXT);
CREATE TABLE IF NOT EXISTS customers (cif TEXT PRIMARY KEY, name TEXT, entity TEXT, segment TEXT, rm TEXT, eid TEXT, passport TEXT, tl TEXT,
  nationality TEXT, dob TEXT, accounts TEXT, cards TEXT, linked_cifs TEXT);
CREATE TABLE IF NOT EXISTS transactions (id TEXT PRIMARY KEY, cif TEXT, account TEXT, date TEXT, type TEXT, amount REAL, currency TEXT,
  balance REAL, counterparty TEXT, iban TEXT, channel TEXT);
CREATE INDEX IF NOT EXISTS ix_txn_cif ON transactions(cif, date);

CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY, created_at TEXT, category TEXT, mode TEXT, rule_id TEXT, rule_name TEXT, scenario_id TEXT, scenario_desc TEXT,
  rule_condition TEXT, decision_layer TEXT, alert_type TEXT, typology TEXT, risk_score INTEGER, priority TEXT, complexity TEXT, dept TEXT,
  entity TEXT, cif TEXT, customer_name TEXT, segment TEXT, rm TEXT, txn_amount REAL, available_balance REAL, account TEXT, txn_ref TEXT,
  alert_on TEXT, alerted_entity_type TEXT, device_id TEXT, beneficiary_account TEXT, prevention_colour TEXT, held INTEGER DEFAULT 0,
  status TEXT, assigned_to TEXT, assigned_at TEXT, group_key TEXT, reschedule_count INTEGER DEFAULT 0, reschedule_until TEXT,
  paused_ms INTEGER DEFAULT 0, paused_at TEXT, sla_due TEXT, decision TEXT, sub_class TEXT, rationale TEXT, potential_savings REAL,
  notes TEXT, ref_ids TEXT, edd_sr TEXT, edd_raised_at TEXT, edd_response TEXT, sr_status TEXT, sr_type TEXT, linked_account TEXT,
  case_id TEXT, closed_at TEXT, serviced_by TEXT, review_team TEXT, dq_exceptions TEXT, fpi_referral TEXT, fpi_response TEXT, escalated INTEGER DEFAULT 0, edd_notified INTEGER DEFAULT 0,
  raw_payload TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ix_alert_cif ON alerts(cif);
CREATE TABLE IF NOT EXISTS alert_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, alert_id TEXT, category TEXT, step TEXT, selected INTEGER,
  prefilled INTEGER, vals TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS alert_events (id INTEGER PRIMARY KEY AUTOINCREMENT, alert_id TEXT, ts TEXT, actor TEXT, action TEXT,
  from_status TEXT, to_status TEXT, comment TEXT);

CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY, type TEXT, status TEXT, owner TEXT, assigned_to TEXT, assigned_at TEXT, created_by TEXT, created_at TEXT, updated_at TEXT,
  maker_id TEXT, checker_id TEXT, investigator_id TEXT, reviewer_id TEXT, approver_id TEXT, alert_id TEXT, origin TEXT, entity TEXT, dept TEXT,
  cif TEXT, customer_name TEXT, segment TEXT, typology TEXT, risk_score INTEGER, priority TEXT, complexity TEXT, risk_l1 TEXT, risk_l2 TEXT,
  risk_title TEXT, sr_number TEXT, returned_count INTEGER DEFAULT 0, disabled INTEGER DEFAULT 0, frozen INTEGER DEFAULT 0, closed_at TEXT,
  report_email_at TEXT, reopened_count INTEGER DEFAULT 0, routing_note TEXT, data TEXT);
CREATE TABLE IF NOT EXISTS case_transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, case_id TEXT, txn_id TEXT, date TEXT, account TEXT,
  currency TEXT, amount REAL, fx_rate REAL, amount_aed REAL, type TEXT, channel TEXT, instrument TEXT, transfer_cat TEXT, product TEXT,
  beneficiary_account TEXT, beneficiary_name TEXT, counterparty_bank TEXT, country TEXT, UNIQUE(case_id, txn_id));
CREATE TABLE IF NOT EXISTS case_parties (id INTEGER PRIMARY KEY AUTOINCREMENT, case_id TEXT, kind TEXT, name TEXT, ref TEXT, details TEXT,
  suspect INTEGER DEFAULT 0, blacklist INTEGER DEFAULT 0, added_by TEXT);
CREATE TABLE IF NOT EXISTS checklist_items (id TEXT PRIMARY KEY, case_id TEXT, title TEXT, assigned_to TEXT, assigned_date TEXT,
  target_date TEXT, status TEXT, comments TEXT, reminded INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS activity_log (id INTEGER PRIMARY KEY AUTOINCREMENT, case_id TEXT, checklist_id TEXT, date TEXT, description TEXT,
  finding TEXT, include_in_report INTEGER DEFAULT 0, actor TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS evidence (id INTEGER PRIMARY KEY AUTOINCREMENT, case_id TEXT, alert_id TEXT, folder TEXT, name TEXT, size INTEGER,
  mime TEXT, path TEXT, checklist_id TEXT, source TEXT, uploaded_by TEXT, uploaded_at TEXT);
CREATE TABLE IF NOT EXISTS audit_trail (id INTEGER PRIMARY KEY AUTOINCREMENT, case_id TEXT, ts TEXT, actor TEXT, action TEXT,
  from_status TEXT, to_status TEXT, comment TEXT, changes TEXT);
CREATE TABLE IF NOT EXISTS case_investigators (case_id TEXT, user_id TEXT, stage TEXT, role TEXT, done INTEGER DEFAULT 0,
  PRIMARY KEY(case_id, user_id, stage));
CREATE TABLE IF NOT EXISTS post_tasks (id TEXT PRIMARY KEY, case_id TEXT, type TEXT, owner_team TEXT, assigned_to TEXT, status TEXT,
  ref_id TEXT, ref_date TEXT, details TEXT, created_at TEXT, completed_at TEXT, target_date TEXT, reminded INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS recoveries (id INTEGER PRIMARY KEY AUTOINCREMENT, case_id TEXT, amount REAL, mode TEXT, date TEXT, comment TEXT,
  suspect INTEGER, blacklist INTEGER, status TEXT, maker_id TEXT, checker_id TEXT, created_at TEXT, decided_at TEXT, checker_comment TEXT);
CREATE TABLE IF NOT EXISTS outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, to_addr TEXT, cc TEXT, subject TEXT, body TEXT,
  related_type TEXT, related_id TEXT, template TEXT);
CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT, updated_by TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS agent_registry (id TEXT PRIMARY KEY, def TEXT, status TEXT);
CREATE TABLE IF NOT EXISTS agent_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, agent_id TEXT, ts TEXT, actor TEXT, target_type TEXT,
  target_id TEXT, tool_calls TEXT, output TEXT, status TEXT);
`

export type Row = Record<string, any>

export function openDb(path = DB_PATH) {
  const db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
  db.exec(SCHEMA)
  return db
}

export let db = openDb()
/** Used by tests to swap in an in-memory database. */
export function useDb(next: DatabaseSync) { db = next }

const clean = (v: unknown) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v)

export const all = <T = Row>(sql: string, ...p: unknown[]) => db.prepare(sql).all(...(p.map(clean) as any[])) as T[]
export const get = <T = Row>(sql: string, ...p: unknown[]) => db.prepare(sql).get(...(p.map(clean) as any[])) as T | undefined
export const run = (sql: string, ...p: unknown[]) => db.prepare(sql).run(...(p.map(clean) as any[]))

/** Insert an object into a table (keys = columns). */
export function insert(table: string, obj: Row) {
  const keys = Object.keys(obj)
  const sql = `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`
  return run(sql, ...keys.map((k) => obj[k]))
}
export function update(table: string, pk: string, id: unknown, obj: Row) {
  const keys = Object.keys(obj)
  if (!keys.length) return
  run(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE ${pk} = ?`, ...keys.map((k) => obj[k]), id)
}

export function tx<T>(fn: () => T): T {
  db.exec('BEGIN')
  try { const r = fn(); db.exec('COMMIT'); return r } catch (e) { db.exec('ROLLBACK'); throw e }
}

export const json = <T = any>(s: string | null | undefined, fallback: T): T => {
  if (!s) return fallback
  try { return JSON.parse(s) as T } catch { return fallback }
}

// Clock offset lets the seed script replay workflows "in the past" so TAT and ageing look realistic.
let clockOffset = 0
export const setClock = (d: Date | null) => { clockOffset = d ? d.getTime() - Date.now() : 0 }
export const nowIso = () => new Date(Date.now() + clockOffset).toISOString()

// ---------- config ----------
export function getConfig<T = any>(key: string, fallback?: T): T {
  const r = get<{ value: string }>('SELECT value FROM config WHERE key = ?', key)
  return r ? JSON.parse(r.value) : (fallback as T)
}
export function setConfig(key: string, value: unknown, by = 'system') {
  run('INSERT INTO config (key, value, updated_by, updated_at) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at',
    key, JSON.stringify(value), by, nowIso())
}

/** Sequential IDs like ALT-000123 / FC-2026-0042. */
export function nextId(prefix: string, table: string, pad = 6) {
  const r = get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE id LIKE ?`, `${prefix}%`)
  let n = (r?.n ?? 0) + 1
  while (get(`SELECT 1 FROM ${table} WHERE id = ?`, `${prefix}${String(n).padStart(pad, '0')}`)) n++
  return `${prefix}${String(n).padStart(pad, '0')}`
}
