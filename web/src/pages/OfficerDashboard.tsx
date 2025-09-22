import React from 'react'
import CameraCapture from '../widgets/CameraCapture'
import { callEdgeFunctionMultipart } from '../shared/api'
import { supabase } from '../shared/supabaseClient'
import { useAuth } from '../shared/AuthContext'
import ReceiptList from '../widgets/ReceiptList'
import BulkZipUpload from '../widgets/BulkZipUpload'

export default function OfficerDashboard() {
  const [tab, setTab] = React.useState<'upload'|'history'>('upload')
  return (
    <div className="mx-auto max-w-5xl p-4">
      <div className="flex items-center gap-3 mb-4">
        <button className={tabBtn(tab==='upload')} onClick={() => setTab('upload')}>Upload</button>
        <button className={tabBtn(tab==='history')} onClick={() => setTab('history')}>History</button>
      </div>
      {tab === 'upload' ? <UploadPanel /> : <HistoryPanel />}
    </div>
  )
}

function tabBtn(active:boolean) {
  return `px-4 py-2 rounded border ${active ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-gray-50'}`
}

function UploadPanel() {
  const { user } = useAuth()
  const [file, setFile] = React.useState<File | null>(null)
  const [date, setDate] = React.useState<string>('')
  const [total, setTotal] = React.useState<string>('')
  const [busy, setBusy] = React.useState(false)
  const [message, setMessage] = React.useState<string>('')

  const onCaptured = async (blob: Blob, guesses?: { date?: string, total?: string }) => {
    const f = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' })
    setFile(f)
    if (guesses?.date) setDate(guesses.date)
    if (guesses?.total) setTotal(guesses.total)
  }

  const onFileChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const f = e.target.files?.[0]
    if (f) setFile(f)
  }

  const onSubmit: React.FormEventHandler = async (e) => {
    e.preventDefault()
    if (!file || !date || !total) {
      setMessage('Please provide image, date and total')
      return
    }
    setBusy(true)
    setMessage('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('date', date)
      fd.append('total', total)
      const res = await callEdgeFunctionMultipart('upload-receipt', fd)
      setMessage('Uploaded successfully')
      setFile(null)
      setDate('')
      setTotal('')
    } catch (err:any) {
      setMessage(err.message || 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div>
        <h2 className="font-semibold mb-2">Auto-Capture (Camera)</h2>
        <CameraCapture onCapture={onCaptured} />
      </div>
      <form onSubmit={onSubmit} className="space-y-3">
        <h2 className="font-semibold">Upload Details</h2>
        <input type="file" accept="image/*" onChange={onFileChange} className="block w-full" />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-gray-600">Date</label>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="border rounded w-full p-2" required />
          </div>
          <div>
            <label className="block text-sm text-gray-600">Total ($)</label>
            <input type="number" step="0.01" value={total} onChange={e=>setTotal(e.target.value)} className="border rounded w-full p-2" required />
          </div>
        </div>
        <button disabled={busy} className="bg-blue-600 text-white px-4 py-2 rounded">{busy ? 'Uploading...' : 'Submit'}</button>
        {message && <div className="text-sm text-gray-700">{message}</div>}
        {file && <Preview file={file} />}
      </form>
      <BulkZipUpload />
    </div>
  )
}

function Preview({ file }: { file: File }) {
  const [url, setUrl] = React.useState<string>('')
  React.useEffect(() => {
    const u = URL.createObjectURL(file)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file])
  return (
    <img src={url} alt="preview" className="mt-2 max-h-64 object-contain border rounded" />
  )
}

function HistoryPanel() {
  return (
    <div>
      <ReceiptList scope="officer" />
    </div>
  )
}
