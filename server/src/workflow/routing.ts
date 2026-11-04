// FR-CASE-035: what happens when the Fraud Ops Checker approves a case. Data-driven and editable in Admin config.

export type RoutingAction = 'close_email' | 'close' | 'threshold' | 'investigate'
export interface RoutingRule {
  id: string
  label: string
  /** Matches when the case's Risk Category L1 or L2 is in this list. Empty = match all (catch-all). */
  categories: string[]
  action: RoutingAction
  emailTo?: string
}

export const DEFAULT_ROUTING_RULES: RoutingRule[] = [
  { id: 'R1', label: 'Group Compliance / Cyber security', categories: ['Group Compliance', 'Cyber Security'], action: 'close_email', emailTo: 'group.compliance@auronova.example; cyber.security@auronova.example' },
  { id: 'R2', label: 'External Fraud / Card Fraud / Fraudulent Enquiries', categories: ['External Fraud', 'Card Fraud', 'Fraudulent Enquiries'], action: 'close' },
  { id: 'R3', label: 'Advance Fee Scam (amount vs X)', categories: ['Advance Fee Scam'], action: 'threshold' },
  { id: 'R4', label: 'All other cases', categories: [], action: 'investigate' },
]

export interface RoutingInput { riskL1?: string | null; riskL2?: string | null; successfulAmountAed: number }
export interface RoutingResult {
  rule: RoutingRule
  outcome: 'CLOSE' | 'INVESTIGATE'
  emailTo?: string
  explanation: string
}

export function evaluateRouting(input: RoutingInput, rules: RoutingRule[], afsThresholdAed: number): RoutingResult {
  const cats = [input.riskL1, input.riskL2].filter(Boolean) as string[]
  const rule = rules.find((r) => r.categories.length === 0 || r.categories.some((c) => cats.includes(c)))
  if (!rule) throw new Error('Routing table has no catch-all rule')
  switch (rule.action) {
    case 'close_email':
      return { rule, outcome: 'CLOSE', emailTo: rule.emailTo, explanation: `${rule.label}: close the case and email ${rule.emailTo ?? 'the owning team'}.` }
    case 'close':
      return { rule, outcome: 'CLOSE', explanation: `${rule.label}: close the case at Fraud Ops.` }
    case 'threshold': {
      const above = input.successfulAmountAed > afsThresholdAed
      return {
        rule, outcome: above ? 'INVESTIGATE' : 'CLOSE',
        explanation: `${rule.label}: successful fraud AED ${fmt(input.successfulAmountAed)} is ${above ? 'above' : 'at or below'} X = AED ${fmt(afsThresholdAed)}, so ${above ? 'send to the FP&I Investigator pool' : 'close the case'}.`,
      }
    }
    default:
      return { rule, outcome: 'INVESTIGATE', explanation: `${rule.label}: route to the FP&I Investigator pool.` }
  }
}

const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 })
