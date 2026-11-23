import { useQueryClient } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { ROLES, type User } from '../../../shared/src/index'
import { api, getUserId, setUserId, useApi } from '../api'
import { initials } from './ui'

const MeCtx = createContext<User | null>(null)
export const useMe = () => useContext(MeCtx)!
export const hasRole = (u: User | null, ...r: string[]) => !!u && r.some((x) => u.roles.includes(x as any))

export function Layout({ children }: { children: ReactNode }) {
  const users = useApi<User[]>('/users')
  const me = useApi<User>('/me')
  const counts = useApi<any>(me.data ? '/process-counts' : null, { refetchInterval: 30000 })
  const qc = useQueryClient()
  const nav = useNavigate()
  const c = counts.data ?? {}
  const switchUser = (id: string) => { setUserId(id); qc.clear(); nav('/') }
  const link = (to: string, label: string, count?: number) => (
    <NavLink to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
      <span>{label}</span>{count ? <span className="nav-count">{count}</span> : null}
    </NavLink>
  )
  return (
    <MeCtx.Provider value={me.data ?? null}>
      <div className="shell">
        <aside className="sidebar">
          <Link to="/" className="brand">
            <img className="brand-logo" src="/auronova-logo.png" alt="Auronova Consulting" />
            <div><div className="brand-title">Agentic Fraud Risk Framework</div><div className="brand-sub">FAMS + FCMS</div></div>
          </Link>
          <nav className="nav">
            <div className="nav-group">Overview</div>
            {link('/', 'Home')}
            {link('/process', 'Process map')}
            {link('/scenarios', 'Test scenarios')}
            <div className="nav-group">Stage A · Alerts (FAMS)</div>
            {link('/alerts', 'Alert queue', c.queue)}
            {link('/prevention', 'Prevention desk')}
            <div className="nav-group">Stage B · Cases (FCMS)</div>
            {link('/cases', 'Fraud cases', (c.maker ?? 0) + (c.checker ?? 0) + (c.investigator ?? 0) + (c.reviewer ?? 0) + (c.approver ?? 0))}
            {link('/whistleblower', 'Whistleblower', c.whistleblower)}
            {link('/post-closure', 'Post-closure', c.postTasks)}
            <div className="nav-group">Insight</div>
            {link('/dashboards', 'Reports & dashboards')}
            {link('/calendar', 'Calendar')}
            <div className="nav-group">AI agents</div>
            {link('/agents', 'Agent hub')}
            <div className="nav-group">Admin</div>
            {link('/outbox', 'Email outbox')}
            {link('/config', 'Configuration')}
          </nav>
          <div className="sidebar-foot"><b>Auronova Consulting</b> · prototype<br />Synthetic data only</div>
        </aside>
        <div className="main">
          <header className="topbar">
            <GlobalSearch />
            <div className="user-switch">
              <div className="right">
                <div style={{ fontWeight: 600 }}>{me.data?.name ?? '…'}</div>
                <div className="small muted">{me.data?.roles.map((r) => ROLES[r]).join(' · ')} · {me.data?.entities.join('/')}</div>
              </div>
              <div className="avatar">{initials(me.data?.name)}</div>
              <select value={getUserId()} onChange={(e) => switchUser(e.target.value)} aria-label="Switch user (demo)" style={{ width: 190 }}>
                {users.data?.map((u) => <option key={u.id} value={u.id}>{u.name}: {u.roles.map((r) => ROLES[r]).join(', ')}</option>)}
              </select>
            </div>
            <div className="accent" />
          </header>
          <main className="content">{me.data ? children : me.error ? <div className="alert-box error">Cannot reach the API. Start the server (npm run dev) and seed it (npm run seed).</div> : null}</main>
        </div>
      </div>
    </MeCtx.Provider>
  )
}

type Suggestion = { kind: 'Case' | 'Alert'; id: string; label: string; sub: string }
/** FR-LP-011 global search: top matches appear while typing; Enter opens the full results page. */
function GlobalSearch() {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [items, setItems] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(-1)
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { setItems([]); return }
    let alive = true
    const t = setTimeout(() => { api<Suggestion[]>(`/search/suggest?q=${encodeURIComponent(term)}`).then((r) => { if (alive) { setItems(r); setHi(-1) } }).catch(() => {}) }, 250)
    return () => { alive = false; clearTimeout(t) }
  }, [q])
  const go = (s: Suggestion) => { setOpen(false); setQ(''); nav(s.kind === 'Case' ? `/cases/${s.id}` : `/alerts/${s.id}`) }
  const all = () => { if (q.trim()) { setOpen(false); nav(`/search?q=${encodeURIComponent(q.trim())}`) } }
  return (
    <form className="search-global" role="search" onSubmit={(e) => { e.preventDefault(); if (open && hi >= 0 && items[hi]) go(items[hi]); else all() }}>
      <input className="input" value={q} onChange={(e) => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(items.length - 1, h + 1)) } else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(-1, h - 1)) } else if (e.key === 'Escape') setOpen(false) }}
        placeholder="Global search: CIF, name, Alert ID, Case ID, national ID, passport, SR…" aria-label="Global search" aria-autocomplete="list" aria-expanded={open && items.length > 0} />
      {open && q.trim().length >= 2 && items.length > 0 && (
        <div className="suggest" role="listbox" aria-label="Search suggestions">
          {items.map((s, i) => (
            <a key={s.kind + s.id} role="option" aria-selected={i === hi} className={i === hi ? 'on' : ''} href={s.kind === 'Case' ? `/cases/${s.id}` : `/alerts/${s.id}`} onMouseDown={(e) => { e.preventDefault(); go(s) }}>
              <span className="kind">{s.kind}</span><span>{s.label}</span><span className="sub">{s.sub}</span>
            </a>
          ))}
          <div className="suggest-all" onMouseDown={(e) => { e.preventDefault(); all() }}>Press Enter to see all results for "{q.trim()}"</div>
        </div>
      )}
    </form>
  )
}