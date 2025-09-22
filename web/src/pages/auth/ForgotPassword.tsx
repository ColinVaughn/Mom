import React from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../shared/AuthContext'

export default function ForgotPassword() {
  const { sendPasswordReset } = useAuth()
  const [email, setEmail] = React.useState('')
  const [sent, setSent] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      await sendPasswordReset(email)
      setSent(true)
    } catch (err:any) {
      setError(err?.message || 'Failed to send reset email')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={onSubmit} className="max-w-sm w-full space-y-3 bg-white border rounded p-4">
        <h1 className="text-xl font-semibold">Reset your password</h1>
        {sent ? (
          <div className="text-sm text-green-700">If an account exists for {email}, a reset link has been sent.</div>
        ) : (
          <>
            {error && <div className="text-red-600 text-sm">{error}</div>}
            <input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="Email" required className="border rounded w-full p-2" />
            <button disabled={busy} className="bg-blue-600 text-white px-4 py-2 rounded w-full">{busy? 'Sending...' : 'Send reset link'}</button>
          </>
        )}
        <div className="text-sm text-center">
          <Link className="text-blue-600" to="/login">Back to login</Link>
        </div>
      </form>
    </div>
  )
}
