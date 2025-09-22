import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { Session, User } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'

interface AuthContextState {
  session: Session | null
  user: User | null
  loading: boolean
  signInWithEmailOtp: (email: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextState | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession()
      setSession(data.session)
      setLoading(false)
    }
    init()
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess)
    })
    return () => {
      sub.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextState>(() => ({
    session,
    user: session?.user ?? null,
    loading,
    signInWithEmailOtp: async (email: string) => {
      await supabase.auth.signInWithOtp({ email })
    },
    signOut: async () => {
      await supabase.auth.signOut()
    },
  }), [session, loading])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
