import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApi } from '../api'
import { Card, Loading, StatusBadge } from '../components/ui'

/** FR-CASE-0156..0158: all activities with a target date; reminder emails go 10 days before the due date. */
export function CalendarPage() {
  const q = useApi<any[]>('/calendar')
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  if (q.isLoading) return <Loading />
  const events = q.data ?? []
  const start = new Date(month); start.setDate(1 - ((month.getDay() + 6) % 7))
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d })
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const today = key(new Date())
  const upcoming = events.filter((e) => e.date >= today && e.status !== 'Completed').slice(0, 14)
  return (
    <>
      <div className="page-head">
        <div><div className="crumbs">Insight</div><h1>Calendar</h1><p>Checklist target dates, post-completion task deadlines and re-scheduled alerts. Reminder emails go 10 days before each target date.</p></div>
        <div className="row">
          <button className="btn" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
          <b style={{ minWidth: 140, textAlign: 'center' }}>{month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</b>
          <button className="btn" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button>
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr) 320px' }}>
        <div className="cal">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="cal-h">{d}</div>)}
          {days.map((d) => {
            const k = key(d)
            const ev = events.filter((e) => e.date === k)
            return (
              <div key={k} className={`cal-d ${d.getMonth() !== month.getMonth() ? 'other' : ''} ${k === today ? 'today' : ''}`}>
                <div>{d.getDate()}</div>
                {ev.slice(0, 3).map((e) => <Link key={e.ref} to={e.caseId ? `/cases/${e.caseId}` : `/alerts/${e.ref}`} className={`cal-ev ${e.kind === 'Post-completion' ? 'pt' : ''} ${e.kind === 'Re-scheduled alert' ? 'rs' : ''} ${e.status === 'Completed' ? 'done' : ''}`} title={`${e.title}${e.detail ? ` (${e.detail})` : ''}`}>{e.title}</Link>)}
                {ev.length > 3 && <div className="small muted">+{ev.length - 3} more</div>}
              </div>
            )
          })}
        </div>
        <Card title="Upcoming">
          <div className="stack" style={{ gap: 8 }}>
            {upcoming.map((e) => <div key={e.ref} className="small"><div className="row between"><b>{e.date}</b><StatusBadge s={e.status} /></div><div>{e.title}</div>{e.detail && <div className="muted">{e.detail}</div>}<div className="muted">{e.kind} · {e.caseId ? <Link to={`/cases/${e.caseId}`}>{e.caseId}</Link> : e.ref} {e.owner ? `· ${e.owner}` : ''}</div></div>)}
            {!upcoming.length && <div className="muted">Nothing upcoming.</div>}
          </div>
        </Card>
      </div>
    </>
  )
}
