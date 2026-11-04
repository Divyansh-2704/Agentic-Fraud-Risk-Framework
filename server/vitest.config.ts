import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    env: { FCMS_DB: ':memory:', FCMS_DATA_DIR: join(tmpdir(), 'fcms-test') },
    include: ['test/**/*.test.ts'],
    testTimeout: 30000,
  },
})
