import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { AuthProvider } from './shared/AuthContext'
import { flushPending, attachOnlineFlush } from './shared/offlineQueue'
import { supabase } from './shared/supabaseClient'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)

// PWA: register service worker (in production builds)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

// Offline queue: flush on startup and when online
async function getToken(): Promise<string | undefined> {
  try {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token
  } catch { return undefined }
}

flushPending(getToken)
attachOnlineFlush(getToken)
