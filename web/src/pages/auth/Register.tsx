import React from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../shared/AuthContext'

export default function Register() {
  const { signUpWithPassword } = useAuth()
  const nav = useNavigate()
  const [name, setName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      await signUpWithPassword(name, email, password)
      alert('Account created. If your project requires email confirmation, please check your inbox.')
      nav('/login')
    } catch (err:any) {
      setError(err?.message || 'Registration failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={onSubmit} className="max-w-sm w-full space-y-3 bg-white border rounded p-4">
        <h1 className="text-xl font-semibold">Create account</h1>
        {error && <div className="text-red-600 text-sm">{error}</div>}
        <input value={name} onChange={e=>setName(e.target.value)} name="name" type="text" placeholder="Full name" required className="border rounded w-full p-2" />
        <input value={email} onChange={e=>setEmail(e.target.value)} name="email" type="email" placeholder="Email" required className="border rounded w-full p-2" />
        <input value={password} onChange={e=>setPassword(e.target.value)} name="password" type="password" placeholder="Password" required className="border rounded w-full p-2" />
        <button disabled={busy} className="bg-blue-600 text-white px-4 py-2 rounded w-full">{busy? 'Creating...' : 'Create account'}</button>
        <div className="text-sm text-center">
          <Link className="text-blue-600" to="/login">Back to login</Link>
        </div>
      </form>
    </div>
  )
}
