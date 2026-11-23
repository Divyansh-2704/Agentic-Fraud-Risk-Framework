// Server entry point. Vercel's Express runtime imports the default export of this file
// (routes live in routes.ts so that Vercel's entry-file lookup cannot pick the wrong file).
import express from 'express'
import { createApp } from './routes.js'
import { dbInfo, DIALECT, get, initDb } from './db.js'
import { seedAll } from './seed.js'

// Create the schema and seed synthetic demo data once if the database is empty
// (first start on a new PostgreSQL database, or a fresh serverless instance on the SQLite fallback).
let ready: Promise<void> | null = null
let seedError: string | null = null
function ensureSeeded(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await initDb()
      if (!(await get('SELECT 1 AS x FROM users LIMIT 1'))) { console.log('Database is empty: seeding demo data...'); await seedAll() }
    })()
    ready.then(() => { seedError = null }, (e) => { seedError = String(e?.stack ?? e); console.error('Database start-up failed', e); ready = null })
  }
  return ready
}

const app = express()

// Diagnostics (no data exposed): runtime, database engine and seeding status.
app.get('/api/health', async (_req, res) => {
  let users: number | string
  try { await initDb(); users = Number((await get<{ n: number }>('SELECT COUNT(*) AS n FROM users'))!.n) } catch (e) { users = String(e) }
  res.json({ ok: !seedError && typeof users === 'number', node: process.version, vercel: !!process.env.VERCEL, database: DIALECT, db: dbInfo(), users, seedError })
})

app.use((_req, res, next) => {
  ensureSeeded().then(() => next(), (e) => res.status(500).json({ error: `Database not ready: ${e?.message ?? e}` }))
})
app.use(createApp())

export default app

if (!process.env.VERCEL) {
  const port = Number(process.env.PORT ?? 4000)
  void ensureSeeded().then(() => console.log(`Database: ${dbInfo()}`), () => {})
  app.listen(port, () => console.log(`FCMS API listening on http://localhost:${port}`))
}
