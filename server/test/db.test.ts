// Connection settings used locally and on Vercel (cloud PostgreSQL such as Neon).
import { afterAll, describe, expect, it } from 'vitest'
import { closeDb, dbInfo, get, poolConfig } from '../src/db.js'

afterAll(async () => { await closeDb() })

describe('PostgreSQL connection settings', () => {
  it('local server: no SSL, normal pool', () => {
    const c = poolConfig('postgresql://postgres:pw@localhost:5432/fraud_detection', false)
    expect(c.ssl).toBeUndefined()
    expect(c.max).toBe(10)
  })

  it('cloud server (Neon URL from Vercel): SSL with certificate check, libpq-only options removed', () => {
    const c = poolConfig('postgresql://u:pw@ep-cool-name-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require', true)
    expect(c.ssl).toEqual({ rejectUnauthorized: true })
    expect(c.connectionString).toBe('postgresql://u:pw@ep-cool-name-pooler.us-east-1.aws.neon.tech/neondb')
    expect(c.max).toBe(3) // serverless: small pool per instance
  })

  it('cloud server without sslmode still uses SSL; sslmode=no-verify and sslmode=disable are honoured', () => {
    expect(poolConfig('postgresql://u:pw@db.example.com/app', true).ssl).toEqual({ rejectUnauthorized: true })
    expect(poolConfig('postgresql://u:pw@db.example.com/app?sslmode=no-verify', true).ssl).toEqual({ rejectUnauthorized: false })
    expect(poolConfig('postgresql://u:pw@db.example.com/app?sslmode=disable', true).ssl).toBeUndefined()
  })

  it('connects to the test database and reports it without credentials', async () => {
    expect(dbInfo()).toMatch(/^postgresql:\/\/[^@]+\/\w+$/)
    expect(Number((await get<{ one: number }>('SELECT 1 AS one'))!.one)).toBe(1)
  })
})
