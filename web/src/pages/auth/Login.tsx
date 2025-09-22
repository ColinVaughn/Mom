import React from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../shared/AuthContext'

export default function Login() {
  const { signInWithPassword, signInWithMicrosoft } = useAuth()
  const nav = useNavigate()
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      await signInWithPassword(email, password)
      nav('/')
    } catch (err:any) {
      setError(err?.message || 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  const onMicrosoft = async () => {
    try {
      setBusy(true); setError(null)
      await signInWithMicrosoft()
      // Redirect will occur; if it doesn't, fall through
    } catch (err:any) {
      setBusy(false)
      setError(err?.message || 'Microsoft sign-in failed')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={onSubmit} className="max-w-sm w-full space-y-3 bg-white border rounded p-4">
        <h1 className="text-xl font-semibold">Sign in</h1>
        {error && <div className="text-red-600 text-sm">{error}</div>}
        <input value={email} onChange={e=>setEmail(e.target.value)} name="email" type="email" placeholder="Email" required className="border rounded w-full p-2" />
        <input value={password} onChange={e=>setPassword(e.target.value)} name="password" type="password" placeholder="Password" required className="border rounded w-full p-2" />
        <button disabled={busy} className="bg-blue-600 text-white px-4 py-2 rounded w-full">{busy? 'Signing in...' : 'Sign in'}</button>
        <div className="flex items-center gap-3 text-gray-500">
          <div className="h-px bg-gray-200 flex-1" />
          <span className="text-xs">or</span>
          <div className="h-px bg-gray-200 flex-1" />
        </div>
        <button type="button" onClick={onMicrosoft} disabled={busy} className="border border-gray-300 bg-white hover:bg-gray-50 text-gray-800 px-4 py-2 rounded w-full">
          Continue with Microsoft
        </button>
        <div className="text-sm flex justify-between">
          <Link className="text-blue-600" to="/register">Create account</Link>
          <Link className="text-blue-600" to="/forgot-password">Forgot password?</Link>
        </div>
      </form>
    </div>
  )
}
