import { LoaderCircle } from 'lucide-react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Toaster } from 'sonner'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AdminLayout } from './components/Layout'
import { useApp } from './context/useApp'
import { AdminUsersPage } from './pages/AdminUsersPage'
import { AdditionalServicesPage } from './pages/AdditionalServicesPage'
import { BookingsPage } from './pages/BookingsPage'
import { ComingSoonServicesPage } from './pages/ComingSoonServicesPage'
import { CustomersPage } from './pages/CustomersPage'
import { DashboardPage } from './pages/DashboardPage'
import { ImportServicesPage } from './pages/ImportServicesPage'
import { LoginPage } from './pages/LoginPage'
import { PlatformSettingsPage } from './pages/PlatformSettingsPage'
import { ServicesPage } from './pages/ServicesPage'
import { TechniciansPage } from './pages/TechniciansPage'
import { OffersPage } from './pages/OffersPage'
import { BannersPage } from './pages/BannersPage'
import { HomeSectionsPage } from './pages/HomeSectionsPage'
import { PeakHoursPage } from './pages/PeakHoursPage'
import { LocationHistoryPage } from './pages/LocationHistoryPage'
import { PausedJobsPage } from './pages/PausedJobsPage'
import { SchedulingSettingsPage } from './pages/SchedulingSettingsPage'
import { CouponsPage } from './pages/CouponsPage'
import { RevisitsPage } from './pages/RevisitsPage'
import { InvoicesPage } from './pages/InvoicesPage'
import { InvoiceSettingsPage } from './pages/InvoiceSettingsPage'
import { NotificationsPage } from './pages/NotificationsPage'
import { FinanceReportsPage } from './pages/FinanceReportsPage'
import { ServiceAreasPage } from './pages/ServiceAreasPage'
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
          path="/coming-soon-services"
          element={
            <ProtectedRoute>
              <ComingSoonServicesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/additional-services"
          element={
            <ProtectedRoute>
              <AdditionalServicesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/import-services"
          element={
            <ProtectedRoute>
              <ImportServicesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/platform-settings"
          element={
            <ProtectedRoute>
              <PlatformSettingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/banners"
          element={
            <ProtectedRoute>
              <BannersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/home-sections"
          element={
            <ProtectedRoute>
              <HomeSectionsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/offers"
          element={
            <ProtectedRoute>
              <OffersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/peak-hours"
          element={
            <ProtectedRoute>
              <PeakHoursPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/location-history"
          element={
            <ProtectedRoute>
              <LocationHistoryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/paused-jobs"
          element={
            <ProtectedRoute>
              <PausedJobsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/scheduling-settings"
          element={
            <ProtectedRoute>
              <SchedulingSettingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/coupons"
          element={
            <ProtectedRoute>
              <CouponsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/notifications"
          element={
            <ProtectedRoute>
              <NotificationsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/finance-reports"
          element={
            <ProtectedRoute>
              <FinanceReportsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/service-areas"
          element={
            <ProtectedRoute>
              <ServiceAreasPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/revisits"
          element={
            <ProtectedRoute>
              <RevisitsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/invoices"
          element={
            <ProtectedRoute>
              <InvoicesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/invoice-settings"
          element={
            <ProtectedRoute>
              <InvoiceSettingsPage />
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
