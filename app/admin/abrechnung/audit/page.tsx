'use client'
// ═══════════════════════════════════════════════════════════════
// Abrechnungs-Audit — wer hat wann was am Geldweg geändert
//
// BEFUND (29.08.2026): `/api/billing/audit` war vollständig und wurde von
// keiner Stelle aufgerufen. Anders als die meisten Tabellen dieses Projekts
// ist `billing_audit_trail` nicht leer — sie trägt live Einträge. Es gab
// also ein geführtes Protokoll über die Geldwege und keinen einzigen Weg,
// es zu lesen.
//
// Ein Audit-Trail, den niemand einsehen kann, erfüllt seinen Zweck nicht:
// er soll die Frage „wer hat diese Rechnung geändert und warum" beantworten
// können, und zwar dann, wenn sie gestellt wird — bei einer Rückfrage, einer
// Prüfung oder einem Streit über einen Betrag.
//
// ── ABGRENZUNG ──────────────────────────────────────────────────────
// `/admin/monitoring` zeigt eine ZUSAMMENFASSUNG desselben Bestands
// (Anzahl je Objekt und Vorgang im Beobachtungsfenster). Hier stehen die
// EINZELNEN Einträge. Die beiden Seiten haben bewusst verschiedene
// Berechtigungen: das Monitoring verlangt `system.verwalten`, dieser
// Trail `abrechnung.lesen` — und genau die Rollen, die den Trail brauchen
// (Buchhaltung, PDL), haben `system.verwalten` NICHT.
//
// Die Seite liest ausschließlich. Ein Audit-Eintrag ist unveränderlich;
// eine Oberfläche, die daran etwas anbietet, wäre ein Widerspruch in sich.
// ═══════════════════════════════════════════════════════════════
import Link from 'next/link'
import { Fragment, useCallback, useEffect, useState } from 'react'
import { Banner, EmptyRow, StatusBadge } from '@/components/admin/OpsUI'

interface AuditEintrag {
  id: string
  entity_type: string
  entity_id: string
  action: string
  previous_state: unknown
  new_state: unknown
  reason: string | null
  actor_id: string | null
  actor_role: string | null
  created_at: string
}

const eingabe: React.CSSProperties = {
  padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--coal2)', color: 'var(--ink)', fontSize: 14,
  fontFamily: 'inherit',
}

/** Die Objekte, die der Geldweg protokolliert. Freitext bleibt möglich. */
const ENTITAETEN = [
  'invoice', 'invoice_item', 'payment', 'payment_allocation',
  'credit_note', 'dunning', 'service_record',
]

function zeitpunkt(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('de-DE')
}

/**
 * Ein Zustand als lesbarer Text.
 *
 * `null` und „leeres Objekt" werden UNTERSCHIEDEN: bei einem Anlegen gibt
 * es keinen Vorzustand (`null`), bei einer Änderung ohne erfasste Felder
 * gibt es einen, der nichts enthält. Beides als „—" auszugeben würde einen
 * fehlenden Eintrag wie einen leeren aussehen lassen.
 */
function zustand(wert: unknown): string {
  if (wert === null || wert === undefined) return '—'
  if (typeof wert === 'object' && Object.keys(wert as object).length === 0) return '{ }'
  try {
    return JSON.stringify(wert, null, 1)
  } catch {
    return String(wert)
  }
}

export default function AbrechnungsAuditPage() {
  const [entityType, setEntityType] = useState('')
  const [entityId, setEntityId] = useState('')
  const [von, setVon] = useState('')
  const [bis, setBis] = useState('')
  const [eintraege, setEintraege] = useState<AuditEintrag[] | null>(null)
  const [offen, setOffen] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [fehler, setFehler] = useState('')

  const laden = useCallback(async () => {
    setLoading(true)
    setFehler('')
    try {
      const p = new URLSearchParams()
      if (entityType) p.set('entity_type', entityType)
      if (entityId.trim()) p.set('entity_id', entityId.trim())
      // Die Route vergleicht gegen `created_at`, einen Zeitstempel. Ein
      // blosses Datum als `bis` träfe sonst nur Mitternacht und schnitte
      // den ganzen Tag ab — deshalb bis zum Ende des Tages.
      if (von) p.set('from', `${von}T00:00:00.000Z`)
      if (bis) p.set('to', `${bis}T23:59:59.999Z`)

      const res = await fetch(`/api/billing/audit?${p.toString()}`)
      const body = await res.json()
      if (!res.ok) { setFehler(body.error || 'Audit-Trail konnte nicht geladen werden.'); return }
      // Die Route antwortet mit einem nackten Array.
      setEintraege(Array.isArray(body) ? body : [])
    } catch {
      setFehler('Audit-Trail konnte nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [entityType, entityId, von, bis])

  useEffect(() => { laden() }, [laden])

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Abrechnungs-Audit</h1>
          <p className="admin-subtitle">
            Wer hat wann was am Geldweg geändert — und mit welcher Begründung.
            Einträge sind unveränderlich.
          </p>
        </div>
        <Link href="/admin/rechnungen" style={sekundaer}>Rechnungsübersicht</Link>
      </div>

      {fehler && <Banner tone="danger">{fehler}</Banner>}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end', marginBottom: 16 }}>
        <label style={{ fontSize: 13 }}>
          Objekt<br />
          <select value={entityType} onChange={e => setEntityType(e.target.value)} style={{ ...eingabe, marginTop: 4 }}>
            <option value="">alle</option>
            {ENTITAETEN.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 13, flex: '1 1 260px' }}>
          Objekt-ID<br />
          <input
            type="text" value={entityId}
            onChange={e => setEntityId(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') laden() }}
            placeholder="UUID einer Rechnung, Zahlung, …"
            style={{ ...eingabe, width: '100%', marginTop: 4 }}
          />
        </label>
        <label style={{ fontSize: 13 }}>
          Von<br />
          <input type="date" value={von} onChange={e => setVon(e.target.value)} style={{ ...eingabe, marginTop: 4 }} />
        </label>
        <label style={{ fontSize: 13 }}>
          Bis<br />
          <input type="date" value={bis} onChange={e => setBis(e.target.value)} style={{ ...eingabe, marginTop: 4 }} />
        </label>
        <button onClick={laden} disabled={loading} style={primaer}>Anzeigen</button>
        <button
          onClick={() => { setEntityType(''); setEntityId(''); setVon(''); setBis('') }}
          style={sekundaer}
        >
          Zurücksetzen
        </button>
      </div>

      {/* Die Route begrenzt auf 100 Einträge. „100 Einträge" zu schreiben,
          wo es 400 sein können, wäre eine Falschaussage über den Bestand —
          deshalb „mindestens", sobald die Grenze erreicht ist. */}
      {eintraege !== null && (
        <p style={{ fontSize: 13, color: 'var(--ink4)', margin: '0 0 12px' }}>
          {eintraege.length === 0
            ? 'Keine Einträge'
            : eintraege.length >= 100
              ? `Mindestens ${eintraege.length} Einträge — die Anzeige ist begrenzt. Bitte Zeitraum oder Objekt einschränken.`
              : `${eintraege.length} Einträge`}
        </p>
      )}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Zeitpunkt</th><th>Objekt</th><th>Vorgang</th>
              <th>Handelnde/r</th><th>Begründung</th><th></th>
            </tr>
          </thead>
          <tbody>
            {loading && eintraege === null
              ? <EmptyRow colSpan={6}>Laden…</EmptyRow>
              : eintraege === null
                ? <EmptyRow colSpan={6}>—</EmptyRow>
                : eintraege.length === 0
                  ? <EmptyRow colSpan={6}>Keine Einträge für diese Auswahl</EmptyRow>
                  : eintraege.map(e => (
                    // Der Key gehoert an das Fragment, nicht an dessen
                    // Kinder: eine Liste aus schluessellosen Fragmenten
                    // ordnet React beim naechsten Rendern neu zu, und der
                    // aufgeklappte Vorher/Nachher-Block haengt dann an
                    // einer anderen Zeile.
                    <Fragment key={e.id}>
                      <tr>
                        <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{zeitpunkt(e.created_at)}</td>
                        <td style={{ fontSize: 13 }}>
                          <div style={{ fontWeight: 600 }}>{e.entity_type}</div>
                          <div style={{ fontSize: 11, color: 'var(--ink4)' }}>{e.entity_id?.slice(0, 8)}…</div>
                        </td>
                        <td><StatusBadge label={e.action} color="#2196F3" /></td>
                        <td style={{ fontSize: 13 }}>
                          {/* Kein Handelnder heißt „Automatik", nicht
                              „unbekannt": die Ketten laufen unter dem
                              Dienstschlüssel, dort ist auth.uid() NULL. */}
                          {e.actor_id
                            ? <>
                                {e.actor_role ?? 'Rolle unbekannt'}
                                <div style={{ fontSize: 11, color: 'var(--ink4)' }}>{e.actor_id.slice(0, 8)}…</div>
                              </>
                            : <span style={{ color: 'var(--ink4)' }}>Automatik</span>}
                        </td>
                        <td style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{e.reason || '—'}</td>
                        <td>
                          <button
                            onClick={() => setOffen(offen === e.id ? null : e.id)}
                            style={{ ...sekundaer, padding: '5px 10px', fontSize: 12 }}
                          >
                            {offen === e.id ? 'Zu' : 'Vorher/Nachher'}
                          </button>
                        </td>
                      </tr>
                      {offen === e.id && (
                        <tr>
                          <td colSpan={6} style={{ background: 'var(--coal2)' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, padding: 12 }}>
                              <div>
                                <div style={{ fontSize: 12, color: 'var(--ink4)', marginBottom: 4 }}>Vorher</div>
                                <pre style={vorschau}>{zustand(e.previous_state)}</pre>
                              </div>
                              <div>
                                <div style={{ fontSize: 12, color: 'var(--ink4)', marginBottom: 4 }}>Nachher</div>
                                <pre style={vorschau}>{zustand(e.new_state)}</pre>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const primaer: React.CSSProperties = {
  fontSize: 14, color: 'var(--coal)', fontWeight: 600,
  background: 'linear-gradient(135deg,var(--gold2),var(--gold))',
  border: 'none', borderRadius: 8, padding: '10px 18px',
  cursor: 'pointer', fontFamily: 'inherit',
}

const sekundaer: React.CSSProperties = {
  fontSize: 13, color: 'var(--ink3)', background: 'var(--coal2)',
  border: '1px solid var(--border)', borderRadius: 8,
  padding: '10px 14px', cursor: 'pointer', fontFamily: 'inherit',
  textDecoration: 'none',
}

const vorschau: React.CSSProperties = {
  margin: 0, fontSize: 12, lineHeight: 1.5,
  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
  maxHeight: 260, overflow: 'auto',
}
