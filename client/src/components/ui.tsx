import { cloneElement, createContext, isValidElement, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react'
import * as XLSX from 'xlsx'

// ---------- Toasts ----------
type Toast = { id: number; msg: string; err?: boolean }
const ToastCtx = createContext<(msg: string, err?: boolean) => void>(() => {})
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])
  const push = useCallback((msg: string, err?: boolean) => {
    const id = Date.now() + Math.random()
    setItems((x) => [...x, { id, msg, err }])
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), err ? 7000 : 3500)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status">{items.map((t) => <div key={t.id} className={`toast ${t.err ? 'err' : ''}`}>{t.msg}</div>)}</div>
    </ToastCtx.Provider>
  )
}
export const useToast = () => useContext(ToastCtx)

// ---------- Formatting ----------
export const fmtAed = (n: unknown) => `AED ${Number(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
export const fmtNum = (n: unknown) => Number(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 })
export const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '–')
export const fmtDateTime = (s?: string | null) => (s ? new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–')
export function fmtDur(ms: number) {
  if (!ms || ms < 0) return '0m'
  const m = Math.floor(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24)
  return d ? `${d}d ${h % 24}h` : h ? `${h}h ${m % 60}m` : `${m}m`
}
export const initials = (name?: string) => (name ?? '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()

// ---------- Small components ----------
export function Card({ title, actions, children, pad = true, className = '', id }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; pad?: boolean; className?: string; id?: string }) {
  return (
    <section className={`card ${className}`} id={id}>
      {(title || actions) && <div className="card-head"><h2>{title}</h2><div className="row">{actions}</div></div>}
      <div className={pad ? 'card-pad' : ''}>{children}</div>
    </section>
  )
}

export function Badge({ children, tone = '' }: { children: ReactNode; tone?: '' | 'orange' | 'solid' | 'accent' | 'red' | 'ok' | 'grey' | 'outline' }) {
  return <span className={`badge ${tone ? `badge-${tone}` : ''}`}>{children}</span>
}

const STATUS_TONE: Record<string, Parameters<typeof Badge>[0]['tone']> = {
  'Yet to start': 'outline', WIP: '', 'EDD raised': 'orange', 'EDD responded': '', 'Re-scheduled': 'grey', 'Referred to FP&I': 'orange', Hold: 'grey', Closed: 'solid',
  Draft: 'outline', 'Submitted to FO Checker': '', 'Return for re-work': 'red', Reject: 'grey', 'Approved and Closed (FO)': 'solid',
  'Approved for Investigation': 'orange', 'Investigation in progress': '', 'Review in progress': '', 'Pending Approval': 'orange',
  'Investigation Approved': 'solid', 'Final report generated and closed': 'solid', 'Case re-opened': 'accent', 'Under Investigation': '',
  Open: 'outline', Submitted: '', Completed: 'solid', Pending: 'orange', Approved: 'solid', Rejected: 'red',
}
export const StatusBadge = ({ s }: { s: string }) => <Badge tone={STATUS_TONE[s] ?? ''}>{s}</Badge>
export const PriorityBadge = ({ p }: { p: string }) => <Badge tone={p === 'High' ? 'accent' : p === 'Medium' ? 'orange' : 'outline'}>{p}</Badge>
export const PreventionChip = ({ c }: { c?: string | null }) => (c ? <span className={`badge pv-${c}`}><span className="dot" style={{ background: c === 'Green' ? 'var(--ok)' : c === 'Red' ? 'var(--red)' : 'var(--grey)' }} />{c === 'Green' ? 'Green · allowed' : c === 'Red' ? 'Red · blocked' : 'Grey · step-up'}</span> : null)

export function Kpi({ label, value, sub, onClick, selected, tone }: { label: string; value: ReactNode; sub?: ReactNode; onClick?: () => void; selected?: boolean; tone?: 'accent' | 'alarm' }) {
  return (
    <button type="button" className={`kpi ${tone ?? ''} ${selected ? 'selected' : ''}`} onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </button>
  )
}

export function Field({ label, req, children, hint }: { label: string; req?: boolean; children: ReactNode; hint?: ReactNode }) {
  // Tie the label to its control (screen readers, and label-based selectors in the automated UI tests).
  const autoId = useId()
  const single = isValidElement(children) && ((typeof children.type === 'string' && ['input', 'select', 'textarea'].includes(children.type)) || children.type === Select)
  const id = single ? ((children.props as any).id ?? autoId) : undefined
  return (
    <div className="field">
      <label htmlFor={id}>{label}{req && <span className="req"> *</span>}</label>
      {single ? cloneElement(children as ReactElement<any>, { id }) : children}
      {hint && <span className="small muted">{hint}</span>}
    </div>
  )
}

export function Select({ value, onChange, options, placeholder = 'Select…', disabled, id }: { value: any; onChange: (v: string) => void; options: (string | { value: string; label: string })[]; placeholder?: string; disabled?: boolean; id?: string }) {
  return (
    <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      <option value="">{placeholder}</option>
      {options.map((o) => typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

export function Tabs({ tabs, value, onChange }: { tabs: { id: string; label: ReactNode }[]; value: string; onChange: (id: string) => void }) {
  return <div className="tabs" role="tablist">{tabs.map((t) => <button key={t.id} role="tab" className={`tab ${t.id === value ? 'on' : ''}`} onClick={() => onChange(t.id)}>{t.label}</button>)}</div>
}

export function Modal({ title, onClose, children, footer, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  // Escape closes the pop-up (as does a click on the dimmed background or the ✕ button).
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close.current() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal>
        <div className="modal-head"><h2>{title}</h2><button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>
export const Loading = () => <div className="empty">Loading…</div>
export const ErrorBox = ({ error }: { error: any }) => <div className="alert-box error">{error?.message ?? String(error)}</div>

export function exportXlsx(rows: Record<string, unknown>[], name: string) {
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 30))
  XLSX.writeFile(wb, `${name}.xlsx`)
}

// ---------- Data table: sort, per-column filter, selection, export (FR-LP-007, 015, 017) ----------
export interface Col<T> { key: string; label: string; render?: (r: T) => ReactNode; value?: (r: T) => unknown; sortable?: boolean; filter?: boolean; width?: number }
export function DataTable<T extends Record<string, any>>({ cols, rows, onRow, selectable, selected, onSelect, exportName, rowClass, empty = 'Nothing here.', maxHeight }: {
  cols: Col<T>[]; rows: T[]; onRow?: (r: T) => void; selectable?: boolean; selected?: Set<string>; onSelect?: (s: Set<string>) => void
  exportName?: string; rowClass?: (r: T) => string; empty?: ReactNode; maxHeight?: number
}) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null)
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [showFilters, setShowFilters] = useState(false)
  const val = (c: Col<T>, r: T) => (c.value ? c.value(r) : r[c.key])
  const view = useMemo(() => {
    let out = rows.filter((r) => cols.every((c) => !filters[c.key] || String(val(c, r) ?? '').toLowerCase().includes(filters[c.key].toLowerCase())))
    if (sort) {
      const c = cols.find((x) => x.key === sort.key)!
      out = [...out].sort((a, b) => {
        const x = val(c, a), y = val(c, b)
        return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''))) * sort.dir
      })
    }
    return out
  }, [rows, cols, sort, filters])
  const allOn = selectable && view.length > 0 && view.every((r) => selected?.has(r.id))
  return (
    <div>
      <div className="row" style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
        <span className="small muted">{view.length} of {rows.length} row{rows.length === 1 ? '' : 's'}</span>
        <span className="spacer" />
        <button className="btn btn-sm btn-ghost" onClick={() => setShowFilters((x) => !x)}>{showFilters ? 'Hide filters' : 'Column filters'}</button>
        {exportName && <button className="btn btn-sm" onClick={() => exportXlsx(view.map((r) => Object.fromEntries(cols.map((c) => [c.label, val(c, r) as any]))), exportName)}>Export to Excel</button>}
      </div>
      <div className="table-wrap" style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}>
        <table className="tbl">
          <thead style={maxHeight ? { position: 'sticky', top: 0, zIndex: 1 } : undefined}>
            <tr>
              {selectable && <th style={{ width: 34 }}><input type="checkbox" checked={!!allOn} onChange={() => onSelect?.(allOn ? new Set() : new Set(view.map((r) => r.id)))} aria-label="Select all" /></th>}
              {cols.map((c) => (
                <th key={c.key} className={c.sortable !== false ? 'sortable' : ''} style={{ width: c.width }} onClick={() => c.sortable !== false && setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 1 ? -1 : 1 } : { key: c.key, dir: 1 }))}>
                  {c.label}{sort?.key === c.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
            </tr>
            {showFilters && (
              <tr>
                {selectable && <th />}
                {cols.map((c) => <th key={c.key} style={{ padding: '4px 8px', background: '#fff' }}>{c.filter !== false && <input className="input" style={{ padding: '3px 6px', fontSize: 12 }} value={filters[c.key] ?? ''} onChange={(e) => setFilters((f) => ({ ...f, [c.key]: e.target.value }))} placeholder="Filter" />}</th>)}
              </tr>
            )}
          </thead>
          <tbody>
            {view.map((r) => (
              <tr key={r.id} className={`${onRow ? 'clickable' : ''} ${selected?.has(r.id) ? 'sel' : ''} ${rowClass?.(r) ?? ''}`} onClick={() => onRow?.(r)}>
                {selectable && <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={!!selected?.has(r.id)} onChange={() => { const s = new Set(selected); s.has(r.id) ? s.delete(r.id) : s.add(r.id); onSelect?.(s) }} aria-label={`Select ${r.id}`} /></td>}
                {cols.map((c) => <td key={c.key}>{c.render ? c.render(r) : (val(c, r) as ReactNode) ?? '–'}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {!view.length && <Empty>{empty}</Empty>}
      </div>
    </div>
  )
}

/** Small reusable comment + confirm modal for routing actions (FR-CASE-084: comment on every routing action). */
/** The app's standard yes/no confirmation pop-up (used instead of the browser's native confirm box). */
export function ConfirmModal({ title, message, confirm, tone = 'primary', onClose, onConfirm }: { title: string; message: ReactNode; confirm: string; tone?: 'primary' | 'accent' | 'danger'; onClose: () => void; onConfirm: () => void }) {
  const [busy, setBusy] = useState(false)
  return (
    <Modal title={title} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className={`btn btn-${tone}`} disabled={busy} autoFocus onClick={async () => { setBusy(true); try { await onConfirm() } finally { setBusy(false) } }}>{confirm}</button></>}>
      <div className="small">{message}</div>
    </Modal>
  )
}

export function CommentModal({ title, label = 'Comment', confirm, tone = 'primary', onClose, onConfirm, children }: { title: string; label?: string; confirm: string; tone?: 'primary' | 'accent' | 'danger'; onClose: () => void; onConfirm: (comment: string) => void; children?: ReactNode }) {
  const [c, setC] = useState('')
  return (
    <Modal title={title} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className={`btn btn-${tone}`} disabled={!c.trim()} onClick={() => onConfirm(c)}>{confirm}</button></>}>
      <div className="stack">
        {children}
        <Field label={label} req><textarea value={c} onChange={(e) => setC(e.target.value)} autoFocus placeholder="Required on every routing action" /></Field>
      </div>
    </Modal>
  )
}
