import React from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../shared/AuthContext'

export default function ResetPassword() {
  const { updatePassword } = useAuth()
  const nav = useNavigate()
  const [password, setPassword] = React.useState('')
  const [confirm, setConfirm] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match'); return }
    setBusy(true); setError(null)
    try {
      await updatePassword(password)
      alert('Password updated. You are now signed in.')
      nav('/')
    } catch (err:any) {
      setError(err?.message || 'Failed to update password')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={onSubmit} className="max-w-sm w-full space-y-3 bg-white border rounded p-4">
        <h1 className="text-xl font-semibold">Set a new password</h1>
        {error && <div className="text-red-600 text-sm">{error}</div>}
        <input value={password} onChange={e=>setPassword(e.target.value)} type="password" placeholder="New password" required className="border rounded w-full p-2" />
        <input value={confirm} onChange={e=>setConfirm(e.target.value)} type="password" placeholder="Confirm password" required className="border rounded w-full p-2" />
        <button disabled={busy} className="bg-blue-600 text-white px-4 py-2 rounded w-full">{busy? 'Updating...' : 'Update password'}</button>
        <div className="text-sm text-center">
          <Link className="text-blue-600" to="/login">Back to login</Link>
        </div>
      </form>
    </div>
  )
}
