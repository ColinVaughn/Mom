import React from 'react'
import { useAuth } from '../shared/AuthContext'
import { callEdgeFunctionJson } from '../shared/api'

interface PendingReceipt {
  id: string
  user_id: string
  user_name?: string
  date: string
  total: number
  recon_reason?: string | null
  wex_id?: string | null
  image_url?: string | null
}

type CandReceipt = { id: string; date: string; total: number; hasImage: boolean }
type CandWex = { id: string; external_id?: string; amount: number; transacted_at: string; merchant?: string }

export default function ReconcilePanel() {
  const { session } = useAuth()
  const [users, setUsers] = React.useState<Array<{ id: string; name: string }>>([])
  const [filters, setFilters] = React.useState<{ user_id?: string; date_from?: string; date_to?: string }>({})
  const [rows, setRows] = React.useState<PendingReceipt[]>([])
  const [loading, setLoading] = React.useState(false)
  const [candReceipts, setCandReceipts] = React.useState<Record<string, CandReceipt[]>>({})
  const [candWex, setCandWex] = React.useState<Record<string, CandWex[]>>({})
  const [selReceipt, setSelReceipt] = React.useState<Record<string, string>>({})
  const [selWex, setSelWex] = React.useState<Record<string, string>>({})

  // Load users for filter
  React.useEffect(() => {
    (async () => {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/users?select=id,name&order=name.asc`
      const res = await fetch(url, {
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
      })
      if (!res.ok) return
      const data = await res.json()
      setUsers(data || [])
    })()
  }, [session?.access_token])

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const payload: any = { filters: {
        ...filters,
        status: 'pending_review',
        limit: 200,
        offset: 0,
      } }
      const resp = await callEdgeFunctionJson('get-receipts', payload)
      const list = ((resp.receipts || []) as any[]).map(r => ({ id: r.id, user_id: r.user_id, user_name: r.user_name, date: r.date, total: Number(r.total), recon_reason: (r as any).recon_reason, wex_id: (r as any).wex_id || null, image_url: (r as any).image_url || null }))
      setRows(list)
    } finally {
      setLoading(false)
    }
  }, [filters])

  React.useEffect(() => { load() }, [load])

  const updateReceipt = async (id: string, patch: Record<string, any>) => {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/receipts?id=eq.${id}`
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(patch)
    })
    if (!res.ok) throw new Error(await res.text())
  }

  const insertResolution = async (user_id: string, date: string, reason: string) => {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/missing_resolutions`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        Prefer: 'resolution=merge-duplicates'
      },
      body: JSON.stringify([{ user_id, date, reason, manager_id: session?.user?.id }])
    })
    if (!res.ok) throw new Error(await res.text())
  }

  const deleteReceipt = async (id: string) => {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/receipts?id=eq.${id}`
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string, ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) }
    })
    if (!res.ok) throw new Error(await res.text())
  }

  const resolveMissing = async (row: PendingReceipt) => {
    const reason = row.recon_reason?.trim() || 'Manager-acknowledged missing receipt'
    await updateReceipt(row.id, { status: 'missing', recon_reason: reason })
    await insertResolution(row.user_id, row.date, reason)
    setRows(prev => prev.filter(r => r.id !== row.id))
  }

  const discardPlaceholder = async (row: PendingReceipt) => {
    await deleteReceipt(row.id)
    setRows(prev => prev.filter(r => r.id !== row.id))
  }

  const fetchReceiptCandidates = async (row: PendingReceipt) => {
    // Find receipts (with images) for same user/date, unlinked
    const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/receipts_with_user?select=id,date,total,image_url&user_id=eq.${row.user_id}&date=eq.${row.date}&status=neq.missing&wex_id=is.null&order=date.desc`
    const res = await fetch(url, { headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string, ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) } })
    if (!res.ok) { setCandReceipts(s=>({ ...s, [row.id]: [] })); return }
    const items = await res.json()
    const mapped: CandReceipt[] = (items || []).map((x: any) => ({ id: x.id, date: x.date, total: Number(x.total), hasImage: !!x.image_url }))
    setCandReceipts(s => ({ ...s, [row.id]: mapped }))
  }

  const fetchWexCandidates = async (row: PendingReceipt) => {
    const tolDollars = 1, tolPercent = 5
    const tol = Math.max(tolDollars, Math.abs(Number(row.total)) * (tolPercent / 100))
    const minAmt = (Number(row.total) - tol).toFixed(2)
    const maxAmt = (Number(row.total) + tol).toFixed(2)
    const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/wex_transactions?select=id,external_id,amount,transacted_at,merchant&user_id=eq.${row.user_id}&transacted_at=eq.${row.date}&amount=gte.${minAmt}&amount=lte.${maxAmt}&order=transacted_at.desc`
    const res = await fetch(url, { headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string, ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) } })
    if (!res.ok) { setCandWex(s=>({ ...s, [row.id]: [] })); return }
    const items = await res.json()
    const mapped: CandWex[] = (items || []).map((x: any) => ({ id: x.id, external_id: x.external_id, amount: Number(x.amount), transacted_at: x.transacted_at, merchant: x.merchant }))
    setCandWex(s => ({ ...s, [row.id]: mapped }))
  }

  const linkPlaceholderToReceipt = async (row: PendingReceipt) => {
    const recId = selReceipt[row.id]
    if (!row.wex_id || !recId) return
    // 1) set the real receipt's wex_id
    await updateReceipt(recId, { wex_id: row.wex_id })
    // 2) remove placeholder
    await deleteReceipt(row.id)
    setRows(prev => prev.filter(r => r.id !== row.id))
  }

  const linkReceiptToWex = async (row: PendingReceipt) => {
    const wexId = selWex[row.id]
    if (!wexId) return
    // 1) set this receipt's wex_id and restore status to uploaded if it has an image
    await updateReceipt(row.id, { wex_id: wexId, status: row.image_url ? 'uploaded' : 'pending_review' })
    // 2) cleanup: delete any pending placeholder for this wex_id
    const delUrl = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/receipts?wex_id=eq.${wexId}&status=eq.pending_review&id=neq.${row.id}`
    await fetch(delUrl, { method: 'DELETE', headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string, ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) } })
    setRows(prev => prev.filter(r => r.id !== row.id))
  }

  return (
    <div>
      <div className="grid md:grid-cols-4 gap-3 mb-3">
        <div>
          <label className="block text-sm text-gray-600">Officer</label>
          <select className="border rounded w-full p-2" value={filters.user_id || ''} onChange={e=>setFilters(s=>({ ...s, user_id: e.target.value || undefined }))}>
            <option value="">All</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-600">From</label>
          <input type="date" className="border rounded w-full p-2" value={filters.date_from || ''} onChange={e=>setFilters(s=>({ ...s, date_from: e.target.value || undefined }))} />
        </div>
        <div>
          <label className="block text-sm text-gray-600">To</label>
          <input type="date" className="border rounded w-full p-2" value={filters.date_to || ''} onChange={e=>setFilters(s=>({ ...s, date_to: e.target.value || undefined }))} />
        </div>
        <div className="self-end">
          <button onClick={()=>load()} className="px-3 py-2 rounded border bg-white hover:bg-gray-50">Refresh</button>
        </div>
      </div>

      <div className="overflow-x-auto border rounded">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 text-left">Officer</th>
              <th className="p-2 text-left">Date</th>
              <th className="p-2 text-right">Amount</th>
              <th className="p-2 text-left">Reason</th>
              <th className="p-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-t">
                <td className="p-2">{r.user_name || r.user_id}</td>
                <td className="p-2">{r.date}</td>
                <td className="p-2 text-right">${Number(r.total).toFixed(2)}</td>
                <td className="p-2 w-[30%]">
                  <input
                    type="text"
                    value={r.recon_reason || ''}
                    onChange={e=>setRows(prev=>prev.map(x=>x.id===r.id?{...x, recon_reason: e.target.value}:x))}
                    placeholder="e.g., Carpool day / no fuel purchase"
                    className="border rounded w-full p-2"
                  />
                </td>
                <td className="p-2">
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => resolveMissing(r)} className="px-2 py-1.5 rounded bg-amber-600 text-white hover:bg-amber-700" disabled={loading}>Mark Missing</button>
                      <button onClick={() => discardPlaceholder(r)} className="px-2 py-1.5 rounded bg-gray-600 text-white hover:bg-gray-700" disabled={loading}>Discard</button>
                    </div>
                    {r.wex_id ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <button onClick={() => fetchReceiptCandidates(r)} className="px-2 py-1 rounded border hover:bg-gray-50">Find Receipts</button>
                        <select className="border rounded p-1" value={selReceipt[r.id] || ''} onChange={e=>setSelReceipt(s=>({ ...s, [r.id]: e.target.value }))}>
                          <option value="">Select receipt…</option>
                          {(candReceipts[r.id] || []).map(c => (
                            <option key={c.id} value={c.id}>{c.date} • ${c.total.toFixed(2)} {c.hasImage ? '📷' : ''}</option>
                          ))}
                        </select>
                        <button onClick={() => linkPlaceholderToReceipt(r)} className="px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700" disabled={!selReceipt[r.id] || loading}>Link to Receipt</button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <button onClick={() => fetchWexCandidates(r)} className="px-2 py-1 rounded border hover:bg-gray-50">Find WEX Tx</button>
                        <select className="border rounded p-1" value={selWex[r.id] || ''} onChange={e=>setSelWex(s=>({ ...s, [r.id]: e.target.value }))}>
                          <option value="">Select WEX…</option>
                          {(candWex[r.id] || []).map(c => (
                            <option key={c.id} value={c.id}>{c.transacted_at} • ${c.amount.toFixed(2)} • {c.merchant || '—'}</option>
                          ))}
                        </select>
                        <button onClick={() => linkReceiptToWex(r)} className="px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700" disabled={!selWex[r.id] || loading}>Link to WEX</button>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={5} className="p-3 text-center text-gray-500">No pending items</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {loading && <div className="mt-2 text-sm text-gray-500">Loading...</div>}
    </div>
  )
}
