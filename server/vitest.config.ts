import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig } from 'vitest/config'

// Tests run against the PostgreSQL test database (TEST_DATABASE_URL in fraud-framework/.env).
// Without it they fall back to an in-memory SQLite database, so `npm test` works on any machine.
const envFile = join(__dirname, '..', '.env')
if (existsSync(envFile)) process.loadEnvFile(envFile)
// Set TEST_DATABASE_URL=sqlite to force the SQLite fallback.
const testDb = /^postgres(ql)?:\/\//.test(process.env.TEST_DATABASE_URL ?? '') ? process.env.TEST_DATABASE_URL! : ''
console.log(`Test database: ${testDb ? testDb.replace(/\/\/[^@]*@/, '//') : 'in-memory SQLite'}`)
if (testDb && testDb === process.env.DATABASE_URL) throw new Error('TEST_DATABASE_URL must point to a separate database: the tests wipe it.')

export default defineConfig({
  test: {
    env: testDb
      ? { DATABASE_URL: testDb, FCMS_DATA_DIR: join(tmpdir(), 'fcms-test') }
      : { DATABASE_URL: '', FCMS_DB: ':memory:', FCMS_DATA_DIR: join(tmpdir(), 'fcms-test') },
    include: ['test/**/*.test.ts'],
    // The test files share one database, so they run one after another.
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 300000,
  },
})
