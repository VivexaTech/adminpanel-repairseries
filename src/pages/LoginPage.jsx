import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { useApp } from '../context/useApp'
import { Button, Card, Field, Input } from '../components/ui'
import { isFirebaseConfigured } from '../firebase/config'

export function LoginPage() {
  const { session, login } = useApp()
  const [form, setForm] = useState({
    email: 'admin@repairseries.com',
    password: 'Admin@123',
  })
  const [loading, setLoading] = useState(false)

  if (session) return <Navigate to="/" replace />

  const handleSubmit = async (event) => {
    event.preventDefault()
    try {
      setLoading(true)
      await login(form)
    } catch (error) {
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="grid w-full max-w-6xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="hidden overflow-hidden bg-slate-950 text-white lg:block">
          <div className="flex h-full flex-col justify-between rounded-[22px] bg-gradient-to-br from-blue-600 via-slate-950 to-slate-950 p-8">
            <div>
              <p className="text-sm uppercase tracking-[0.28em] text-blue-100">Repair Series</p>
              <h1 className="mt-5 max-w-md text-5xl font-semibold leading-tight">
                Modern service operations for a fast-moving repair team.
              </h1>
              <p className="mt-5 max-w-xl text-sm text-slate-300">
                Monitor bookings, assign technicians, manage services, and keep your admin workflow production-ready.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {['Realtime insights', 'Protected access', 'Scalable service catalog'].map((item) => (
                <div key={item} className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card className="mx-auto w-full max-w-xl p-8">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-2xl bg-blue-600/10 p-3 text-blue-600">
              <ShieldCheck className="size-6" />
            </div>
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Admin authentication</p>
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
                Sign in to dashboard
              </h2>
            </div>
          </div>

          {!isFirebaseConfigured ? (
            <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
              Firebase env variables are missing. Add Firebase keys in `.env.local` and restart `npm run dev`.
            </div>
          ) : null}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <Field label="Email">
              <Input
                type="email"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              />
            </Field>
            <Field label="Password">
              <Input
                type="password"
                value={form.password}
                onChange={(event) =>
                  setForm((current) => ({ ...current, password: event.target.value }))
                }
              />
            </Field>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Signing in...' : 'Continue'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  )
}
