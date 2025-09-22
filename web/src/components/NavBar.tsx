import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../shared/AuthContext'

export default function NavBar() {
  const { session, signOut } = useAuth()
  const loc = useLocation()

  return (
    <header className="border-b bg-white">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/" className="font-semibold">GRTS</Link>
          {session && (
            <nav className="flex items-center gap-3 text-sm">
              <Link className={linkCls(loc.pathname === '/officer')} to="/officer">Officer</Link>
              <Link className={linkCls(loc.pathname === '/manager')} to="/manager">Manager</Link>
            </nav>
          )}
        </div>
        <div className="text-sm">
          {!session ? (
            <Link to="/login" className="text-blue-600">Login</Link>
          ) : (
            <button onClick={signOut} className="text-red-600">Sign Out</button>
          )}
        </div>
      </div>
    </header>
  )
}

function linkCls(active: boolean) {
  return `px-2 py-1 rounded ${active ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'}`
}
