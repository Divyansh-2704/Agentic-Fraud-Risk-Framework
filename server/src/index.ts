// Server entry point. Vercel's Express runtime imports the default export of this file
// (routes live in routes.ts so that Vercel's entry-file lookup cannot pick the wrong file).
import express from 'express'
import { createApp } from './routes.js'
import { DB_PATH, get } from './db.js'
import { seedAll } from './seed.js'

// Seed synthetic demo data once if the database is empty (always the case on a fresh Vercel instance).
let ready: Promise<void> | null = null
let seedError: string | null = null
function ensureSeeded(): Promise<void> {
  if (!ready) {
    ready = get('SELECT 1 FROM users LIMIT 1')
      ? Promise.resolve()
      : (console.log('Database is empty: seeding demo data...'), seedAll())
    ready.then(() => { seedError = null }, (e) => { seedError = String(e?.stack ?? e); console.error('Seeding failed', e); ready = null })
  }
  return ready
}

const app = express()

// Diagnostics (no data exposed): runtime, DB location and seeding status.
app.get('/api/health', (_req, res) => {
  let users: number | string
  try { users = get<{ n: number }>('SELECT COUNT(*) n FROM users')!.n } catch (e) { users = String(e) }
  res.json({ ok: !seedError, node: process.version, vercel: !!process.env.VERCEL, db: DB_PATH, users, seedError })
})

app.use((_req, res, next) => {
  ensureSeeded().then(() => next(), (e) => res.status(500).json({ error: `Demo data could not be seeded: ${e?.message ?? e}` }))
})
app.use(createApp())

export default app

if (!process.env.VERCEL) {
  const port = Number(process.env.PORT ?? 4000)
  void ensureSeeded()
  app.listen(port, () => console.log(`FCMS API listening on http://localhost:${port}`))
}
