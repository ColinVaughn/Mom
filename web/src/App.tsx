import React from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './shared/AuthContext'
import NavBar from './components/NavBar'
import OfficerDashboard from './pages/OfficerDashboard'
import ManagerDashboard from './pages/ManagerDashboard'
import { Protected } from './shared/Protected'
import Login from './pages/auth/Login'
import Register from './pages/auth/Register'
import ForgotPassword from './pages/auth/ForgotPassword'
import ResetPassword from './pages/auth/ResetPassword'
import MicrosoftButton from './components/MicrosoftButton'
import TodoBoard from './widgets/TodoBoard'

function Home() {
  const { session } = useAuth()
  const [isManager, setIsManager] = React.useState(false)
  const [name, setName] = React.useState<string>('')

  React.useEffect(() => {
    let aborted = false
    ;(async () => {
      if (!session?.user?.id) { setIsManager(false); setName(''); return }
      try {
        const { supabase } = await import('./shared/supabaseClient')
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData.session?.access_token
        const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/users?id=eq.${session.user.id}&select=role,name`
        const res = await fetch(url, { headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string, ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
        if (!res.ok) return
        const rows = await res.json()
        if (aborted) return
        const row = rows?.[0]
        setIsManager(row?.role === 'manager')
        setName(row?.name || '')
      } catch {}
    })()
    return () => { aborted = true }
  }, [session?.user?.id])
  return (
    <div className="min-h-[calc(100vh-56px)]">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-emerald-50" />
        <div className="relative mx-auto max-w-6xl px-4 py-10 md:py-14">
          <div className="max-w-3xl">
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-gray-900">Gas Receipt Tracking System</h1>
            {!session ? (
              <p className="mt-2 text-gray-600">Sign in to capture receipts, reconcile fuel transactions, and track spend.</p>
            ) : (
              <p className="mt-2 text-gray-600">Welcome{name ? `, ${name}` : ''}. Choose a dashboard or jump into a quick action.</p>
            )}
            {!session ? (
              <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-3">
                <a href="/login" className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-white shadow-sm hover:bg-blue-700">Sign in</a>
                <div className="text-gray-500 text-sm">or</div>
                <MicrosoftButton />
              </div>
            ) : (
              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                <a href="/officer" className="group rounded-xl border bg-white p-5 shadow-sm hover:shadow-md transition">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm uppercase tracking-wide text-gray-500">Dashboard</div>
                      <div className="mt-1 text-lg font-semibold text-gray-900">Officer</div>
                      <p className="mt-1 text-gray-600 text-sm">Capture receipts, upload images, and review your submissions.</p>
                    </div>
                    <div className="text-3xl">📷</div>
                  </div>
                </a>
                {isManager && (
                  <a href="/manager" className="group rounded-xl border bg-white p-5 shadow-sm hover:shadow-md transition">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm uppercase tracking-wide text-gray-500">Dashboard</div>
                        <div className="mt-1 text-lg font-semibold text-gray-900">Manager</div>
                        <p className="mt-1 text-gray-600 text-sm">Audit receipts, reconcile WEX, run analytics, and export reports.</p>
                      </div>
                      <div className="text-3xl">📊</div>
                    </div>
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {session && (
        <section className="mx-auto max-w-6xl px-4 pb-10">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <div className="rounded-xl border bg-white p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-800 mb-2">Quick actions</h3>
                <div className="flex flex-wrap gap-2">
                  <a href="/officer" className="inline-flex items-center rounded-lg border px-3 py-1.5 hover:bg-gray-50">Capture receipt</a>
                  <a href="/officer" className="inline-flex items-center rounded-lg border px-3 py-1.5 hover:bg-gray-50">View my receipts</a>
                  {isManager && (
                    <>
                      <a href="/manager#reconcile" className="inline-flex items-center rounded-lg border px-3 py-1.5 hover:bg-gray-50">Reconcile pending</a>
                      <a href="/manager" className="inline-flex items-center rounded-lg border px-3 py-1.5 hover:bg-gray-50">Analytics</a>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div>
              <div className="rounded-xl border bg-white p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-800">Your To‑Do</h3>
                <div className="mt-2 text-sm text-gray-600">
                  <TodoBoard />
                </div>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

export default function App() {
  const { session, loading } = useAuth()

  if (loading) {
    return <div className="p-6">Loading...</div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />
      <main className="py-4">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={!session ? <Login /> : <Navigate to="/" replace />} />
          <Route path="/register" element={!session ? <Register /> : <Navigate to="/" replace />} />
          <Route path="/forgot-password" element={!session ? <ForgotPassword /> : <Navigate to="/" replace />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/officer" element={<Protected><OfficerDashboard /></Protected>} />
          <Route path="/manager" element={<Protected roles={['manager']}><ManagerDashboard /></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}
