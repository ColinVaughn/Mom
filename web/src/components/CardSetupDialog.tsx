import React from 'react'
import { useAuth } from '../shared/AuthContext'

export default function CardSetupDialog() {
  const { session } = useAuth()
  const [show, setShow] = React.useState(false)
  const [cardInput, setCardInput] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [checking, setChecking] = React.useState(true)

  // Check if user has any cards set up
  React.useEffect(() => {
    if (!session?.user?.id) {
      setChecking(false)
      return
    }

    const checkCards = async () => {
      try {
        const { supabase } = await import('../shared/supabaseClient')
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData.session?.access_token
        
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/wex_cards?select=card_last4&user_id=eq.${session.user.id}`,
          {
            headers: {
              apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          }
        )

        if (!res.ok) {
          setChecking(false)
          return
        }

        const cards = await res.json()
        
        // Show dialog if user has no cards
        if (!cards || cards.length === 0) {
          setShow(true)
        }
      } catch (err) {
        console.error('Failed to check cards:', err)
      } finally {
        setChecking(false)
      }
    }

    checkCards()
  }, [session?.user?.id])

  const handleSkip = () => {
    setShow(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const last4 = cardInput.trim()
    if (!/^[0-9]{4}$/.test(last4)) {
      setError('Please enter a valid 4-digit card number')
      return
    }

    try {
      setSaving(true)
      const { supabase } = await import('../shared/supabaseClient')
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/wex_cards?on_conflict=card_last4`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            Prefer: 'resolution=merge-duplicates',
          },
          body: JSON.stringify([{ card_last4: last4, user_id: session?.user?.id }]),
        }
      )

      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || 'Failed to save card')
      }

      // Success - close dialog
      setShow(false)
    } catch (err: any) {
      setError(err?.message || 'Failed to save card. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // Don't show anything while checking or if dialog shouldn't be shown
  if (checking || !show) {
    return null
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50" />
      
      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900">Add Your Gas Card</h3>
              <p className="mt-1 text-sm text-gray-600">
                Please enter the last 4 digits of your gas card to help us track missing gas receipts and reconcile your transactions.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="card-last4" className="block text-sm font-medium text-gray-700 mb-1">
                Card Last 4 Digits
              </label>
              <input
                id="card-last4"
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={cardInput}
                onChange={(e) => setCardInput(e.target.value)}
                placeholder="1234"
                className="border rounded-lg w-full px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                disabled={saving}
              />
              {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleSkip}
                disabled={saving}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Skip for Now
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {saving ? 'Saving...' : 'Save Card'}
              </button>
            </div>
          </form>

          <p className="text-xs text-gray-500">
            You can add or update your card information later in your profile settings.
          </p>
        </div>
      </div>
    </>
  )
}
