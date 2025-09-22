import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { Session, User } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'

interface AuthContextState {
  session: Session | null
  user: User | null
  loading: boolean
  // password-based auth
  signInWithPassword: (email: string, password: string) => Promise<void>
  signUpWithPassword: (name: string, email: string, password: string) => Promise<void>
  sendPasswordReset: (email: string, redirectTo?: string) => Promise<void>
  updatePassword: (newPassword: string) => Promise<void>
  // legacy helper (not used by default UI anymore)
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
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, sess) => {
      // Handle password recovery links
      if (event === 'PASSWORD_RECOVERY') {
        // session may not be established yet; after user sets new password we will sign them in
      }
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
    signInWithPassword: async (email: string, password: string) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
    },
    signUpWithPassword: async (name: string, email: string, password: string) => {
      const { error } = await supabase.auth.signUp({ email, password, options: { data: { name } } })
      if (error) throw error
    },
    sendPasswordReset: async (email: string, redirectTo?: string) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectTo || `${window.location.origin}/reset-password` })
      if (error) throw error
    },
    updatePassword: async (newPassword: string) => {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
    },
    // still expose OTP for backward-compat
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
