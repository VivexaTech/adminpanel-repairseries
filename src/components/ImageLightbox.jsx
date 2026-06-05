import { Download, ZoomIn, ZoomOut, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { cn } from '../utils/helpers'

export function ImageLightbox({ open, url, alt = '', title, onClose }) {
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    if (open) setZoom(1)
  }, [open, url])

  const onDownload = useCallback(() => {
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    a.download = String(title || 'image').replace(/\s+/g, '-')
    a.click()
  }, [url, title])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !url) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-[color-mix(in_srgb,var(--on-surface)_70%,transparent)] backdrop-blur-sm"
        aria-label="Close preview"
        onClick={onClose}
      />
      <div className="relative z-[101] flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-[var(--outline-variant)] bg-[var(--surface-lowest)] shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--outline-variant)] px-4 py-3">
          <p className="min-w-0 truncate text-sm font-semibold text-[var(--on-surface)]">{title || alt || 'Preview'}</p>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-xl border border-[var(--outline-variant)] p-2 text-[var(--on-surface)] transition hover:bg-[var(--surface-high)]"
              onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))}
              aria-label="Zoom in"
            >
              <ZoomIn className="size-4" />
            </button>
            <button
              type="button"
              className="rounded-xl border border-[var(--outline-variant)] p-2 text-[var(--on-surface)] transition hover:bg-[var(--surface-high)]"
              onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}
              aria-label="Zoom out"
            >
              <ZoomOut className="size-4" />
            </button>
            <button
              type="button"
              className="rounded-xl border border-[var(--outline-variant)] p-2 text-[var(--on-surface)] transition hover:bg-[var(--surface-high)]"
              onClick={onDownload}
              aria-label="Download"
            >
              <Download className="size-4" />
            </button>
            <button
              type="button"
              className="rounded-xl border border-[var(--outline-variant)] p-2 text-[var(--on-surface-variant)] transition hover:bg-[var(--surface-high)]"
              onClick={onClose}
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
        <div
          className="min-h-0 flex-1 overflow-auto bg-black/80 p-4 sm:p-8"
          onWheel={(e) => {
            if (!e.ctrlKey && !e.metaKey) return
            e.preventDefault()
            const delta = e.deltaY > 0 ? -0.1 : 0.1
            setZoom((z) => Math.min(4, Math.max(0.4, +(z + delta).toFixed(2))))
          }}
        >
          <div className="flex min-h-[50vh] items-center justify-center">
            <img
              src={url}
              alt={alt || ''}
              className={cn('max-w-none rounded-xl shadow-lg')}
              style={{ transform: `scale(${zoom})`, transition: 'transform 0.15s ease-out' }}
            />
          </div>
          <p className="mt-6 text-center text-xs text-[var(--on-surface-variant)]">
            Scroll with Ctrl / ⌘ + wheel to zoom. Pinch on trackpad supported on some browsers.
          </p>
        </div>
      </div>
    </div>
  )
}
