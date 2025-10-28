import React from 'react'
import { useAuth } from '../shared/AuthContext'

export default function MicrosoftButton({
  text = 'Continue with Microsoft',
  loginHint,
  domainHint,
  fullWidth = true,
  className = '',
  onError,
}: {
  text?: string
  loginHint?: string
  domainHint?: string
  fullWidth?: boolean
  className?: string
  onError?: (message: string) => void
}) {
  const { signInWithMicrosoft } = useAuth()
  const [busy, setBusy] = React.useState(false)

  // Reset busy state when window regains focus (user likely closed OAuth popup)
  React.useEffect(() => {
    if (!busy) return

    const handleFocus = () => {
      // Small delay to allow OAuth redirect to complete if successful
      const timer = setTimeout(() => {
        setBusy(false)
      }, 500)
      return () => clearTimeout(timer)
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [busy])

  const onClick = async () => {
    try {
      setBusy(true)
      await signInWithMicrosoft(loginHint, domainHint)
      // Supabase will redirect; if it doesn't, we simply stop the loading state
    } catch (err: any) {
      setBusy(false)
      onError?.(err?.message || 'Microsoft sign-in failed')
    }
  }

  return (
    <button
      type="button"
      aria-label="Sign in with Microsoft"
      onClick={onClick}
      disabled={busy}
      className={`${fullWidth ? 'w-full ' : ''}inline-flex items-center justify-center gap-2 border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed text-gray-800 px-6 py-3 rounded-lg transition-colors ${className}`}
    >
      <MicrosoftLogo />
      <span>{busy ? 'Opening Microsoft…' : text}</span>
    </button>
  )
}

function MicrosoftLogo({ size = 18 }: { size?: number }) {
  // Simple 2x2 squares logo
  const s = size
  const half = Math.floor(size / 2)
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden="true">
      <rect x="0" y="0" width={half - 1} height={half - 1} fill="#F35325" />
      <rect x={half + 1} y="0" width={half - 1} height={half - 1} fill="#81BC06" />
      <rect x="0" y={half + 1} width={half - 1} height={half - 1} fill="#05A6F0" />
      <rect x={half + 1} y={half + 1} width={half - 1} height={half - 1} fill="#FFBA08" />
    </svg>
  )
}
