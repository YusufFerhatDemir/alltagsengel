'use client'
// ═══════════════════════════════════════════════════════════════
// Abrechnungs-Monitoring — die Geldwege im Beobachtungsfenster
//
// BEFUND (29.08.2026): /api/admin/monitoring/abrechnung war vollständig und
// wurde von keiner Stelle aufgerufen. Die Route beschreibt sich selbst als
// „fachliches Monitoring der Geldwege" und grenzt sich ausdrücklich vom
// HTTP-Monitoring ab: dort stehen Antwortzeiten aus einem Ring-Buffer, der
// nach jedem Cold Start leer ist; hier stehen Vorgänge aus der Datenbank —
// „die überleben den Neustart und sind das, was bei einer
// Abrechnungsstörung zählt". Nur sehen konnte sie niemand.
//
// ── DIE EINE REGEL, DIE DIESE SEITE EINHALTEN MUSS ──────────────────
// Jeder Zähler trägt ein `messbar`. Ist es false, ist die Abfrage
// fehlgeschlagen und `aktuell` steht auf 0 — die Zahl bedeutet dann NICHTS.
// Eine 0 als „keine Vorgänge" auszugeben wäre hier die teuerste aller
// falschen Antworten: „keine fehlgeschlagenen Rechnungen" liest sich wie
// Entwarnung und wäre in Wahrheit „nicht nachgesehen". Die Seite zeigt in
// diesem Fall deshalb gar keine Zahl.
// ═══════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from 'react'
import { Banner, StatusBadge } from '@/components/admin/OpsUI'
import type {
  AbrechnungsMetriken, Anomalie, Zaehler,
} from '@/lib/monitoring/abrechnung-metriken'

const FENSTER = [
  { stunden: 24, label: '24 Stunden' },
  { stunden: 72, label: '3 Tage' },
  { stunden: 168, label: '7 Tage' },
  { stunden: 720, label: '30 Tage' },
]

const SCHWERE_FARBE: Record<Anomalie['schwere'], string> = {
  hoch: '#D04B3B',
  mittel: '#E8A000',
  niedrig: '#999',
}

const SCHWERE_LABEL: Record<Anomalie['schwere'], string> = {
  hoch: 'Hoch', mittel: 'Mittel', niedrig: 'Niedrig',
}

function zeitpunkt(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('de-DE')
}

export default function AbrechnungsMonitoringPage() {
  const [stunden, setStunden] = useState(24)
  const [daten, setDaten] = useState<AbrechnungsMetriken | null>(null)
  const [loading, setLoading] = useState(true)
  const [fehler, setFehler] = useState('')

  const laden = useCallback(async () => {
    setLoading(true)
    setFehler('')
    try {
      const res = await fetch(`/api/admin/monitoring/abrechnung?stunden=${stunden}`)
      const body = await res.json()
      if (!res.ok) { setFehler(body.error || 'Monitoring konnte nicht geladen werden.'); return }
      setDaten(body)
    } catch {
      setFehler('Monitoring konnte nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [stunden])

  useEffect(() => { laden() }, [laden])

  const unmessbar = daten
    ? [
        ['Rechnungen', daten.rechnungen],
        ['Mahnungen', daten.mahnungen],
        ['CAMT-Importe', daten.camtImporte],
        ['Zahlungen', daten.zahlungen],
        ['Versand (versendet)', daten.rechnungsversand.versendet],
        ['Versand (fehlgeschlagen)', daten.rechnungsversand.fehlgeschlagen],
        ['Versand (übersprungen)', daten.rechnungsversand.uebersprungen],
      ].filter(([, z]) => !(z as Zaehler).messbar).map(([n]) => n as string)
    : []

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Abrechnungs-Monitoring</h1>
          <p className="admin-subtitle">
            Fachliche Vorgänge aus der Datenbank — nicht die Antwortzeiten der Anwendung.
            {daten && ` Fenster: ${zeitpunkt(daten.fensterVon)} bis ${zeitpunkt(daten.fensterBis)}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select
            value={stunden}
            onChange={e => setStunden(Number(e.target.value))}
            style={{
              padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)',
              background: 'var(--coal2)', color: 'var(--ink)', fontSize: 14,
              fontFamily: 'inherit', cursor: 'pointer',
            }}
          >
            {FENSTER.map(f => <option key={f.stunden} value={f.stunden}>{f.label}</option>)}
          </select>
          <button
            onClick={laden}
            disabled={loading}
            style={{
              fontSize: 13, color: 'var(--ink3)', background: 'var(--coal2)',
              border: '1px solid var(--border)', borderRadius: 8,
              padding: '9px 14px', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Neu messen
          </button>
        </div>
      </div>

      {fehler && <Banner tone="danger">{fehler}</Banner>}

      {/* Ein fehlgeschlagener Teilzähler wird ausdrücklich benannt. Ohne
          diesen Hinweis stünde eine 0 in der Kachel und sähe aus wie eine
          Messung — die Seite würde Entwarnung geben, wo nicht gemessen
          wurde. */}
      {unmessbar.length > 0 && (
        <Banner tone="danger">
          Nicht messbar: {unmessbar.join(', ')}. Diese Zähler konnten nicht erhoben
          werden — für sie gibt es hier keine Aussage, weder „null Vorgänge" noch sonst eine.
        </Banner>
      )}

      {loading && !daten ? <p style={{ color: 'var(--muted)' }}>Messung läuft…</p> : !daten ? null : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
            <Kachel titel="Rechnungen" z={daten.rechnungen} />
            <Kachel titel="Mahnungen" z={daten.mahnungen} />
            <Kachel titel="CAMT-Importe" z={daten.camtImporte} />
            <Kachel titel="Zahlungen" z={daten.zahlungen} />
          </div>

          <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 20 }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Rechnungsversand</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <Kachel titel="Versendet" z={daten.rechnungsversand.versendet} />
              <Kachel titel="Fehlgeschlagen" z={daten.rechnungsversand.fehlgeschlagen} tonBeiWert="danger" />
              {/* „Übersprungen" ist keine Störung: der Versand ist über
                  Anwendungsschalter absichtlich stillgelegt, solange
                  FIRST_REAL_INVOICE_APPROVED nicht gesetzt ist. Eine Zahl
                  hier rot zu färben hieße, den Normalzustand als Fehler
                  auszugeben. */}
              <Kachel titel="Übersprungen" z={daten.rechnungsversand.uebersprungen} />
            </div>
          </div>

          <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 20 }}>
            <h2 style={{ margin: '0 0 4px', fontSize: 16 }}>Auffälligkeiten ({daten.anomalien.length})</h2>
            <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--ink4)' }}>
              Abgeleitet aus dem Vergleich mit dem unmittelbar davorliegenden, gleich langen Fenster.
            </p>
            {daten.anomalien.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--ink4)' }}>
                Keine — im Rahmen dessen, was messbar war.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {daten.anomalien.map(a => (
                  <div
                    key={a.schluessel}
                    style={{
                      display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
                      padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)',
                    }}
                  >
                    <StatusBadge label={SCHWERE_LABEL[a.schwere]} color={SCHWERE_FARBE[a.schwere]} />
                    <span style={{ fontSize: 14 }}>{a.meldung}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Abrechnungs-Audit</h2>
            {!daten.audit.messbar ? (
              <Banner tone="danger">
                Der Audit-Trail konnte nicht gelesen werden — die Zahlen unten wären erfunden,
                deshalb stehen sie hier nicht.
              </Banner>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 16 }}>
                  <Kennzahl label="Einträge" wert={daten.audit.gesamt} />
                  {/* 0 Handelnde heißt „nur Automatik oder nichts" — das ist
                      eine Aussage und keine Lücke, siehe Kommentar am Typ. */}
                  <Kennzahl label="Handelnde" wert={daten.audit.handelnde} />
                  <Kennzahl label="Jüngster Eintrag" wert={zeitpunkt(daten.audit.letzterEintragAm)} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
                  <Verteilung
                    titel="Nach Objekt"
                    zeilen={daten.audit.jeEntityTyp.map(e => [e.entityType, e.anzahl])}
                  />
                  <Verteilung
                    titel="Nach Vorgang"
                    zeilen={daten.audit.jeAktion.map(e => [e.aktion, e.anzahl])}
                  />
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Ein Zähler mit seinem Vergleichswert.
 *
 * Bei `messbar === false` erscheint AUSDRÜCKLICH keine Zahl. Das ist der
 * ganze Punkt der Kachel: `aktuell` steht dann auf 0, und eine 0 wäre hier
 * eine Behauptung über etwas, das gar nicht erhoben wurde.
 */
function Kachel({ titel, z, tonBeiWert }: {
  titel: string; z: Zaehler; tonBeiWert?: 'danger'
}) {
  const farbe = !z.messbar ? 'var(--ink4)'
    : tonBeiWert === 'danger' && z.aktuell > 0 ? '#D04B3B'
    : 'var(--ink)'
  const delta = z.aktuell - z.vorher
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 12, color: 'var(--ink4)' }}>{titel}</div>
      {!z.messbar ? (
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink4)', marginTop: 4 }}>
          nicht messbar
        </div>
      ) : (
        <>
          <div style={{ fontSize: 24, fontWeight: 700, color: farbe }}>{z.aktuell}</div>
          <div style={{ fontSize: 12, color: 'var(--ink4)' }}>
            Vorfenster {z.vorher}
            {delta !== 0 && ` · ${delta > 0 ? '+' : ''}${delta}`}
          </div>
        </>
      )}
    </div>
  )
}

function Kennzahl({ label, wert }: { label: string; wert: number | string }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--ink4)' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700 }}>{wert}</div>
    </div>
  )
}

function Verteilung({ titel, zeilen }: { titel: string; zeilen: Array<[string, number]> }) {
  return (
    <div>
      <h3 style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--ink4)' }}>{titel}</h3>
      {zeilen.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink4)' }}>Keine Einträge im Fenster</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <tbody>
              {zeilen.map(([name, anzahl]) => (
                <tr key={name}>
                  <td style={{ fontSize: 13 }}>{name}</td>
                  <td style={{ fontSize: 13, textAlign: 'right', fontWeight: 600 }}>{anzahl}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
