import { useEffect, useState } from 'react'
import { Clock3, Route, Timer, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Card, Field, Input, PageHeader, Select } from '../components/ui'
import {
  DEFAULT_SCHEDULING_SETTINGS,
  saveSchedulingSettings,
  subscribeSchedulingSettings,
} from '../services/schedulingSettings'

export function SchedulingSettingsPage() {
  const [settings, setSettings] = useState(DEFAULT_SCHEDULING_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const unsubscribe = subscribeSchedulingSettings(
      (next) => {
        setSettings(next)
        setLoading(false)
      },
      () => {
        setSettings(DEFAULT_SCHEDULING_SETTINGS)
        setLoading(false)
        toast.error('Could not load scheduling settings.')
      },
    )
    return () => unsubscribe?.()
  }, [])

  const update = (key, value) =>
    setSettings((current) => ({ ...current, [key]: Number(value) }))

  const updateHour = (key, value) =>
    setSettings((current) => ({
      ...current,
      workingHours: { ...current.workingHours, [key]: Number(value) },
    }))

  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    try {
      const saved = await saveSchedulingSettings(settings)
      setSettings(saved)
      toast.success('Scheduling settings saved.')
    } catch (error) {
      toast.error(error?.message || 'Could not save scheduling settings.')
    } finally {
      setSaving(false)
    }
  }

  const fields = [
    {
      icon: Route,
      title: 'Travel buffer',
      description: 'Reserved after service duration before another booking.',
    },
    {
      icon: Timer,
      title: 'Slot interval',
      description: 'Granularity for future customer-facing booking slots.',
    },
    {
      icon: Users,
      title: 'Daily capacity',
      description: 'Maximum bookings assigned to one technician per day.',
    },
    {
      icon: Clock3,
      title: 'Working hours',
      description: 'Bookings and buffers must finish inside this window.',
    },
  ]

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Scheduling Settings"
        description="Duration-aware allocation uses each service's duration plus this travel buffer. Changes affect new bookings only."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {fields.map((item) => (
          <Card key={item.title} className="p-4">
            <item.icon className="size-5 text-[var(--primary)]" />
            <h3 className="mt-3 text-sm font-semibold text-[var(--on-surface)]">{item.title}</h3>
            <p className="mt-1 text-xs leading-5 text-[var(--on-surface-variant)]">
              {item.description}
            </p>
          </Card>
        ))}
      </div>

      <Card className="p-5 sm:p-6">
        <form className="grid gap-5 sm:grid-cols-2" onSubmit={submit}>
          <Field label="Travel / buffer time (minutes)">
            <Input
              type="number"
              min="0"
              max="240"
              step="5"
              value={settings.travelBufferMinutes}
              disabled={loading || saving}
              onChange={(event) => update('travelBufferMinutes', event.target.value)}
            />
          </Field>

          <Field label="Slot interval">
            <Select
              value={settings.slotIntervalMinutes}
              disabled={loading || saving}
              onChange={(event) => update('slotIntervalMinutes', event.target.value)}
            >
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={60}>60 minutes</option>
            </Select>
          </Field>

          <Field label="Maximum daily bookings per technician">
            <Input
              type="number"
              min="1"
              max="30"
              value={settings.maximumDailyBookings}
              disabled={loading || saving}
              onChange={(event) => update('maximumDailyBookings', event.target.value)}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Work starts">
              <Input
                type="number"
                min="0"
                max="23"
                value={settings.workingHours.startHour}
                disabled={loading || saving}
                onChange={(event) => updateHour('startHour', event.target.value)}
              />
            </Field>
            <Field label="Work ends">
              <Input
                type="number"
                min="1"
                max="24"
                value={settings.workingHours.endHour}
                disabled={loading || saving}
                onChange={(event) => updateHour('endHour', event.target.value)}
              />
            </Field>
          </div>

          <div className="sm:col-span-2 rounded-2xl bg-[var(--surface-low)] p-4 text-sm text-[var(--on-surface-variant)]">
            Service duration remains configurable per service in <strong>Services</strong>. Allocation
            rounds any partial overlap up to the occupied slot and locks all affected technician slots
            atomically.
          </div>

          <div className="sm:col-span-2 flex justify-end">
            <Button type="submit" disabled={loading || saving}>
              {saving ? 'Saving…' : 'Save scheduling settings'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
