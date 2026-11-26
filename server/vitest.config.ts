import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig } from 'vitest/config'

// Tests run against the PostgreSQL test database (TEST_DATABASE_URL in fraud-framework/.env), which they wipe and re-seed.
const envFile = join(__dirname, '..', '.env')
if (existsSync(envFile)) process.loadEnvFile(envFile)
const testDb = process.env.TEST_DATABASE_URL ?? ''
if (!/^postgres(ql)?:\/\//.test(testDb)) {
  throw new Error('TEST_DATABASE_URL is not set to a PostgreSQL database. Copy .env.example to .env, set your password, then run: npm run db:setup')
}
if (testDb === process.env.DATABASE_URL) throw new Error('TEST_DATABASE_URL must point to a separate database: the tests wipe it.')
console.log(`Test database: ${testDb.replace(/\/\/[^@]*@/, '//')}`)

export default defineConfig({
  test: {
    // The AI agent never calls a real LLM from the tests (ai.test.ts switches it on against local mock services).
    env: { DATABASE_URL: testDb, AI_AGENT_DISABLED: '1' },
    include: ['test/**/*.test.ts'],
    // The test files share one database, so they run one after another.
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 300000,
  },
})
