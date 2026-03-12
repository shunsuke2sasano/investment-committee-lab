import React from 'react'

// ═══════════════════════════════════════════════════════════════════════════
// DESIGN TOKENS
// ═══════════════════════════════════════════════════════════════════════════
export const T = {
  bg:      '#060A0E',
  surface: '#0A1520',
  border:  '#1E3A5F',
  borderDim:'#0F1923',
  text:    '#C8D8E8',
  textDim: '#4A6A8A',
  textMid: '#2A4A6A',
  cyan:    '#00D4FF',
  green:   '#34D399',
  yellow:  '#FCD34D',
  red:     '#F87171',
  orange:  '#FB923C',
  amber:   '#FBBF24',
  purple:  '#A78BFA',
  pink:    '#E879F9',
  slate:   '#94A3B8',
  sky:     '#38BDF8',
} as const

export const VERDICT_COLOR = {
  BUY:   T.green,
  WATCH: T.yellow,
  PASS:  T.red,
} as const

export const STATUS_COLOR = {
  intact:  T.green,
  warning: T.yellow,
  broken:  T.red,
  draft:   T.textDim,
  active:  T.cyan,
  archived:T.slate,
} as const

// ═══════════════════════════════════════════════════════════════════════════
// STYLE HELPERS
// ═══════════════════════════════════════════════════════════════════════════
export const css = {
  input: {
    width: '100%', background: '#080D12', border: `1px solid ${T.borderDim}`,
    color: T.text, fontFamily: "'Courier New', monospace", fontSize: 13,
    outline: 'none', padding: '9px 12px', boxSizing: 'border-box' as const,
    transition: 'border 0.15s',
  } as React.CSSProperties,

  label: {
    color: T.textMid, fontSize: 9, letterSpacing: 3,
    textTransform: 'uppercase' as const, display: 'block', marginBottom: 6,
    fontFamily: "'Courier New', monospace",
  } as React.CSSProperties,

  card: {
    border: `1px solid ${T.borderDim}`, background: '#080D12',
    padding: '20px 24px', marginBottom: 16,
  } as React.CSSProperties,
}

// ═══════════════════════════════════════════════════════════════════════════
// BASE COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

// ── Input ─────────────────────────────────────────────────────────────────
interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label?: string
  error?: string
  accent?: string
  onChange?: (value: string) => void
}
export function Input({ label, error, accent = T.cyan, onChange, ...props }: InputProps) {
  return (
    <div style={{ marginBottom: 14 }}>
      {label && <label style={css.label}>{label}</label>}
      <input
        {...props}
        onChange={e => onChange?.(e.target.value)}
        style={{
          ...css.input,
          borderColor: error ? T.red : T.borderDim,
        }}
        onFocus={e => { e.target.style.borderColor = accent }}
        onBlur={e => { e.target.style.borderColor = error ? T.red : T.borderDim }}
      />
      {error && <div style={{ color: T.red, fontSize: 10, marginTop: 4 }}>{error}</div>}
    </div>
  )
}

// ── Textarea ──────────────────────────────────────────────────────────────
interface TextareaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'> {
  label?: string
  error?: string
  accent?: string
  onChange?: (value: string) => void
}
export function Textarea({ label, error, accent = T.cyan, onChange, ...props }: TextareaProps) {
  return (
    <div style={{ marginBottom: 14 }}>
      {label && <label style={css.label}>{label}</label>}
      <textarea
        {...props}
        onChange={e => onChange?.(e.target.value)}
        style={{
          ...css.input,
          resize: 'vertical', lineHeight: 1.7,
          borderColor: error ? T.red : T.borderDim,
          minHeight: 80,
        }}
        onFocus={e => { e.target.style.borderColor = accent }}
        onBlur={e => { e.target.style.borderColor = error ? T.red : T.borderDim }}
      />
      {error && <div style={{ color: T.red, fontSize: 10, marginTop: 4 }}>{error}</div>}
    </div>
  )
}

// ── Select ────────────────────────────────────────────────────────────────
interface SelectProps {
  label?: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  accent?: string
}
export function Select({ label, value, onChange, options, accent = T.cyan }: SelectProps) {
  return (
    <div style={{ marginBottom: 14 }}>
      {label && <label style={css.label}>{label}</label>}
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ ...css.input, cursor: 'pointer' }}
        onFocus={e => { (e.target as HTMLElement).style.borderColor = accent }}
        onBlur={e => { (e.target as HTMLElement).style.borderColor = T.borderDim }}
      >
        {options.map(o => <option key={o.value} value={o.value} style={{ background: '#0A1520' }}>{o.label}</option>)}
      </select>
    </div>
  )
}

// ── Button ────────────────────────────────────────────────────────────────
interface ButtonProps {
  children: React.ReactNode
  onClick?: () => void
  variant?: 'primary' | 'ghost' | 'danger'
  accent?: string
  disabled?: boolean
  loading?: boolean
  size?: 'sm' | 'md'
  type?: 'button' | 'submit'
  fullWidth?: boolean
}
export function Button({
  children, onClick, variant = 'primary', accent = T.cyan,
  disabled, loading, size = 'md', type = 'button', fullWidth,
}: ButtonProps) {
  const col = variant === 'danger' ? T.red : accent
  const pad = size === 'sm' ? '6px 16px' : '10px 28px'
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        background: variant === 'primary' ? `rgba(${hexRgb(col)},0.1)` : 'transparent',
        border: `1px solid ${disabled ? T.borderDim : col}`,
        color: disabled ? T.textDim : col,
        padding: pad, cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: "'Courier New', monospace", fontSize: 10, letterSpacing: 3,
        transition: 'all 0.15s', display: 'inline-flex', alignItems: 'center',
        gap: 8, whiteSpace: 'nowrap',
        width: fullWidth ? '100%' : undefined,
        justifyContent: fullWidth ? 'center' : undefined,
      }}
    >
      {loading && <Spinner color={col} />}
      {children}
    </button>
  )
}

// ── Spinner ───────────────────────────────────────────────────────────────
function Spinner({ color = T.cyan }: { color?: string }) {
  const [f, setF] = React.useState(0)
  React.useEffect(() => {
    const t = setInterval(() => setF(p => (p + 1) % 4), 200)
    return () => clearInterval(t)
  }, [])
  return <span style={{ color }}>{'⠋⠙⠹⠸'[f]}</span>
}

// ── Section header ────────────────────────────────────────────────────────
export function SectionHeader({ label, color = T.cyan }: { label: string; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, marginTop: 8 }}>
      <div style={{ width: 3, height: 3, background: color }} />
      <div style={{ color: T.textDim, fontSize: 9, letterSpacing: 5, fontFamily: "'Courier New',monospace" }}>{label}</div>
      <div style={{ flex: 1, height: 1, background: T.borderDim }} />
    </div>
  )
}

// ── Score badge ───────────────────────────────────────────────────────────
export function ScoreBadge({ score, max = 5 }: { score: number; max?: number }) {
  const col = score >= 4 ? T.green : score >= 3 ? T.yellow : T.red
  return (
    <span style={{
      color: col, fontWeight: 700, fontSize: 14,
      fontFamily: "'Courier New',monospace",
    }}>{score}<span style={{ color: T.textDim, fontSize: 10 }}>/{max}</span></span>
  )
}

// ── Verdict badge ─────────────────────────────────────────────────────────
export function VerdictBadge({ verdict }: { verdict: 'BUY' | 'WATCH' | 'PASS' }) {
  const col = VERDICT_COLOR[verdict]
  return (
    <span style={{
      color: col, border: `1px solid ${col}`, padding: '3px 12px',
      fontSize: 11, fontWeight: 700, letterSpacing: 3,
      fontFamily: "'Courier New',monospace",
      background: `rgba(${hexRgb(col)},0.08)`,
    }}>{verdict}</span>
  )
}

// ── Toast ─────────────────────────────────────────────────────────────────
export function Toast({ message, type }: { message: string; type: 'success' | 'error' | 'info' }) {
  const col = type === 'success' ? T.green : type === 'error' ? T.red : T.cyan
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      border: `1px solid ${col}`, background: T.surface, color: T.text,
      padding: '12px 20px', fontFamily: "'Courier New',monospace", fontSize: 12,
      letterSpacing: 1, boxShadow: `0 0 20px rgba(${hexRgb(col)},0.2)`,
    }}>
      <span style={{ color: col, marginRight: 10 }}>
        {type === 'success' ? '✓' : type === 'error' ? '✗' : '●'}
      </span>
      {message}
    </div>
  )
}

// ── Numeric input with validation ──────────────────────────────────────────
interface NumericInputProps {
  label: string
  value: number | null
  onChange: (v: number | null) => void
  unit?: string
  placeholder?: string
  accent?: string
}
export function NumericInput({ label, value, onChange, unit, placeholder, accent = T.cyan }: NumericInputProps) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={css.label}>{label}{unit && <span style={{ color: T.textMid }}> ({unit})</span>}</label>
      <input
        type="number"
        value={value ?? ''}
        placeholder={placeholder ?? '—'}
        onChange={e => {
          const v = e.target.value
          onChange(v === '' ? null : parseFloat(v))
        }}
        style={css.input}
        onFocus={e => { e.target.style.borderColor = accent }}
        onBlur={e => { e.target.style.borderColor = T.borderDim }}
      />
    </div>
  )
}

// ── Helper ────────────────────────────────────────────────────────────────
export function hexRgb(hex: string): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `${r},${g},${b}`
}

// ── Page layout ───────────────────────────────────────────────────────────
export function PageLayout({ children, title, subtitle, actions }: {
  children: React.ReactNode
  title: string
  subtitle?: string
  actions?: React.ReactNode
}) {
  return (
    <div style={{ padding: '28px 36px', maxWidth: 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <div style={{ color: T.textDim, fontSize: 9, letterSpacing: 5, marginBottom: 4, fontFamily: "'Courier New',monospace" }}>{subtitle}</div>
          <h1 style={{ color: T.text, fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: 2, fontFamily: "'Courier New',monospace" }}>{title}</h1>
        </div>
        {actions && <div style={{ display: 'flex', gap: 10 }}>{actions}</div>}
      </div>
      {children}
    </div>
  )
}

// ── Divider ───────────────────────────────────────────────────────────────
export function Divider() {
  return <div style={{ height: 1, background: T.borderDim, margin: '20px 0' }} />
}

// ── InfoRow ───────────────────────────────────────────────────────────────
export function InfoRow({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
      <div style={{ color: T.textMid, fontSize: 9, letterSpacing: 2, minWidth: 120, fontFamily: "'Courier New',monospace", paddingTop: 2 }}>{label}</div>
      <div style={{ color: color ?? T.text, fontSize: 12 }}>{value}</div>
    </div>
  )
}
