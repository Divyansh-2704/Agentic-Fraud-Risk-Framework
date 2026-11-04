/** FR-LP-013: KPI section; clicking a KPI filters the table below. */
export type KpiSet = { assignment: Record<string, number>; status: Record<string, number>; priority: Record<string, number>; age: Record<string, number>; srType: Record<string, number>; overdue: number }
export type KpiFilter = { assigned?: string; status?: string; priority?: string; age?: string; srType?: string }

export function KpiFilters({ kpis, value, onChange }: { kpis?: KpiSet; value: KpiFilter; onChange: (v: KpiFilter) => void }) {
  if (!kpis) return null
  const toggle = (k: keyof KpiFilter, v: string) => onChange({ ...value, [k]: value[k] === v ? undefined : v })
  const group = (title: string, k: keyof KpiFilter, entries: [string, number, string?][]) => (
    <div>
      <div className="kpi-label" style={{ marginBottom: 6 }}>{title}</div>
      <div className="kpi-strip">
        {entries.map(([label, n, v]) => <button key={label} className={`chip ${value[k] === (v ?? label) ? 'on' : ''}`} onClick={() => toggle(k, v ?? label)}>{label}<b>{n}</b></button>)}
      </div>
    </div>
  )
  const active = Object.values(value).some(Boolean)
  return (
    <div className="card card-pad">
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14 }}>
        {group('Assignment', 'assigned', [['Unassigned', kpis.assignment.Unassigned, 'no'], ['Assigned', kpis.assignment.Assigned, 'yes']])}
        {group('By priority', 'priority', Object.entries(kpis.priority) as [string, number][])}
        {group('By age', 'age', Object.entries(kpis.age) as [string, number][])}
        {group('By SR type', 'srType', Object.entries(kpis.srType) as [string, number][])}
        <div style={{ gridColumn: '1 / -1' }}>{group('By stage', 'status', Object.entries(kpis.status) as [string, number][])}</div>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        {kpis.overdue > 0 && <span className="badge badge-red">{kpis.overdue} overdue (SLA breached)</span>}
        <span className="spacer" />
        {active && <button className="btn btn-sm btn-ghost" onClick={() => onChange({})}>Clear KPI filter</button>}
      </div>
    </div>
  )
}
