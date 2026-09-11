'use client'

import { useState } from 'react'
import {
  CONTENT_STATUS, CONTENT_STATUS_WERTE, STATUS_VORGABE,
  type ContentStatus, type ContentStand,
} from '@/lib/marketing/content-status'

/**
 * Bearbeitungsstand eines Content-Stücks setzen.
 *
 * ── WARUM NICHT OPTIMISTISCH ──────────────────────────────────────────
 * Der Knopf zeigt den neuen Stand erst, wenn die Antwort da ist. Bei einem
 * geteilten Stand ist eine optimistische Anzeige gefährlich: sie behauptet
 * „veröffentlicht", während der Schreibvorgang scheiterte — und der
 * Nächste, der die Liste öffnet, sieht das Stück als offen und postet es
 * ein zweites Mal. Lieber eine halbe Sekunde „Speichern…".
 */
export default function ContentStatusSchalter({
  contentId, stand,
}: {
  contentId: string
  stand: ContentStand | null
}) {
  const [status, setStatus] = useState<ContentStatus>(stand?.status ?? STATUS_VORGABE)
  const [notiz, setNotiz] = useState(stand?.notiz ?? '')
  const [notizOffen, setNotizOffen] = useState(false)
  const [laeuft, setLaeuft] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [veroeffentlichtAm, setVeroeffentlichtAm] = useState(stand?.veroeffentlichtAm ?? null)

  async function speichern(neu: ContentStatus, neueNotiz = notiz) {
    setLaeuft(true)
    setFehler(null)
    try {
      const antwort = await fetch('/api/admin/marketing-content/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentId, status: neu, notiz: neueNotiz || null }),
      })
      const daten = await antwort.json().catch(() => null)
      if (!antwort.ok) {
        setFehler(daten?.error || 'Speichern fehlgeschlagen.')
        return
      }
      setStatus(neu)
      setVeroeffentlichtAm(daten?.veroeffentlichtAm ?? null)
    } catch {
      setFehler('Netzwerkfehler — der Stand wurde nicht gespeichert.')
    } finally {
      setLaeuft(false)
    }
  }

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--ink5)', fontWeight: 700 }}>Stand</span>
        {CONTENT_STATUS_WERTE.map(w => {
          const aktiv = status === w
          return (
            <button
              key={w}
              type="button"
              disabled={laeuft}
              onClick={() => speichern(w)}
              style={{
                padding: '4px 10px', borderRadius: 999, fontSize: 12, cursor: laeuft ? 'wait' : 'pointer',
                border: `1px solid ${aktiv ? CONTENT_STATUS[w].farbe : 'var(--border)'}`,
                background: aktiv ? CONTENT_STATUS[w].farbe : 'transparent',
                color: aktiv ? '#13110F' : 'var(--ink3)',
                fontWeight: aktiv ? 700 : 400,
                opacity: laeuft ? 0.6 : 1,
              }}
            >
              {CONTENT_STATUS[w].label}
            </button>
          )
        })}
        {laeuft && <span style={{ fontSize: 12, color: 'var(--ink5)' }}>Speichern…</span>}
        {veroeffentlichtAm && status === 'veroeffentlicht' && (
          <span style={{ fontSize: 12, color: 'var(--ink5)' }}>
            am {new Date(veroeffentlichtAm).toLocaleDateString('de-DE')}
          </span>
        )}
        <button
          type="button"
          onClick={() => setNotizOffen(o => !o)}
          style={{
            marginLeft: 'auto', background: 'none', border: 'none', padding: 0,
            color: 'var(--gold2)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline',
          }}
        >
          {notiz ? 'Notiz ändern' : 'Notiz'}
        </button>
      </div>

      {notiz && !notizOffen && (
        <p style={{ fontSize: 12, color: 'var(--ink3)', margin: '8px 0 0', lineHeight: 1.5 }}>
          {notiz}
        </p>
      )}

      {notizOffen && (
        <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            value={notiz}
            onChange={e => setNotiz(e.target.value)}
            maxLength={500}
            placeholder="z. B. Bild fehlt noch, auf Oktober geschoben"
            style={{
              flex: '1 1 240px', padding: '7px 10px', borderRadius: 8, fontSize: 13,
              border: '1px solid var(--border)', background: 'var(--coal3)', color: 'var(--ink2)',
            }}
          />
          <button
            type="button"
            disabled={laeuft}
            onClick={async () => { await speichern(status); setNotizOffen(false) }}
            style={{
              padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              border: '1px solid var(--border)', background: 'var(--coal3)',
              color: 'var(--ink2)', cursor: laeuft ? 'wait' : 'pointer',
            }}
          >
            Notiz speichern
          </button>
        </div>
      )}

      {fehler && (
        <p style={{ fontSize: 12, color: '#D04B3B', margin: '8px 0 0' }} role="alert">
          {fehler}
        </p>
      )}
    </div>
  )
}
