import React from 'react'
import ReceiptList from '../widgets/ReceiptList'
import { useAuth } from '../shared/AuthContext'
import { callEdgeFunctionJson } from '../shared/api'
import { Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend, Title } from 'chart.js'

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend, Title)

export default function ManagerDashboard() {
  const [tab, setTab] = React.useState<'receipts'|'users'|'analytics'>('receipts')
  return (
    <div className="mx-auto max-w-6xl p-4">
      <div className="flex items-center gap-3 mb-4">
        <button className={tabBtn(tab==='receipts')} onClick={() => setTab('receipts')}>Receipts</button>
        <button className={tabBtn(tab==='users')} onClick={() => setTab('users')}>Users</button>
        <button className={tabBtn(tab==='analytics')} onClick={() => setTab('analytics')}>Analytics</button>
      </div>
      {tab === 'receipts' && <ReceiptsPanel />}
      {tab === 'users' && <UsersPanel />}
      {tab === 'analytics' && <AnalyticsPanel />}
    </div>
  )
}

function tabBtn(active:boolean) {
  return `px-4 py-2 rounded border ${active ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-gray-50'}`
}

function ReceiptsPanel() {
  const exportPdf = async (mode: 'single'|'grid') => {
    const payload = { mode, filters: {} }
    const { data: sessionData } = await (await import('../shared/supabaseClient')).supabase.auth.getSession()
    const token = sessionData.session?.access_token
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-pdf`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const t = await res.text()
      throw new Error(t)
    }
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'receipts.pdf'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => exportPdf('single')} className="bg-gray-800 text-white px-3 py-2 rounded">Export PDF (Single)</button>
        <button onClick={() => exportPdf('grid')} className="bg-gray-800 text-white px-3 py-2 rounded">Export PDF (Grid)</button>
      </div>
      <ReceiptList scope="manager" />
    </div>
  )
}

function UsersPanel() {
  const { session } = useAuth()
  const [users, setUsers] = React.useState<Array<{ id: string; name: string; email: string; role: 'officer'|'manager'; created_at: string }>>([])
  const [email, setEmail] = React.useState('')
  const [name, setName] = React.useState('')
  const [role, setRole] = React.useState<'officer'|'manager'>('officer')
  const [loading, setLoading] = React.useState(true)

  const load = React.useCallback(async () => {
    setLoading(true)
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/user-management`, {
      headers: { Authorization: `Bearer ${session?.access_token}` },
    })
    const data = await res.json()
    setUsers(data.users || [])
    setLoading(false)
  }, [session?.access_token])

  React.useEffect(() => { load() }, [load])

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault()
    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/user-management`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ email, name, role, sendInvite: true }),
    })
    setEmail(''); setName(''); setRole('officer')
    await load()
  }

  const updateRole = async (user_id: string, newRole: 'officer'|'manager') => {
    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/user-management`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ user_id, role: newRole }),
    })
    await load()
  }

  const removeUser = async (user_id: string) => {
    if (!confirm('Delete user?')) return
    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/user-management`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ user_id }),
    })
    await load()
  }

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <form onSubmit={createUser} className="space-y-3">
        <h3 className="font-semibold">Add User</h3>
        <input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="Email" required className="border rounded w-full p-2" />
        <input value={name} onChange={e=>setName(e.target.value)} type="text" placeholder="Name" required className="border rounded w-full p-2" />
        <select value={role} onChange={e=>setRole(e.target.value as any)} className="border rounded w-full p-2">
          <option value="officer">Officer</option>
          <option value="manager">Manager</option>
        </select>
        <button className="bg-blue-600 text-white px-4 py-2 rounded">Create & Invite</button>
      </form>
      <div>
        <h3 className="font-semibold mb-2">Users</h3>
        <div className="overflow-x-auto border rounded">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2 text-left">Name</th>
                <th className="p-2 text-left">Email</th>
                <th className="p-2 text-left">Role</th>
                <th className="p-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-t">
                  <td className="p-2">{u.name}</td>
                  <td className="p-2">{u.email}</td>
                  <td className="p-2">{u.role}</td>
                  <td className="p-2">
                    <select value={u.role} onChange={e=>updateRole(u.id, e.target.value as any)} className="border rounded p-1">
                      <option value="officer">Officer</option>
                      <option value="manager">Manager</option>
                    </select>
                    <button onClick={()=>removeUser(u.id)} className="ml-2 text-red-600">Delete</button>
                  </td>
                </tr>
              ))}
              {!loading && users.length === 0 && (<tr><td colSpan={4} className="p-3 text-center text-gray-500">No users</td></tr>)}
            </tbody>
          </table>
        </div>
        {loading && <div className="mt-2 text-sm text-gray-500">Loading...</div>}
      </div>
    </div>
  )
}

function AnalyticsPanel() {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  React.useEffect(() => {
    let chart: Chart | null = null
    ;(async () => {
      const { supabase } = await import('../shared/supabaseClient')
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/receipts_with_user?select=date,total`, {
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
      const data = await res.json()
      const byMonth: Record<string, number> = {}
      for (const r of data || []) {
        const m = (r.date as string).slice(0,7)
        byMonth[m] = (byMonth[m] || 0) + Number(r.total)
      }
      const labels = Object.keys(byMonth).sort()
      const values = labels.map(k => Number(byMonth[k].toFixed(2)))
      if (canvasRef.current) {
        chart = new Chart(canvasRef.current, {
          type: 'bar',
          data: {
            labels,
            datasets: [{ label: 'Monthly Spend', data: values, backgroundColor: '#2563eb' }],
          },
          options: {
            responsive: true,
          },
        })
      }
    })()
    return () => { chart?.destroy() }
  }, [])

  return (
    <div>
      <canvas ref={canvasRef} />
    </div>
  )
}
