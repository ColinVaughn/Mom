import React from 'react'
import { callEdgeFunctionJson } from '../shared/api'
import { useAuth } from '../shared/AuthContext'

interface Props {
  scope: 'officer' | 'manager'
}

type Receipt = {
  id: string
  user_id: string
  user_name?: string
  user_email?: string
  date: string
  total: number
  status: 'uploaded'|'verified'|'missing'
  image_url?: string | null
  signed_url?: string | null
}

export default function ReceiptList({ scope }: Props) {
  const { session } = useAuth()
  const [filters, setFilters] = React.useState<{ user_id?: string; status?: string; date_from?: string; date_to?: string; amount_min?: string; amount_max?: string }>({})
  const [receipts, setReceipts] = React.useState<Receipt[]>([])
  const [count, setCount] = React.useState<number>(0)
  const [loading, setLoading] = React.useState(false)
  const [users, setUsers] = React.useState<Array<{ id: string; name: string }>>([])

  React.useEffect(() => {
    if (scope === 'manager') {
      // load users for filter
      (async () => {
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/users?select=id,name&order=name.asc`, {
          headers: {
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
            Authorization: `Bearer ${session?.access_token}`,
          },
        })
        const data = await res.json()
        setUsers(data || [])
      })()
    }
  }, [scope, session?.access_token])

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const payload: any = { filters: {
        ...filters,
        amount_min: filters.amount_min ? Number(filters.amount_min) : undefined,
        amount_max: filters.amount_max ? Number(filters.amount_max) : undefined,
      } }
      const resp = await callEdgeFunctionJson('get-receipts', payload)
      setReceipts(resp.receipts || [])
      setCount(resp.count || 0)
    } finally {
      setLoading(false)
    }
  }, [filters])

  React.useEffect(() => { load() }, [load])

  const missingCount = receipts.filter(r => r.status === 'missing').length

  return (
    <div>
      {missingCount > 0 && scope === 'officer' && (
        <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded text-yellow-800 text-sm">
          You have {missingCount} missing receipt{missingCount>1?'s':''}. Please upload them.
        </div>
      )}
      <div className="grid md:grid-cols-6 gap-3 items-end mb-3">
        {scope === 'manager' && (
          <div>
            <label className="block text-sm text-gray-600">Officer</label>
            <select className="border rounded w-full p-2" value={filters.user_id || ''} onChange={e=>setFilters(s=>({ ...s, user_id: e.target.value || undefined }))}>
              <option value="">All</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="block text-sm text-gray-600">Status</label>
          <select className="border rounded w-full p-2" value={filters.status || ''} onChange={e=>setFilters(s=>({ ...s, status: e.target.value || undefined }))}>
            <option value="">All</option>
            <option value="uploaded">Uploaded</option>
            <option value="verified">Verified</option>
            <option value="missing">Missing</option>
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
        <div>
          <label className="block text-sm text-gray-600">Min $</label>
          <input type="number" step="0.01" className="border rounded w-full p-2" value={filters.amount_min || ''} onChange={e=>setFilters(s=>({ ...s, amount_min: e.target.value || undefined }))} />
        </div>
        <div>
          <label className="block text-sm text-gray-600">Max $</label>
          <input type="number" step="0.01" className="border rounded w-full p-2" value={filters.amount_max || ''} onChange={e=>setFilters(s=>({ ...s, amount_max: e.target.value || undefined }))} />
        </div>
      </div>

      <div className="overflow-x-auto border rounded">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              {scope==='manager' && <th className="text-left p-2">Officer</th>}
              <th className="text-left p-2">Date</th>
              <th className="text-right p-2">Total ($)</th>
              <th className="text-left p-2">Status</th>
              <th className="text-left p-2">Image</th>
            </tr>
          </thead>
          <tbody>
            {receipts.map(r => (
              <tr key={r.id} className="border-t">
                {scope==='manager' && <td className="p-2">{r.user_name}</td>}
                <td className="p-2">{r.date}</td>
                <td className="p-2 text-right">{Number(r.total).toFixed(2)}</td>
                <td className="p-2">
                  <span className={
                    r.status==='missing' ? 'px-2 py-1 text-xs rounded bg-yellow-100 text-yellow-800' :
                    r.status==='verified' ? 'px-2 py-1 text-xs rounded bg-green-100 text-green-800' :
                    'px-2 py-1 text-xs rounded bg-gray-100 text-gray-800'
                  }>{r.status}</span>
                </td>
                <td className="p-2">
                  {r.signed_url ? <a className="text-blue-600 underline" href={r.signed_url} target="_blank">View</a> : <span className="text-gray-500">—</span>}
                </td>
              </tr>
            ))}
            {!loading && receipts.length === 0 && (
              <tr><td colSpan={scope==='manager'?5:4} className="p-3 text-center text-gray-500">No receipts</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {loading && <div className="mt-2 text-sm text-gray-500">Loading...</div>}
      <div className="mt-2 text-xs text-gray-500">Total: {count}</div>
    </div>
  )
}
