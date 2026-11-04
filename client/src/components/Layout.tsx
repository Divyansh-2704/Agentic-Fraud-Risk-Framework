import { useQueryClient } from '@tanstack/react-query'
import { createContext, useContext, useState, type ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { ROLES, type User } from '../../../shared/src/index'
import { getUserId, setUserId, useApi } from '../api'
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
  const [q, setQ] = useState('')
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
            <form className="search-global" onSubmit={(e) => { e.preventDefault(); if (q.trim()) nav(`/search?q=${encodeURIComponent(q.trim())}`) }}>
              <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Global search: CIF, name, Alert ID, Case ID, national ID, passport, SR…" aria-label="Global search" />
            </form>
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
