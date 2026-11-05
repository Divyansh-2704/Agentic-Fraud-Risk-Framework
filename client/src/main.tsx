import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ToastProvider } from './components/ui'
import { AgentHub } from './pages/AgentHub'
import { AlertQueue } from './pages/AlertQueue'
import { AlertWorkspace } from './pages/AlertWorkspace'
import { CalendarPage } from './pages/Calendar'
import { CaseList } from './pages/CaseList'
import { CaseWorkspace } from './pages/CaseWorkspace'
import { ConfigPage } from './pages/Config'
import { Dashboards } from './pages/Dashboards'
import { Home } from './pages/Home'
import { Outbox } from './pages/Outbox'
import { PostClosure } from './pages/PostClosure'
import { PreventionDesk } from './pages/PreventionDesk'
import { ProcessMap } from './pages/ProcessMap'
import { SearchPage } from './pages/Search'
import { Scenarios } from './pages/Scenarios'
import '@fontsource-variable/outfit'
import './styles/theme.css'

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 5000, retry: 1, refetchOnWindowFocus: false } } })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <BrowserRouter>
          <Layout>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/process" element={<ProcessMap />} />
              <Route path="/alerts" element={<AlertQueue />} />
              <Route path="/alerts/:id" element={<AlertWorkspace />} />
              <Route path="/prevention" element={<PreventionDesk />} />
              <Route path="/cases" element={<CaseList />} />
              <Route path="/whistleblower" element={<CaseList whistleblower />} />
              <Route path="/cases/:id" element={<CaseWorkspace />} />
              <Route path="/post-closure" element={<PostClosure />} />
              <Route path="/dashboards" element={<Dashboards />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/agents" element={<AgentHub />} />
              <Route path="/outbox" element={<Outbox />} />
              <Route path="/config" element={<ConfigPage />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/scenarios" element={<Scenarios />} />
              <Route path="*" element={<div className="empty">Page not found.</div>} />
            </Routes>
          </Layout>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)
