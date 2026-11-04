import { useNavigate, useSearchParams } from 'react-router-dom'
import { useApi } from '../api'
import { Card, DataTable, Loading } from '../components/ui'
import { alertCols } from './AlertQueue'
import { caseCols } from './CaseList'

/** FR-LP-011: global keyword search across alerts and cases, live and history. */
export function SearchPage() {
  const [sp] = useSearchParams()
  const nav = useNavigate()
  const q = sp.get('q') ?? ''
  const enc = encodeURIComponent(q)
  const al = useApi<any>(`/alerts?scope=live&q=${enc}`), ah = useApi<any>(`/alerts?scope=history&q=${enc}`)
  const cl = useApi<any>(`/cases?scope=live&q=${enc}`), ch = useApi<any>(`/cases?scope=history&q=${enc}`)
  if (al.isLoading || cl.isLoading) return <Loading />
  const alerts = [...(al.data?.rows ?? []), ...(ah.data?.rows ?? [])]
  const cases = [...(cl.data?.rows ?? []), ...(ch.data?.rows ?? [])]
  return (
    <>
      <div className="page-head"><div><div className="crumbs">Global search</div><h1>Results for “{q}”</h1><p>{alerts.length} alert(s) and {cases.length} case(s), including history. Fuzzy matching tolerates small typos.</p></div></div>
      <div className="stack">
        <Card title={`Cases (${cases.length})`} pad={false}><DataTable rows={cases} cols={caseCols} onRow={(c) => nav(`/cases/${c.id}`)} exportName="search-cases" /></Card>
        <Card title={`Alerts (${alerts.length})`} pad={false}><DataTable rows={alerts} cols={alertCols} onRow={(a) => nav(`/alerts/${a.id}`)} exportName="search-alerts" /></Card>
      </div>
    </>
  )
}
