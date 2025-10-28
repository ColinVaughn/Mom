import React from 'react'
import { useAuth } from '../shared/AuthContext'

export default function CardManagement() {
  const { session } = useAuth()
  const [cards, setCards] = React.useState<Array<{ card_last4: string; created_at: string }>>([])
  const [cardInput, setCardInput] = React.useState('')
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null)

  const loadCards = React.useCallback(async () => {
    if (!session?.user?.id) return
    
    setLoading(true)
    setError(null)
    
    try {
      const { supabase } = await import('../shared/supabaseClient')
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/wex_cards?select=card_last4,created_at&user_id=eq.${session.user.id}&order=created_at.desc`,
        {
          headers: {
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        }
      )

      if (!res.ok) {
        throw new Error('Failed to load cards')
      }

      const data = await res.json()
      setCards(data || [])
    } catch (err: any) {
      setError(err?.message || 'Failed to load cards')
    } finally {
      setLoading(false)
    }
  }, [session?.user?.id])

  React.useEffect(() => {
    loadCards()
  }, [loadCards])

  const handleAddCard = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccessMessage(null)

    const last4 = cardInput.trim()
    if (!/^[0-9]{4}$/.test(last4)) {
      setError('Please enter a valid 4-digit card number')
      return
    }

    // Check if card already exists
    if (cards.some(c => c.card_last4 === last4)) {
      setError('This card is already in your list')
      return
    }

    try {
      setSaving(true)
      const { supabase } = await import('../shared/supabaseClient')
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/wex_cards`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            Prefer: 'return=representation',
          },
          body: JSON.stringify([{ card_last4: last4, user_id: session?.user?.id }]),
        }
      )

      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || 'Failed to add card')
      }

      setCardInput('')
      setSuccessMessage('Card added successfully!')
      await loadCards()
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (err: any) {
      setError(err?.message || 'Failed to add card')
    } finally {
      setSaving(false)
    }
  }

  const handleRemoveCard = async (last4: string) => {
    if (!confirm(`Remove card ending in ${last4}?`)) return

    setError(null)
    setSuccessMessage(null)

    try {
      const { supabase } = await import('../shared/supabaseClient')
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/wex_cards?card_last4=eq.${last4}&user_id=eq.${session?.user?.id}`,
        {
          method: 'DELETE',
          headers: {
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        }
      )

      if (!res.ok) {
        throw new Error('Failed to remove card')
      }

      setSuccessMessage('Card removed successfully!')
      await loadCards()
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (err: any) {
      setError(err?.message || 'Failed to remove card')
    }
  }

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString()
    } catch {
      return dateStr
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-xl border shadow-sm p-6 space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
            Gas Card Management
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Manage the gas cards associated with your account. These are used to track and reconcile your fuel transactions.
          </p>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
            <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {successMessage && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-start gap-2">
            <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <p className="text-sm text-green-800">{successMessage}</p>
          </div>
        )}

        {/* Add Card Form */}
        <div className="border-t pt-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Add New Card</h3>
          <form onSubmit={handleAddCard} className="flex gap-2">
            <div className="flex-1">
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={cardInput}
                onChange={(e) => setCardInput(e.target.value.replace(/\D/g, ''))}
                placeholder="Enter last 4 digits"
                className="border border-gray-300 rounded-lg w-full px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                disabled={saving}
              />
            </div>
            <button
              type="submit"
              disabled={saving || !cardInput.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center gap-2"
            >
              {saving ? (
                <>
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Adding...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Card
                </>
              )}
            </button>
          </form>
          <p className="mt-2 text-xs text-gray-500">
            Enter only the last 4 digits of your gas card (e.g., 1234)
          </p>
        </div>

        {/* Cards List */}
        <div className="border-t pt-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Your Cards</h3>
          
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <svg className="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
          ) : cards.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed">
              <svg className="w-12 h-12 text-gray-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
              <p className="text-gray-600 font-medium">No cards added yet</p>
              <p className="text-sm text-gray-500 mt-1">Add your first gas card above to get started</p>
            </div>
          ) : (
            <div className="space-y-2">
              {cards.map((card) => (
                <div
                  key={card.card_last4}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                      <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-mono text-lg font-semibold text-gray-900">•••• {card.card_last4}</p>
                      <p className="text-xs text-gray-500">Added {formatDate(card.created_at)}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveCard(card.card_last4)}
                    className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors font-medium"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info Box */}
        <div className="border-t pt-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex gap-3">
              <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <div className="text-sm text-blue-900">
                <p className="font-medium mb-1">Why do we need this?</p>
                <p className="text-blue-800">
                  Your card information helps us automatically match WEX transactions to your receipts and identify missing receipts. 
                  We only store the last 4 digits for security purposes.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
