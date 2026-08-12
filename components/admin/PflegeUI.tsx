'use client'
// ═══════════════════════════════════════════════════════════════
// Formular-Bausteine für die Pflegedokumentation (/admin/pflegedoku)
// Ergänzt OpsUI um Feld-Primitive, die in allen Pflegedoku-Formularen
// identisch gebraucht werden.
// ═══════════════════════════════════════════════════════════════
import type { CSSProperties, ReactNode } from 'react'

export const pflegeInput: CSSProperties = {
  fontSize: 14, color: 'var(--ink)', background: 'var(--coal2)',
  border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px',
  fontFamily: 'inherit', width: '100%',
}

export const pflegePrimaryBtn: CSSProperties = {
  fontSize: 14, color: 'var(--coal)', fontWeight: 600,
  background: 'linear-gradient(135deg,var(--gold2),var(--gold))', border: 'none',
  borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit',
}

export const pflegeSecondaryBtn: CSSProperties = {
  fontSize: 14, color: 'var(--ink)', fontWeight: 600,
  background: 'var(--coal2)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit',
  textDecoration: 'none', display: 'inline-flex', alignItems: 'center',
}

export const pflegeMiniBtn: CSSProperties = {
  fontSize: 12, color: 'var(--ink)', fontWeight: 600,
  background: 'var(--coal2)', border: '1px solid var(--border)',
  borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit',
  marginRight: 6,
}

export function Feld({ label, hint, children, breit = false }: { label: string; hint?: string; children: ReactNode; breit?: boolean }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: breit ? '1 / -1' : undefined }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink4)' }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 11, color: 'var(--ink5)' }}>{hint}</span>}
    </label>
  )
}

export function TextFeld({ label, value, onChange, disabled, placeholder, breit, type = 'text' }: {
  label: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  placeholder?: string
  breit?: boolean
  type?: 'text' | 'date' | 'datetime-local' | 'number'
}) {
  return (
    <Feld label={label} breit={breit}>
      <input
        type={type}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        style={{ ...pflegeInput, opacity: disabled ? 0.6 : 1 }}
      />
    </Feld>
  )
}

export function TextBereich({ label, value, onChange, disabled, rows = 3, placeholder }: {
  label: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  rows?: number
  placeholder?: string
}) {
  return (
    <Feld label={label} breit>
      <textarea
        value={value}
        rows={rows}
        disabled={disabled}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        style={{ ...pflegeInput, resize: 'vertical', opacity: disabled ? 0.6 : 1 }}
      />
    </Feld>
  )
}

export function AuswahlFeld({ label, value, onChange, optionen, disabled, breit }: {
  label: string
  value: string
  onChange: (v: string) => void
  optionen: Record<string, { label: string; color: string }> | Array<[string, string]>
  disabled?: boolean
  breit?: boolean
}) {
  const eintraege: Array<[string, string]> = Array.isArray(optionen)
    ? optionen
    : Object.entries(optionen).map(([k, v]) => [k, v.label])
  return (
    <Feld label={label} breit={breit}>
      <select
        value={value}
        disabled={disabled}
        onChange={e => onChange(e.target.value)}
        style={{ ...pflegeInput, opacity: disabled ? 0.6 : 1 }}
      >
        {eintraege.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
    </Feld>
  )
}

export function SchalterFeld({ label, value, onChange, disabled }: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink3)' }}>
      <input type="checkbox" checked={value} disabled={disabled} onChange={e => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

export function Karte({ titel, aktion, children }: { titel: string; aktion?: ReactNode; children: ReactNode }) {
  return (
    <section style={{
      background: 'var(--coal2)', border: '1px solid var(--border)',
      borderRadius: 12, padding: 16, marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>{titel}</h2>
        {aktion}
      </div>
      {children}
    </section>
  )
}

export function FeldRaster({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
      {children}
    </div>
  )
}

export function Tabs<T extends string>({ tabs, aktiv, onChange }: {
  tabs: Array<{ key: T; label: string }>
  aktiv: T
  onChange: (k: T) => void
}) {
  return (
    <div className="admin-filters" style={{ marginBottom: 16 }}>
      {tabs.map(t => (
        <button
          key={t.key}
          className={`admin-filter-btn ${aktiv === t.key ? 'active' : ''}`}
          onClick={() => onChange(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
