import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './shared/AuthContext'
import NavBar from './components/NavBar'
import OfficerDashboard from './pages/OfficerDashboard'
import ManagerDashboard from './pages/ManagerDashboard'
import { Protected } from './shared/Protected'

function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-xl w-full">
        <h1 className="text-2xl font-semibold mb-4">Gas Receipt Tracking System</h1>
        <p className="text-gray-600">App bootstrapped. Please sign in to continue.</p>
        <a className="mt-4 inline-block text-blue-600 underline" href="/login">Go to Login</a>
      </div>
    </div>
  )
}

function Login() {
  const { signInWithEmailOtp } = useAuth()
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const form = e.target as HTMLFormElement
    const email = (form.elements.namedItem('email') as HTMLInputElement).value
    await signInWithEmailOtp(email)
    alert('Check your email for the magic link.')
  }
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={onSubmit} className="max-w-sm w-full space-y-3">
        <h1 className="text-xl font-semibold">Login</h1>
        <input name="email" type="email" placeholder="Email" required className="border rounded w-full p-2" />
        <button className="bg-blue-600 text-white px-4 py-2 rounded w-full">Send Magic Link</button>
      </form>
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
          <Route path="/officer" element={<Protected><OfficerDashboard /></Protected>} />
          <Route path="/manager" element={<Protected roles={['manager']}><ManagerDashboard /></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}
