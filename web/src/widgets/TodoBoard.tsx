import React from 'react'
import { useAuth } from '../shared/AuthContext'
import { callEdgeFunctionJson } from '../shared/api'
import { supabase } from '../shared/supabaseClient'

// Types for receipts and WEX transactions
interface Receipt {
  id: string
  user_id: string
  date: string
  total: number
  status: 'uploaded'|'verified'|'missing'
  user_name?: string
  user_email?: string
}

interface WexTxn { id?: string; external_id?: string; amount: number; merchant?: string; transacted_at: string }

type Role = 'officer'|'manager'

function fmt(d: Date) { return d.toISOString().slice(0,10) }

function prefillLink(date: string, total?: number | string) {
  const base = window.location.origin + '/officer'
  const p = new URLSearchParams()
  p.set('date', date)
  if (total != null) p.set('total', String(total))
  return `${base}?${p.toString()}`
}

async function getMyRole(): Promise<Role> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  const uid = sessionData.session?.user?.id
  if (!uid) return 'officer'
  const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/users?select=role&id=eq.${uid}`
  const res = await fetch(url, { headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string, ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
  if (!res.ok) return 'officer'
  const rows = await res.json()
  const role = (rows?.[0]?.role || 'officer') as Role
  return (role === 'manager') ? 'manager' : 'officer'
}

export default function TodoBoard() {
  const { session } = useAuth()
  const [role, setRole] = React.useState<Role>('officer')
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  // Officer-specific state
  const [officerTasks, setOfficerTasks] = React.useState<Array<{ date: string; tx: WexTxn[] }>>([])

  // Manager-specific state
  const [managerSummary, setManagerSummary] = React.useState<Array<{ user_id: string; user_name: string; count: number }>>([])

  React.useEffect(() => {
    let alive = true
    if (!session) return
    ;(async () => {
      try {
        setLoading(true); setError(null)
        const myRole = await getMyRole()
        if (!alive) return
        setRole(myRole)
        const since = new Date(Date.now() - 30 * 86400_000)
        if (myRole === 'officer') {
          await loadOfficerTasksSince(since, setOfficerTasks)
        } else {
          await loadManagerSummarySince(since, setManagerSummary)
        }
      } catch (e:any) {
        if (!alive) return
        setError(e?.message || 'Failed to load')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [session])

  if (!session) return null

  return (
    <div className="mt-6">
      <div className="bg-white rounded-xl border shadow-sm p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Your To‑Do</h2>
          {loading && <div className="text-sm text-gray-500">Loading…</div>}
        </div>
        {error && <div className="mt-2 text-sm text-red-600">{error}</div>}
        {!loading && !error && (
          role === 'officer' ? <OfficerTodo tasks={officerTasks} /> : <ManagerTodo summary={managerSummary} />
        )}
      </div>
    </div>
  )
}

function OfficerTodo({ tasks }: { tasks: Array<{ date: string; tx: WexTxn[] }> }) {
  if (tasks.length === 0) {
    return <div className="mt-2 text-sm text-gray-600">No pending items from WEX for the last 30 days. You're all caught up!</div>
  }
  return (
    <div className="mt-3 space-y-3">
      {tasks.map(({ date, tx }) => (
        <div key={date} className="border rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-gray-900">Missing receipt{tx.length>1?'s':''} for {date}</div>
              <div className="text-xs text-gray-600">Based on WEX transactions with no matching receipt.</div>
            </div>
            <a href={`/officer`} className="text-sm text-blue-700 underline">Open Upload</a>
          </div>
          <div className="mt-2 grid sm:grid-cols-2 md:grid-cols-3 gap-2">
            {tx.map((t, i) => (
              <div key={(t.external_id || t.id || i) + date} className="border rounded p-2 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-gray-900">${Number(t.amount).toFixed(2)}</div>
                  <div className="text-xs text-gray-600">{t.merchant || '—'}</div>
                </div>
                <div className="flex items-center gap-2">
                  <a className="text-xs px-2 py-1 rounded border border-blue-600 text-blue-700 hover:bg-blue-50" href={prefillLink(date, t.amount)}>Upload Now</a>
                  <button className="text-xs px-2 py-1 rounded border" onClick={() => navigator.clipboard.writeText(prefillLink(date, t.amount))}>Copy Link</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function ManagerTodo({ summary }: { summary: Array<{ user_id: string; user_name: string; count: number }> }) {
  if (summary.length === 0) {
    return <div className="mt-2 text-sm text-gray-600">No team-wide missing receipts flagged in the last 30 days.</div>
  }
  return (
    <div className="mt-3 space-y-2">
      <div className="text-sm text-gray-700">Recent missing receipts (last 30 days):</div>
      <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2">
        {summary.map(s => (
          <div key={s.user_id} className="border rounded p-3">
            <div className="font-medium text-gray-900">{s.user_name || 'Officer'}</div>
            <div className="text-sm text-gray-700">{s.count} missing receipts</div>
            <a href="/manager" className="mt-2 inline-block text-xs px-2 py-1 rounded border border-blue-600 text-blue-700 hover:bg-blue-50">Open Manager</a>
          </div>
        ))}
      </div>
    </div>
  )
}

async function loadOfficerTasksSince(since: Date, setOfficerTasks: (v: Array<{ date: string; tx: WexTxn[] }>) => void) {
  const first = fmt(since)
  const last = fmt(new Date())

  // Load receipts for the current user
  const receiptsResp = await callEdgeFunctionJson<any, { receipts: Receipt[] }>('get-receipts', {
    filters: { date_from: first, date_to: last, limit: 1000 },
  })
  const receipts = receiptsResp.receipts || []

  // Group receipts by date and split by status
  const byDate: Record<string, { receipts: Receipt[]; nonMissingCount: number; flaggedMissing: number }> = {}
  for (const r of receipts) {
    const key = (r.date as string).slice(0,10)
    if (!byDate[key]) byDate[key] = { receipts: [], nonMissingCount: 0, flaggedMissing: 0 }
    byDate[key].receipts.push(r)
    if (r.status === 'missing') byDate[key].flaggedMissing++
    else byDate[key].nonMissingCount++
  }

  // Get all WEX tx for the current user since 'since'
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  const uid = sessionData.session?.user?.id
  if (!uid) { setOfficerTasks([]); return }
  const wexUrl = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/wex_transactions?select=external_id,amount,merchant,transacted_at&user_id=eq.${uid}&transacted_at=gte.${first}&transacted_at=lte.${last}`
  const wexRes = await fetch(wexUrl, { headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string, ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
  const wexRows: WexTxn[] = wexRes.ok ? await wexRes.json() : []

  // Build WEX by date
  const wexByDate: Record<string, WexTxn[]> = {}
  for (const t of wexRows) {
    const key = String(t.transacted_at).slice(0,10)
    if (!wexByDate[key]) wexByDate[key] = []
    wexByDate[key].push(t)
  }

  // For each date with WEX or receipts, compute missing based on deficits and flagged missing
  const dates = Array.from(new Set([...Object.keys(byDate), ...Object.keys(wexByDate)])).sort()
  const tolerance = 0.02
  const tasks: Array<{ date: string; tx: WexTxn[] }> = []

  for (const date of dates) {
    const rx = byDate[date]?.receipts || []
    const nonMissing = rx.filter(r => r.status !== 'missing')
    const flaggedMissing = byDate[date]?.flaggedMissing || 0
    const tx = [...(wexByDate[date] || [])]

    // Try to match non-missing receipts to transactions by amount within tolerance, remove matched tx
    const remainingTx = [...tx]
    for (const r of nonMissing) {
      const idx = remainingTx.findIndex(t => Math.abs(Number(t.amount) - Number(r.total)) <= tolerance)
      if (idx >= 0) remainingTx.splice(idx, 1)
    }

    // The number of missing is max(deficit, flaggedMissing)
    const deficit = Math.max(0, tx.length - nonMissing.length)
    const missingCount = Math.max(deficit, flaggedMissing)

    if (missingCount > 0) {
      // Use up to missingCount remaining transactions as actionable items
      const actionable = remainingTx.slice(0, missingCount)
      // If we don't have enough remaining tx rows (edge case), fall back to using the largest non-matched tx list
      const list = actionable.length ? actionable : remainingTx
      if (list.length) tasks.push({ date, tx: list })
      else {
        // If no WEX tx info available (should be rare), at least push a generic item
        tasks.push({ date, tx: [] })
      }
    }
  }

  // Remove days that have been marked resolved by a manager
  try {
    const { data: sess2 } = await supabase.auth.getSession()
    const token2 = sess2.session?.access_token
    const uid2 = sess2.session?.user?.id
    if (uid2) {
      const urlRes = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/missing_resolutions?select=date&user_id=eq.${uid2}&date=gte.${first}&date=lte.${last}`
      const resRes = await fetch(urlRes, { headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string, ...(token2 ? { Authorization: `Bearer ${token2}` } : {}) } })
      if (resRes.ok) {
        const rows: Array<{ date: string }> = await resRes.json()
        const resolvedSet = new Set(rows.map(r => String(r.date).slice(0,10)))
        for (let i = tasks.length - 1; i >= 0; i--) {
          if (resolvedSet.has(tasks[i].date)) tasks.splice(i, 1)
        }
      }
    }
  } catch {
    // ignore
  }

  // Sort tasks by date descending (most recent first)
  tasks.sort((a,b) => a.date < b.date ? 1 : -1)
  setOfficerTasks(tasks)
}

async function loadManagerSummarySince(since: Date, setManagerSummary: (v: Array<{ user_id: string; user_name: string; count: number }>) => void) {
  const receiptsResp = await callEdgeFunctionJson<any, { receipts: Receipt[] }>('get-receipts', {
    filters: { status: 'missing', date_from: fmt(since), date_to: fmt(new Date()), limit: 1000 },
  })
  const recs = receiptsResp.receipts || []
  const map = new Map<string, { user_id: string; user_name: string; count: number }>()
  for (const r of recs) {
    const key = r.user_id
    const name = (r as any).user_name || 'Officer'
    if (!map.has(key)) map.set(key, { user_id: key, user_name: name, count: 0 })
    map.get(key)!.count += 1
  }
  const arr = Array.from(map.values()).sort((a,b) => b.count - a.count).slice(0, 12)
  setManagerSummary(arr)
}
