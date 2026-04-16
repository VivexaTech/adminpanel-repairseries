import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useMemo } from 'react'
import { Card, PageHeader, Badge } from '../components/ui'
import { useApp } from '../context/useApp'
import { compactNumber, currency, formatDateTime, getBookingAmount, isBookingCompleted } from '../utils/helpers'

export function DashboardPage() {
  const { bookings, customers, metrics, loading } = useApp()

  const chartData = useMemo(() => {
    const now = new Date()
    const months = Array.from({ length: 6 }).map((_, idx) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - idx), 1)
      return {
        key: `${d.getFullYear()}-${d.getMonth()}`,
        month: d.toLocaleString('en-US', { month: 'short' }),
        revenue: 0,
      }
    })

    bookings
      .filter((b) => isBookingCompleted(b))
      .forEach((b) => {
        const raw = b.scheduledAt?.toDate?.() || b.dateTime || b.scheduledAt
        if (!raw) return
        const d = new Date(raw)
        const key = `${d.getFullYear()}-${d.getMonth()}`
        const idx = months.findIndex((m) => m.key === key)
        if (idx >= 0) months[idx].revenue += getBookingAmount(b)
      })

    return months.map(({ month, revenue }) => ({ month, revenue }))
  }, [bookings])

  const cards = [
    { label: 'Total Orders Completed', value: compactNumber(metrics.totalOrdersCompleted) },
    { label: 'Pending Bookings', value: compactNumber(metrics.pendingBookings) },
    { label: 'Total Earnings', value: currency(metrics.totalEarnings) },
    { label: "Today's Bookings", value: compactNumber(metrics.todaysBookings) },
  ]

  const recentBookings = [...bookings]
    .sort((a, b) => {
      const aDate = a.scheduledAt?.toDate?.() || a.dateTime || a.scheduledAt || 0
      const bDate = b.scheduledAt?.toDate?.() || b.dateTime || b.scheduledAt || 0
      return new Date(bDate) - new Date(aDate)
    })
    .slice(0, 5)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Operations Dashboard"
        description={`Track service health across ${customers.length} customers and field operations in realtime.`}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label}>
            <p className="text-sm text-slate-500 dark:text-slate-400">{card.label}</p>
            <p className="mt-4 text-3xl font-semibold text-slate-900 dark:text-white">{card.value}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Monthly Revenue</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Billing trend and earnings growth
              </p>
            </div>
            <Badge tone="info">Live view</Badge>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#33415520" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="revenue" fill="#2563eb" radius={[12, 12, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Recent Bookings</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Latest booking activity and statuses
            </p>
          </div>
          <div className="space-y-3">
            {loading.bookings ? (
              <div className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                Loading bookings...
              </div>
            ) : null}
            {recentBookings.map((booking) => (
              <div
                key={booking.id}
                className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">{booking.serviceName}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {booking.id} • {formatDateTime(booking.scheduledAt?.toDate?.() || booking.dateTime || booking.scheduledAt)}
                    </p>
                  </div>
                  <Badge
                    tone={
                      booking.status === 'Completed'
                        ? 'success'
                        : booking.status === 'Assigned' || booking.status === 'Started'
                          ? 'info'
                          : 'warning'
                    }
                  >
                    {booking.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
