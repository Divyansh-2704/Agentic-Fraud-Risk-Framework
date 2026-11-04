import { useState } from 'react'
import { api, useAct } from '../api'
import { Field, Select } from './ui'

const FOLDERS = ['General', 'Account statements', 'Interview transcripts', 'Recordings', 'Recall requests', 'Police reports', 'Emails', 'Whistleblower']

/** Upload any file type incl. audio / video (FR-ALT-069, FR-CASE-023..025), or link an existing Maktaba document (FR-ALT-071). */
export function EvidenceUpload({ path, checklist }: { path: string; checklist?: { id: string; title: string }[] }) {
  const act = useAct()
  const [folder, setFolder] = useState('General')
  const [cl, setCl] = useState('')
  const [mk, setMk] = useState({ name: '', ref: '' })
  const [busy, setBusy] = useState(false)
  const upload = async (file: File) => {
    setBusy(true)
    const base64 = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] ?? ''); r.onerror = rej; r.readAsDataURL(file) })
    await act(() => api(path, { method: 'POST', body: { name: file.name, mime: file.type, base64, folder, checklist_id: cl || undefined } }), `Uploaded ${file.name}`)
    setBusy(false)
  }
  return (
    <div className="stack" style={{ marginTop: 12, padding: 12, background: 'var(--blue-50)', borderRadius: 8 }}>
      <div className="form-grid">
        <Field label="Folder"><Select value={folder} onChange={setFolder} placeholder="" options={FOLDERS} /></Field>
        {checklist && <Field label="Link to checklist item"><Select value={cl} onChange={setCl} placeholder="None" options={checklist.map((c) => ({ value: c.id, label: `${c.id} · ${c.title}` }))} /></Field>}
        <Field label="Upload file (any format, incl. audio / video)"><input type="file" disabled={busy} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /></Field>
      </div>
      <div className="row">
        <input className="input" style={{ width: 220 }} placeholder="Maktaba document name" value={mk.name} onChange={(e) => setMk({ ...mk, name: e.target.value })} />
        <input className="input" style={{ width: 160 }} placeholder="Maktaba ref" value={mk.ref} onChange={(e) => setMk({ ...mk, ref: e.target.value })} />
        <button className="btn btn-sm" disabled={!mk.name || !mk.ref} onClick={async () => { await act(() => api(path, { method: 'POST', body: { name: mk.name, maktabaRef: mk.ref, folder, checklist_id: cl || undefined } }), 'Linked from Maktaba'); setMk({ name: '', ref: '' }) }}>Link from Maktaba</button>
      </div>
    </div>
  )
}
