'use client'
import { useMemo, useState } from 'react'
import DialogOverlay from '@/components/DialogOverlay'
import { Banner } from '@/components/admin/OpsUI'
import { vorlagenFuer, type Zielgruppe } from '@/lib/email/templates'
import { logger } from '@/lib/logger'

const log = logger.child('admin:email-dialog')

/**
 * „E-Mail senden" — Vorlagenauswahl, Vorschau, Versand.
 *
 * DIE REIHENFOLGE IST DER SCHUTZ
 * Die Vorschau lädt beim Öffnen und bei jeder Änderung. Der Senden-Knopf
 * ist erst freigegeben, wenn eine Vorschau vorliegt und keine Pflichtangabe
 * fehlt. Man kann also nichts abschicken, das man nicht gesehen hat.
 *
 * Der Absender steht sichtbar über der Vorschau — nicht weil es technisch
 * nötig wäre, sondern damit im Zweifel jemand merkt, wenn dort einmal etwas
 * anderes als info@alltagsengel.care stünde.
 */
export default function EmailVorlagenDialog({
  zielgruppe,
  empfaengerEmail,
  empfaengerName,
  vorbelegung,
  onClose,
}: {
  zielgruppe: Zielgruppe
  empfaengerEmail: string | null
  empfaengerName: string | null
  /** Werte, die aus dem Vorgang bekannt sind (z. B. der Vorname). */
  vorbelegung?: Record<string, string>
  onClose: () => void
}) {
  const vorlagen = useMemo(() => vorlagenFuer(zielgruppe), [zielgruppe])
  const [vorlagenId, setVorlagenId] = useState(vorlagen[0]?.id ?? '')
  const vorlage = useMemo(() => vorlagen.find(v => v.id === vorlagenId), [vorlagen, vorlagenId])

  const [werte, setWerte] = useState<Record<string, string>>(vorbelegung ?? {})
  const [vorschau, setVorschau] = useState<{ betreff: string; html: string; fehlend: string[] } | null>(null)
  const [laedt, setLaedt] = useState(false)
  const [sendet, setSendet] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [erfolg, setErfolg] = useState<string | null>(null)

  async function vorschauLaden() {
    if (!vorlage) return
    setFehler(null)
    setLaedt(true)
    try {
      const antwort = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modus: 'vorschau', vorlageId: vorlage.id, werte }),
      })
      const daten = await antwort.json().catch(() => null)
      if (!antwort.ok) {
        setFehler(daten?.error || 'Die Vorschau konnte nicht geladen werden.')
        setVorschau(null)
        return
      }
      setVorschau({
        betreff: daten.betreff,
        html: daten.rumpfHtml,
        fehlend: daten.fehlendeFelder ?? [],
      })
    } catch (err) {
      log.errorWithException('Vorschau fehlgeschlagen', err)
      setFehler('Die Vorschau konnte nicht geladen werden.')
      setVorschau(null)
    } finally {
      setLaedt(false)
    }
  }

  async function senden() {
    if (!vorlage || !empfaengerEmail) return
    setFehler(null)
    setSendet(true)
    try {
      const antwort = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modus: 'senden',
          vorlageId: vorlage.id,
          werte,
          empfaengerEmail,
          empfaengerName,
        }),
      })
      const daten = await antwort.json().catch(() => null)
      if (!antwort.ok) {
        setFehler(daten?.error || 'Der Versand ist fehlgeschlagen.')
        return
      }
      setErfolg(`Gesendet an ${empfaengerEmail}${daten?.providerId ? ` (${daten.providerId})` : ''}.`)
    } catch (err) {
      log.errorWithException('Versand fehlgeschlagen', err)
      setFehler('Der Versand ist fehlgeschlagen.')
    } finally {
      setSendet(false)
    }
  }

  const kannSenden =
    !!empfaengerEmail && !!vorschau && vorschau.fehlend.length === 0 && !sendet && !erfolg

  return (
    <DialogOverlay onClose={onClose}>
      <div
        role="dialog" aria-label="E-Mail aus Vorlage senden" aria-modal="true"
        className="admin-modal" style={{ maxWidth: 640, width: '94%' }}
        onClick={e => e.stopPropagation()}
      >
        <h3>E-Mail senden</h3>

        {!empfaengerEmail && (
          <Banner tone="warn">
            Für diesen Vorgang ist keine E-Mail-Adresse hinterlegt. Die Vorschau lässt sich
            ansehen, gesendet werden kann nicht.
          </Banner>
        )}
        {erfolg && <Banner tone="success">{erfolg}</Banner>}
        {fehler && <Banner tone="danger">{fehler}</Banner>}

        <label style={{ display: 'block', marginBottom: 12 }}>
          <span style={beschriftung}>Vorlage</span>
          <select
            className="admin-select"
            value={vorlagenId}
            onChange={e => { setVorlagenId(e.target.value); setVorschau(null); setErfolg(null) }}
            style={{ width: '100%' }}
          >
            {vorlagen.map(v => (
              <option key={v.id} value={v.id}>{v.quelle} — {v.name}</option>
            ))}
          </select>
        </label>

        {vorlage && vorlage.felder.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            {vorlage.felder.map(f => (
              <label key={f.key} style={{ display: 'block', marginBottom: 8 }}>
                <span style={beschriftung}>
                  {f.label}{f.pflicht && ' *'}
                </span>
                <input
                  value={werte[f.key] ?? ''}
                  onChange={e => {
                    setWerte(w => ({ ...w, [f.key]: e.target.value }))
                    setVorschau(null)
                  }}
                  placeholder={f.beispiel}
                  style={eingabe}
                />
              </label>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <button onClick={vorschauLaden} disabled={laedt || !vorlage} style={vorschauBtn}>
            {laedt ? 'Lädt…' : vorschau ? 'Vorschau aktualisieren' : 'Vorschau anzeigen'}
          </button>
        </div>

        {vorschau && (
          <div style={{ marginBottom: 14 }}>
            {vorschau.fehlend.length > 0 && (
              <Banner tone="warn">
                Pflichtangaben fehlen: {vorschau.fehlend.join(', ')} — bitte ergänzen.
              </Banner>
            )}
            <div style={kopf}>
              <div><strong>Von:</strong> Alltagsengel &lt;info@alltagsengel.care&gt;</div>
              <div><strong>An:</strong> {empfaengerEmail || '— keine Adresse —'}</div>
              <div><strong>Betreff:</strong> {vorschau.betreff}</div>
            </div>
            {/* Der Rumpf stammt aus dem eigenen Vorlagenkatalog, nicht aus
                einer Eingabe: eingesetzte Werte laufen serverseitig durch
                esc(). */}
            <div style={rumpf} dangerouslySetInnerHTML={{ __html: vorschau.html }} />
          </div>
        )}

        <div className="admin-modal-btns">
          <button className="btn-cancel" onClick={onClose}>
            {erfolg ? 'Schließen' : 'Abbrechen'}
          </button>
          <button className="btn-confirm" onClick={senden} disabled={!kannSenden}>
            {sendet ? 'Wird gesendet…' : 'Jetzt senden'}
          </button>
        </div>

        <p style={{ fontSize: 11, color: 'var(--ink5)', marginTop: 10, lineHeight: 1.5 }}>
          Der Versand geht über Resend an die angezeigte Adresse. Es wird nichts automatisch
          gesendet — nur dieser Knopf löst eine echte E-Mail aus.
        </p>
      </div>
    </DialogOverlay>
  )
}

const beschriftung: React.CSSProperties = {
  display: 'block', fontSize: 12, color: 'var(--ink3)', fontWeight: 600, marginBottom: 4,
}
const eingabe: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 10,
  fontSize: 14, background: 'var(--coal3)', color: 'var(--ink)',
  fontFamily: "'Jost',sans-serif", outline: 'none', boxSizing: 'border-box',
}
const vorschauBtn: React.CSSProperties = {
  fontSize: 13, color: 'var(--gold2)', background: 'rgba(201,150,60,0.1)',
  border: '1px solid rgba(201,150,60,0.3)', borderRadius: 8, padding: '8px 14px',
  cursor: 'pointer', fontFamily: 'inherit',
}
const kopf: React.CSSProperties = {
  background: 'var(--coal3)', border: '1px solid var(--border)', borderRadius: 10,
  padding: '10px 12px', fontSize: 12, color: 'var(--ink3)', lineHeight: 1.7, marginBottom: 8,
}
const rumpf: React.CSSProperties = {
  background: '#fff', color: '#222', borderRadius: 10, padding: '16px 18px',
  fontSize: 14, maxHeight: 320, overflowY: 'auto',
}
