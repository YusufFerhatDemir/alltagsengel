'use client'
// ═══════════════════════════════════════════════════════════════
// BUNDESLAND-HINWEIS — Kassenabrechnung noch nicht freigeschaltet
// ═══════════════════════════════════════════════════════════════
// Ersetzt die früheren „nur in Hessen"-Textbausteine in der
// Buchungsstrecke. Der Text kommt aus dem Status des Bundeslands,
// nicht aus dem Code.
//
// Enthält direkt die Warteliste: Wer heute nicht über die Kasse
// abrechnen kann, soll trotzdem im System bleiben und bei der
// Freischaltung benachrichtigt werden.
// ═══════════════════════════════════════════════════════════════

import { useState } from 'react'
import { wartelisteEintragen, type BundeslandLageClient } from '@/lib/expansion/client'
import { TEXT_WARTELISTE } from '@/lib/expansion/types'

interface Props {
  lage: BundeslandLageClient
  /** Vorbelegung des E-Mail-Felds aus dem Profil. */
  email?: string | null
  name?: string | null
  /** Woher der Eintrag stammt (buchung, krankenfahrt, …). */
  quelle?: string
  /** Warteliste ausblenden, wenn die Seite bereits eine anbietet. */
  ohneWarteliste?: boolean
}

export default function BundeslandHinweis({
  lage, email, name, quelle = 'web', ohneWarteliste = false,
}: Props) {
  const [offen, setOffen] = useState(false)
  const [mail, setMail] = useState(email ?? '')
  const [sendet, setSendet] = useState(false)
  const [meldung, setMeldung] = useState<string | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)

  // Freigeschaltet → kein Hinweis nötig.
  if (lage.kassenabrechnung) return null

  const land = lage.bundeslandName
  const wartelisteMoeglich = !ohneWarteliste && lage.warteliste && !!lage.bundesland

  async function eintragen() {
    setFehler(null)
    setSendet(true)
    const ergebnis = await wartelisteEintragen({
      bundesland: lage.bundesland,
      plz: lage.plz,
      name: name ?? null,
      email: mail.trim(),
      interesse: 'kasse',
      quelle,
    })
    setSendet(false)
    if (ergebnis.ok) {
      setMeldung('Eingetragen. Wir melden uns, sobald die Abrechnung freigeschaltet ist.')
    } else {
      setFehler(ergebnis.fehler)
    }
  }

  return (
    <div style={karte}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span aria-hidden style={{ fontSize: 18, lineHeight: 1.2 }}>ℹ️</span>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--ink3)' }}>
            {lage.hinweis}
          </p>

          {land && (
            <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--ink4)' }}>
              Bundesland: <strong>{land}</strong>
              {lage.plz ? ` · PLZ ${lage.plz}` : ''}
              {lage.goLive ? ` · geplanter Start: ${formatDatum(lage.goLive)}` : ''}
            </p>
          )}

          {lage.privatleistungen ? (
            <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--ink3)' }}>
              Ihre Buchung läuft als <strong>Privatleistung</strong> — daran ändert das
              laufende Verfahren nichts.
            </p>
          ) : (
            <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--ink3)' }}>
              In Ihrer Region nehmen wir derzeit Vormerkungen entgegen.
            </p>
          )}

          {(lage.ansprechpartner.email || lage.ansprechpartner.telefon) && (
            <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--ink4)' }}>
              Ansprechpartner: {lage.ansprechpartner.name || 'Alltagsengel'}
              {lage.ansprechpartner.email && <> · <a href={`mailto:${lage.ansprechpartner.email}`} style={link}>{lage.ansprechpartner.email}</a></>}
              {lage.ansprechpartner.telefon && <> · <a href={`tel:${lage.ansprechpartner.telefon}`} style={link}>{lage.ansprechpartner.telefon}</a></>}
            </p>
          )}

          {wartelisteMoeglich && !meldung && (
            offen ? (
              <div style={{ marginTop: 12 }}>
                <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--ink4)' }}>
                  {TEXT_WARTELISTE}
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input
                    type="email"
                    value={mail}
                    onChange={e => setMail(e.target.value)}
                    placeholder="ihre@email.de"
                    style={eingabe}
                  />
                  <button
                    onClick={eintragen}
                    disabled={sendet || !mail.includes('@')}
                    style={knopf}
                  >
                    {sendet ? 'Wird gesendet…' : 'Benachrichtigen'}
                  </button>
                </div>
                {fehler && (
                  <p style={{ margin: '6px 0 0', fontSize: 12, color: '#D04B3B' }}>{fehler}</p>
                )}
              </div>
            ) : (
              <button onClick={() => setOffen(true)} style={{ ...knopf, marginTop: 10 }}>
                Bei Freischaltung benachrichtigen
              </button>
            )
          )}

          {meldung && (
            <p style={{ margin: '10px 0 0', fontSize: 13, color: '#3E8E5A', fontWeight: 600 }}>
              ✓ {meldung}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function formatDatum(iso: string): string {
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: 'long', year: 'numeric', })
  } catch {
    return iso
  }
}

const karte: React.CSSProperties = {
  background: 'rgba(201,150,60,0.08)',
  border: '1px solid rgba(201,150,60,0.22)',
  borderRadius: 12,
  padding: '12px 14px',
  marginTop: 10,
}

const eingabe: React.CSSProperties = {
  flex: '1 1 190px', minWidth: 0, padding: '9px 12px', borderRadius: 9,
  border: '1px solid var(--cream3, rgba(0,0,0,0.14))', fontSize: 14,
  fontFamily: 'inherit', outline: 'none',
}

const knopf: React.CSSProperties = {
  padding: '9px 16px', borderRadius: 9, border: 'none',
  background: 'var(--gold)', color: '#fff', fontSize: 13, fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
}

const link: React.CSSProperties = { color: 'var(--gold2, #C9963C)', textDecoration: 'none' }
