// Fraud Investigation Report in Word format (FR-CASE-061, 062, 079).
// v1 assembles the report from case data with a fixed template. The Investigation Copilot (agent #8) will later draft the narrative.
import { existsSync, readFileSync } from 'node:fs'
import { AlignmentType, BorderStyle, Document, HeadingLevel, ImageRun, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType } from 'docx'

// Auronova Consulting palette: navy headings, amber-dark accent line (readable on white), lavender table headers.
const NAVY = '1C2045', ORANGE = 'A0610D', BLUE_100 = 'F3F6FF'
const LOGO = new URL('../../../client/public/auronova-logo.png', import.meta.url)
const logoPara = () => existsSync(LOGO)
  ? [new Paragraph({ spacing: { after: 120 }, children: [new ImageRun({ type: 'png', data: readFileSync(LOGO), transformation: { width: 150, height: 40 } })] })]
  : []

const h = (text: string) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 120 }, children: [new TextRun({ text, color: NAVY, bold: true })] })
const p = (text: string, opts: { bold?: boolean; italics?: boolean } = {}) => new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text, ...opts })] })
const cell = (text: string, header = false) => new TableCell({
  shading: header ? { type: ShadingType.CLEAR, color: 'auto', fill: BLUE_100 } : undefined,
  margins: { top: 60, bottom: 60, left: 100, right: 100 },
  children: [new Paragraph({ children: [new TextRun({ text: text ?? '', bold: header, size: 18 })] })],
})
const table = (headers: string[], rows: (string | number | null | undefined)[][]) => new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  borders: { top: b(), bottom: b(), left: b(), right: b(), insideHorizontal: b(), insideVertical: b() },
  rows: [new TableRow({ tableHeader: true, children: headers.map((x) => cell(x, true)) }), ...rows.map((r) => new TableRow({ children: r.map((x) => cell(x === null || x === undefined ? '' : String(x))) }))],
})
const b = () => ({ style: BorderStyle.SINGLE, size: 4, color: 'E4E7F4' })
const kv = (pairs: [string, unknown][]) => table(['Field', 'Value'], pairs.map(([k, v]) => [k, v === true ? 'Yes' : v === false ? 'No' : (v as any)]))
const aed = (n: unknown) => `AED ${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export async function buildCaseReport(full: any): Promise<Buffer> {
  const c = full.case, d = full.data, fi = d.financialImpact
  const rec = d.fpiRecommendation?.category ? d.fpiRecommendation : d.recommendation
  const findings = full.activityLog.filter((l: any) => l.include_in_report)
  const isWb = c.type === 'WHISTLEBLOWER'
  const doc = new Document({
    creator: 'Auronova Consulting · Agentic Fraud Risk Framework',
    title: `${c.id} Final Investigation Report`,
    styles: { default: { document: { run: { font: 'Calibri', size: 21 } } } },
    sections: [{
      children: [
        ...logoPara(),
        new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun({ text: 'Auronova Consulting · Fraud Prevention & Investigation', color: ORANGE, bold: true, size: 20 })] }),
        new Paragraph({ heading: HeadingLevel.TITLE, spacing: { after: 120 }, children: [new TextRun({ text: isWb ? 'Whistleblower Investigation Report' : 'Fraud Investigation Report', color: NAVY, bold: true, size: 40 })] }),
        p(`Case ${c.id} · Status: ${c.status} · Generated ${new Date().toLocaleString('en-GB')}`, { italics: true }),
        p('CONFIDENTIAL. Prepared under the Chinese-wall policy. Do not share STR content with the customer.', { italics: true }),

        h('1. Case summary'),
        kv([
          ['Case ID', c.id], ['Entity', c.entity], ['Origin', c.origin], ['Customer', `${c.customer_name ?? '-'} (CIF ${c.cif ?? '-'})`],
          ['Risk Category (L1 / L2)', `${c.risk_l1 ?? '-'} / ${c.risk_l2 ?? '-'}`], ['Risk title', c.risk_title], ['Complexity', c.complexity],
          ['Created', c.created_at?.slice(0, 10)], ['Date reported to FP&I', d.investigation?.dateReportedToFpi], ['Unit / Branch', d.investigation?.unitBranch],
          ['Fraud', d.investigation?.isFraud], ['Reportable in MIS', d.investigation?.reportableMis], ['Reportable in OpRisk', d.investigation?.reportableOpRisk],
          ['Maker / Checker', `${full.people.maker ?? '-'} / ${full.people.checker ?? '-'}`],
          ['Investigator / Reviewer / Approver', `${full.people.investigator ?? '-'} / ${full.people.reviewer ?? '-'} / ${full.people.approver ?? '-'}`],
        ]),
        h('2. Background'),
        p(d.details?.description || '-'),
        ...(isWb ? [p(`Allegation: ${d.whistleblower?.allegation ?? '-'}`)] : []),

        h('3. Parties involved'),
        full.parties.length ? table(['Type', 'Name', 'Reference', 'Suspect', 'Blacklist'], full.parties.map((x: any) => [x.kind, x.name, x.ref, x.suspect ? 'Yes' : 'No', x.blacklist ? 'Yes' : 'No'])) : p('None recorded.'),

        h('4. Transactions'),
        full.transactions.length ? table(['Date', 'Txn ID', 'Type', 'Amount', 'AED', 'Beneficiary'], full.transactions.map((t: any) => [t.date?.slice(0, 10), t.txn_id, t.type, `${t.currency} ${t.amount}`, t.amount_aed, `${t.beneficiary_name ?? ''} ${t.beneficiary_account ?? ''}`])) : p('No transactions selected (non-financial case).'),

        h('5. Financial impact'),
        kv([['Attempted fraud', aed(fi.attempted)], ['Successful fraud', aed(fi.successful)], ['Near miss', aed(fi.nearMiss)], ['Potential loss', aed(fi.potential)],
          ['Gross loss', aed(fi.gross)], ['Recovery', aed(fi.recovery)], ['Net loss (computed)', aed(fi.net)], ['Total exposure', aed(fi.exposure)], ['Memo ref no.', fi.memoRef]]),

        h('6. Investigation findings'),
        ...(findings.length ? findings.map((l: any) => p(`${l.date} · ${l.finding || l.description}${l.checklist_id ? ` (checklist ${l.checklist_id})` : ''}`)) : [p('No findings were marked "Include in Final Report".')]),

        h('7. Checklist status'),
        full.checklist.length ? table(['ID', 'Item', 'Owner', 'Target', 'Status'], full.checklist.map((i: any) => [i.id, i.title, i.assigned_name, i.target_date, i.status])) : p('-'),

        h('8. Recommendation'),
        kv([['Category', rec?.category], ['Type', rec?.type], ['Issue', rec?.issue], ['Action', rec?.action], ['Recommendation', rec?.text], ['STR required', rec?.strRequired]]),

        h('9. Evidence'),
        full.evidence.length ? table(['Folder', 'Document', 'Source', 'Uploaded'], full.evidence.map((e: any) => [e.folder, e.name, e.source, e.uploaded_at?.slice(0, 10)])) : p('-'),

        h('10. Workflow history'),
        table(['When', 'Who', 'Action', 'Comment'], [...full.audit].reverse().slice(-25).map((a: any) => [a.ts?.slice(0, 16).replace('T', ' '), a.actor_name, a.action, a.comment ?? ''])),
      ],
    }],
  })
  return Packer.toBuffer(doc)
}
