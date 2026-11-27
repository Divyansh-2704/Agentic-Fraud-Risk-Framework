// One-off: analyse every open alert that has no completed AI analysis yet (e.g. the seeded backlog).
// Run: npm run ai:backfill   (needs OPENROUTER_API_KEY and the masking service: npm run dev:masking)
// Options: --all  also closed alerts · --force  re-analyse alerts that already have a result
import { closeDb, initDb, refreshCache } from './db.js'
import { aiState, backfill, drainQueue, maskingHealth, queueStatus } from './services/ai.js'
import { getUser } from './services/common.js'
import { migrateConfig } from './seed.js'

async function main() {
  await initDb(); await refreshCache(); await migrateConfig()
  const s = aiState()
  if (!s.configured) throw new Error('OPENROUTER_API_KEY is not set in fraud-framework/.env')
  const m = await maskingHealth()
  if (!m.ok) throw new Error(`The Presidio masking service is not reachable (${(m as any).error}). Start it with: npm run dev:masking`)
  const { queued } = await backfill(getUser('u-super')!, { includeClosed: process.argv.includes('--all'), force: process.argv.includes('--force') })
  console.log(`Queued ${queued} alert(s) for ${s.model}. Analysing (3 at a time)...`)
  const timer = setInterval(async () => console.log((await queueStatus()).counts), 15_000)
  while (true) { const n = await drainQueue(30 * 60_000, 3); if (!n) break }
  clearInterval(timer)
  console.log('Finished:', (await queueStatus()).counts)
}
main().then(() => closeDb()).catch(async (e) => { console.error(e.message ?? e); await closeDb(); process.exit(1) })
