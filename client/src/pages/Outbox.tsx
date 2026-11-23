import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApi } from '../api'
import { Card, DataTable, fmtDateTime, Loading, Modal } from '../components/ui'

/** Simulated Outlook: every system email (notifications, escalations, final reports). Managers / super users see all; others see mail to them and to their team mailbox. */
export function Outbox() {
  const q = useApi<any[]>('/outbox')
  const [sel, setSel] = useState<any>(null)
  if (q.isLoading) return <Loading />
  return (
    <>
      <div className="page-head"><div><div className="crumbs">Admin</div><h1>Email outbox</h1><p>Integration stub for Outlook. Every email the system sends is recorded here and attached to its alert or case. You see the emails sent to you and to your team mailbox (fraud.ops@, fpi.team@ or hr.governance@); managers and the System Administrator see all.</p></div></div>
      <Card pad={false}>
        <DataTable rows={q.data ?? []} onRow={setSel} exportName="outbox" cols={[
          { key: 'ts', label: 'Sent', render: (m) => fmtDateTime(m.ts) }, { key: 'subject', label: 'Subject', render: (m) => <b>{m.subject}</b> },
          { key: 'to_addr', label: 'To', render: (m) => <span className="small">{m.to_addr}</span> }, { key: 'template', label: 'Template', render: (m) => <span className="mono small">{m.template}</span> },
          { key: 'related_id', label: 'Related', render: (m) => m.related_id ? <Link onClick={(e) => e.stopPropagation()} to={m.related_type === 'case' ? `/cases/${m.related_id}` : `/alerts/${m.related_id}`} className="mono small">{m.related_id}</Link> : '–' }]} />
      </Card>
      {sel && <Modal title={sel.subject} onClose={() => setSel(null)}><dl className="kv"><dt>To</dt><dd>{sel.to_addr}</dd><dt>Cc</dt><dd>{sel.cc || '–'}</dd><dt>Sent</dt><dd>{fmtDateTime(sel.ts)}</dd></dl><div className="hr" /><pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{sel.body}</pre></Modal>}
    </>
  )
}
