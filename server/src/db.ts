// Database layer: PostgreSQL everywhere (local: fraud-framework/.env, Vercel: the project's DATABASE_URL).
// Every helper is async. Transactions are bound to the async call chain (AsyncLocalStorage),
// so services can call each other inside tx() and all their queries share one connection.
import { AsyncLocalStorage } from 'node:async_hooks'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const here = dirname(fileURLToPath(import.meta.url))

// Local settings (DATABASE_URL etc.) live in fraud-framework/.env, which is git-ignored.
// Only read when DATABASE_URL is not already set (the test runners set it to the test database). Never on Vercel.
const ENV_FILE = join(here, '..', '..', '.env')
if (process.env.DATABASE_URL === undefined && existsSync(ENV_FILE) && !process.env.VERCEL) { try { process.loadEnvFile(ENV_FILE) } catch { /* ignore malformed .env */ } }

/** Connection string. DATABASE_URL is the standard name; POSTGRES_URL is what some Vercel storage integrations inject. */
export const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || ''
export const NOT_CONFIGURED = process.env.VERCEL
  ? 'DATABASE_URL is not set. In Vercel: Project > Storage > connect a PostgreSQL database (e.g. Neon), then redeploy.'
  : 'DATABASE_URL is not set. Copy .env.example to .env, set your PostgreSQL password, then run: npm run db:setup'

/** PostgreSQL schema (created on first start, see initDb). */
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT, email TEXT, roles TEXT, entities TEXT, dept TEXT);
CREATE TABLE IF NOT EXISTS customers (cif TEXT PRIMARY KEY, name TEXT, entity TEXT, segment TEXT, rm TEXT, eid TEXT, passport TEXT, tl TEXT,
  nationality TEXT, dob TEXT, accounts TEXT, cards TEXT, linked_cifs TEXT);
CREATE TABLE IF NOT EXISTS transactions (id TEXT PRIMARY KEY, cif TEXT, account TEXT, date TEXT, type TEXT, amount DOUBLE PRECISION, currency TEXT,
  balance DOUBLE PRECISION, counterparty TEXT, iban TEXT, channel TEXT);
CREATE INDEX IF NOT EXISTS ix_txn_cif ON transactions(cif, date);

CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY, created_at TEXT, category TEXT, mode TEXT, rule_id TEXT, rule_name TEXT, scenario_id TEXT, scenario_desc TEXT,
  rule_condition TEXT, decision_layer TEXT, alert_type TEXT, typology TEXT, risk_score INTEGER, priority TEXT, complexity TEXT, dept TEXT,
  entity TEXT, cif TEXT, customer_name TEXT, segment TEXT, rm TEXT, txn_amount DOUBLE PRECISION, available_balance DOUBLE PRECISION, account TEXT, txn_ref TEXT,
  alert_on TEXT, alerted_entity_type TEXT, device_id TEXT, beneficiary_account TEXT, prevention_colour TEXT, held INTEGER DEFAULT 0,
  status TEXT, assigned_to TEXT, assigned_at TEXT, group_key TEXT, reschedule_count INTEGER DEFAULT 0, reschedule_until TEXT,
  paused_ms BIGINT DEFAULT 0, paused_at TEXT, sla_due TEXT, decision TEXT, sub_class TEXT, rationale TEXT, potential_savings DOUBLE PRECISION,
  notes TEXT, ref_ids TEXT, edd_sr TEXT, edd_raised_at TEXT, edd_response TEXT, sr_status TEXT, sr_type TEXT, linked_account TEXT,
  case_id TEXT, closed_at TEXT, serviced_by TEXT, review_team TEXT, dq_exceptions TEXT, fpi_referral TEXT, fpi_response TEXT, escalated INTEGER DEFAULT 0, edd_notified INTEGER DEFAULT 0,
  raw_payload TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ix_alert_cif ON alerts(cif);
CREATE TABLE IF NOT EXISTS alert_actions (id SERIAL PRIMARY KEY, alert_id TEXT, category TEXT, step TEXT, selected INTEGER,
  prefilled INTEGER, vals TEXT, updated_at TEXT);
CREATE INDEX IF NOT EXISTS ix_alert_actions ON alert_actions(alert_id);
CREATE TABLE IF NOT EXISTS alert_events (id SERIAL PRIMARY KEY, alert_id TEXT, ts TEXT, actor TEXT, action TEXT,
  from_status TEXT, to_status TEXT, comment TEXT);
CREATE INDEX IF NOT EXISTS ix_alert_events ON alert_events(alert_id);

CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY, type TEXT, status TEXT, owner TEXT, assigned_to TEXT, assigned_at TEXT, created_by TEXT, created_at TEXT, updated_at TEXT,
  maker_id TEXT, checker_id TEXT, investigator_id TEXT, reviewer_id TEXT, approver_id TEXT, alert_id TEXT, origin TEXT, entity TEXT, dept TEXT,
  cif TEXT, customer_name TEXT, segment TEXT, typology TEXT, risk_score INTEGER, priority TEXT, complexity TEXT, risk_l1 TEXT, risk_l2 TEXT,
  risk_title TEXT, sr_number TEXT, returned_count INTEGER DEFAULT 0, disabled INTEGER DEFAULT 0, frozen INTEGER DEFAULT 0, closed_at TEXT,
  report_email_at TEXT, reopened_count INTEGER DEFAULT 0, routing_note TEXT, data TEXT);
CREATE TABLE IF NOT EXISTS case_transactions (id SERIAL PRIMARY KEY, case_id TEXT, txn_id TEXT, date TEXT, account TEXT,
  currency TEXT, amount DOUBLE PRECISION, fx_rate DOUBLE PRECISION, amount_aed DOUBLE PRECISION, type TEXT, channel TEXT, instrument TEXT, transfer_cat TEXT, product TEXT,
  beneficiary_account TEXT, beneficiary_name TEXT, counterparty_bank TEXT, country TEXT, UNIQUE(case_id, txn_id));
CREATE TABLE IF NOT EXISTS case_parties (id SERIAL PRIMARY KEY, case_id TEXT, kind TEXT, name TEXT, ref TEXT, details TEXT,
  suspect INTEGER DEFAULT 0, blacklist INTEGER DEFAULT 0, added_by TEXT);
CREATE TABLE IF NOT EXISTS checklist_items (id TEXT PRIMARY KEY, case_id TEXT, title TEXT, assigned_to TEXT, assigned_date TEXT,
  target_date TEXT, status TEXT, comments TEXT, reminded INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS activity_log (id SERIAL PRIMARY KEY, case_id TEXT, checklist_id TEXT, date TEXT, description TEXT,
  finding TEXT, include_in_report INTEGER DEFAULT 0, actor TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS evidence (id SERIAL PRIMARY KEY, case_id TEXT, alert_id TEXT, folder TEXT, name TEXT, size INTEGER,
  mime TEXT, path TEXT, checklist_id TEXT, source TEXT, uploaded_by TEXT, uploaded_at TEXT);
CREATE TABLE IF NOT EXISTS evidence_files (path TEXT PRIMARY KEY, data BYTEA, created_at TEXT);
CREATE TABLE IF NOT EXISTS audit_trail (id SERIAL PRIMARY KEY, case_id TEXT, ts TEXT, actor TEXT, action TEXT,
  from_status TEXT, to_status TEXT, comment TEXT, changes TEXT);
CREATE INDEX IF NOT EXISTS ix_audit_case ON audit_trail(case_id);
CREATE TABLE IF NOT EXISTS case_investigators (case_id TEXT, user_id TEXT, stage TEXT, role TEXT, done INTEGER DEFAULT 0,
  PRIMARY KEY(case_id, user_id, stage));
CREATE TABLE IF NOT EXISTS post_tasks (id TEXT PRIMARY KEY, case_id TEXT, type TEXT, owner_team TEXT, assigned_to TEXT, status TEXT,
  ref_id TEXT, ref_date TEXT, details TEXT, created_at TEXT, completed_at TEXT, target_date TEXT, reminded INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS recoveries (id SERIAL PRIMARY KEY, case_id TEXT, amount DOUBLE PRECISION, mode TEXT, date TEXT, comment TEXT,
  suspect INTEGER, blacklist INTEGER, status TEXT, maker_id TEXT, checker_id TEXT, created_at TEXT, decided_at TEXT, checker_comment TEXT);
CREATE TABLE IF NOT EXISTS outbox (id SERIAL PRIMARY KEY, ts TEXT, to_addr TEXT, cc TEXT, subject TEXT, body TEXT,
  related_type TEXT, related_id TEXT, template TEXT);
CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT, updated_by TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS agent_registry (id TEXT PRIMARY KEY, def TEXT, status TEXT);
CREATE TABLE IF NOT EXISTS ai_analyses (alert_id TEXT PRIMARY KEY, status TEXT, verdict TEXT, confidence INTEGER, model TEXT, prompt_version TEXT,
  result TEXT, masked_input TEXT, masked_output TEXT, mask_stats TEXT, error TEXT, attempts INTEGER DEFAULT 0, requested_at TEXT, started_at TEXT,
  finished_at TEXT, duration_ms INTEGER, usage TEXT);
CREATE TABLE IF NOT EXISTS agent_runs (id SERIAL PRIMARY KEY, agent_id TEXT, ts TEXT, actor TEXT, target_type TEXT,
  target_id TEXT, tool_calls TEXT, output TEXT, status TEXT);
`
/** Every table, children first (used by the seed reset). */
export const TABLES = ['ai_analyses', 'agent_runs', 'agent_registry', 'config', 'outbox', 'recoveries', 'post_tasks', 'case_investigators', 'audit_trail', 'evidence_files', 'evidence',
  'activity_log', 'checklist_items', 'case_parties', 'case_transactions', 'cases', 'alert_events', 'alert_actions', 'alerts', 'transactions', 'customers', 'users']

export type Row = Record<string, any>
interface Conn { query(sql: string, params: unknown[]): Promise<{ rows: Row[]; rowCount: number }>; exec(sql: string): Promise<void> }

// ---------- connection ----------
/** "?" placeholders -> "$1, $2..." (skips quoted literals). */
function toPg(sql: string) {
  let n = 0, out = '', quote: string | null = null
  for (const ch of sql) {
    if (quote) { if (ch === quote) quote = null; out += ch; continue }
    if (ch === "'" || ch === '"') { quote = ch; out += ch; continue }
    out += ch === '?' ? `$${++n}` : ch
  }
  return out
}

pg.types.setTypeParser(20, (v: string) => Number(v)) // COUNT(*), BIGINT -> number
pg.types.setTypeParser(1700, (v: string) => Number(v)) // NUMERIC -> number

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])
/**
 * Pool settings for a connection string. SSL is on for every non-local server (Neon, Supabase, RDS...), with
 * certificate verification unless the URL says sslmode=no-verify. libpq-only URL options are removed because
 * node-postgres would otherwise reinterpret them.
 */
export function poolConfig(url: string, serverless = !!process.env.VERCEL): pg.PoolConfig {
  const u = new URL(url)
  const mode = u.searchParams.get('sslmode')
  for (const p of ['sslmode', 'channel_binding', 'sslrootcert', 'pgbouncer', 'connect_timeout']) u.searchParams.delete(p)
  const ssl = mode === 'disable' || (!mode && LOCAL_HOSTS.has(u.hostname)) ? undefined : { rejectUnauthorized: mode !== 'no-verify' }
  return {
    connectionString: u.toString(),
    ssl,
    // Serverless: few connections per instance, released quickly, because many instances may run at once.
    max: serverless ? 3 : 10,
    idleTimeoutMillis: serverless ? 5_000 : 30_000,
    connectionTimeoutMillis: 15_000,
  }
}

let pgPool: pg.Pool | null = null
function pool() {
  if (!DATABASE_URL) throw new Error(NOT_CONFIGURED)
  if (!pgPool) {
    pgPool = new pg.Pool(poolConfig(DATABASE_URL))
    pgPool.on('error', (e) => console.error('PostgreSQL pool error', e.message))
  }
  return pgPool
}
function pgConn(client: () => pg.Pool | pg.PoolClient): Conn {
  return {
    async query(sql, params) { const r = await client().query(toPg(sql), params as any[]); return { rows: r.rows, rowCount: r.rowCount ?? 0 } },
    async exec(sql) { await client().query(sql) },
  }
}

const base: Conn = pgConn(pool)
const txStore = new AsyncLocalStorage<Conn>()
const conn = () => txStore.getStore() ?? base

/** Keys for PostgreSQL advisory locks, so several server instances never create the schema or seed at the same time. */
export const LOCKS = { schema: 4_101_001, seed: 4_101_002 } as const
/** Inside a transaction: waits until no other connection holds this lock (released at COMMIT / ROLLBACK). */
export async function advisoryLock(key: number) { await get('SELECT pg_advisory_xact_lock(?::bigint) AS locked', key) }

let schemaReady: Promise<void> | null = null
/** Creates the tables if they do not exist (idempotent, safe with concurrent instances). Call before the first query. */
export function initDb() {
  schemaReady ??= tx(async () => { await advisoryLock(LOCKS.schema); await exec(SCHEMA) }).catch((e) => { schemaReady = null; throw e })
  return schemaReady
}
export async function closeDb() { const p = pgPool; pgPool = null; schemaReady = null; await p?.end() }
/** Server and database name, without credentials. */
export const dbInfo = () => {
  if (!DATABASE_URL) return 'not configured'
  const u = new URL(DATABASE_URL)
  return `postgresql://${u.host}${u.pathname}`
}

const clean = (v: unknown) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v)

export async function all<T = Row>(sql: string, ...p: unknown[]): Promise<T[]> { return (await conn().query(sql, p.map(clean))).rows as T[] }
export async function get<T = Row>(sql: string, ...p: unknown[]): Promise<T | undefined> { return (await conn().query(sql, p.map(clean))).rows[0] as T | undefined }
export async function run(sql: string, ...p: unknown[]) { return { changes: (await conn().query(sql, p.map(clean))).rowCount } }
export async function exec(sql: string) { await conn().exec(sql) }

/** Insert an object into a table (keys = columns). */
export function insert(table: string, obj: Row) {
  const keys = Object.keys(obj)
  return run(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, ...keys.map((k) => obj[k]))
}
export async function update(table: string, pk: string, id: unknown, obj: Row) {
  const keys = Object.keys(obj)
  if (!keys.length) return
  await run(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE ${pk} = ?`, ...keys.map((k) => obj[k]), id)
}

/** Runs fn on the shared pool even when called inside a transaction (for background work that outlives the caller). */
export function outsideTx<T>(fn: () => T): T { return txStore.exit(fn) }

/** Runs fn in a transaction on one pooled connection. Nested calls join the outer transaction. */
export async function tx<T>(fn: () => Promise<T>): Promise<T> {
  if (txStore.getStore()) return fn()
  const client = await pool().connect()
  const c = pgConn(() => client)
  try {
    await client.query('BEGIN')
    const r = await txStore.run(c, fn)
    await client.query('COMMIT')
    return r
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e } finally { client.release() }
}

export const json = <T = any>(s: string | null | undefined, fallback: T): T => {
  if (!s) return fallback
  try { return JSON.parse(s) as T } catch { return fallback }
}

// Clock offset lets the seed script replay workflows "in the past" so TAT and ageing look realistic.
let clockOffset = 0
export const setClock = (d: Date | null) => { clockOffset = d ? d.getTime() - Date.now() : 0 }
export const nowIso = () => new Date(Date.now() + clockOffset).toISOString()

// ---------- users + config cache ----------
// Users and configuration are small and read on almost every line of business logic, so they are cached in memory
// and refreshed from the database at the start of every API request (see routes.ts), which keeps several server
// instances (e.g. on Vercel) consistent. Writes go to the database and the cache together.
let cfgCache = new Map<string, unknown>()
let userRows: Row[] = []
let cacheFrozen = false
/** While the seed rebuilds the data it owns the cache; concurrent requests must not overwrite it with half-written rows. */
export const freezeCache = (on: boolean) => { cacheFrozen = on }
export async function refreshCache() {
  if (cacheFrozen) return
  const [cfg, users] = await Promise.all([all<{ key: string; value: string }>('SELECT key, value FROM config'), all('SELECT * FROM users ORDER BY name')])
  cfgCache = new Map(cfg.map((r) => [r.key, json(r.value, null)]))
  userRows = users
}
export const cachedUserRows = () => userRows
export const setCachedUsers = (rows: Row[]) => { userRows = [...rows].sort((a, b) => String(a.name).localeCompare(String(b.name))) }
export function clearCache() { cfgCache = new Map(); userRows = [] }

export function getConfig<T = any>(key: string, fallback?: T): T {
  return cfgCache.has(key) ? (structuredClone(cfgCache.get(key)) as T) : (fallback as T)
}
export async function setConfig(key: string, value: unknown, by = 'system') {
  await run('INSERT INTO config (key, value, updated_by, updated_at) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at',
    key, JSON.stringify(value), by, nowIso())
  cfgCache.set(key, structuredClone(value))
}

/** Sequential IDs like ALT-000123 / FC-2026-0042. */
export async function nextId(prefix: string, table: string, pad = 6) {
  const r = await get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE id LIKE ?`, `${prefix}%`)
  let n = Number(r?.n ?? 0) + 1
  while (await get(`SELECT 1 AS x FROM ${table} WHERE id = ?`, `${prefix}${String(n).padStart(pad, '0')}`)) n++
  return `${prefix}${String(n).padStart(pad, '0')}`
}

// ---------- evidence files (stored in the database so every server instance can serve them) ----------
export async function saveFile(path: string, data: Buffer) {
  await run('INSERT INTO evidence_files (path, data, created_at) VALUES (?,?,?)', path, data, nowIso())
}
export async function loadFile(path: string): Promise<Buffer | null> {
  const r = await get<{ data: Buffer }>('SELECT data FROM evidence_files WHERE path = ?', path)
  return r?.data ? Buffer.from(r.data) : null
}
