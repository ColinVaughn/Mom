import React from 'react'
import { callEdgeFunctionJson } from '../shared/api'
import { supabase } from '../shared/supabaseClient'

type Receipt = {
  id: string
  user_id: string
  date: string
  total: number
  status: 'uploaded'|'verified'|'missing'
  signed_url?: string | null
}

interface Props {
  userId: string
  monthStart: Date
}

function fmt(d: Date) {
  return d.toISOString().slice(0,10)
}

function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth()+1, 0)
}

export default function OfficerCalendar({ userId, monthStart }: Props) {
  const [map, setMap] = React.useState<Record<string, { all: Receipt[]; missing: number; txCount: number }>>({})
  const [loading, setLoading] = React.useState(true)

  const first = React.useMemo(() => new Date(monthStart.getFullYear(), monthStart.getMonth(), 1), [monthStart])
  const last = React.useMemo(() => endOfMonth(first), [first])

  React.useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      const res = await callEdgeFunctionJson<any, { receipts: Receipt[] }>('get-receipts', {
        filters: {
          user_id: userId,
          date_from: fmt(first),
          date_to: fmt(last),
          limit: 1000,
        },
      })
      if (!alive) return
      const m: Record<string, { all: Receipt[]; missing: number; txCount: number }> = {}
      for (const r of res.receipts || []) {
        const key = (r.date as string).slice(0,10)
        if (!m[key]) m[key] = { all: [], missing: 0, txCount: 0 }
        m[key].all.push(r)
        if (r.status === 'missing') m[key].missing++
      }

      // Fetch WEX transactions for the same officer/month to compute missing even if not pre-flagged
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData.session?.access_token
        const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/wex_transactions?select=transacted_at&user_id=eq.${userId}&transacted_at=gte.${fmt(first)}&transacted_at=lte.${fmt(last)}`
        const resTx = await fetch(url, {
          headers: {
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        })
        if (resTx.ok) {
          const rows: Array<{ transacted_at: string }> = await resTx.json()
          for (const row of rows) {
            const key = String(row.transacted_at).slice(0,10)
            if (!m[key]) m[key] = { all: [], missing: 0, txCount: 0 }
            m[key].txCount += 1
          }
        }
        // Derive missing by comparing txCount to non-missing receipts in same day
        for (const key of Object.keys(m)) {
          const nonMissing = m[key].all.filter(r => r.status !== 'missing').length
          const deficit = Math.max(0, (m[key].txCount || 0) - nonMissing)
          // Use the larger of deficit vs explicitly flagged missing
          m[key].missing = Math.max(m[key].missing, deficit)
        }
      } catch {
        // ignore tx fetch errors; we'll rely on explicit missing entries
      }

      setMap(m)
      setLoading(false)
    })()
    return () => { alive = false }
  }, [userId, first, last])

  // Build calendar grid
  const startWeekday = new Date(first.getFullYear(), first.getMonth(), 1).getDay() // 0=Sun
  const daysInMonth = last.getDate()
  const cells: Array<{ date: Date | null }> = []
  for (let i=0;i<startWeekday;i++) cells.push({ date: null })
  for (let d=1; d<=daysInMonth; d++) cells.push({ date: new Date(first.getFullYear(), first.getMonth(), d) })
  while (cells.length % 7 !== 0) cells.push({ date: null })

  const weekDays = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

  return (
    <div className="bg-white rounded-xl border shadow-sm p-3 md:p-4">
      <div className="grid grid-cols-7 gap-1 text-xs font-medium text-gray-600 mb-1">
        {weekDays.map(w => (<div key={w} className="p-2 text-center">{w}</div>))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((c, idx) => {
          if (!c.date) return <div key={idx} className="p-3" />
          const key = fmt(c.date)
          const info = map[key]
          const hasMissing = info && info.missing > 0
          const total = info ? info.all.length : 0
          const tx = info ? info.txCount : 0
          return (
            <div key={idx} className={`p-2 rounded border ${hasMissing ? 'bg-red-50 border-red-200' : total>0 ? 'bg-green-50 border-green-200' : 'bg-white'} min-h-[64px] flex flex-col`}>
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-gray-900">{c.date.getDate()}</div>
                {loading && <div className="h-2 w-2 rounded-full bg-gray-300 animate-pulse" />}
              </div>
              <div className="mt-1 text-[11px] text-gray-700 flex items-center gap-1">
                {hasMissing && <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-red-100 text-red-700">Missing</span>}
                {total>0 && <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">{total} receipt{total>1?'s':''}</span>}
                {tx>0 && <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">{tx} WEX</span>}
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-3 text-xs text-gray-600 flex items-center gap-3">
        <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-red-200 border border-red-300" /> Missing day</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-green-200 border border-green-300" /> Has receipts</span>
      </div>
    </div>
  )
}
