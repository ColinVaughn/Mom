import React from 'react'
import { callEdgeFunctionJson } from '../shared/api'
import { useAuth } from '../shared/AuthContext'
import Lightbox from '../components/Lightbox'
import Thumb from '../components/Thumb'
import { getCachedReceipts, setCachedReceipts, makeReceiptsCacheKey } from '../shared/receiptsCache'

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
  const [lightboxUrl, setLightboxUrl] = React.useState<string | null>(null)
  const [limit] = React.useState<number>(50)
  const [offset, setOffset] = React.useState<number>(0)
  const sentinelRef = React.useRef<HTMLDivElement | null>(null)
  // Manager-customizable columns
  const COLS = React.useMemo(() => (
    [
      { key: 'officer', label: 'Officer', managerOnly: true },
      { key: 'date', label: 'Date' },
      { key: 'time_text', label: 'Time' },
      { key: 'total', label: 'Total ($)' },
      { key: 'gallons', label: 'Gallons' },
      { key: 'price_per_gallon', label: 'Price/Gal' },
      { key: 'fuel_grade', label: 'Grade' },
      { key: 'station', label: 'Station' },
      { key: 'station_address', label: 'Station Address' },
      { key: 'payment_method', label: 'Payment' },
      { key: 'card_last4', label: 'Card ****' },
      { key: 'ocr_confidence', label: 'OCR %' },
      { key: 'status', label: 'Status' },
      { key: 'image', label: 'Image' },
    ] as const
  ), [])
  type ColKey = (typeof COLS)[number]['key']
  const defaultVisible: Record<ColKey, boolean> = {
    officer: scope === 'manager',
    date: true,
    time_text: false,
    total: true,
    gallons: false,
    price_per_gallon: false,
    fuel_grade: false,
    station: true,
    station_address: false,
    payment_method: false,
    card_last4: false,
    ocr_confidence: false,
    status: true,
    image: true,
  }
  const [visible, setVisible] = React.useState<Record<ColKey, boolean>>(() => {
    if (scope !== 'manager') return defaultVisible
    try {
      const raw = localStorage.getItem('manager_receipt_columns')
      if (raw) {
        const parsed = JSON.parse(raw)
        return { ...defaultVisible, ...parsed }
      }
    } catch {}
    return defaultVisible
  })

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

  // Persist manager column choices
  React.useEffect(() => {
    if (scope === 'manager') {
      try { localStorage.setItem('manager_receipt_columns', JSON.stringify(visible)) } catch {}
    }
  }, [scope, visible])

  const load = React.useCallback(async (append = false) => {
    setLoading(true)
    try {
      const cacheKey = makeReceiptsCacheKey(scope, filters)
      // Serve cached first page quickly
      if (!append && offset === 0) {
        const cached = await getCachedReceipts(cacheKey)
        if (cached?.receipts?.length) {
          setReceipts(cached.receipts)
          setCount(cached.count || cached.receipts.length)
        }
      }

      const payload: any = { filters: {
        ...filters,
        amount_min: filters.amount_min ? Number(filters.amount_min) : undefined,
        amount_max: filters.amount_max ? Number(filters.amount_max) : undefined,
        limit,
        offset,
      } }
      const resp = await callEdgeFunctionJson('get-receipts', payload)
      const newReceipts = resp.receipts || []
      const newCount = resp.count || 0
      setCount(newCount)
      setReceipts(prev => append ? [...prev, ...newReceipts] : newReceipts)
      // Cache only first page for current filters
      if (offset === 0 && !append) {
        await setCachedReceipts(cacheKey, newReceipts, newCount)
      }
    } finally {
      setLoading(false)
    }
  }, [filters, limit, offset, scope])

  // Reset pagination when filters change
  React.useEffect(() => { setOffset(0) }, [filters, scope])

  // Load first page when offset is 0 (filters changed or initial)
  React.useEffect(() => {
    if (offset === 0) {
      load(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, scope, limit, offset])

  // When offset > 0, append next page
  React.useEffect(() => {
    if (offset > 0) {
      load(true)
    }
  }, [offset, load])

  // Infinite scroll: observe sentinel and increase offset when visible
  React.useEffect(() => {
    if (!sentinelRef.current) return
    const el = sentinelRef.current
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && !loading && receipts.length < count) {
          setOffset((prev) => prev + limit)
        }
      }
    }, { rootMargin: '200px 0px', threshold: 0 })
    io.observe(el)
    return () => io.disconnect()
  }, [loading, receipts.length, count, limit])

  const missingCount = receipts.filter(r => r.status === 'missing').length

  return (
    <div>
      {missingCount > 0 && scope === 'officer' && (
        <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded text-yellow-800 text-sm">
          You have {missingCount} missing receipt{missingCount>1?'s':''}. Please upload them.
        </div>
      )}
      {scope === 'manager' && (
        <details className="mb-3 bg-gray-50 border rounded p-3">
          <summary className="cursor-pointer font-medium">Customize columns</summary>
          <div className="grid md:grid-cols-4 gap-2 mt-2 text-sm">
            {COLS.map(c => (
              (c.managerOnly && scope !== 'manager') ? null : (
                <label key={c.key} className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={visible[c.key]} onChange={e=>setVisible(v=>({ ...v, [c.key]: e.target.checked }))} />
                  {c.label}
                </label>
              )
            ))}
          </div>
        </details>
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
            <option value="pending_review">Pending Review</option>
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

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {loading && Array.from({ length: 3 }).map((_,i) => (
          <div key={`sk-${i}`} className="bg-white rounded-lg border shadow-sm p-3 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-32" />
            <div className="mt-2 h-6 bg-gray-200 rounded w-48" />
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="h-4 bg-gray-200 rounded" />
              <div className="h-4 bg-gray-200 rounded" />
            </div>
          </div>
        ))}
        {!loading && receipts.map(r => (
          <div key={r.id} className="bg-white rounded-lg border shadow-sm p-3">
            <div className="flex items-center justify-between">
              <div>
                {visible.date && <div className="text-sm text-gray-600">{r.date}</div>}
                {visible.station && (r as any).station && <div className="font-medium text-gray-900">{(r as any).station}</div>}
              </div>
              <div className="text-right">
                {visible.total && <div className="text-base font-semibold text-gray-900">${Number(r.total).toFixed(2)}</div>}
                {visible.status && (
                  <span className={
                    r.status==='missing' ? 'inline-block mt-1 px-2 py-0.5 text-xs rounded bg-yellow-100 text-yellow-800' :
                    r.status==='verified' ? 'inline-block mt-1 px-2 py-0.5 text-xs rounded bg-green-100 text-green-800' :
                    'inline-block mt-1 px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-800'
                  }>{r.status}</span>
                )}
              </div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
              {visible.time_text && <div className="text-gray-600">Time: <span className="text-gray-900">{(r as any).time_text || '—'}</span></div>}
              {visible.gallons && <div className="text-gray-600">Gallons: <span className="text-gray-900">{(r as any).gallons ?? '—'}</span></div>}
              {visible.price_per_gallon && <div className="text-gray-600">Price/Gal: <span className="text-gray-900">{(r as any).price_per_gallon ?? '—'}</span></div>}
              {visible.fuel_grade && <div className="text-gray-600">Grade: <span className="text-gray-900">{(r as any).fuel_grade || '—'}</span></div>}
              {visible.payment_method && <div className="text-gray-600">Payment: <span className="text-gray-900">{(r as any).payment_method || '—'}</span></div>}
              {visible.card_last4 && <div className="text-gray-600">Card: <span className="text-gray-900">{(r as any).card_last4 ? `**** ${String((r as any).card_last4).padStart(4,'*')}` : '—'}</span></div>}
            </div>
            <div className="mt-2 flex items-center justify-between">
              {visible.station_address && (r as any).station_address && (
                <div className="text-xs text-gray-500 truncate pr-3">{(r as any).station_address}</div>
              )}
              {visible.image && (
                r.signed_url ? (
                  <Thumb
                    src={(r as any).thumb_signed_url || r.signed_url!}
                    alt="thumb"
                    loading="lazy"
                    className="ml-auto h-16 w-auto rounded border cursor-pointer bg-white"
                    onClick={() => setLightboxUrl(r.signed_url!)}
                  />
                ) : (
                  <span className="ml-auto text-xs text-gray-400">No image</span>
                )
              )}
            </div>
          </div>
        ))}
        {!loading && receipts.length === 0 && (
          <div className="text-center text-gray-500 text-sm">No receipts</div>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto border rounded">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              {visible.officer && scope==='manager' && <th className="text-left p-2">Officer</th>}
              {visible.date && <th className="text-left p-2">Date</th>}
              {visible.time_text && <th className="text-left p-2">Time</th>}
              {visible.total && <th className="text-right p-2">Total ($)</th>}
              {visible.gallons && <th className="text-right p-2">Gallons</th>}
              {visible.price_per_gallon && <th className="text-right p-2">Price/Gal</th>}
              {visible.fuel_grade && <th className="text-left p-2">Grade</th>}
              {visible.station && <th className="text-left p-2">Station</th>}
              {visible.station_address && <th className="text-left p-2">Station Address</th>}
              {visible.payment_method && <th className="text-left p-2">Payment</th>}
              {visible.card_last4 && <th className="text-left p-2">Card ****</th>}
              {visible.ocr_confidence && <th className="text-right p-2">OCR %</th>}
              {visible.status && <th className="text-left p-2">Status</th>}
              {visible.image && <th className="text-left p-2">Image</th>}
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 6 }).map((_,i) => (
              <tr key={`skl-${i}`} className="border-t animate-pulse">
                <td className="p-2" colSpan={Object.values(visible).filter(Boolean).length}>
                  <div className="h-4 bg-gray-200 rounded w-2/3" />
                </td>
              </tr>
            ))}
            {!loading && receipts.map(r => (
              <tr key={r.id} className="border-t">
                {visible.officer && scope==='manager' && <td className="p-2">{r.user_name}</td>}
                {visible.date && <td className="p-2">{r.date}</td>}
                {visible.time_text && <td className="p-2">{(r as any).time_text || '—'}</td>}
                {visible.total && <td className="p-2 text-right">{Number(r.total).toFixed(2)}</td>}
                {visible.gallons && <td className="p-2 text-right">{(r as any).gallons != null ? Number((r as any).gallons).toFixed(3) : '—'}</td>}
                {visible.price_per_gallon && <td className="p-2 text-right">{(r as any).price_per_gallon != null ? Number((r as any).price_per_gallon).toFixed(3) : '—'}</td>}
                {visible.fuel_grade && <td className="p-2">{(r as any).fuel_grade || '—'}</td>}
                {visible.station && <td className="p-2">{(r as any).station || '—'}</td>}
                {visible.station_address && <td className="p-2">{(r as any).station_address || '—'}</td>}
                {visible.payment_method && <td className="p-2">{(r as any).payment_method || '—'}</td>}
                {visible.card_last4 && <td className="p-2">{(r as any).card_last4 ? `**** ${String((r as any).card_last4).padStart(4,'*')}` : '—'}</td>}
                {visible.ocr_confidence && <td className="p-2 text-right">{(r as any).ocr_confidence != null ? Number((r as any).ocr_confidence).toFixed(0) : '—'}</td>}
                {visible.status && (
                  <td className="p-2">
                    <span className={
                      r.status==='missing' ? 'px-2 py-1 text-xs rounded bg-yellow-100 text-yellow-800' :
                      r.status==='pending_review' ? 'px-2 py-1 text-xs rounded bg-blue-100 text-blue-800' :
                      r.status==='verified' ? 'px-2 py-1 text-xs rounded bg-green-100 text-green-800' :
                      'px-2 py-1 text-xs rounded bg-gray-100 text-gray-800'
                    }>{r.status}</span>
                  </td>
                )}
                {visible.image && (
                  <td className="p-2">
                    {r.signed_url ? (
                      <Thumb
                        src={(r as any).thumb_signed_url || r.signed_url!}
                        alt="thumb"
                        loading="lazy"
                        className="h-12 w-auto rounded border cursor-pointer bg-white"
                        onClick={() => setLightboxUrl(r.signed_url!)}
                      />
                    ) : (
                      <span className="text-gray-500">—</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {!loading && receipts.length === 0 && (
              <tr><td colSpan={Object.values(visible).filter(Boolean).length} className="p-3 text-center text-gray-500">No receipts</td></tr>
            )}
          </tbody>
        </table>
        {/* Pagination */}
        {receipts.length < count && (
          <div className="p-3 text-center">
            <button
              className="inline-flex items-center px-4 py-2 rounded border bg-white hover:bg-gray-50"
              disabled={loading}
              onClick={() => { setOffset(prev => prev + limit) }}
            >{loading ? 'Loading…' : 'Load more'}</button>
            {/* Infinite scroll sentinel */}
            <div ref={sentinelRef} className="h-1" />
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <Lightbox src={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      )}
      {loading && <div className="mt-2 text-sm text-gray-500">Loading...</div>}
      <div className="mt-2 text-xs text-gray-500">Total: {count}</div>
    </div>
  )
}
