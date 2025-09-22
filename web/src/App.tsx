import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './shared/AuthContext'
import NavBar from './components/NavBar'
import OfficerDashboard from './pages/OfficerDashboard'
import ManagerDashboard from './pages/ManagerDashboard'
import { Protected } from './shared/Protected'
import Login from './pages/auth/Login'
import Register from './pages/auth/Register'
import ForgotPassword from './pages/auth/ForgotPassword'
import ResetPassword from './pages/auth/ResetPassword'

function Home() {
  const { session } = useAuth()
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-xl w-full">
        <h1 className="text-2xl font-semibold mb-4">Gas Receipt Tracking System</h1>
        {!session ? (
          <>
            <p className="text-gray-600">App bootstrapped. Please sign in to continue.</p>
            <a className="mt-4 inline-block text-blue-600 underline" href="/login">Go to Login</a>
          </>
        ) : (
          <>
            <p className="text-gray-600">You're signed in. Choose a dashboard to continue.</p>
            <div className="mt-4 flex items-center gap-4">
              <a className="text-blue-600 underline" href="/officer">Go to Officer</a>
              <a className="text-blue-600 underline" href="/manager">Go to Manager</a>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function App() {
  const { session, loading } = useAuth()

  if (loading) {
    return <div className="p-6">Loading...</div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />
      <main className="py-4">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={!session ? <Login /> : <Navigate to="/" replace />} />
          <Route path="/register" element={!session ? <Register /> : <Navigate to="/" replace />} />
          <Route path="/forgot-password" element={!session ? <ForgotPassword /> : <Navigate to="/" replace />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/officer" element={<Protected><OfficerDashboard /></Protected>} />
          <Route path="/manager" element={<Protected roles={['manager']}><ManagerDashboard /></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}
