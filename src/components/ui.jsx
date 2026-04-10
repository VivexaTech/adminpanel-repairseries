import { Search, X } from 'lucide-react'
import { cn } from '../utils/helpers'

export function PageHeader({ title, description, actions }) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-[var(--primary)]">
          Repair Series
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-[var(--on-surface)]">{title}</h1>
        <p className="mt-1 text-sm text-[var(--on-surface-variant)]">{description}</p>
      </div>
      {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
    </div>
  )
}

export function Card({ className, children }) {
  return (
    <div
      className={cn(
        'glass rounded-3xl border border-[var(--outline-variant)]/45 p-5 shadow-[0_20px_50px_-24px_rgba(44,47,48,0.25)]',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function Button({
  children,
  className,
  variant = 'primary',
  type = 'button',
  ...props
}) {
  const variants = {
    primary: 'bg-[var(--primary)] text-white hover:bg-[var(--primary-container)]',
    secondary: 'bg-[var(--secondary)] text-[var(--surface-lowest)] hover:opacity-90',
    ghost:
      'border border-[var(--border)] bg-[var(--surface-lowest)] text-[var(--on-surface)] hover:bg-[var(--surface-low)]',
    danger: 'bg-[var(--error)] text-white hover:opacity-90',
  }

  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center rounded-2xl px-4 py-2.5 text-sm font-medium transition',
        variants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export function Badge({ children, tone = 'neutral' }) {
  const tones = {
    neutral: 'bg-[var(--surface-high)] text-[var(--on-surface)]',
    success: 'bg-[color-mix(in_srgb,var(--success)_16%,transparent)] text-[var(--success)]',
    warning: 'bg-[color-mix(in_srgb,var(--warning)_24%,transparent)] text-[var(--secondary)]',
    danger: 'bg-[color-mix(in_srgb,var(--error)_20%,transparent)] text-[var(--error)]',
    info: 'bg-[color-mix(in_srgb,var(--primary)_14%,transparent)] text-[var(--primary)]',
  }

  return (
    <span className={cn('rounded-full px-3 py-1 text-xs font-semibold', tones[tone])}>
      {children}
    </span>
  )
}

export function SearchInput({ value, onChange, placeholder = 'Search...' }) {
  return (
    <label className="flex items-center gap-2 rounded-2xl border border-[var(--outline-variant)] bg-[var(--surface-lowest)] px-4 py-3">
      <Search className="size-4 text-[var(--on-surface-variant)]" />
      <input
        className="w-full bg-transparent text-sm text-[var(--on-surface)] outline-none placeholder:text-[var(--on-surface-variant)]"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  )
}

export function Modal({ open, title, onClose, children, className, bodyClassName }) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[color-mix(in_srgb,var(--on-surface)_45%,transparent)] p-3 sm:p-4">
      <div
        className={cn(
          'glass flex w-full max-w-2xl flex-col rounded-3xl border border-[var(--outline-variant)]/60 p-4 sm:p-6',
          className,
        )}
      >
        <div className="mb-5 flex shrink-0 items-center justify-between">
          <h3 className="text-xl font-semibold text-[var(--on-surface)]">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-[var(--on-surface-variant)] transition hover:bg-[var(--surface-high)]"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className={cn('min-h-0', bodyClassName)}>{children}</div>
      </div>
    </div>
  )
}

export function Field({ label, children }) {
  return (
    <label className="grid gap-2 text-sm font-medium text-[var(--on-surface)]">
      <span>{label}</span>
      {children}
    </label>
  )
}

export function Input(props) {
  return (
    <input
      {...props}
      className={cn(
        'w-full rounded-2xl border border-[var(--outline-variant)] bg-[var(--surface-lowest)] px-4 py-3 text-sm text-[var(--on-surface)] outline-none ring-0 transition placeholder:text-[var(--on-surface-variant)] focus:border-[var(--primary)]',
        props.className,
      )}
    />
  )
}

export function Select(props) {
  return (
    <select
      {...props}
      className={cn(
        'w-full rounded-2xl border border-[var(--outline-variant)] bg-[var(--surface-lowest)] px-4 py-3 text-sm text-[var(--on-surface)] outline-none transition focus:border-[var(--primary)]',
        props.className,
      )}
    />
  )
}

export function Textarea(props) {
  return (
    <textarea
      {...props}
      className={cn(
        'min-h-28 w-full rounded-2xl border border-[var(--outline-variant)] bg-[var(--surface-lowest)] px-4 py-3 text-sm text-[var(--on-surface)] outline-none transition placeholder:text-[var(--on-surface-variant)] focus:border-[var(--primary)]',
        props.className,
      )}
    />
  )
}
