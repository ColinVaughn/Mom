import React from 'react'
import ReceiptList from '../widgets/ReceiptList'
import ReconcilePanel from '../widgets/ReconcilePanel'
import { useAuth } from '../shared/AuthContext'
import { callEdgeFunctionJson } from '../shared/api'
import OfficerCalendar from '../widgets/OfficerCalendar'
import { Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend, Title, LineController, PointElement, LineElement } from 'chart.js'

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend, Title, LineController, PointElement, LineElement)

export default function ManagerDashboard() {
  const [tab, setTab] = React.useState<'receipts'|'users'|'analytics'|'calendar'|'reconcile'>('receipts')

  const valid = new Set(['receipts','users','analytics','calendar','reconcile'])
  const applyHash = React.useCallback(() => {
    const h = (window.location.hash || '').replace(/^#/,'')
    if (valid.has(h)) setTab(h as any)
  }, [])

  React.useEffect(() => {
    applyHash()
    const onHash = () => applyHash()
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [applyHash])

  const selectTab = (t: 'receipts'|'users'|'analytics'|'calendar'|'reconcile') => {
    setTab(t)
    try { window.location.hash = t } catch {}
  }
  return (
    <div className="mx-auto max-w-6xl p-4">
      <div className="flex items-center gap-3 mb-4">
        <button className={tabBtn(tab==='receipts')} onClick={() => selectTab('receipts')}>Receipts</button>
        <button className={tabBtn(tab==='users')} onClick={() => selectTab('users')}>Users</button>
        <button className={tabBtn(tab==='analytics')} onClick={() => selectTab('analytics')}>Analytics</button>
        <button className={tabBtn(tab==='calendar')} onClick={() => selectTab('calendar')}>Calendar</button>
        <button className={tabBtn(tab==='reconcile')} onClick={() => selectTab('reconcile')}>Reconcile</button>
      </div>
      {tab === 'receipts' && <ReceiptsPanel />}
      {tab === 'users' && <UsersPanel />}
      {tab === 'analytics' && <AnalyticsPanel />}
      {tab === 'calendar' && <CalendarPanel />}
      {tab === 'reconcile' && <ReconcilePanel />}
    </div>
  )
}

function tabBtn(active:boolean) {
  return `px-4 py-2 rounded border ${active ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-gray-50'}`
}

function ReceiptsPanel() {
  const [exporting, setExporting] = React.useState<'single'|'grid'|null>(null)

  const exportPdf = async (mode: 'single'|'grid') => {
    try {
      setExporting(mode)
      const payload = { mode, filters: {}, ...(mode==='grid' ? { use_thumbs: true } : {}) }
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
    } catch (err: any) {
      alert(`PDF export failed: ${err?.message || 'Unknown error'}`)
    } finally {
      setExporting(null)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <button 
          onClick={() => exportPdf('single')} 
          disabled={exporting !== null}
          className="bg-gray-800 text-white px-3 py-2 rounded disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {exporting === 'single' && (
            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          )}
          {exporting === 'single' ? 'Generating...' : 'Export PDF (Single)'}
        </button>
        <button 
          onClick={() => exportPdf('grid')} 
          disabled={exporting !== null}
          className="bg-gray-800 text-white px-3 py-2 rounded disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {exporting === 'grid' && (
            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          )}
          {exporting === 'grid' ? 'Generating...' : 'Export PDF (Grid)'}
        </button>
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
  // Card mapping state
  const [selectedForCards, setSelectedForCards] = React.useState<string>('')
  const [cards, setCards] = React.useState<string[]>([])
  const [cardInput, setCardInput] = React.useState('')
  const [cardsLoading, setCardsLoading] = React.useState(false)
  const [cardError, setCardError] = React.useState<string | null>(null)

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

  // When users list changes, auto-select the first officer for convenience
  React.useEffect(() => {
    if (!selectedForCards && users.length) {
      const first = users.find(u => u.role === 'officer')
      if (first) setSelectedForCards(first.id)
    }
  }, [users, selectedForCards])

  const loadCards = React.useCallback(async () => {
    if (!selectedForCards) { setCards([]); return }
    setCardsLoading(true)
    setCardError(null)
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/wex_cards?select=card_last4&user_id=eq.${selectedForCards}`,
      { headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string, ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) } })
    if (!res.ok) { setCards([]); setCardsLoading(false); return }
    const rows = await res.json()
    setCards((rows || []).map((r: any) => r.card_last4))
    setCardsLoading(false)
  }, [selectedForCards, session?.access_token])

  React.useEffect(() => { loadCards() }, [loadCards])

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

  const addCard = async (e: React.FormEvent) => {
    e.preventDefault()
    setCardError(null)
    const last4 = cardInput.trim()
    if (!selectedForCards) { setCardError('Select an officer first.'); return }
    if (!/^[0-9]{4}$/.test(last4)) { setCardError('Enter a 4-digit last4.'); return }
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/wex_cards?on_conflict=card_last4`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify([{ card_last4: last4, user_id: selectedForCards }]),
    })
    if (!res.ok) {
      const t = await res.text()
      setCardError(t || 'Failed to save')
      return
    }
    setCardInput('')
    await loadCards()
  }

  const removeCard = async (last4: string) => {
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/wex_cards?card_last4=eq.${last4}`, {
      method: 'DELETE',
      headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string, ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
    })
    if (!res.ok) return
    await loadCards()
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
      <div className="md:col-span-2">
        <div className="mt-6 border rounded p-3 bg-white">
          <h3 className="font-semibold mb-2">Card Last4 Mapping</h3>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <label className="text-sm text-gray-600">Officer</label>
            <select value={selectedForCards} onChange={e=>setSelectedForCards(e.target.value)} className="border rounded p-2">
              <option value="">Select officer</option>
              {users.filter(u=>u.role==='officer').map(u => (
                <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
              ))}
            </select>
            {users.filter(u=>u.role==='officer').length === 0 && (
              <span className="text-sm text-gray-600 ml-2">No officers found. Create one above in "Add User".</span>
            )}
          </div>
          {selectedForCards ? (
            <div className="space-y-3">
              <form onSubmit={addCard} className="flex items-center gap-2">
                <input value={cardInput} onChange={e=>setCardInput(e.target.value)} inputMode="numeric" maxLength={4} placeholder="1234" className="border rounded p-2 w-28" />
                <button className="px-3 py-2 rounded bg-blue-600 text-white">Add</button>
                {cardError && <div className="text-sm text-red-600 ml-2">{cardError}</div>}
              </form>
              <div className="overflow-x-auto border rounded">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="p-2 text-left">Card Last4</th>
                      <th className="p-2 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cards.map(last4 => (
                      <tr key={last4} className="border-t">
                        <td className="p-2 font-mono">{last4}</td>
                        <td className="p-2"><button onClick={()=>removeCard(last4)} className="text-red-600">Remove</button></td>
                      </tr>
                    ))}
                    {!cardsLoading && cards.length === 0 && (
                      <tr><td colSpan={2} className="p-3 text-center text-gray-500">No cards mapped</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {cardsLoading && <div className="text-sm text-gray-500">Loading cards...</div>}
            </div>
          ) : (
            <div className="text-sm text-gray-600">Select an officer to manage card mappings.</div>
          )}
        </div>
      </div>
    </div>
  )
}

function CalendarPanel() {
  const { session } = useAuth()
  const [officers, setOfficers] = React.useState<Array<{ id: string; name: string; email: string }>>([])
  const [selected, setSelected] = React.useState<string>('')
  const [monthStart, setMonthStart] = React.useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [exportingPdf, setExportingPdf] = React.useState(false)

  const load = React.useCallback(async () => {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/users?select=id,name,email,role&order=created_at.desc`
    const res = await fetch(url, {
      headers: {
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
    })
    if (!res.ok) { setOfficers([]); return }
    const rows = await res.json()
    const offs = (rows || []).filter((u: any) => u.role === 'officer')
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
    try {
      setExportingPdf(true)
      const payload = { mode: 'single', filters: { user_id: selected, status: 'missing', date_from: fmt(monthFirst), date_to: fmt(monthLast) } }
      const { supabase } = await import('../shared/supabaseClient')
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || 'PDF export failed')
      }
      const blob = await res.blob()
      const a = document.createElement('a')
      const name = officerById(selected)?.name?.replace(/\s+/g,'_') || 'officer'
      a.download = `missing_${name}_${monthStart.getFullYear()}-${String(monthStart.getMonth()+1).padStart(2,'0')}.pdf`
      a.href = URL.createObjectURL(blob)
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (err: any) {
      alert(`PDF export failed: ${err?.message || 'Unknown error'}`)
    } finally {
      setExportingPdf(false)
    }
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
          <button 
            onClick={exportPdf} 
            disabled={exportingPdf}
            className="px-3 py-1.5 rounded border border-gray-800 text-gray-900 hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {exportingPdf && (
              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            )}
            {exportingPdf ? 'Generating...' : 'Missing PDF'}
          </button>
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
  const [from, setFrom] = React.useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [to, setTo] = React.useState(() => new Date())
  const [officers, setOfficers] = React.useState<Array<{ id: string; name: string; email: string }>>([])
  const [userId, setUserId] = React.useState<string>('')
  const [loading, setLoading] = React.useState(false)
  const [summary, setSummary] = React.useState({ totalSpend: 0, receiptCount: 0, missingCount: 0, wexCount: 0, deficit: 0 })
  const [excludeResolved, setExcludeResolved] = React.useState(true)
  const [showTrendline, setShowTrendline] = React.useState(true)
  const [stackedBars, setStackedBars] = React.useState(true)
  const [topMerchants, setTopMerchants] = React.useState<Array<{ merchant: string; amount: number }>>([])
  const [spendByOfficer, setSpendByOfficer] = React.useState<Array<{ user_id: string; user_name: string; amount: number }>>([])
  const [anomalies, setAnomalies] = React.useState<Array<{ date: string; spend: number; zSpend: number; deficit: number; zDeficit: number }>>([])

  const spendRef = React.useRef<HTMLCanvasElement>(null)
  const missingRef = React.useRef<HTMLCanvasElement>(null)
  const officerTrendRef = React.useRef<HTMLCanvasElement>(null)
  const charts = React.useRef<{ spend: Chart | null; missing: Chart | null; officer: Chart | null }>({ spend: null, missing: null, officer: null })

  const fmt = (d: Date) => d.toISOString().slice(0, 10)

  const loadOfficers = React.useCallback(async () => {
    const { supabase } = await import('../shared/supabaseClient')
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/users?select=id,name,email,role&order=created_at.desc`, {
      headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    })
    if (!res.ok) { setOfficers([]); return }
    const rows = await res.json()
    setOfficers((rows || []).filter((u: any) => u.role === 'officer'))
  }, [])

  React.useEffect(() => { loadOfficers() }, [loadOfficers])

  const applyPreset = (days: number) => {
    const end = new Date()
    const start = new Date(Date.now() - days * 86400_000)
    // Normalize to date-only
    start.setHours(0,0,0,0); end.setHours(0,0,0,0)
    setFrom(start)
    setTo(end)
  }

  const refresh = React.useCallback(async () => {
    setLoading(true)
    try {
      const { supabase } = await import('../shared/supabaseClient')
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      const auth = { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string, ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      const f = fmt(from)
      const t = fmt(to)
      const userQ = userId ? `&user_id=eq.${userId}` : ''

      // Non-missing receipts (spend and count)
      const urlRec = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/receipts_with_user?select=user_id,user_name,date,total&date=gte.${f}&date=lte.${t}${userQ}&status=neq.missing`

      const resRec = await fetch(urlRec, { headers: auth })
      const nonMissing = resRec.ok ? await resRec.json() : []

      // Missing receipts
      const urlMissing = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/receipts?select=date&date=gte.${f}&date=lte.${t}${userQ}&status=eq.missing`
      const resMissing = await fetch(urlMissing, { headers: auth })
      const missingRows = resMissing.ok ? await resMissing.json() : []

      // WEX transactions
      const urlWex = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/wex_transactions?select=amount,merchant,transacted_at&transacted_at=gte.${f}&transacted_at=lte.${t}${userQ}`

      const resWex = await fetch(urlWex, { headers: auth })
      const wexRows = resWex.ok ? await resWex.json() : []

      // Build date list
      const labels: string[] = []
      for (let d = new Date(from); d <= to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
        labels.push(fmt(d))
      }

      const spendByDay: Record<string, number> = {}
      const receiptsByDay: Record<string, number> = {}
      for (const r of nonMissing || []) {
        const key = String(r.date).slice(0, 10)
        spendByDay[key] = (spendByDay[key] || 0) + Number(r.total)
        receiptsByDay[key] = (receiptsByDay[key] || 0) + 1
      }

      const missingByDay: Record<string, number> = {}
      for (const m of missingRows || []) {
        const key = String(m.date).slice(0, 10)
        missingByDay[key] = (missingByDay[key] || 0) + 1
      }

      const wexByDay: Record<string, number> = {}
      for (const w of wexRows || []) {
        const key = String(w.transacted_at).slice(0, 10)
        wexByDay[key] = (wexByDay[key] || 0) + 1
      }

      const deficitByDay: Record<string, number> = {}
      for (const day of labels) {
        const def = Math.max(0, (wexByDay[day] || 0) - (receiptsByDay[day] || 0))
        deficitByDay[day] = def
      }

      // Exclude manager-resolved days: subtract resolution counts from missing and deficit
      let resolvedTotal = 0
      if (excludeResolved) {
        const resUrl = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/missing_resolutions?select=date,user_id&date=gte.${f}&date=lte.${t}${userQ}`
        const resRes = await fetch(resUrl, { headers: auth })
        if (resRes.ok) {
          const rows: Array<{ date: string; user_id: string }> = await resRes.json()
          const resolvedByDay: Record<string, number> = {}
          for (const r of rows) {
            const key = String(r.date).slice(0, 10)
            resolvedByDay[key] = (resolvedByDay[key] || 0) + 1
          }
          resolvedTotal = rows.length
          for (const day of labels) {
            if (resolvedByDay[day]) {
              missingByDay[day] = Math.max(0, (missingByDay[day] || 0) - resolvedByDay[day])
              deficitByDay[day] = Math.max(0, (deficitByDay[day] || 0) - resolvedByDay[day])
            }
          }
        }
      }

      // Anomaly detection (Z-score >= 2) based on Daily Spend and WEX Deficit
      const spendSeries = labels.map(d => spendByDay[d] || 0)
      const deficitSeries = labels.map(d => deficitByDay[d] || 0)
      const mean = (arr: number[]) => arr.reduce((a,b)=>a+b,0) / (arr.length || 1)
      const std = (arr: number[], m: number) => Math.sqrt(arr.reduce((a,b)=>a+(b-m)*(b-m),0) / (arr.length || 1))
      const mSpend = mean(spendSeries)
      const sSpend = std(spendSeries, mSpend) || 1
      const mDef = mean(deficitSeries)
      const sDef = std(deficitSeries, mDef) || 1
      const ano: Array<{ date: string; spend: number; zSpend: number; deficit: number; zDeficit: number }> = []
      for (let i=0;i<labels.length;i++) {
        const zS = (spendSeries[i] - mSpend) / sSpend
        const zD = (deficitSeries[i] - mDef) / sDef
        if (zS >= 2 || zD >= 2) ano.push({ date: labels[i], spend: spendSeries[i], zSpend: Number(zS.toFixed(2)), deficit: deficitSeries[i], zDeficit: Number(zD.toFixed(2)) })
      }
      ano.sort((a,b) => Math.max(b.zSpend,b.zDeficit) - Math.max(a.zSpend,a.zDeficit))
      setAnomalies(ano.slice(0, 20))
      const anomalyDates = new Set(ano.map(a => a.date))

      // Summary
      const totalSpend = (nonMissing || []).reduce((a: number, r: any) => a + Number(r.total), 0)
      const receiptCount = (nonMissing || []).length
      const missingCount = Math.max(0, (missingRows || []).length - resolvedTotal)
      const wexCount = (wexRows || []).length
      const deficit = labels.reduce((a, d) => a + (deficitByDay[d] || 0), 0)
      setSummary({ totalSpend, receiptCount, missingCount, wexCount, deficit })

      // Charts
      const destroyIfExists = (canvas: HTMLCanvasElement | null) => {
        if (!canvas) return
        const existing = (Chart as any).getChart ? (Chart as any).getChart(canvas) : null
        if (existing) existing.destroy()
      }
      charts.current.spend?.destroy(); charts.current.spend = null
      charts.current.missing?.destroy(); charts.current.missing = null
      charts.current.officer?.destroy(); charts.current.officer = null
      destroyIfExists(spendRef.current)
      destroyIfExists(missingRef.current)
      destroyIfExists(officerTrendRef.current)
      if (spendRef.current) {
        const spendData = labels.map(d => Number((spendByDay[d] || 0).toFixed(2)))
        const ma7: number[] = []
        for (let i=0;i<spendData.length;i++) {
          const start = Math.max(0, i-6)
          const slice = spendData.slice(start, i+1)
          const avg = slice.length ? slice.reduce((a,b)=>a+b,0)/slice.length : 0
          ma7.push(Number(avg.toFixed(2)))
        }
        const datasets: any[] = [
          { label: 'Daily Spend', data: spendData, backgroundColor: '#2563eb' },
        ]
        if (showTrendline) datasets.push({ type: 'line', label: '7‑day Avg', data: ma7, borderColor: '#10b981', backgroundColor: 'transparent', tension: 0.3, pointRadius: 0 })
        // Overlay anomaly points
        const anomalyPoints = labels.map((d, idx) => anomalyDates.has(d) ? spendSeries[idx] : null)
        datasets.push({ type: 'line', label: 'Anomalies', data: anomalyPoints, showLine: false, pointRadius: 4, pointBackgroundColor: '#dc2626', borderColor: 'transparent' })
        charts.current.spend = new Chart(spendRef.current, {
          type: 'bar',
          data: { labels, datasets },
          options: { responsive: true, scales: { y: { beginAtZero: true } } },
        })
      }
      if (missingRef.current) {
        charts.current.missing = new Chart(missingRef.current, {
          type: 'bar',
          data: {
            labels,
            datasets: [
              { label: 'Flagged Missing', data: labels.map(d => missingByDay[d] || 0), backgroundColor: '#ef4444' },
              { label: 'WEX Deficit', data: labels.map(d => deficitByDay[d] || 0), backgroundColor: '#f59e0b' },
            ],
          },
          options: { responsive: true, scales: { x: { stacked: stackedBars }, y: { beginAtZero: true, ticks: { precision: 0 }, stacked: stackedBars } } },
        })
      }

      // Officer trendlines (lines per officer)
      if (officerTrendRef.current) {
        // Build per-officer per-day spend series
        const perOfficer: Record<string, { name: string; series: number[]; total: number }> = {}
        for (const r of nonMissing || []) {
          const id = String((r as any).user_id || '')
          const name = String((r as any).user_name || 'Officer')
          const day = String(r.date).slice(0,10)
          const idx = labels.indexOf(day)
          if (idx < 0) continue
          if (!perOfficer[id]) perOfficer[id] = { name, series: Array(labels.length).fill(0), total: 0 }
          perOfficer[id].series[idx] += Number(r.total || 0)
          perOfficer[id].total += Number(r.total || 0)
        }
        const entries = Object.entries(perOfficer)
        const chosen = userId ? entries.filter(([id]) => id === userId) : entries.sort((a,b) => b[1].total - a[1].total).slice(0, 5)
        const palette = ['#1d4ed8','#059669','#9333ea','#ef4444','#f59e0b','#0ea5e9','#16a34a']
        const officerDatasets = chosen.map(([id, obj], i) => ({ label: obj.name || 'Officer', data: obj.series.map(v => Number(v.toFixed(2))), borderColor: palette[i % palette.length], backgroundColor: 'transparent', tension: 0.25, pointRadius: 0 }))
        charts.current.officer = new Chart(officerTrendRef.current, {
          type: 'line',
          data: { labels, datasets: officerDatasets },
          options: { responsive: true, scales: { y: { beginAtZero: true } } },
        })
      }

      // Leaderboards
      // Top merchants (by WEX amount)
      const merchMap = new Map<string, number>()
      for (const w of wexRows || []) {
        const m = String(w.merchant || '')
        const amt = Number(w.amount || 0)
        merchMap.set(m, (merchMap.get(m) || 0) + amt)
      }
      const merchArr = Array.from(merchMap.entries()).map(([merchant, amount]) => ({ merchant: merchant || '—', amount }))
        .sort((a,b) => b.amount - a.amount).slice(0, 10)
      setTopMerchants(merchArr)

      // Spend by officer (from receipts_with_user, non-missing)
      const userMap = new Map<string, { user_id: string; user_name: string; amount: number }>()
      for (const r of nonMissing || []) {
        const id = String((r as any).user_id || '')
        const name = String((r as any).user_name || 'Officer')
        const amt = Number(r.total || 0)
        const cur = userMap.get(id) || { user_id: id, user_name: name, amount: 0 }
        cur.amount += amt
        userMap.set(id, cur)
      }
      const userArr = Array.from(userMap.values()).sort((a,b) => b.amount - a.amount).slice(0, 10)
      setSpendByOfficer(userArr)
    } finally {
      setLoading(false)
    }
  }, [from, to, userId, excludeResolved, showTrendline, stackedBars])

  React.useEffect(() => { refresh() }, [refresh])

  // Cleanup charts on unmount or route change
  React.useEffect(() => {
    return () => {
      charts.current.spend?.destroy(); charts.current.spend = null
      charts.current.missing?.destroy(); charts.current.missing = null
      charts.current.officer?.destroy(); charts.current.officer = null
    }
  }, [])

  const sumFmt = (n: number) => `$${n.toFixed(2)}`

  const exportCsv = async () => {
    // Recompute using current state to assemble a CSV snapshot
    const { supabase } = await import('../shared/supabaseClient')
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    const auth = { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string, ...(token ? { Authorization: `Bearer ${token}` } : {}) }
    const f = fmt(from), t = fmt(to)
    const userQ = userId ? `&user_id=eq.${userId}` : ''
    const urlRec = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/receipts_with_user?select=date,total&date=gte.${f}&date=lte.${t}${userQ}&status=neq.missing`
    const resRec = await fetch(urlRec, { headers: auth }); const nonMissing = resRec.ok ? await resRec.json() : []
    const urlMissing = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/receipts?select=date&date=gte.${f}&date=lte.${t}${userQ}&status=eq.missing`
    const resMissing = await fetch(urlMissing, { headers: auth }); const missingRows = resMissing.ok ? await resMissing.json() : []
    const urlWex = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/wex_transactions?select=amount,transacted_at&transacted_at=gte.${f}&transacted_at=lte.${t}${userQ}`
    const resWex = await fetch(urlWex, { headers: auth }); const wexRows = resWex.ok ? await resWex.json() : []

    const labels: string[] = []
    for (let d = new Date(from); d <= to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) labels.push(fmt(d))
    const spendByDay: Record<string, number> = {}; const receiptsByDay: Record<string, number> = {}
    for (const r of nonMissing) { const k = String(r.date).slice(0,10); spendByDay[k]=(spendByDay[k]||0)+Number(r.total); receiptsByDay[k]=(receiptsByDay[k]||0)+1 }
    const missingByDay: Record<string, number> = {}; for (const m of missingRows) { const k=String(m.date).slice(0,10); missingByDay[k]=(missingByDay[k]||0)+1 }
    const wexByDay: Record<string, number> = {}; for (const w of wexRows) { const k=String(w.transacted_at).slice(0,10); wexByDay[k]=(wexByDay[k]||0)+1 }
    const deficitByDay: Record<string, number> = {}; for (const k of labels) deficitByDay[k] = Math.max(0, (wexByDay[k]||0)-(receiptsByDay[k]||0))
    if (excludeResolved) {
      const resUrl = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/missing_resolutions?select=date,user_id&date=gte.${f}&date=lte.${t}${userQ}`
      const r = await fetch(resUrl, { headers: auth }); if (r.ok) {
        const rows = await r.json(); const resolved: Record<string, number> = {}
        for (const x of rows) { const k=String(x.date).slice(0,10); resolved[k]=(resolved[k]||0)+1 }
        for (const k of labels) { if (resolved[k]) { missingByDay[k]=Math.max(0,(missingByDay[k]||0)-resolved[k]); deficitByDay[k]=Math.max(0,(deficitByDay[k]||0)-resolved[k]) } }
      }
    }
    const header = ['Date','Spend','Receipts','Missing','WEX Tx','Deficit']
    const rows = [header]
    for (const day of labels) {
      rows.push([day, (spendByDay[day]||0).toFixed(2), String(receiptsByDay[day]||0), String(missingByDay[day]||0), String(wexByDay[day]||0), String(deficitByDay[day]||0)])
    }
    // Summary footer
    const totalSpend = labels.reduce((a,d)=>a+(spendByDay[d]||0),0)
    const receiptCount = labels.reduce((a,d)=>a+(receiptsByDay[d]||0),0)
    const missingCount = labels.reduce((a,d)=>a+(missingByDay[d]||0),0)
    const wexCount = labels.reduce((a,d)=>a+(wexByDay[d]||0),0)
    const deficit = labels.reduce((a,d)=>a+(deficitByDay[d]||0),0)
    rows.push([])
    rows.push(['Summary', `Spend ${totalSpend.toFixed(2)}`, `Receipts ${receiptCount}`, `Missing ${missingCount}`, `WEX ${wexCount}`, `Deficit ${deficit}`])
    const csv = rows.map(r => r.map(v => {
      const s = String(v)
      return /[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s
    }).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `analytics_${f}_${t}${userId?('_'+userId):''}.csv`
    a.click(); URL.revokeObjectURL(a.href)
  }

  const exportAnalyticsPdf = async () => {
    // Capture canvases as images and build printable HTML
    const spendImg = spendRef.current ? spendRef.current.toDataURL('image/png') : null
    const missingImg = missingRef.current ? missingRef.current.toDataURL('image/png') : null
    const officerImg = officerTrendRef.current ? officerTrendRef.current.toDataURL('image/png') : null
    const f = fmt(from), t = fmt(to)
    const officerLabel = userId ? (officers.find(o=>o.id===userId)?.name || 'Officer') : 'All officers'
    const rows = anomalies.slice(0, 12).map(a => `<tr><td>${a.date}</td><td>$${a.spend.toFixed(2)}</td><td>${a.zSpend}</td><td>${a.deficit}</td><td>${a.zDeficit}</td></tr>`).join('')
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Analytics ${f} - ${t}</title>
      <style>body{font-family:ui-sans-serif,system-ui,Segoe UI,Roboto; padding:20px;}
      h1{font-size:18px;margin:0 0 8px} h2{font-size:15px;margin:16px 0 8px}
      .kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}
      .card{border:1px solid #e5e7eb;border-radius:8px;padding:10px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th,td{border-top:1px solid #e5e7eb;padding:6px 8px;text-align:left}
      .meta{color:#374151;font-size:12px;margin-bottom:8px}
      img{max-width:100%;height:auto;border:1px solid #e5e7eb;border-radius:6px}
      </style></head><body>
      <h1>GRTS Analytics</h1>
      <div class="meta">Range: ${f} → ${t} • Officer: ${officerLabel}</div>
      <div class="kpis">
        <div class="card"><div>Total Spend</div><div><strong>${sumFmt(summary.totalSpend)}</strong></div></div>
        <div class="card"><div>Receipts</div><div><strong>${summary.receiptCount}</strong></div></div>
        <div class="card"><div>Missing${excludeResolved?' (excl. resolved)':''}</div><div><strong>${summary.missingCount}</strong></div></div>
        <div class="card"><div>WEX Tx</div><div><strong>${summary.wexCount}</strong></div></div>
        <div class="card"><div>WEX Deficit</div><div><strong>${summary.deficit}</strong></div></div>
      </div>
      <h2>Daily Spend</h2>
      ${spendImg ? `<img src="${spendImg}" />` : '<div class="card">No chart</div>'}
      <h2>Missing vs WEX Deficit</h2>
      ${missingImg ? `<img src="${missingImg}" />` : '<div class="card">No chart</div>'}
      <h2>Officer Spend Trends</h2>
      ${officerImg ? `<img src="${officerImg}" />` : '<div class="card">No chart</div>'}
      <h2>Anomalies</h2>
      <table>
        <thead><tr><th>Date</th><th>Spend</th><th>Z(Spend)</th><th>Deficit</th><th>Z(Def)</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5">No anomalies</td></tr>'}</tbody>
      </table>
      <script>window.onload=()=>{setTimeout(()=>window.print(),300)}</script>
    </body></html>`
    const w = window.open('', '_blank', 'noopener,noreferrer')
    if (!w) return
    w.document.open(); w.document.write(html); w.document.close()
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col">
          <label className="text-xs text-gray-600">From</label>
          <input type="date" value={fmt(from)} onChange={e=>setFrom(new Date(e.target.value))} className="border rounded p-2" />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-gray-600">To</label>
          <input type="date" value={fmt(to)} onChange={e=>setTo(new Date(e.target.value))} className="border rounded p-2" />
        </div>
        <div className="flex items-center gap-1">
          <button onClick={()=>applyPreset(7)} className="px-2 py-1.5 rounded border">7d</button>
          <button onClick={()=>applyPreset(30)} className="px-2 py-1.5 rounded border">30d</button>
          <button onClick={()=>applyPreset(90)} className="px-2 py-1.5 rounded border">90d</button>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <label className="text-xs text-gray-600">Officer</label>
          <select value={userId} onChange={e=>setUserId(e.target.value)} className="border rounded p-2 min-w-[220px]">
            <option value="">All officers</option>
            {officers.map(o => (
              <option key={o.id} value={o.id}>{o.name} ({o.email})</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-700 flex items-center gap-1">
            <input type="checkbox" checked={excludeResolved} onChange={e=>setExcludeResolved(e.target.checked)} /> Exclude resolved
          </label>
          <label className="text-xs text-gray-700 flex items-center gap-1">
            <input type="checkbox" checked={showTrendline} onChange={e=>setShowTrendline(e.target.checked)} /> Trendline
          </label>
          <label className="text-xs text-gray-700 flex items-center gap-1">
            <input type="checkbox" checked={stackedBars} onChange={e=>setStackedBars(e.target.checked)} /> Stacked
          </label>
        </div>
        <button onClick={refresh} className="px-3 py-1.5 rounded border border-blue-600 text-blue-700 hover:bg-blue-50">Refresh</button>
        <button onClick={exportCsv} className="px-3 py-1.5 rounded border border-gray-800 text-gray-900 hover:bg-gray-50">Export CSV</button>
        <button onClick={exportAnalyticsPdf} className="px-3 py-1.5 rounded border border-gray-800 text-gray-900 hover:bg-gray-50">Export PDF</button>
      </div>

      <div className="grid md:grid-cols-5 gap-3">
        <div className="border rounded p-3 bg-white"><div className="text-xs text-gray-600">Total Spend</div><div className="text-lg font-semibold">{sumFmt(summary.totalSpend)}</div></div>
        <div className="border rounded p-3 bg-white"><div className="text-xs text-gray-600">Receipts</div><div className="text-lg font-semibold">{summary.receiptCount}</div></div>
        <div className="border rounded p-3 bg-white"><div className="text-xs text-gray-600">Missing (flagged{excludeResolved?' – excl. resolved':''})</div><div className="text-lg font-semibold">{summary.missingCount}</div></div>
        <div className="border rounded p-3 bg-white"><div className="text-xs text-gray-600">WEX Tx</div><div className="text-lg font-semibold">{summary.wexCount}</div></div>
        <div className="border rounded p-3 bg-white"><div className="text-xs text-gray-600">WEX Deficit</div><div className="text-lg font-semibold">{summary.deficit}</div></div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white border rounded p-3">
          <div className="font-medium mb-2">Daily Spend</div>
          <canvas ref={spendRef} />
        </div>
        <div className="bg-white border rounded p-3">
          <div className="font-medium mb-2">Missing vs WEX Deficit</div>
          <canvas ref={missingRef} />
        </div>
      </div>

      <div className="bg-white border rounded p-3">
        <div className="font-medium mb-2">Officer Spend Trends</div>
        <div className="text-xs text-gray-600 mb-1">Top officers by spend in range (or selected officer)</div>
        <canvas ref={officerTrendRef} />
      </div>

      <div className="bg-white border rounded p-3">
        <div className="font-medium mb-2">Anomalies (Z-score ≥ 2)</div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2 text-left">Date</th>
                <th className="p-2 text-left">Spend</th>
                <th className="p-2 text-left">Z(Spend)</th>
                <th className="p-2 text-left">Deficit</th>
                <th className="p-2 text-left">Z(Def)</th>
              </tr>
            </thead>
            <tbody>
              {anomalies.length ? anomalies.map(a => (
                <tr key={a.date} className="border-t">
                  <td className="p-2">{a.date}</td>
                  <td className="p-2">{sumFmt(a.spend)}</td>
                  <td className="p-2">{a.zSpend}</td>
                  <td className="p-2">{a.deficit}</td>
                  <td className="p-2">{a.zDeficit}</td>
                </tr>
              )) : (
                <tr><td colSpan={5} className="p-3 text-center text-gray-500">No anomalies detected</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white border rounded p-3">
          <div className="font-medium mb-2">Top Merchants (WEX)</div>
          <div className="text-xs text-gray-600 mb-1">Range & filters applied</div>
          <div className="space-y-1">
            {topMerchants.map((m, i) => (
              <div key={m.merchant + i} className="flex items-center justify-between">
                <div className="truncate mr-2">{i+1}. {m.merchant || '—'}</div>
                <div className="font-mono">{sumFmt(m.amount)}</div>
              </div>
            ))}
            {topMerchants.length === 0 && <div className="text-sm text-gray-600">No data for range.</div>}
          </div>
        </div>
        <div className="bg-white border rounded p-3">
          <div className="font-medium mb-2">Spend by Officer</div>
          <div className="text-xs text-gray-600 mb-1">From receipts (non-missing)</div>
          <div className="space-y-1">
            {spendByOfficer.map((u, i) => (
              <div key={u.user_id + i} className="flex items-center justify-between">
                <div className="truncate mr-2">{i+1}. {u.user_name}</div>
                <div className="font-mono">{sumFmt(u.amount)}</div>
              </div>
            ))}
            {spendByOfficer.length === 0 && <div className="text-sm text-gray-600">No data for range.</div>}
          </div>
        </div>
      </div>

      {loading && <div className="text-sm text-gray-600">Loading…</div>}
    </div>
  )
}
