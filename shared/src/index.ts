// Shared domain definitions (BRD: FCMS requirements). Imported by both server and client.

export const ROLES = {
  FO_ANALYST: 'Fraud Ops Analyst',
  GOVERNANCE: 'Governance Analyst',
  HR: 'HR Analyst',
  FO_MAKER: 'Fraud Ops Maker',
  FO_CHECKER: 'Fraud Ops Checker',
  FPI_INVESTIGATOR: 'FP&I Investigator',
  FPI_REVIEWER: 'FP&I Reviewer',
  FPI_APPROVER: 'FP&I Approver',
  MANAGER: 'Fraud Ops Manager',
  SUPER_USER: 'Super User',
} as const
export type Role = keyof typeof ROLES

export type Entity = 'Retail' | 'Islamic' | 'Digital'
export const ENTITIES: Entity[] = ['Retail', 'Islamic', 'Digital']

export interface User {
  id: string
  name: string
  email: string
  roles: Role[]
  entities: Entity[]
  dept: 'FRAUD_OPS' | 'GOVERNANCE' | 'HR' | 'FPI' | 'ADMIN'
}

// ---------- Alerts (FAMS, BRD section 4) ----------
export const ALERT_STATUSES = [
  'Yet to start', 'WIP', 'EDD raised', 'EDD responded', 'Re-scheduled', 'Referred to FP&I', 'Hold', 'Closed',
] as const
export type AlertStatus = (typeof ALERT_STATUSES)[number]

export type AlertCategory = 'Prevention' | 'Detection'
export type AlertDept = 'FRAUD_OPS' | 'GOVERNANCE' | 'HR'
export type AlertComplexity = 'High' | 'Medium' // High = L2, Medium = L1
export type Priority = 'High' | 'Medium' | 'Low'
export type PreventionColour = 'Green' | 'Red' | 'Grey' // allowed / blocked / step-up (FR-ALT-050)

export const ALERT_DECISIONS = ['False Positive', 'Confirmed Fraud'] as const
export const ALERT_SUBCLASS: Record<(typeof ALERT_DECISIONS)[number], string[]> = {
  'False Positive': ['Inconclusive', 'Customer declined', 'System issue', 'Rule discrepancy', 'Valid alert-non fraud'],
  'Confirmed Fraud': ['Scam-malicious code (personal PC)', 'Scam-pharming', 'Scam-phishing', 'External fraud'],
}
export const PREVENTION_DECISIONS = {
  Approve: ['False positive', 'Expected or Authorized Behavior'],
  Reject: ['Confirmed fraud'],
}

export const ALERT_IN_PROGRESS_ACTIONS = ['EDD SR Raised', 'Send back to Queue', 'Re-schedule alert', 'Re-assign to another user', 'Refer to FP&I'] as const

/** Precautionary-step catalogue (FR-ALT-019). `fields` describes the inputs captured for each step. */
export interface StepDef { category: string; step: string; fields: string[] }
export const PRECAUTION_CATALOGUE: StepDef[] = [
  { category: 'Customer Beneficiary', step: 'Lien Amount', fields: ['Amount (AED)'] },
  { category: 'Customer Beneficiary', step: 'Lien Accounts', fields: ['Impacted account'] },
  { category: 'Customer Beneficiary', step: 'Lien Status (from Finacle)', fields: ['Marked / Released'] },
  { category: 'Customer Beneficiary', step: 'Beneficiary Card Blocked', fields: ['Card details', 'Date'] },
  { category: 'Customer Beneficiary', step: 'Beneficiary Online Banking Blocked', fields: ['Date'] },
  { category: 'Customer Beneficiary', step: 'Linked Accounts Identified', fields: ['Linked account numbers'] },
  { category: 'Customer Beneficiary', step: 'Remitting Bank Contacted', fields: ['Date'] },
  { category: 'Victim', step: 'Victim Card Blocked', fields: ['Card details', 'Date'] },
  { category: 'Victim', step: 'Victim Customer Contacted', fields: ['Date'] },
  { category: 'Victim', step: 'Victim Online Banking Blocked', fields: ['Date'] },
  { category: 'Police Reporting', step: 'Case Reported to Police by Call', fields: ['Date', 'Reference number'] },
  { category: 'Police Reporting', step: 'Case Reported to Police by Email', fields: ['Date', 'Reference number'] },
  { category: 'EDD', step: 'EDD Email Sent for Islamic Linked Account', fields: ['Date'] },
  { category: 'EDD', step: 'EDD Email Sent for Islamic Beneficiary Account', fields: ['Date'] },
  { category: 'EDD', step: 'EDD SR Email Sent to Business Unit', fields: ['Date'] },
  { category: 'EDD', step: 'EDD SR Raised', fields: ['SR reference', 'Date'] },
  { category: 'Email Notification', step: 'Cards Business Informed', fields: ['Date'] },
  { category: 'Email Notification', step: 'Business Notified', fields: ['Date'] },
  { category: 'Email Notification', step: 'FP&I Notified', fields: ['Date'] },
  { category: 'Regulatory', step: 'STR Raised', fields: ['Date', 'SR number'] },
  { category: 'Regulatory', step: 'TDRA Reported', fields: ['Date', 'SR number', 'Contact number', 'Remark'] },
  { category: 'Regulatory', step: 'FARIS Reported', fields: ['Date', 'SR number'] },
  { category: 'Freeze', step: 'Freeze Placed in Beneficiary Account', fields: ['Date', 'Account number'] },
  { category: 'Freeze', step: 'Freeze Placed in Victim Account', fields: ['Date', 'Account number'] },
  { category: 'Cancellation', step: 'FTS Cancellation Email Initiated', fields: ['Date', 'SR number'] },
  { category: 'Cancellation', step: 'IPI Cancellation Email Initiated', fields: ['Date', 'SR number'] },
  { category: 'Cancellation', step: 'SWIFT Cancellation Initiated', fields: ['Date', 'SR number'] },
  { category: 'Service Request', step: 'Email Sent to RCB for POS Transaction', fields: ['Date'] },
  { category: 'Service Request', step: 'Indemnity Request Initiated', fields: ['Date'] },
  { category: 'Service Request', step: 'ATM Snapshot Requested', fields: ['Date'] },
  { category: 'Service Request', step: 'Telecommunication Follow Up SR Raised', fields: ['Date', 'SR reference'] },
  { category: 'Recall', step: 'Recall Email to RBWM Digital Team (Payment Gateway / Third-Party Apps)', fields: ['Date', 'SR number'] },
  { category: 'Recall', step: 'Direct Remittance Recall Email Sent', fields: ['Date'] },
  { category: 'Recall', step: 'Recall Email Sent to Telecommunication Team', fields: ['Provider (Etisalat / du / Virgin)', 'Date', 'SR reference'] },
  { category: 'NPSS', step: 'NPSS Dispute Email Raised', fields: ['Date', 'SR number'] },
  { category: 'Others', step: 'Others', fields: ['Free text'] },
]

export const ALERT_TYPES = [
  'Account takeover', 'Mule account', 'Phishing', 'Pharming', 'Malware / remote access', 'Advance fee scam',
  'Velocity breach', 'Behavioural deviation', 'High-risk counterparty', 'Staff anomaly', 'Device anomaly',
] as const

// ---------- Cases (FCMS, BRD section 5) ----------
export const CASE_STATUSES = [
  'Draft', 'Submitted to FO Checker', 'Return for re-work', 'Reject', 'Approved and Closed (FO)',
  'Approved for Investigation', 'Investigation in progress', 'Review in progress', 'Pending Approval',
  'Investigation Approved', 'Final report generated and closed', 'Case re-opened',
  // whistleblower variant (Sheet 6)
  'Under Investigation', 'Closed',
] as const
export type CaseStatus = (typeof CASE_STATUSES)[number]

export const CLOSED_STATUSES: CaseStatus[] = ['Reject', 'Approved and Closed (FO)', 'Final report generated and closed', 'Closed']

export type CaseType = 'STANDARD' | 'WHISTLEBLOWER'

/** Who currently owns the case. Drives queues / pools. */
export type CaseOwner = 'FO_MAKER' | 'FO_CHECKER' | 'FPI_INVESTIGATOR' | 'FPI_REVIEWER' | 'FPI_APPROVER' | 'HR_GOV' | 'NONE'

export const CASE_ACTIONS = [
  'submit', 'checker_approve', 'checker_reject', 'checker_return',
  'inv_return', 'inv_approve_afs', 'inv_submit',
  'rev_return', 'rev_approve_close', 'rev_send_approver',
  'app_return', 'app_approve',
  'wb_route', 'wb_close', 'reopen',
] as const
export type CaseAction = (typeof CASE_ACTIONS)[number]

export const CASE_ACTION_LABELS: Record<CaseAction, string> = {
  submit: 'Submit to Fraud Ops Checker',
  checker_approve: 'Approve (apply routing rules)',
  checker_reject: 'Reject (close case)',
  checker_return: 'Return to Maker',
  inv_return: 'Return for rework (to Fraud Ops Maker)',
  inv_approve_afs: 'Approve Advance Fee Scam (final report + close)',
  inv_submit: 'Submit to Reviewer',
  rev_return: 'Return for rework (to Investigator)',
  rev_approve_close: 'Approve and Close',
  rev_send_approver: 'Send to Approver',
  app_return: 'Return for rework',
  app_approve: 'Approve (final report + close)',
  wb_route: 'Route to HR / Governance',
  wb_close: 'Close whistleblower case',
  reopen: 'Re-open case',
}

// Risk classification drop-downs (BRD appendix "New Drop-down values.xlsx" was not supplied: these are representative, configurable values).
export const RISK_CATEGORIES: Record<string, Record<string, string[]>> = {
  'Group Compliance': { 'Regulatory / AML': ['Sanctions exposure', 'Suspicious structuring'] },
  'Cyber Security': { 'Malware / Intrusion': ['Remote access trojan', 'Credential theft'] },
  'External Fraud': { 'Phishing / Vishing': ['Vishing - OTP disclosure', 'Phishing link'], 'Account Takeover': ['Device swap', 'SIM swap'] },
  'Card Fraud': { 'Card Not Present': ['E-commerce compromise'], 'Card Present': ['Skimming', 'Cloned card'] },
  'Fraudulent Enquiries': { 'Customer Enquiry': ['Unrecognised transaction enquiry'] },
  'Advance Fee Scam': { 'Advance Fee': ['Lottery / prize', 'Romance scam', 'Inheritance'] },
  'Internal Fraud': { 'Staff Misconduct': ['Unauthorised access', 'Collusion'] },
  'Investment Scam': { 'Fake Investment': ['Crypto platform', 'Forex platform'] },
  'Mule Account': { 'Mule Network': ['Recruited mule', 'Rented account'] },
}

export const DROPDOWNS = {
  source: ['Internal', 'External'],
  complexity: ['L1', 'L2'],
  reportingChannel: ['Customer call', 'Branch', 'Email', 'CRM service request', 'Alert (DSP)', 'Regulator / Police', 'Internal referral'],
  scamMethod: ['Phone call', 'SMS', 'WhatsApp', 'Email', 'Social media', 'Website'],
  scamType: ['Vishing', 'Smishing', 'Phishing', 'Impersonation', 'Investment', 'Romance'],
  compromiseSource: ['Customer disclosure', 'Malware', 'Data breach', 'Social engineering', 'Unknown'],
  customerRole: ['Victim', 'Beneficiary / Mule', 'Suspect', 'Staff'],
  channelType: ['Mobile app', 'Online banking', 'Branch', 'ATM', 'POS', 'Payment gateway'],
  txnType: ['UAEFTS transfer', 'IPI instant payment', 'SWIFT transfer', 'Card purchase', 'ATM withdrawal', 'Internal transfer'],
  paymentInstrument: ['Account', 'Debit card', 'Credit card', 'Wallet'],
  transferCategory: ['Local', 'International', 'Own account', 'Third party'],
  currencies: ['AED', 'USD', 'EUR', 'GBP', 'INR'],
  recCategory: ['People', 'Process', 'System'],
  recType: ['Generic', 'Non-Generic'],
  recIssue: ['Weak customer authentication', 'Delayed hold on beneficiary', 'Training gap', 'Rule gap in DSP', 'Process control gap', 'Third-party exposure'],
  recAction: ['Strengthen control', 'Staff awareness session', 'Tune DSP rule', 'Update procedure', 'Customer awareness campaign', 'Disciplinary review'],
  staffStatus: ['Active', 'Suspended', 'Terminated', 'Resigned'],
  recoveryMode: ['Beneficiary bank recall', 'Lien release', 'Customer refund', 'Insurance', 'Legal recovery'],
  telecomProviders: ['Etisalat', 'du', 'Virgin Mobile'],
}

/** Exchange rates to AED, frozen per transaction date (FR-CASE-011). Static demo table; the server stores the rate used on each transaction. */
export const FX_TO_AED: Record<string, number> = { AED: 1, USD: 3.6725, EUR: 3.98, GBP: 4.65, INR: 0.044 }

export const CHECKLIST_TEMPLATES: string[] = [
  'Obtain an understanding of the allegations',
  'Determine estimated potential loss',
  'Obtain and review the procedure with respect to the activity / area',
  'Determine type of evidences that needs to be obtained',
  'Review the AODs',
  'Review the account statement',
  'Retrieve the video footages',
  'Determine and list individuals who should be interviewed',
  'Review staff file',
  'Review staff account',
  'Review customer account',
  'Review third party account',
  'SR resolution to ensure the process is correctly handled by the team',
  'Creating a Physical File',
]

// ---------- Post-closure ----------
export const POST_TASK_TYPES = ['Op Risk Event', 'Central Bank STR', 'Generic Issue', 'Non-Generic Issue'] as const
export type PostTaskType = (typeof POST_TASK_TYPES)[number]

// ---------- Agents (Sheet 8, placeholders in v1) ----------
export interface AgentDef {
  id: string; n: number; stage: string; name: string; does: string; why: string
  autonomy: 'Recommend' | 'Draft' | 'Draft / recommend'; phase: 'Quick win' | 'Phase 2' | 'Phase 3'
  surface: 'alert' | 'prevention' | 'case-maker' | 'case-checker' | 'investigation' | 'review' | 'post-closure' | 'dashboard' | 'global'
  tools: string[] // planned tool calls (agent layer comes later)
}
export const AGENTS: AgentDef[] = [
  { id: 'dq-linking', n: 1, stage: 'Alert ingested', name: 'Data Quality + Linking Agent', does: 'Flags missing fields, links alerts / cases of the same customer, spots shared devices or beneficiaries', why: 'Fewer data-quality exceptions; analyst sees the full picture', autonomy: 'Recommend', phase: 'Phase 2', surface: 'alert', tools: ['get_alert', 'search_alerts_by_device', 'search_alerts_by_beneficiary', 'get_customer_cases'] },
  { id: 'triage', n: 2, stage: 'Triage', name: 'Triage Agent', does: 'Suggests priority, L1/L2 complexity and best queue / analyst skill', why: 'Right alert to the right person first time', autonomy: 'Recommend', phase: 'Phase 2', surface: 'alert', tools: ['get_alert', 'get_config', 'list_analyst_workload'] },
  { id: 'alert-summary', n: 3, stage: 'Analyst works alert', name: 'Alert Summary Agent', does: 'Writes a short case story from rule, transactions and history, every fact linked to its record; drafts EDD and notification emails', why: 'Cuts reading and typing time on every alert', autonomy: 'Draft', phase: 'Quick win', surface: 'alert', tools: ['get_alert', 'get_transactions', 'get_alert_history', 'draft_email'] },
  { id: 'disposition', n: 4, stage: 'Alert decision', name: 'Disposition Recommender', does: 'Suggests False Positive / Confirmed Fraud, sub-classification and a draft rationale', why: 'Faster, more consistent decisions', autonomy: 'Recommend', phase: 'Phase 2', surface: 'alert', tools: ['get_alert', 'get_transactions', 'get_rule_precision'] },
  { id: 'held-copilot', n: 5, stage: 'Prevention alerts', name: 'Held-Transaction Copilot', does: 'Ranks held transactions by SLA risk and gives a one-screen summary for Approve / Reject', why: 'Fewer SLA breaches while money is on hold', autonomy: 'Recommend', phase: 'Phase 2', surface: 'prevention', tools: ['list_held_transactions', 'get_alert', 'get_customer_profile'] },
  { id: 'case-prefill', n: 6, stage: 'Maker prepares case', name: 'Case Pre-fill Agent', does: 'Reads the complaint / SR / alert, proposes transactions, risk category, parties and recommendation fields', why: 'Removes re-typing; fewer returns from Checker', autonomy: 'Draft', phase: 'Quick win', surface: 'case-maker', tools: ['get_alert', 'get_case', 'search_transactions', 'get_dropdowns'] },
  { id: 'checker-qa', n: 7, stage: 'Checker + routing', name: 'Checker QA Agent', does: 'Checks completeness, financial validations and consistency; explains which routing rule will apply', why: 'Fewer rework loops', autonomy: 'Recommend', phase: 'Quick win', surface: 'case-checker', tools: ['get_case', 'validate_financials', 'preview_routing'] },
  { id: 'inv-copilot', n: 8, stage: 'FP&I investigation', name: 'Investigation Copilot', does: 'Suggests checklist items, summarises evidence (incl. audio / video transcripts), builds a timeline, drafts activity log and the investigation report (FR-CASE-061)', why: 'Biggest time saving in the process', autonomy: 'Draft', phase: 'Quick win', surface: 'investigation', tools: ['get_case', 'list_evidence', 'read_evidence', 'draft_activity_log', 'draft_report'] },
  { id: 'reviewer-qa', n: 9, stage: 'Review + approval', name: 'Reviewer QA Agent', does: 'Checks report claims against evidence and flags gaps before sign-off', why: 'Higher quality, fewer returns', autonomy: 'Recommend', phase: 'Phase 2', surface: 'review', tools: ['get_case', 'list_evidence', 'get_report'] },
  { id: 'post-closure', n: 10, stage: 'Closure + post-completion', name: 'Post-Closure Agents', does: 'Suggest task categories, pre-fill OpenPages, draft STR, track recovery, watchlist checks', why: 'Faster closure follow-up, better recovery', autonomy: 'Draft / recommend', phase: 'Quick win', surface: 'post-closure', tools: ['get_case', 'list_post_tasks', 'draft_str', 'list_recoveries', 'check_watchlist'] },
  { id: 'insight', n: 11, stage: 'Reporting + feedback', name: 'Insight + Feedback Agent', does: 'Rule precision back to DSP, root-cause trends, SLA risk alerts, narrative for dashboards', why: 'System and rules improve over time', autonomy: 'Recommend', phase: 'Phase 3', surface: 'dashboard', tools: ['get_dashboard', 'get_rule_precision', 'list_closed_cases'] },
  { id: 'policy-search', n: 12, stage: 'Across all', name: 'Policy Search Agent', does: 'Finds the relevant internal policy for a case (FR-CASE-0127)', why: 'Less time searching documents', autonomy: 'Recommend', phase: 'Phase 2', surface: 'global', tools: ['search_policies', 'get_case'] },
]

export const AGENT_GUARDRAILS = [
  'Read-only access to data',
  'Every claim is linked to a record',
  'Customer identifiers masked where possible',
  'Chinese-wall access is respected',
  'Every suggestion is logged',
  'A person approves: maker-checker is unchanged',
]

// ---------- Helpers ----------
export const complexityToLevel = (c: AlertComplexity) => (c === 'High' ? 'L2' : 'L1')
export const isClosedCase = (s: string) => (CLOSED_STATUSES as string[]).includes(s)
