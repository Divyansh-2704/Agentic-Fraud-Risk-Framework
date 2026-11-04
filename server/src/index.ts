import express from 'express'
import { createApp } from './app.js'
import { get } from './db.js'
import { seedAll } from './seed.js'

// Seed synthetic demo data once if the database is empty (always the case on a fresh Vercel instance).
let ready: Promise<void> | null = null
function ensureSeeded(): Promise<void> {
  if (!ready) {
    ready = get('SELECT 1 FROM users LIMIT 1')
      ? Promise.resolve()
      : (console.log('Database is empty: seeding demo data...'), seedAll())
    ready.catch(() => { ready = null }) // retry on the next request if seeding failed
  }
  return ready
}

const app = express()
app.use((_req, _res, next) => { ensureSeeded().then(() => next(), next) })
app.use(createApp())

// Vercel's Express runtime imports the default export; locally we listen on a port.
export default app

if (!process.env.VERCEL) {
  const port = Number(process.env.PORT ?? 4000)
  void ensureSeeded()
  app.listen(port, () => console.log(`FCMS API listening on http://localhost:${port}`))
}
