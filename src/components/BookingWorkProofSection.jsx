import { useState } from 'react'
import { ImageLightbox } from './ImageLightbox'
import { cn, formatDateTime } from '../utils/helpers'

function workPhotoUrl(photo) {
  if (!photo || typeof photo !== 'object') return ''
  return String(photo.url || photo.downloadUrl || '').trim()
}

function uploadedAtDisplay(photo) {
  if (!photo || typeof photo !== 'object') return '—'
  const raw = photo.uploadedAt
  if (!raw) return '—'
  try {
    const d = typeof raw?.toDate === 'function' ? raw.toDate() : new Date(raw)
    if (Number.isNaN(d.getTime())) return '—'
    return formatDateTime(d)
  } catch {
    return '—'
  }
}

function PhotoTile({ title, subtitle, url, onPreview }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{title}</p>
      {url ? (
        <button
          type="button"
          onClick={() => onPreview(url, title)}
          className={cn(
            'group relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-900/40 text-left dark:border-slate-600',
            'shadow-md ring-offset-2 ring-offset-slate-900 hover:ring-2 hover:ring-sky-500/40',
          )}
        >
          <img src={url} alt={title} className="aspect-[4/3] w-full object-cover" />
          <span className="absolute bottom-2 left-2 rounded-lg bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur">
            Preview · tap to enlarge
          </span>
        </button>
      ) : (
        <div className="flex aspect-[4/3] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 text-center dark:border-slate-600 dark:bg-slate-900/30">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Photo not uploaded</p>
        </div>
      )}
      {subtitle ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
      ) : null}
    </div>
  )
}

export function BookingWorkProofSection({ booking }) {
  const [lightbox, setLightbox] = useState({ open: false, url: '', title: '' })

  if (!booking) return null

  const start = booking.startWorkPhoto
  const complete = booking.completionPhoto
  const startUrl = workPhotoUrl(start)
  const completeUrl = workPhotoUrl(complete)

  return (
    <>
      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/40">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Work proof
        </h4>
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <PhotoTile
            title="Start booking photo"
            subtitle={startUrl ? `Uploaded: ${uploadedAtDisplay(start)}` : undefined}
            url={startUrl}
            onPreview={(url, title) => setLightbox({ open: true, url, title })}
          />
          <PhotoTile
            title="Completion photo"
            subtitle={completeUrl ? `Uploaded: ${uploadedAtDisplay(complete)}` : undefined}
            url={completeUrl}
            onPreview={(url, title) => setLightbox({ open: true, url, title })}
          />
        </div>

        <div className="mt-6 space-y-2 rounded-xl border border-slate-200/80 bg-white/60 px-4 py-3 text-sm dark:border-slate-600 dark:bg-slate-900/50">
          <p className="text-slate-800 dark:text-slate-100">
            <span className="text-slate-500 dark:text-slate-400">Booking started at (photo): </span>
            {uploadedAtDisplay(start)}
          </p>
          <p className="text-slate-800 dark:text-slate-100">
            <span className="text-slate-500 dark:text-slate-400">Booking completed at (photo): </span>
            {uploadedAtDisplay(complete)}
          </p>
        </div>
      </div>

      <ImageLightbox
        open={lightbox.open}
        url={lightbox.url}
        title={lightbox.title}
        onClose={() => setLightbox((s) => ({ ...s, open: false }))}
      />
    </>
  )
}
