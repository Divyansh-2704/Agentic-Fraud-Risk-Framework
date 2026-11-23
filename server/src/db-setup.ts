// One-time PostgreSQL setup: creates the application and test databases (if missing), the tables, and seeds demo data
// into an empty application database. Safe to run again. Run: npm run db:setup   (add --reseed to wipe and re-seed)
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const envFile = join(here, '..', '..', '.env')
if (existsSync(envFile)) process.loadEnvFile(envFile)
const pg = createRequire(import.meta.url)('pg') as typeof import('pg')

async function ensureDatabase(url: string) {
  const { poolConfig } = await import('./db.js')
  const name = decodeURIComponent(new URL(url).pathname.slice(1))
  // Hosted databases (Neon, Supabase...) already exist and often do not allow connecting to "postgres": try the target first.
  const probe = new pg.Client(poolConfig(url, false))
  try { await probe.connect(); await probe.end(); console.log(`  database ${name}: reachable`); return } catch (e: any) {
    await probe.end().catch(() => {})
    if (e?.code !== '3D000') throw e // 3D000 = database does not exist; anything else (password, network) is a real error
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`Unsupported database name "${name}" (letters, digits and _ only).`)
  const admin = new URL(url); admin.pathname = '/postgres'
  const client = new pg.Client(poolConfig(admin.toString(), false))
  await client.connect()
  try {
    const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name])
    if (exists.rowCount) console.log(`  database ${name}: already exists`)
    else { await client.query(`CREATE DATABASE ${name}`); console.log(`  database ${name}: created`) }
  } finally { await client.end() }
}

async function main() {
  const appUrl = process.env.DATABASE_URL
  const testUrl = process.env.TEST_DATABASE_URL
  if (!appUrl) throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill in your PostgreSQL password.')
  console.log(`PostgreSQL server: ${new URL(appUrl).host}`)
  await ensureDatabase(appUrl)
  if (testUrl) await ensureDatabase(testUrl)

  // Load the app's database layer only now, so it connects to a database that exists.
  const db = await import('./db.js')
  const { seedAll } = await import('./seed.js')
  await db.initDb()
  console.log(`  tables: ready (${db.dbInfo()})`)
  const users = Number((await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM users'))!.n)
  if (users === 0 || process.argv.includes('--reseed')) await seedAll()
  else console.log(`  demo data: already present (${users} users). Use "npm run db:setup -- --reseed" to wipe and re-seed.`)
  await db.closeDb()
  console.log('Done. Start the app with: npm run dev')
}

main().catch((e) => { console.error(`Database setup failed: ${e.message}`); process.exit(1) })
