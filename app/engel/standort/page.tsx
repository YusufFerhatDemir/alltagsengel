'use client'
// ═══════════════════════════════════════════════════════════════════════
// Standortfreigabe — /engel/standort
// ═══════════════════════════════════════════════════════════════════════
//
// DIE STELLE, AN DER DIE FREIGABE ENTSTEHT. Ohne diese Seite gaebe es
// das Modul nur auf dem Papier: es existiert bewusst KEIN
// Verwaltungsweg, der die Freigabe fuer jemanden einschaltet — sie kann
// nur hier entstehen, durch die betroffene Person selbst.
//
// DREI DINGE MACHT DIESE SEITE, BEVOR SIE ETWAS EINSCHALTET
//   1. Sie erklaert in ganzen Saetzen, was in welchem Modus erhoben
//      wird. Eine Einwilligung, die niemand versteht, ist keine.
//   2. Sie verlangt ein ausdrueckliches Haekchen (`enabledByUser`).
//      Ohne das schickt sie nichts ab, und die Route wuerde es auch
//      abweisen.
//   3. Fuer den Dauermodus fragt sie zuerst das Betriebssystem
//      (navigator.geolocation) und meldet dessen Antwort ehrlich weiter.
//      Es wird NICHTS umgangen und nichts behauptet: verweigert das
//      Geraet, bleibt der Modus aus.
//
// „AUS" IST IMMER EINEN KLICK ENTFERNT und steht deshalb oben, nicht am
// Ende einer Liste.
// ═══════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { requireUser } from '@/lib/supabase/require-session'
import { logger } from '@/lib/logger'

const log = logger.child('engel:standort')

interface Einstellung {
  modus: 'off' | 'during_service' | 'always'
  enabledAt: string | null
  disabledAt: string | null
  enabledByUser: boolean
  osPermissionGranted: boolean
  updatedAt: string | null
}

interface KatalogEintrag {
  wert: 'off' | 'during_service' | 'always'
  bezeichnung: string
  erklaerung: string
}

function zeitpunkt(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('de-DE', {
      timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'short',
    })
  } catch { return iso }
}

/**
 * Fragt das Betriebssystem nach der Standortberechtigung.
 *
 * Der Rueckgabewert ist das, was das Geraet geantwortet hat — nicht
 * mehr. Es gibt hier keinen Umweg ueber IP-Ortung, keinen Fallback und
 * keine Wiederholung im Hintergrund: sagt das Betriebssystem nein,
 * heisst die Antwort nein.
 */
async function frageBetriebssystem(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return false
  return new Promise<boolean>(fertig => {
    navigator.geolocation.getCurrentPosition(
      () => fertig(true),
      () => fertig(false),
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 0 },
    )
  })
}

export default function StandortFreigabeSeite() {
  const router = useRouter()
  const [einstellung, setEinstellung] = useState<Einstellung | null>(null)
  const [katalog, setKatalog] = useState<KatalogEintrag[]>([])
  const [zustimmung, setZustimmung] = useState(false)
  const [laedt, setLaedt] = useState(true)
  const [laeuft, setLaeuft] = useState(false)
  const [meldung, setMeldung] = useState<{ ton: 'ok' | 'fehler'; text: string } | null>(null)

  const laden = useCallback(async () => {
    setLaedt(true)
    try {
      const user = await requireUser(router, { redirectTo: '/engel/standort' })
      if (!user) { setLaedt(false); return }

      const res = await fetch('/api/location/settings')
      const inhalt = await res.json().catch(() => null)
      if (!res.ok) throw new Error(inhalt?.error || 'Einstellung konnte nicht geladen werden.')
      setEinstellung(inhalt.einstellung as Einstellung)
      setKatalog(inhalt.katalog as KatalogEintrag[])
    } catch (e) {
      log.errorWithException('Standortfreigabe laden', e)
      setMeldung({ ton: 'fehler', text: 'Die Einstellung konnte nicht geladen werden.' })
    } finally {
      setLaedt(false)
    }
  }, [router])

  useEffect(() => { laden() }, [laden])

  async function setzen(modus: Einstellung['modus']) {
    setLaeuft(true)
    setMeldung(null)
    try {
      // Abschalten fragt nichts und braucht nichts. Einschalten braucht
      // das Haekchen — und der Dauermodus zusaetzlich das
      // Betriebssystem.
      let osFreigabe = einstellung?.osPermissionGranted ?? false
      if (modus === 'always') {
        osFreigabe = await frageBetriebssystem()
        if (!osFreigabe) {
          setMeldung({
            ton: 'fehler',
            text: 'Ihr Gerät hat den Standortzugriff nicht erlaubt. Die dauerhafte '
              + 'Freigabe bleibt deshalb aus. Sie können die Berechtigung in den '
              + 'Einstellungen Ihres Geräts erteilen und es erneut versuchen.',
          })
          setLaeuft(false)
          return
        }
      }

      const res = await fetch('/api/location/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: modus,
          enabledByUser: modus === 'off' ? false : zustimmung,
          osPermissionGranted: osFreigabe,
        }),
      })
      const inhalt = await res.json().catch(() => null)
      if (!res.ok) throw new Error(inhalt?.error || 'Die Änderung wurde nicht gespeichert.')

      setEinstellung(inhalt.einstellung as Einstellung)
      setMeldung({
        ton: 'ok',
        text: modus === 'off'
          ? 'Die Standortfreigabe ist ausgeschaltet. Es wird kein Standort mehr erfasst.'
          : 'Die Standortfreigabe ist aktiv. Sie können sie jederzeit hier wieder ausschalten.',
      })
    } catch (e) {
      log.errorWithException('Standortfreigabe setzen', e)
      setMeldung({ ton: 'fehler', text: e instanceof Error ? e.message : 'Unbekannter Fehler.' })
    } finally {
      setLaeuft(false)
    }
  }

  const aktiv = einstellung && einstellung.modus !== 'off'

  return (
    <div style={{ padding: '20px 16px 90px', maxWidth: 640, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>Standortfreigabe</h1>
      <p style={{ fontSize: 13, color: 'var(--ink3)', lineHeight: 1.7, marginBottom: 18 }}>
        Ihr Standort wird nur erfasst, wenn Sie es hier selbst einschalten. Die Voreinstellung ist
        „Aus", und Sie können jederzeit auf „Aus" zurückstellen. Einsehen dürfen die Daten nur Sie
        selbst und die Sicherheitsadministration.
      </p>

      {meldung && (
        <div style={{
          padding: '10px 14px', borderRadius: 10, marginBottom: 16, fontSize: 13, lineHeight: 1.6,
          border: `1px solid ${meldung.ton === 'ok' ? '#2D8F5E' : '#C0392B'}`,
          color: meldung.ton === 'ok' ? '#2D8F5E' : '#C0392B',
        }}>
          {meldung.text}
        </div>
      )}

      {laedt && <p style={{ fontSize: 13, color: '#888' }}>Lädt …</p>}

      {!laedt && einstellung && (
        <>
          <div style={{
            padding: 14, borderRadius: 12, border: '1px solid var(--border)',
            background: 'var(--coal2)', marginBottom: 18,
          }}>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>AKTUELL</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
              {katalog.find(k => k.wert === einstellung.modus)?.bezeichnung ?? einstellung.modus}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
              {aktiv
                ? `Eingeschaltet am ${zeitpunkt(einstellung.enabledAt)}`
                : `Zuletzt geändert am ${zeitpunkt(einstellung.updatedAt ?? einstellung.disabledAt)}`}
            </div>

            {aktiv && (
              <button
                type="button" disabled={laeuft} onClick={() => setzen('off')}
                style={{
                  marginTop: 12, width: '100%', padding: '11px 16px', borderRadius: 10,
                  border: '1px solid #C0392B', background: 'transparent', color: '#C0392B',
                  fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                Standortfreigabe jetzt ausschalten
              </button>
            )}
          </div>

          <label style={{
            display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 16,
            fontSize: 13, lineHeight: 1.6, color: 'var(--ink3)',
          }}>
            <input
              type="checkbox" checked={zustimmung}
              onChange={e => setZustimmung(e.target.checked)}
              style={{ marginTop: 3, width: 18, height: 18 }}
            />
            <span>
              Ich schalte die Standortfreigabe selbst und freiwillig ein und weiß, dass ich sie
              jederzeit wieder ausschalten kann.
            </span>
          </label>

          <div style={{ display: 'grid', gap: 12 }}>
            {katalog.filter(k => k.wert !== 'off').map(k => (
              <div
                key={k.wert}
                style={{
                  padding: 14, borderRadius: 12, background: 'var(--coal2)',
                  border: `1px solid ${einstellung.modus === k.wert ? '#C9963C' : 'var(--border)'}`,
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{k.bezeichnung}</div>
                <div style={{ fontSize: 13, color: 'var(--ink3)', lineHeight: 1.6, marginBottom: 10 }}>
                  {k.erklaerung}
                </div>
                <button
                  type="button"
                  disabled={laeuft || !zustimmung || einstellung.modus === k.wert}
                  onClick={() => setzen(k.wert)}
                  style={{
                    padding: '9px 16px', borderRadius: 9, border: 'none',
                    background: !zustimmung || einstellung.modus === k.wert ? 'var(--border)' : '#C9963C',
                    color: !zustimmung || einstellung.modus === k.wert ? '#888' : 'var(--coal)',
                    fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
                    cursor: !zustimmung || einstellung.modus === k.wert ? 'default' : 'pointer',
                  }}
                >
                  {einstellung.modus === k.wert ? 'Aktiv' : 'Diesen Modus einschalten'}
                </button>
              </div>
            ))}
          </div>

          <p style={{ fontSize: 11, color: '#888', marginTop: 20, lineHeight: 1.7 }}>
            Erfasst werden Position, Genauigkeit, Zeitpunkt, Gerätetyp und App-Version. Jede
            Änderung an dieser Einstellung wird in der Sicherheitsspur festgehalten — auch das
            Ausschalten. Es wird keine MAC-Adresse erhoben; Betriebssystem-Berechtigungen werden
            nicht umgangen.
          </p>
        </>
      )}
    </div>
  )
}
