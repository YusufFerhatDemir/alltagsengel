/**
 * Business-Go-Live-Dashboard — /admin/go-live
 *
 * Serverseitig gerendert: die Prüfungen lesen Produktionsdaten und
 * Env-Variablen, die im Browser weder verfügbar noch dorthin gehören.
 * Der Admin-Guard läuft deshalb hier zusätzlich zum Client-Guard des
 * Admin-Layouts — ein Client-Guard schützt kein Server-Rendering.
 */

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveOrgId } from '@/lib/organizations/server'
import { ermittleGoLiveStatus, type GoLiveBereich, type GoLiveStatus } from '@/lib/go-live/status'

export const dynamic = 'force-dynamic'

const GOLD = '#C9963C'

const STATUS_STIL: Record<GoLiveStatus, { label: string; farbe: string; hintergrund: string; rand: string }> = {
  ready:    { label: 'READY',    farbe: '#166534', hintergrund: '#dcfce7', rand: '#22c55e' },
  external: { label: 'EXTERNAL', farbe: '#92400e', hintergrund: '#fef3c7', rand: '#f59e0b' },
  blocked:  { label: 'BLOCKED',  farbe: '#991b1b', hintergrund: '#fee2e2', rand: '#ef4444' },
}

export const metadata = { title: 'Go-Live-Status' }

export default async function GoLivePage() {
  // ── Admin-Guard (serverseitig) ──
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?redirectTo=/admin/go-live')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
    redirect('/auth/login?error=admin_required')
  }

  const organizationId = await getActiveOrgId()
  const ergebnis = await ermittleGoLiveStatus(createAdminClient(), organizationId)
  const { zusammenfassung: z } = ergebnis

  return (
    <div className="admin-page">
      <div style={{ borderLeft: `4px solid ${GOLD}`, paddingLeft: 14, marginBottom: 8 }}>
        <h1 style={{ margin: 0 }}>Go-Live-Status</h1>
        <p style={{ color: 'var(--muted, #6b7280)', margin: '4px 0 0', fontSize: 14 }}>
          {ergebnis.organisation ?? 'Organisation'} · Stand {ergebnis.stichtag} · alle Werte live gemessen
        </p>
      </div>

      {/* ── Zusammenfassung ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, margin: '20px 0' }}>
        <Kachel label="Heute nutzbar" wert={z.ready} status="ready" />
        <Kachel label="Wartet auf Externe" wert={z.external} status="external" />
        <Kachel label="Intern zu lösen" wert={z.blocked} status="blocked" />
        <Kachel label="Bereiche gesamt" wert={z.gesamt} />
      </div>

      {ergebnis.hinweise.length > 0 && (
        <div style={{
          background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 8,
          padding: '12px 14px', marginBottom: 20, fontSize: 13, color: '#92400e',
        }}>
          <strong>Nicht prüfbare Punkte (gelten als nicht erfüllt):</strong>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {ergebnis.hinweise.map((h, i) => <li key={i}>{h}</li>)}
          </ul>
        </div>
      )}

      {/* ── Übersichtstabelle ── */}
      <div className="admin-card" style={{ marginBottom: 24, overflowX: 'auto' }}>
        <h2 style={{ marginBottom: 12 }}>Übersicht</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: `2px solid ${GOLD}` }}>
              <th style={{ padding: '8px 8px 8px 0', fontSize: 13 }}>Bereich</th>
              <th style={{ padding: 8, fontSize: 13, width: 120 }}>Status</th>
              <th style={{ padding: '8px 0 8px 8px', fontSize: 13, width: 130 }}>Zuständig</th>
            </tr>
          </thead>
          <tbody>
            {ergebnis.bereiche.map(b => (
              <tr key={b.id} style={{ borderTop: '1px solid var(--border, #e5e7eb)' }}>
                <td style={{ padding: '10px 8px 10px 0' }}>
                  <a href={`#${b.id}`} style={{ fontWeight: 500, color: 'inherit', textDecoration: 'none' }}>{b.titel}</a>
                </td>
                <td style={{ padding: 8 }}><Plakette status={b.status} /></td>
                <td style={{ padding: '10px 0 10px 8px', fontSize: 13, color: 'var(--muted, #6b7280)' }}>
                  {b.status === 'ready' ? '—' : b.zustaendig === 'extern' ? 'Dritte' : 'wir selbst'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Detailkarten ── */}
      {ergebnis.bereiche.map(b => <BereichsKarte key={b.id} bereich={b} />)}

      <div className="admin-card" style={{ fontSize: 13, color: 'var(--muted, #6b7280)' }}>
        <strong style={{ color: 'inherit' }}>Lesart.</strong>{' '}
        <span style={{ color: STATUS_STIL.ready.farbe, fontWeight: 600 }}>READY</span> = alle Pflichtprüfungen erfüllt, heute nutzbar.{' '}
        <span style={{ color: STATUS_STIL.blocked.farbe, fontWeight: 600 }}>BLOCKED</span> = intern zu lösen (Code, Stammdaten, Datenhygiene).{' '}
        <span style={{ color: STATUS_STIL.external.farbe, fontWeight: 600 }}>EXTERNAL</span> = wartet auf einen Dritten; kein Deploy ändert das.
        Fällt in einem Bereich beides aus, steht EXTERNAL — die interne Lücke zu schliessen macht ihn nicht nutzbar, sie bleibt aber in der Prüfliste sichtbar.
        Nicht ausführbare Prüfungen zählen als nicht erfüllt.
      </div>

      <p style={{ marginTop: 20 }}>
        <Link href="/admin/dashboard">← Zurück zum Dashboard</Link>
      </p>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────

function Plakette({ status }: { status: GoLiveStatus }) {
  const s = STATUS_STIL[status]
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: 999,
      background: s.hintergrund, color: s.farbe, border: `1px solid ${s.rand}`,
      fontSize: 12, fontWeight: 700, letterSpacing: 0.4, whiteSpace: 'nowrap',
    }}>
      {s.label}
    </span>
  )
}

function Kachel({ label, wert, status }: { label: string; wert: number; status?: GoLiveStatus }) {
  const farbe = status ? STATUS_STIL[status].farbe : GOLD
  return (
    <div className="admin-card" style={{ textAlign: 'center', padding: '14px 10px' }}>
      <div style={{ fontSize: 30, fontWeight: 700, color: farbe, lineHeight: 1.1 }}>{wert}</div>
      <div style={{ color: 'var(--muted, #6b7280)', fontSize: 13, marginTop: 4 }}>{label}</div>
    </div>
  )
}

function BereichsKarte({ bereich }: { bereich: GoLiveBereich }) {
  const s = STATUS_STIL[bereich.status]
  const pflicht = bereich.pruefungen.filter(p => p.relevanz === 'pflicht')
  const hinweise = bereich.pruefungen.filter(p => p.relevanz === 'hinweis')

  return (
    <div id={bereich.id} className="admin-card" style={{ marginBottom: 16, borderLeft: `4px solid ${s.rand}`, scrollMarginTop: 20 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 10 }}>
        <h2 style={{ margin: 0, flex: '1 1 220px', fontSize: 18 }}>{bereich.titel}</h2>
        <Plakette status={bereich.status} />
      </div>

      <p style={{ margin: '0 0 12px', fontSize: 14, lineHeight: 1.6 }}>{bereich.begruendung}</p>

      <div style={{
        background: 'rgba(201,150,60,0.08)', borderLeft: `3px solid ${GOLD}`,
        padding: '10px 12px', borderRadius: 4, marginBottom: 14, fontSize: 14, lineHeight: 1.6,
      }}>
        <strong>Nächster Schritt:</strong> {bereich.naechsterSchritt}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 380 }}>
          <tbody>
            {pflicht.map((p, i) => <PruefZeile key={`p${i}`} pruefung={p} />)}
            {hinweise.map((p, i) => <PruefZeile key={`h${i}`} pruefung={p} nurHinweis />)}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PruefZeile({ pruefung: p, nurHinweis = false }: {
  pruefung: GoLiveBereich['pruefungen'][number]
  nurHinweis?: boolean
}) {
  const zeichen = p.erfuellt === true ? '✓' : p.erfuellt === false ? '✕' : '?'
  const farbe = p.erfuellt === true ? '#22c55e' : nurHinweis ? '#9ca3af' : p.erfuellt === false ? '#ef4444' : '#f59e0b'
  const beschriftung = p.erfuellt === true ? 'erfüllt' : p.erfuellt === false ? 'nicht erfüllt' : 'nicht prüfbar'

  return (
    <tr style={{ borderTop: '1px solid var(--border, #e5e7eb)' }}>
      <td style={{ padding: '8px 8px 8px 0', width: 24, color: farbe, fontWeight: 700 }} aria-label={beschriftung} title={beschriftung}>
        {zeichen}
      </td>
      <td style={{ padding: 8 }}>
        {p.label}
        {nurHinweis && (
          <span style={{ marginLeft: 6, fontSize: 11, padding: '1px 6px', borderRadius: 4, background: '#f3f4f6', color: '#4b5563' }}>
            HINWEIS
          </span>
        )}
      </td>
      <td style={{ padding: 8, color: 'var(--muted, #6b7280)' }}>{p.wert}</td>
      <td style={{ padding: '8px 0 8px 8px', width: 70, textAlign: 'right' }}>
        {p.erfuellt !== true && (
          <span style={{
            fontSize: 11, padding: '1px 6px', borderRadius: 4,
            background: p.zustaendig === 'extern' ? '#fef3c7' : '#fee2e2',
            color: p.zustaendig === 'extern' ? '#92400e' : '#991b1b',
          }}>
            {p.zustaendig === 'extern' ? 'EXTERN' : 'INTERN'}
          </span>
        )}
      </td>
    </tr>
  )
}
