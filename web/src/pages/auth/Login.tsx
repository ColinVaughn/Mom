import React from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../shared/AuthContext'

export default function Login() {
  const { signInWithPassword } = useAuth()
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

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={onSubmit} className="max-w-sm w-full space-y-3 bg-white border rounded p-4">
        <h1 className="text-xl font-semibold">Sign in</h1>
        {error && <div className="text-red-600 text-sm">{error}</div>}
        <input value={email} onChange={e=>setEmail(e.target.value)} name="email" type="email" placeholder="Email" required className="border rounded w-full p-2" />
        <input value={password} onChange={e=>setPassword(e.target.value)} name="password" type="password" placeholder="Password" required className="border rounded w-full p-2" />
        <button disabled={busy} className="bg-blue-600 text-white px-4 py-2 rounded w-full">{busy? 'Signing in...' : 'Sign in'}</button>
        <div className="text-sm flex justify-between">
          <Link className="text-blue-600" to="/register">Create account</Link>
          <Link className="text-blue-600" to="/forgot-password">Forgot password?</Link>
        </div>
      </form>
    </div>
  )
}
