// Builds the UAT test guide workbook from the scenario catalogue (shared/src/scenarios.ts).
// Run: npm run test-guide   ->  docs/Agentic-Fraud-Test-Scenarios.xlsx
import ExcelJS from 'exceljs'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ALERT_STATUSES, ALERT_SUBCLASS, CASE_STATUSES, POST_TASK_TYPES } from '../shared/src/index.js'
import { SCENARIO_CUSTOMERS, SCENARIO_GROUPS, SCENARIOS, TEST_USERS } from '../shared/src/scenarios.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'docs', 'Agentic-Fraud-Test-Scenarios.xlsx')

const NAVY = 'FF1C2045', AMBER = 'FFFFB339', LAV = 'FFF3F6FF', LAV2 = 'FFE6EBFF', WHITE = 'FFFFFFFF', BORDER = 'FFD5DAEE'
const FONT = 'Arial'
const RESULTS = ['Not run', 'Pass', 'Fail', 'Blocked']
const wb = new ExcelJS.Workbook()
wb.creator = 'Auronova Consulting · Agentic Fraud Risk Framework'
wb.created = new Date()
wb.calcProperties = { fullCalcOnLoad: true }

const thin = { style: 'thin' as const, color: { argb: BORDER } }
const box = { top: thin, left: thin, bottom: thin, right: thin }
function header(ws: ExcelJS.Worksheet, row: number) {
  ws.getRow(row).eachCell((c) => {
    c.font = { name: FONT, bold: true, color: { argb: WHITE }, size: 10 }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
    c.alignment = { vertical: 'middle', wrapText: true }
    c.border = box
  })
  ws.getRow(row).height = 30
}
function body(ws: ExcelJS.Worksheet, from: number) {
  ws.eachRow((r, n) => {
    if (n < from) return
    r.eachCell({ includeEmpty: true }, (c) => {
      c.font = { name: FONT, size: 10, ...(c.font?.bold ? { bold: true } : {}), ...(c.font?.color ? { color: c.font.color } : {}) }
      c.alignment = { vertical: 'top', wrapText: true }
      c.border = box
    })
  })
}
function title(ws: ExcelJS.Worksheet, text: string, sub: string, cols: number) {
  ws.mergeCells(1, 1, 1, cols); ws.mergeCells(2, 1, 2, cols)
  const t = ws.getCell(1, 1); t.value = text; t.font = { name: FONT, size: 16, bold: true, color: { argb: NAVY } }
  const s = ws.getCell(2, 1); s.value = sub; s.font = { name: FONT, size: 10, italic: true, color: { argb: 'FF5D6185' } }; s.alignment = { wrapText: true, vertical: 'top' }
  ws.getRow(1).height = 26; ws.getRow(2).height = 32
  for (let c = 1; c <= cols; c++) ws.getCell(3, c).border = { top: { style: 'medium', color: { argb: AMBER } } }
}
function resultValidation(ws: ExcelJS.Worksheet, col: string, from: number, to: number) {
  for (let r = from; r <= to; r++) {
    const c = ws.getCell(`${col}${r}`)
    c.dataValidation = { type: 'list', allowBlank: false, formulae: [`"${RESULTS.join(',')}"`], showErrorMessage: true, errorTitle: 'Result', error: 'Choose Not run, Pass, Fail or Blocked' }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7E8' } } // input cell
  }
  const ref = `${col}${from}:${col}${to}`
  ws.addConditionalFormatting({ ref, rules: [
    { type: 'cellIs', operator: 'equal', formulae: ['"Pass"'], priority: 1, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFDFF3E4' } }, font: { color: { argb: 'FF1B6B35' }, bold: true } } },
    { type: 'cellIs', operator: 'equal', formulae: ['"Fail"'], priority: 2, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFBE3E3' } }, font: { color: { argb: 'FFC62828' }, bold: true } } },
    { type: 'cellIs', operator: 'equal', formulae: ['"Blocked"'], priority: 3, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFEDEDED' } }, font: { color: { argb: 'FF555555' }, bold: true } } },
  ] })
}
const who = (id: string) => `${TEST_USERS[id]?.name ?? id}`
const cust = (cif?: string) => (cif ? `${SCENARIO_CUSTOMERS[cif]?.name} (CIF ${cif}, ${SCENARIO_CUSTOMERS[cif]?.entity})` : '–')

// ======================= Read me =======================
{
  const ws = wb.addWorksheet('Read me', { views: [{ showGridLines: false }] })
  ws.columns = [{ width: 4 }, { width: 30 }, { width: 110 }]
  title(ws, 'Agentic Fraud Risk Framework · UAT test scenarios', 'Scripted scenarios to check that every alert and case situation in the agentic flow workbook (Sheets 2 to 7) and the FCMS BRD is handled correctly in the prototype UI. Synthetic data only. Auronova Consulting.', 3)
  const rows: [string, string][] = [
    ['What this workbook is', `${SCENARIOS.length} test scenarios in ${SCENARIO_GROUPS.length} groups. Each scenario has its own synthetic customer and a seeded record with a fixed ID, already placed at the start of the test, so scenarios can be run in any order.`],
    ['Before a test session', 'Local: run "npm run seed" then "npm run dev" and open http://localhost:5173. Deployed (Vercel): switch to System Administrator, open Overview > Test scenarios and click "Reset demo data". The page shows "Ready" next to every scenario whose record is still at its starting status.'],
    ['How to run a scenario', '1) Find the scenario on the "Scenarios" sheet (or in the app: Overview > Test scenarios). 2) Click "Start" in the app, or select the "Start as" user in the top-right user switcher and type the record ID in the search box. 3) Follow the "Steps" sheet row by row, switching user whenever "Log in as" changes. 4) Record Pass / Fail / Blocked per step and per scenario.'],
    ['Record IDs', 'Alerts: ALT-TC-<scenario>, e.g. ALT-TC-A01. Fraud cases: FC-TC-<scenario>, e.g. FC-TC-C04. Whistleblower cases: WB-TC-<scenario>. Cases created during a test (from an alert or "+ New case") get a normal ID such as FC-2026-0021: note it in the Notes column.'],
    ['Switching user', 'Login is a demo user selector at the top right (SSO is out of scope). The "Log in as" column names the person; their roles are on the "Users" sheet.'],
    ['Result columns', 'Light-amber cells are for you to fill in: choose Not run, Pass, Fail or Blocked from the drop-down, and add notes. The "Summary" sheet counts results automatically.'],
    ['Time-sensitive scenarios', 'Prevention alerts have a 30-minute SLA (TC-B01..B04): run them within 30 minutes of a reset, otherwise they are also escalated (that is correct behaviour, see TC-B05).'],
    ['Scenarios that change shared settings', 'TC-C13 changes the Advance Fee Scam threshold X to 30,000: its last step sets it back to 10,000. Run TC-C09..C11 before TC-C13 or after restoring X.'],
    ['Blocked by design', 'TC-D09 stays in Pending Approval: no one else can approve it, which is the control being tested.'],
    ['Flow chart sheet', 'One row per scenario showing the status path: green = start, light blue = step, red = return / reject, orange = end. Same legend as the flow workbook.'],
    ['Coverage sheet', 'Every alert status, decision, sub-classification, case status, routing rule, desk action and post-completion task type from the BRD / workbook, with the scenarios that exercise it.'],
  ]
  rows.forEach(([k, v], i) => {
    const r = ws.getRow(4 + i)
    r.getCell(2).value = k; r.getCell(3).value = v
    r.getCell(2).font = { name: FONT, bold: true, size: 10, color: { argb: NAVY } }
    r.getCell(3).font = { name: FONT, size: 10 }
    r.getCell(2).alignment = r.getCell(3).alignment = { wrapText: true, vertical: 'top' }
    r.getCell(2).fill = r.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 ? WHITE : LAV } }
  })
}

// ======================= Summary =======================
const scenRows = SCENARIOS.length
{
  const ws = wb.addWorksheet('Summary', { views: [{ showGridLines: false }] })
  ws.columns = [{ width: 46 }, { width: 12 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 13 }]
  title(ws, 'Test progress', 'Counts update from the Result column of the "Scenarios" sheet.', 7)
  ws.getRow(4).values = ['Group', 'Scenarios', 'Pass', 'Fail', 'Blocked', 'Not run', '% passed']
  header(ws, 4)
  const last = 4 + scenRows
  const groupCol = `Scenarios!$B$5:$B$${last}`, resCol = `Scenarios!$P$5:$P$${last}`
  SCENARIO_GROUPS.forEach((g, i) => {
    const r = 5 + i, n = SCENARIOS.filter((s) => s.group === g).length
    ws.getRow(r).values = [g,
      { formula: `COUNTIF(${groupCol},A${r})`, result: n },
      { formula: `COUNTIFS(${groupCol},A${r},${resCol},"Pass")`, result: 0 },
      { formula: `COUNTIFS(${groupCol},A${r},${resCol},"Fail")`, result: 0 },
      { formula: `COUNTIFS(${groupCol},A${r},${resCol},"Blocked")`, result: 0 },
      { formula: `COUNTIFS(${groupCol},A${r},${resCol},"Not run")`, result: n },
      { formula: `IF(B${r}=0,0,C${r}/B${r})`, result: 0 }] as any
  })
  const tr = 5 + SCENARIO_GROUPS.length
  ws.getRow(tr).values = ['Total', ...['B', 'C', 'D', 'E', 'F'].map((c) => ({ formula: `SUM(${c}5:${c}${tr - 1})`, result: c === 'B' || c === 'F' ? scenRows : 0 })), { formula: `IF(B${tr}=0,0,C${tr}/B${tr})`, result: 0 }] as any
  body(ws, 5)
  ws.getRow(tr).eachCell((c) => { c.font = { name: FONT, bold: true, size: 10 }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LAV2 } } })
  for (let r = 5; r <= tr; r++) ws.getCell(`G${r}`).numFmt = '0.0%'
  ws.getCell(`A${tr + 2}`).value = 'Steps in the guide'
  ws.getCell(`B${tr + 2}`).value = { formula: `COUNTA(Steps!A5:A${4 + SCENARIOS.reduce((n, s) => n + s.steps.length, 0)})`, result: SCENARIOS.reduce((n, s) => n + s.steps.length, 0) }
  ws.getCell(`A${tr + 2}`).font = { name: FONT, bold: true, size: 10 }
}

// ======================= Scenarios =======================
{
  const ws = wb.addWorksheet('Scenarios', { views: [{ state: 'frozen', xSplit: 1, ySplit: 4 }] })
  ws.columns = [12, 26, 46, 14, 10, 22, 24, 22, 30, 20, 50, 50, 44, 9, 30, 12, 16, 12, 34].map((width) => ({ width }))
  title(ws, 'Scenario index', 'One row per scenario. Use "Start as" + "Start record" to begin, then follow the Steps sheet. Fill in the light-amber Result, Tester, Date and Notes cells.', 19)
  ws.getRow(4).values = ['ID', 'Group', 'Scenario', 'Type', 'Workbook sheet', 'BRD reference', 'Start as (user)', 'Start record(s)', 'Synthetic customer', 'Starting status', 'Setup / pre-condition', 'Status flow', 'Pass criteria', 'Steps', 'Start screen', 'Result', 'Tester', 'Date', 'Notes']
  header(ws, 4)
  SCENARIOS.forEach((s, i) => {
    const r = 5 + i
    ws.getRow(r).values = [s.id, s.group, s.title, s.kind, s.sheet, s.brd, `${who(s.startAs)}\n${TEST_USERS[s.startAs]?.roles ?? ''}`, s.records.join('\n') || '(tester creates it)', cust(s.customer), s.startStatus ?? '–', s.setup, s.flow, s.expected,
      { formula: `COUNTIF(Steps!$A:$A,A${r})`, result: s.steps.length }, s.steps[0]?.at ?? '', 'Not run', '', '', ''] as any
  })
  body(ws, 5)
  SCENARIOS.forEach((s, i) => { const c = ws.getCell(`A${5 + i}`); c.font = { name: FONT, bold: true, size: 10, color: { argb: NAVY } } })
  resultValidation(ws, 'P', 5, 4 + scenRows)
  for (let r = 5; r <= 4 + scenRows; r++) for (const col of ['Q', 'R', 'S']) ws.getCell(`${col}${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7E8' } }
  ws.autoFilter = { from: 'A4', to: `S${4 + scenRows}` }
}

// ======================= Steps =======================
{
  const ws = wb.addWorksheet('Steps', { views: [{ state: 'frozen', xSplit: 2, ySplit: 4 }] })
  ws.columns = [12, 6, 20, 26, 26, 60, 60, 12, 30].map((width) => ({ width }))
  title(ws, 'Step-by-step instructions', 'Follow the rows in order. Switch to the "Log in as" user with the selector at the top right of the app before each step.', 9)
  ws.getRow(4).values = ['Scenario', 'Step', 'Log in as', 'Role', 'Where in the UI', 'What to do', 'Expected result', 'Result', 'Notes']
  header(ws, 4)
  let r = 5
  const bands: [number, number, boolean][] = []
  SCENARIOS.forEach((s, si) => {
    const start = r
    s.steps.forEach((st, i) => { ws.getRow(r).values = [s.id, i + 1, who(st.as), TEST_USERS[st.as]?.roles ?? '', st.at, st.do, st.expect, 'Not run', '']; r++ })
    bands.push([start, r - 1, si % 2 === 0])
  })
  body(ws, 5)
  for (const [a, b, shade] of bands) for (let x = a; x <= b; x++) for (const col of ['A', 'B', 'C', 'D', 'E', 'F', 'G']) ws.getCell(`${col}${x}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: shade ? LAV : WHITE } }
  for (let x = 5; x < r; x++) ws.getCell(`A${x}`).font = { name: FONT, bold: true, size: 10, color: { argb: NAVY } }
  resultValidation(ws, 'H', 5, r - 1)
  for (let x = 5; x < r; x++) ws.getCell(`I${x}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7E8' } }
  ws.autoFilter = { from: 'A4', to: `I${r - 1}` }
}

// ======================= Flow chart =======================
{
  const ws = wb.addWorksheet('Flow chart', { views: [{ state: 'frozen', xSplit: 2, ySplit: 5, showGridLines: false }] })
  const maxBoxes = Math.max(...SCENARIOS.flatMap((s) => s.flow.split(' | ').map((l) => l.replace(/^[A-Za-z ]+: /, '').split(' > ').length)))
  ws.columns = [{ width: 11 }, { width: 40 }, ...Array.from({ length: maxBoxes * 2 - 1 }, (_, i) => ({ width: i % 2 ? 3 : 19 }))]
  title(ws, 'Status flow per scenario', 'Read left to right. Green = starting status, light blue = intermediate step, red = return for rework / reject / blocked, orange = end state. Case lines start with "Case:", alert lines with "Alert:".', 2 + maxBoxes * 2 - 1)
  const legend: [string, string][] = [['Start', 'FFC8E6C9'], ['Step', 'FFDCE3FA'], ['Return / reject', 'FFF8C9C9'], ['End', 'FFFFD9A0']]
  legend.forEach(([l, fill], i) => { const c = ws.getCell(4, 3 + i * 2); c.value = l; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }; c.font = { name: FONT, size: 9, bold: true }; c.alignment = { horizontal: 'center' }; c.border = box })
  ws.getRow(5).values = ['ID', 'Scenario']; header(ws, 5); ws.getRow(5).height = 20
  let r = 6
  for (const s of SCENARIOS) {
    const lines = s.flow === 'n/a' ? [] : s.flow.split(' | ')
    const startRow = r
    for (const line of lines.length ? lines : ['(no status change: checks screens and MI)']) {
      const m = line.match(/^(Alert|Case|Tasks|Recovery|\d x [^:]+|[A-Za-z ]{2,12}): (.*)$/)
      const label = m ? `${m[1]}:` : ''
      const parts = (m ? m[2] : line).split(' > ').map((p) => p.trim()).filter(Boolean)
      parts.forEach((p, i) => {
        const c = ws.getCell(r, 3 + i * 2)
        c.value = i === 0 && label ? `${label} ${p}` : p
        const isRet = /return|reject|blocked|refused|disabled|breached/i.test(p)
        const fill = isRet ? 'FFF8C9C9' : i === 0 ? 'FFC8E6C9' : i === parts.length - 1 ? 'FFFFD9A0' : 'FFDCE3FA'
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
        c.font = { name: FONT, size: 9, bold: i === 0 || i === parts.length - 1 }
        c.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' }
        c.border = { top: { style: 'thin', color: { argb: 'FF8C93D9' } }, left: { style: 'thin', color: { argb: 'FF8C93D9' } }, bottom: { style: 'thin', color: { argb: 'FF8C93D9' } }, right: { style: 'thin', color: { argb: 'FF8C93D9' } } }
        if (i < parts.length - 1) { const a = ws.getCell(r, 4 + i * 2); a.value = '→'; a.font = { name: FONT, size: 12, bold: true, color: { argb: 'FFA0610D' } }; a.alignment = { horizontal: 'center', vertical: 'middle' } }
      })
      ws.getRow(r).height = 42
      r++
    }
    ws.getCell(startRow, 1).value = s.id; ws.getCell(startRow, 2).value = s.title
    if (r - 1 > startRow) { ws.mergeCells(startRow, 1, r - 1, 1); ws.mergeCells(startRow, 2, r - 1, 2) }
    for (const col of [1, 2]) { const c = ws.getCell(startRow, col); c.font = { name: FONT, size: 9, bold: col === 1, color: { argb: NAVY } }; c.alignment = { wrapText: true, vertical: 'middle' }; c.border = box }
    r++ // spacer row
  }
}

// ======================= Coverage =======================
{
  const ws = wb.addWorksheet('Coverage', { views: [{ state: 'frozen', ySplit: 4 }] })
  ws.columns = [{ width: 28 }, { width: 44 }, { width: 18 }, { width: 46 }, { width: 11 }]
  title(ws, 'Coverage of case types, statuses and decisions', 'Values from the flow workbook (Sheets 2-7) and the BRD; "Covered by" lists the scenarios that exercise each one.', 5)
  ws.getRow(4).values = ['Area', 'Value', 'Source', 'Covered by', 'Covered?']
  header(ws, 4)
  const text = (s: (typeof SCENARIOS)[number]) => `${s.title} ${s.flow} ${s.setup} ${s.steps.map((x) => `${x.do} ${x.expect}`).join(' ')}`
  const find = (needle: string | RegExp) => SCENARIOS.filter((s) => (typeof needle === 'string' ? text(s).includes(needle) : needle.test(text(s)))).map((s) => s.id).join(', ')
  const items: [string, string, string, string][] = [
    ...ALERT_STATUSES.map((v) => ['Alert status', v, 'FR-ALT-044', find(v === 'Hold' ? 'Hold' : v)] as [string, string, string, string]),
    ...(['False Positive', 'Confirmed Fraud'] as const).flatMap((d) => ALERT_SUBCLASS[d].map((v) => [`Alert decision: ${d}`, v, 'FR-ALT-038/039', find(v)] as [string, string, string, string])),
    ['Alert decision', 'Confirmed Fraud closed without a case', 'Sheet 2 step 10', find('Do NOT create a case')],
    ['Prevention colour', 'Green (allowed to go)', 'FR-ALT-050', find(/Green/)], ['Prevention colour', 'Red (blocked)', 'FR-ALT-050', find(/\(Red\)|Red\)/)], ['Prevention colour', 'Grey (step-up, held)', 'FR-ALT-050/051', find(/Grey/)],
    ['Prevention decision', 'Approve / False positive', 'FR-ALT-052', find('Approve / False positive')], ['Prevention decision', 'Approve / Expected or Authorized Behavior', 'FR-ALT-052', find('Expected or Authorized Behavior')], ['Prevention decision', 'Reject / Confirmed fraud', 'FR-ALT-052', find(/Reject.{0,12}Confirmed fraud/)],
    ['In-progress action', 'EDD SR raised + CRM outcome', 'FR-ALT-023..025', find('Raise EDD SR')], ['In-progress action', 'Send back to queue', 'FR-ALT-026', find('Send back to queue')], ['In-progress action', 'Re-schedule (+24h, max 3, TAT paused)', 'FR-ALT-029..032', find('Re-schedule +24h')],
    ['In-progress action', 'Re-assign to another user', 'FR-ALT-033', find('Re-assign')], ['In-progress action', 'Refer to FP&I + response', 'FR-ALT-035, 060, 061', find('Respond to referral')],
    ['Department queue', 'Fraud Ops', 'FR-ALT-04', 'TC-A01..A09'], ['Department queue', 'HR', 'FR-ALT-04', find('HR department queue')], ['Department queue', 'Governance', 'FR-ALT-04', find('Governance department queue')],
    ['Case origin', 'From an alert decision', 'FR-CASE-01', find('Create a case for investigation')], ['Case origin', 'Manual by Fraud Ops', 'FR-CASE-01', find('Manual - Fraud Ops')], ['Case origin', 'Manual by FP&I (asks Fraud Ops)', 'FR-CASE-02', find('Manual - FP&I')], ['Case origin', 'Auto from CRM service request', 'FR-CASE-01', find('CRM service request')],
    ...CASE_STATUSES.map((v) => ['Case status', v, 'FR-CASE-083', v === 'Reject' ? 'TC-C03' : v === 'Closed' || v === 'Under Investigation' ? 'TC-E03, TC-E04' : find(v)] as [string, string, string, string]),
    ['Routing rule', 'R1 Group Compliance: close + email', 'FR-CASE-035', 'TC-C04'], ['Routing rule', 'R1 Cyber Security: close + email', 'FR-CASE-035', 'TC-C05'],
    ['Routing rule', 'R2 External Fraud: close', 'FR-CASE-035', 'TC-C06'], ['Routing rule', 'R2 Card Fraud: close', 'FR-CASE-035', 'TC-C07'], ['Routing rule', 'R2 Fraudulent Enquiries: close', 'FR-CASE-035', 'TC-C08'],
    ['Routing rule', 'R3 Advance Fee Scam below X: close', 'FR-CASE-035', 'TC-C09'], ['Routing rule', 'R3 Advance Fee Scam equal to X (boundary): close', 'FR-CASE-035', 'TC-C10'], ['Routing rule', 'R3 Advance Fee Scam above X: investigate', 'FR-CASE-035', 'TC-C11, TC-D04, TC-D08'],
    ['Routing rule', 'R4 All other categories: FP&I pool', 'FR-CASE-035', 'TC-A01, TC-C01, TC-C12, TC-D01'], ['Routing rule', 'X configurable', 'FR-CASE-035', 'TC-C13'],
    ['Checker action', 'Approve / Reject / Return', 'FR-CASE-030..034', 'TC-C02 (return + approve), TC-C03 (reject)'],
    ['Investigator action', 'Return to Maker / Approve AFS / Submit', 'FR-CASE-063..066', 'TC-D03, TC-D04, TC-D01'],
    ['Reviewer action', 'Return / Approve and Close / Send to Approver', 'FR-CASE-067..070', 'TC-D05, TC-D01, TC-A01'],
    ['Approver action', 'Return (to Investigator; AFS to Maker) / Approve', 'FR-CASE-071..076', 'TC-D07, TC-D08, TC-D06'],
    ['Special flow', 'Joint investigation', 'FR-CASE-088..091', 'TC-E01'], ['Special flow', 'Joint review', 'FR-CASE-092', 'TC-E02'], ['Special flow', 'Whistleblower: HR / Governance', 'FR-CASE-093..098', 'TC-E03, TC-E04'],
    ...POST_TASK_TYPES.map((v) => ['Post-completion task', v, 'FR-CASE-0119', v === 'Non-Generic Issue' ? 'TC-D01' : find(v)] as [string, string, string, string]),
    ['Post-closure', 'Recovery maker-checker', 'FR-CASE-0150..0155', 'TC-F02'], ['Post-closure', 'Re-open (super user)', 'FR-CASE-081/082', 'TC-F03'], ['Post-closure', 'Disable case (super user)', 'FR-CASE-0134', 'TC-F04'], ['Post-closure', 'Archive after 90 days', 'FR-CASE-0131', 'TC-F05'],
    ['Control', 'Golden rule: maker ≠ checker, creator never signs off', 'FR-CASE-030/085', 'TC-A01, TC-C02, TC-D09'], ['Control', 'Comment on every routing action', 'FR-CASE-084', 'TC-C03'], ['Control', 'Mandatory fields on submit / draft save', 'FR-CASE-026/027', 'TC-C01'],
    ['Control', 'Financial validations', 'FR-CASE-045', 'TC-D02'], ['Control', 'Draft delete only if never returned', 'FR-CASE-087', 'TC-C14, TC-C02'], ['Control', 'Chinese wall (entity, department, whistleblower)', 'BRD 5.10', 'TC-X01, TC-A10, TC-E03'],
    ['Control', 'SLA: overdue + daily email; prevention escalation; EDD > 8 days', 'FR-ALT-063..068', 'TC-A12, TC-B05, TC-A13'], ['Control', 'Data-quality exception + immutable raw payload', 'FR-ALT-03/05', 'TC-A09'], ['Control', 'Multi-alert decision for one customer', 'FR-ALT-011', 'TC-A08'],
  ]
  items.forEach(([a, v, src, by], i) => { const r = 5 + i; ws.getRow(r).values = [a, v, src, by, { formula: `IF(LEN(D${r})>0,"Yes","GAP")`, result: by ? 'Yes' : 'GAP' }] as any })
  body(ws, 5)
  ws.addConditionalFormatting({ ref: `E5:E${4 + items.length}`, rules: [{ type: 'cellIs', operator: 'equal', formulae: ['"GAP"'], priority: 1, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFBE3E3' } }, font: { color: { argb: 'FFC62828' }, bold: true } } }] })
  ws.autoFilter = { from: 'A4', to: `E${4 + items.length}` }
  const gaps = items.filter((x) => !x[3])
  if (gaps.length) console.warn('Coverage gaps:', gaps.map((g) => `${g[0]}: ${g[1]}`).join('; '))
}

// ======================= Users + Customers =======================
{
  const ws = wb.addWorksheet('Users')
  ws.columns = [{ width: 24 }, { width: 40 }, { width: 70 }]
  title(ws, 'Demo users', 'Select these in the user switcher at the top right of the app.', 3)
  ws.getRow(4).values = ['User', 'Roles', 'Used as "Log in as" in']
  header(ws, 4)
  Object.entries(TEST_USERS).forEach(([id, u], i) => {
    const used = SCENARIOS.filter((s) => s.startAs === id || s.steps.some((x) => x.as === id)).map((s) => s.id).join(', ')
    ws.getRow(5 + i).values = [u.name, u.roles, used]
  })
  body(ws, 5)
}
{
  const ws = wb.addWorksheet('Customers')
  ws.columns = [{ width: 12 }, { width: 24 }, { width: 10 }, { width: 18 }, { width: 22 }, { width: 30 }]
  title(ws, 'Synthetic scenario customers', 'One dedicated customer per scenario. Search by CIF, name or national ID.', 6)
  ws.getRow(4).values = ['CIF', 'Name', 'Entity', 'Segment', 'National ID', 'Scenario(s)']
  header(ws, 4)
  Object.entries(SCENARIO_CUSTOMERS).forEach(([cif, c], i) => {
    ws.getRow(5 + i).values = [cif, c.name, c.entity, c.segment, c.eid, SCENARIOS.filter((s) => s.customer === cif).map((s) => s.id).join(', ')]
  })
  body(ws, 5)
}

mkdirSync(dirname(out), { recursive: true })
await wb.xlsx.writeFile(out)
console.log(`Wrote ${out}: ${SCENARIOS.length} scenarios, ${SCENARIOS.reduce((n, s) => n + s.steps.length, 0)} steps`)
