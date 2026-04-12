import { LoaderCircle } from 'lucide-react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Toaster } from 'sonner'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AdminLayout } from './components/Layout'
import { useApp } from './context/useApp'
import { AdminUsersPage } from './pages/AdminUsersPage'
import { BookingsPage } from './pages/BookingsPage'
import { CustomersPage } from './pages/CustomersPage'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { ServicesPage } from './pages/ServicesPage'
import { SupportPage } from './pages/SupportPage'
import { TechniciansPage } from './pages/TechniciansPage'
import { canAccessPath, getDefaultRoute } from './utils/rbac'

function ProtectedRoute({ children }) {
  const { session, authLoading } = useApp()
  const { pathname } = useLocation()

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoaderCircle className="size-8 animate-spin text-[var(--primary)]" />
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />
  if (!canAccessPath(session.role, pathname)) {
    return <Navigate to={getDefaultRoute(session.role)} replace />
  }
  return <AdminLayout>{children}</AdminLayout>
}

function RoleAwareRedirect() {
  const { session, authLoading } = useApp()
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoaderCircle className="size-8 animate-spin text-[var(--primary)]" />
      </div>
    )
  }
  if (!session) return <Navigate to="/login" replace />
  return <Navigate to={getDefaultRoute(session.role)} replace />
}

function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/customers"
          element={
            <ProtectedRoute>
              <CustomersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/technicians"
          element={
            <ProtectedRoute>
              <TechniciansPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/bookings"
          element={
            <ProtectedRoute>
              <ErrorBoundary>
                <BookingsPage />
              </ErrorBoundary>
            </ProtectedRoute>
          }
        />
        <Route
          path="/services"
          element={
            <ProtectedRoute>
              <ServicesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/support"
          element={
            <ProtectedRoute>
              <SupportPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/users"
          element={
            <ProtectedRoute>
              <AdminUsersPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<RoleAwareRedirect />} />
      </Routes>
      <Toaster richColors position="top-right" />
    </>
  )
}

export default App
