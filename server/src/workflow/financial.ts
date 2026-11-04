// FR-CASE-043..045: financial impact of a fraud case, with the validations the system must enforce.

export interface FinancialImpact {
  attempted: number
  successful: number
  nearMiss: number
  potential: number
  gross: number
  recovery: number
  net?: number // computed
  exposure: number
  currency?: string
  memoRef?: string
}

export const EMPTY_IMPACT: FinancialImpact = { attempted: 0, successful: 0, nearMiss: 0, potential: 0, gross: 0, recovery: 0, net: 0, exposure: 0, currency: 'AED', memoRef: '' }

export function computeImpact(fi: Partial<FinancialImpact>): FinancialImpact {
  const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)
  const out: FinancialImpact = {
    attempted: n(fi.attempted), successful: n(fi.successful), nearMiss: n(fi.nearMiss), potential: n(fi.potential),
    gross: n(fi.gross), recovery: n(fi.recovery), exposure: n(fi.exposure), currency: fi.currency ?? 'AED', memoRef: fi.memoRef ?? '',
  }
  out.net = round2(out.gross - out.recovery)
  return out
}

export function validateImpact(fi: Partial<FinancialImpact>): string[] {
  const v = computeImpact(fi)
  const errors: string[] = []
  if (v.successful + v.nearMiss > v.attempted) errors.push('Successful fraud + Near miss must be less than or equal to Attempted fraud')
  if (v.potential > v.successful) errors.push('Potential loss must be less than or equal to Successful fraud')
  if (v.recovery > v.gross) errors.push('Recovery must be less than or equal to Gross loss')
  for (const [k, val] of Object.entries(v)) if (typeof val === 'number' && val < 0 && k !== 'net') errors.push(`${k} cannot be negative`)
  return errors
}

const round2 = (n: number) => Math.round(n * 100) / 100
