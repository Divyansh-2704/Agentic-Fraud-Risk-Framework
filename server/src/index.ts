// Server entry point. Vercel's Express runtime imports the default export of this file
// (routes live in routes.ts so that Vercel's entry-file lookup cannot pick the wrong file).
import express from 'express'
import { createApp } from './routes.js'
import { advisoryLock, DATABASE_URL, dbInfo, get, initDb, LOCKS, NOT_CONFIGURED, tx } from './db.js'
import { seedAll } from './seed.js'

const hasUsers = async () => !!(await get('SELECT 1 AS x FROM users LIMIT 1'))

// Create the schema and seed synthetic demo data once if the database is empty (first start on a new PostgreSQL
// database, e.g. a freshly attached Vercel/Neon database). The advisory lock makes concurrent serverless instances
// wait for the first one instead of seeding twice.
let ready: Promise<void> | null = null
let seedError: string | null = null
function ensureSeeded(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      if (!DATABASE_URL) throw new Error(NOT_CONFIGURED)
      await initDb()
      if (await hasUsers()) return
      await tx(async () => {
        await advisoryLock(LOCKS.seed)
        if (!(await hasUsers())) { console.log('Database is empty: seeding demo data...'); await seedAll() }
      })
    })()
    ready.then(() => { seedError = null }, (e) => { seedError = String(e?.message ?? e); console.error('Database start-up failed:', e?.message === NOT_CONFIGURED ? e.message : e); ready = null })
  }
  return ready
}

const app = express()

// Diagnostics (no data exposed): runtime, database server and seeding status.
app.get('/api/health', async (_req, res) => {
  let users: number | string
  try {
    if (!DATABASE_URL) throw new Error(NOT_CONFIGURED)
    await initDb()
    users = Number((await get<{ n: number }>('SELECT COUNT(*) AS n FROM users'))!.n)
  } catch (e: any) { users = String(e?.message ?? e) }
  res.status(typeof users === 'number' ? 200 : 503)
    .json({ ok: !seedError && typeof users === 'number', node: process.version, vercel: !!process.env.VERCEL, database: 'postgresql', db: dbInfo(), users, seedError })
})

app.use((_req, res, next) => {
  ensureSeeded().then(() => next(), (e) => res.status(503).json({ error: `Database not ready: ${e?.message ?? e}` }))
})
app.use(createApp())

export default app

if (!process.env.VERCEL) {
  const port = Number(process.env.PORT ?? 4000)
  void ensureSeeded().then(() => console.log(`Database: ${dbInfo()}`), () => {})
  app.listen(port, () => console.log(`FCMS API listening on http://localhost:${port}`))
}
