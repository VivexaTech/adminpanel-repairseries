import { Bell, LayoutDashboard, MoonStar, Settings, SunMedium, User, Wrench } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'
import { useApp } from '../context/useApp'
import { cn } from '../utils/helpers'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/customers', label: 'Customers', icon: User },
  { to: '/technicians', label: 'Technicians', icon: Wrench },
  { to: '/bookings', label: 'Bookings', icon: Bell },
  { to: '/services', label: 'Services', icon: Settings },
]

export function AdminLayout({ children }) {
  const { session, theme, setTheme, logout } = useApp()
  const location = useLocation()

  return (
    <div className="min-h-screen p-4 text-[var(--on-surface)] lg:p-6">
      <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[270px_minmax(0,1fr)]">
        <aside className="glass rounded-[28px] border border-[var(--outline-variant)]/50 p-5">
          <div className="mb-8">
            <p className="text-sm font-medium uppercase tracking-[0.26em] text-[var(--primary)]">
              Repair Series
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-[var(--on-surface)]">
              Admin Panel
            </h2>
            <p className="mt-2 text-sm text-[var(--on-surface-variant)]">
              Operations, bookings, technicians, and services in one place.
            </p>
          </div>

          <nav className="space-y-2">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition',
                    isActive
                      ? 'bg-[var(--primary)] text-[var(--surface-lowest)] shadow-lg'
                      : 'text-[var(--on-surface-variant)] hover:bg-[var(--surface-lowest)]',
                  )
                }
              >
                <item.icon className="size-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="mt-8 rounded-3xl bg-[var(--secondary)] p-5 text-[var(--surface-lowest)]">
            <p className="text-sm text-[color-mix(in_srgb,var(--surface-lowest)_80%,transparent)]">Logged in as</p>
            <p className="mt-2 font-semibold">{session?.name}</p>
            <p className="text-sm text-[color-mix(in_srgb,var(--surface-lowest)_80%,transparent)]">{session?.role}</p>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="flex-1 rounded-2xl border border-[var(--outline-variant)] px-4 py-3 text-sm font-medium"
            >
              <span className="flex items-center justify-center gap-2">
                {theme === 'dark' ? <SunMedium className="size-4" /> : <MoonStar className="size-4" />}
                {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
              </span>
            </button>
            <button
              onClick={logout}
              className="rounded-2xl bg-[var(--error)] px-4 py-3 text-sm font-medium text-[var(--surface-lowest)]"
            >
              Logout
            </button>
          </div>
        </aside>

        <main className="space-y-4">
          <div className="glass flex items-center justify-between rounded-[28px] border border-[var(--outline-variant)]/50 px-5 py-4">
            <div>
              <p className="text-sm text-[var(--on-surface-variant)]">Current section</p>
              <h3 className="text-lg font-semibold capitalize text-[var(--on-surface)]">
                {location.pathname === '/' ? 'Dashboard' : location.pathname.slice(1)}
              </h3>
            </div>
            <div className="rounded-2xl border border-[var(--outline-variant)] px-4 py-2 text-sm">
              {session?.email}
            </div>
          </div>

          {children}
        </main>
      </div>
    </div>
  )
}
