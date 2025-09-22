import React from 'react'
import ReceiptList from '../widgets/ReceiptList'
import { useAuth } from '../shared/AuthContext'
import { callEdgeFunctionJson } from '../shared/api'
import OfficerCalendar from '../widgets/OfficerCalendar'
import { Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend, Title } from 'chart.js'

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend, Title)

export default function ManagerDashboard() {
  const [tab, setTab] = React.useState<'receipts'|'users'|'analytics'|'calendar'>('receipts')
  return (
    <div className="mx-auto max-w-6xl p-4">
      <div className="flex items-center gap-3 mb-4">
        <button className={tabBtn(tab==='receipts')} onClick={() => setTab('receipts')}>Receipts</button>
        <button className={tabBtn(tab==='users')} onClick={() => setTab('users')}>Users</button>
        <button className={tabBtn(tab==='analytics')} onClick={() => setTab('analytics')}>Analytics</button>
        <button className={tabBtn(tab==='calendar')} onClick={() => setTab('calendar')}>Calendar</button>
      </div>
      {tab === 'receipts' && <ReceiptsPanel />}
      {tab === 'users' && <UsersPanel />}
      {tab === 'analytics' && <AnalyticsPanel />}
      {tab === 'calendar' && <CalendarPanel />}
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

function CalendarPanel() {
  const { session } = useAuth()
  const [officers, setOfficers] = React.useState<Array<{ id: string; name: string; email: string }>>([])
  const [selected, setSelected] = React.useState<string>('')
  const [monthStart, setMonthStart] = React.useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))

  const load = React.useCallback(async () => {
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/user-management`, {
      headers: { Authorization: `Bearer ${session?.access_token}` },
    })
    const data = await res.json()
    const offs = (data.users || []).filter((u: any) => u.role === 'officer')
    setOfficers(offs)
    if (!selected && offs.length) setSelected(offs[0].id)
  }, [session?.access_token, selected])

  React.useEffect(() => { load() }, [load])

  const changeMonth = (delta: number) => {
    const d = new Date(monthStart)
    d.setMonth(d.getMonth() + delta)
    d.setDate(1)
    setMonthStart(d)
  }

  const label = monthStart.toLocaleDateString(undefined, { year: 'numeric', month: 'long' })

  const fmt = (d: Date) => d.toISOString().slice(0,10)
  const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth()+1, 0)
  const monthFirst = React.useMemo(() => new Date(monthStart.getFullYear(), monthStart.getMonth(), 1), [monthStart])
  const monthLast = React.useMemo(() => endOfMonth(monthFirst), [monthFirst])

  const officerById = (id: string) => officers.find(o => o.id === id)

  const exportCsv = async () => {
    if (!selected) return
    // Fetch receipts and WEX tx to compute missing
    const [{ receipts }, wexRows] = await Promise.all([
      (async () => {
        const { callEdgeFunctionJson } = await import('../shared/api')
        return callEdgeFunctionJson<any, { receipts: any[] }>('get-receipts', {
          filters: { user_id: selected, date_from: fmt(monthFirst), date_to: fmt(monthLast), limit: 1000 },
        })
      })(),
      (async () => {
        const { supabase } = await import('../shared/supabaseClient')
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData.session?.access_token
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/wex_transactions?select=transacted_at&user_id=eq.${selected}&transacted_at=gte.${fmt(monthFirst)}&transacted_at=lte.${fmt(monthLast)}`,
          { headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string, ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
        if (!res.ok) return [] as Array<{ transacted_at: string }>
        return res.json()
      })(),
    ])

    const daily: Record<string, { tx: number; receipts: number; missing: number; flaggedMissing: number }> = {}
    for (const r of receipts || []) {
      const key = String(r.date).slice(0,10)
      if (!daily[key]) daily[key] = { tx: 0, receipts: 0, missing: 0, flaggedMissing: 0 }
      if (r.status === 'missing') daily[key].flaggedMissing++
      else daily[key].receipts++
    }
    for (const t of wexRows || []) {
      const key = String(t.transacted_at).slice(0,10)
      if (!daily[key]) daily[key] = { tx: 0, receipts: 0, missing: 0, flaggedMissing: 0 }
      daily[key].tx++
    }
    for (const key of Object.keys(daily)) {
      const deficit = Math.max(0, daily[key].tx - daily[key].receipts)
      daily[key].missing = Math.max(deficit, daily[key].flaggedMissing)
    }

    const dates: string[] = []
    for (let d = new Date(monthFirst); d <= monthLast; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      dates.push(fmt(d))
    }
    const rows = [['Date','WEX Tx','Receipts','Missing']]
    for (const day of dates) {
      const info = daily[day] || { tx: 0, receipts: 0, missing: 0 }
      rows.push([day, String(info.tx), String(info.receipts), String(info.missing)])
    }
    const csv = rows.map(r => r.map(v => /[",\n]/.test(v) ? '"' + v.replace(/"/g,'""') + '"' : v).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    const name = officerById(selected)?.name?.replace(/\s+/g,'_') || 'officer'
    a.download = `missing_${name}_${monthStart.getFullYear()}-${String(monthStart.getMonth()+1).padStart(2,'0')}.csv`
    a.href = URL.createObjectURL(blob)
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const exportPdf = async () => {
    if (!selected) return
    const payload = { mode: 'single', filters: { user_id: selected, status: 'missing', date_from: fmt(monthFirst), date_to: fmt(monthLast) } }
    const { supabase } = await import('../shared/supabaseClient')
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(payload),
    })
    if (!res.ok) { alert('PDF export failed'); return }
    const blob = await res.blob()
    const a = document.createElement('a')
    const name = officerById(selected)?.name?.replace(/\s+/g,'_') || 'officer'
    a.download = `missing_${name}_${monthStart.getFullYear()}-${String(monthStart.getMonth()+1).padStart(2,'0')}.pdf`
    a.href = URL.createObjectURL(blob)
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={selected} onChange={e=>setSelected(e.target.value)} className="border rounded p-2">
          {officers.map(o => (
            <option key={o.id} value={o.id}>{o.name} ({o.email})</option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={()=>changeMonth(-1)} className="px-3 py-1.5 rounded border">Prev</button>
          <div className="min-w-[10ch] text-center font-medium">{label}</div>
          <button onClick={()=>changeMonth(1)} className="px-3 py-1.5 rounded border">Next</button>
          <button onClick={exportCsv} className="ml-2 px-3 py-1.5 rounded border border-blue-600 text-blue-700 hover:bg-blue-50">Export CSV</button>
          <button onClick={exportPdf} className="px-3 py-1.5 rounded border border-gray-800 text-gray-900 hover:bg-gray-50">Missing PDF</button>
        </div>
      </div>
      {selected ? (
        <OfficerCalendar userId={selected} monthStart={monthStart} />
      ) : (
        <div className="text-sm text-gray-600">Select an officer to view calendar.</div>
      )}
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
