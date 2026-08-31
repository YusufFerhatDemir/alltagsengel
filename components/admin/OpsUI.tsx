'use client'
// ═══════════════════════════════════════════════════════════════
// Wiederverwendbare UI-Bausteine für das Betriebssystem (/admin)
// ═══════════════════════════════════════════════════════════════
import { ReactNode } from 'react'
import { AMPEL_META, type Ampel, type BudgetSummary, euro } from '@/lib/admin/ops'

export function StatusBadge({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="admin-status"
      style={{ background: color, whiteSpace: 'nowrap' }}
    >
      {label}
    </span>
  )
}

export function AmpelDot({ ampel, withLabel = false }: { ampel: Ampel; withLabel?: boolean }) {
  const m = AMPEL_META[ampel]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
      <span style={{ fontSize: 14, lineHeight: 1 }}>{m.emoji}</span>
      {withLabel && <span style={{ color: m.color, fontWeight: 600, fontSize: 13 }}>{m.label}</span>}
    </span>
  )
}

// Schmaler Fortschrittsbalken für Budget-Auslastung
export function BudgetBar({ summary, compact = false }: { summary: BudgetSummary; compact?: boolean }) {
  const m = AMPEL_META[summary.ampel]
  const width = Math.min(summary.pct, 100)
  return (
    <div style={{ minWidth: compact ? 120 : 180 }}>
      <div style={{
        height: compact ? 6 : 8, borderRadius: 6, background: 'var(--coal3)',
        overflow: 'hidden', position: 'relative',
      }}>
        <div style={{
          width: `${width}%`, height: '100%', background: m.color,
          borderRadius: 6, transition: 'width .3s',
        }} />
      </div>
      {!compact && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 11, color: 'var(--ink4)' }}>
          <span>{euro(summary.used)} verbraucht</span>
          <span style={{ color: summary.remaining < 0 ? '#D04B3B' : 'var(--ink4)' }}>
            {euro(summary.remaining)} übrig
          </span>
        </div>
      )}
    </div>
  )
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>
        {children}
      </td>
    </tr>
  )
}

// Kleines Info-Banner (z. B. Vorjahresübertrag-Warnung)
export function Banner({ tone, children }: { tone: 'warn' | 'danger' | 'info' | 'success'; children: ReactNode }) {
  const tones = {
    warn: { bg: 'rgba(232,160,0,.10)', border: 'rgba(232,160,0,.35)', color: '#E8A000' },
    danger: { bg: 'rgba(208,75,59,.10)', border: 'rgba(208,75,59,.35)', color: '#D04B3B' },
    info: { bg: 'rgba(33,150,243,.10)', border: 'rgba(33,150,243,.35)', color: '#64B5F6' },
    success: { bg: 'rgba(92,184,130,.10)', border: 'rgba(92,184,130,.35)', color: '#5CB882' },
  }[tone]
  // WCAG 4.1.3 (Statusmeldungen): Fehler/Warnungen unterbrechen (assertive),
  // Info/Erfolg werden höflich nachgereicht (polite).
  const dringend = tone === 'danger' || tone === 'warn'
  return (
    <div role={dringend ? 'alert' : 'status'} aria-live={dringend ? 'assertive' : 'polite'} style={{
      background: tones.bg, border: `1px solid ${tones.border}`, borderRadius: 12,
      padding: '12px 16px', margin: '0 0 16px', color: tones.color, fontSize: 14,
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      {/* Kinder in EINEN Flex-Item einpacken. Ohne diese Huelle wird jeder
          Knoten — auch ein blosses <strong> mitten im Satz — zu einem eigenen
          Flex-Item und der Text bricht in Spalten auf. */}
      <div style={{ flex: 1, minWidth: 0, lineHeight: 1.55 }}>{children}</div>
    </div>
  )
}

/** Klartext fuer die Rechte, die eine Seite zusaetzlich braucht. */
const RECHT_BEZEICHNUNG: Record<string, string> = {
  'personal.lesen': 'Personal- und Betreuungskraftdaten',
  'personal.schreiben': 'Personaldaten bearbeiten',
  'abrechnung.lesen': 'Abrechnung und Rechnungen',
  'stammdaten.lesen': 'Klienten-Stammdaten',
  'pflege.lesen': 'Pflegedokumentation',
  'qm.lesen': 'Qualitätsmanagement',
  'tarife.lesen': 'Tarife',
  'bankdaten.lesen': 'Bankverbindungen',
}

/**
 * Sagt der Nutzerin, dass ein TEIL dieser Seite ihr nicht angezeigt wird —
 * und warum.
 *
 * WOFUER (Befund 31.08.2026)
 * Neun Seiten sind fuer eine Rolle freigegeben, zeigen aber Inhalte, die
 * unter einem anderen Recht stehen. Der Dienstplan etwa ist ueber
 * `einsatz.lesen` offen, die Betreuungskraefte darauf stehen unter
 * `personal.lesen` — das die Buchhaltung bewusst nicht hat. Ohne diesen
 * Hinweis sah man eine leere Tabelle, und „nichts da" ist an der Stelle
 * eine Falschaussage: die Daten sind da, sie sind nur nicht fuer diese
 * Rolle bestimmt.
 *
 * Kein Sicherheitsbauteil. Die Sperre steht in RLS und haelt auch ohne
 * diesen Hinweis (nachgewiesen mit `npm run audit:rls-rollen`); hier geht
 * es allein darum, dass die Oberflaeche die Wahrheit sagt.
 *
 * Rendert NICHTS, wenn nichts fehlt — die Seite kann ihn bedenkenlos
 * immer einbinden.
 */
export function TeilweiseUnsichtbar({ fehlendeRechte }: { fehlendeRechte: readonly string[] }) {
  if (fehlendeRechte.length === 0) return null
  const bereiche = fehlendeRechte.map(r => RECHT_BEZEICHNUNG[r] ?? r)
  return (
    <Banner tone="info">
      <strong>Ein Teil dieser Seite bleibt leer.</strong>{' '}
      Ihre Rolle hat keinen Zugriff auf {bereiche.join(' und ')}. Die betroffenen
      Bereiche werden deshalb ohne Inhalt angezeigt — das ist kein Fehler und keine
      fehlende Erfassung. Wenden Sie sich an die Administration, wenn Sie diese
      Angaben für Ihre Arbeit brauchen.
    </Banner>
  )
}

// Such-Eingabefeld im Admin-Stil
export function SearchInput({ value, onChange, placeholder }: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <input
      type="search"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder || 'Suchen…'}
      style={{
        width: '100%', maxWidth: 360, padding: '10px 14px',
        border: '1px solid var(--border)', borderRadius: 10, fontSize: 14,
        background: 'var(--coal2)', color: 'var(--ink)', fontFamily: "'Jost',sans-serif",
        outline: 'none', boxSizing: 'border-box',
      }}
    />
  )
}
