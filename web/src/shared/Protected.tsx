import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from './AuthContext'

export const Protected: React.FC<{ children: React.ReactNode; roles?: Array<'officer'|'manager'> }>
= ({ children, roles }) => {
  const { session } = useAuth()
  const [role, setRole] = React.useState<'officer'|'manager'|null>(null)
  const [loading, setLoading] = React.useState<boolean>(!!roles)

  React.useEffect(() => {
    let cancelled = false
    async function fetchRole() {
      if (!session?.user || !roles) return
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/users?id=eq.${session.user.id}&select=role`, {
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
          Authorization: `Bearer ${session.access_token}`,
        },
      })
      const data = await res.json()
      if (!cancelled) {
        setRole(data?.[0]?.role || null)
        setLoading(false)
      }
    }
    fetchRole()
    return () => { cancelled = true }
  }, [session?.user?.id, roles])

  if (!session) return <Navigate to="/login" replace />
  if (roles) {
    if (loading) return <div className="p-6">Loading...</div>
    if (!role || !roles.includes(role)) return <Navigate to="/" replace />
  }
  return <>{children}</>
}
