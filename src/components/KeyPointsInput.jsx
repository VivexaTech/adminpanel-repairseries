import { Plus, Trash2 } from 'lucide-react'
import { Button, Input } from './ui'

export function KeyPointsInput({ value, onChange }) {
  const points = Array.isArray(value) ? value : []

  const updatePoint = (index, next) => {
    const updated = points.map((item, idx) => (idx === index ? next : item))
    onChange(updated)
  }

  const addPoint = () => onChange([...points, ''])

  const removePoint = (index) => onChange(points.filter((_, idx) => idx !== index))

  return (
    <div className="space-y-3">
      {points.length ? (
        <div className="space-y-2">
          {points.map((point, index) => (
            <div key={`${index}`} className="flex gap-2">
              <Input
                value={point}
                onChange={(event) => updatePoint(index, event.target.value)}
                placeholder={`Key point ${index + 1}`}
              />
              <Button type="button" variant="ghost" onClick={() => removePoint(index)}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
          Add key points for the service (optional).
        </div>
      )}
      <Button type="button" variant="ghost" onClick={addPoint} className="w-full justify-center">
        <Plus className="mr-2 size-4" />
        Add key point
      </Button>
    </div>
  )
}

