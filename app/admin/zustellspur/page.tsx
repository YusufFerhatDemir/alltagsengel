'use client'
// ═══════════════════════════════════════════════════════════════════════
// Zustellspur — Betriebsansicht des Benachrichtigungsversands
// ═══════════════════════════════════════════════════════════════════════
// Die wichtigste Liste ist "Aufgegeben": dort steht, welche Nachricht
// NICHT angekommen ist und auch nicht mehr versendet wird. Alles darunter
// ist Kontext.
// ═══════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react'
import { StatusBadge, EmptyRow, Banner } from '@/components/admin/OpsUI'
import { timeAgo } from '@/lib/admin/ops'
import { logger } from '@/lib/logger'

const log = logger.child('admin:zustellspur')

interface DeadLetterRow {
  id: string
  channel: string
  recipient: string
  grund: string
  sanitized_error: string | null
  attempt_count: number
  vorgang_art: string | null
  created_at: string
}

interface OffenRow {
  id: string
  channel: string
  recipient: string
  attemptCount: number
  sanitizedError: string | null
  createdAt: string
  wiederholbarAb: string | null
  vorgangArt: string | null
}

interface LaufRow {
  id: string
  status: string
  gestartet_am: string
  laufzeit_ms: number | null
  verarbeitet: number
  erfolgreich: number
  fehlgeschlagen: number
  dead_letter: number
  uebersprungen: number
  abbruchgrund: string | null
}

interface Antwort {
  schemaBereit: boolean
  hinweis: string | null
  offen: OffenRow[]
  deadLetter: DeadLetterRow[]
  laeufe: LaufRow[]
  vorgaenge: Array<{ art: string; kanaele: string[] }>
}

const GRUND_TEXT: Record<string, string> = {
  max_versuche_erreicht: 'Alle Versuche verbraucht',
  dauerhaft_fehlgeschlagen: 'Dauerhaft nicht zustellbar',
  nicht_wiederherstellbar: 'Nicht wiederherstellbar',
  voraussetzung_fehlt: 'Voraussetzung fehlt',
}

const KANAL_TEXT: Record<string, string> = {
  email: 'E-Mail',
  push: 'Push',
  in_app: 'In-App',
  whatsapp: 'WhatsApp',
}

const LAUF_FARBE: Record<string, string> = {
  fertig: '#2D8F5E',
  laeuft: '#C9963C',
  abgebrochen: '#C0392B',
}

const zelle: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 13 }
const kopf: React.CSSProperties = { ...zelle, color: '#888', fontWeight: 600, fontSize: 12, textTransform: 'uppercase' }

export default function ZustellspurPage() {
  const [daten, setDaten] = useState<Antwort | null>(null)
  const [loading, setLoading] = useState(true)
  const [fehler, setFehler] = useState<string | null>(null)

  useEffect(() => {
    let abgebrochen = false
    async function laden() {
      try {
        const res = await fetch('/api/admin/zustellspur')
        if (!res.ok) {
          setFehler('Die Zustellspur konnte nicht geladen werden.')
          return
        }
        const json = (await res.json()) as Antwort
        if (!abgebrochen) setDaten(json)
      } catch (err) {
        log.errorWithException('Zustellspur konnte nicht geladen werden', err)
        setFehler('Die Zustellspur konnte nicht geladen werden.')
      } finally {
        if (!abgebrochen) setLoading(false)
      }
    }
    laden()
    return () => { abgebrochen = true }
  }, [])

  if (loading) return <div style={{ padding: 24, color: '#888' }}>Wird geladen …</div>

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Zustellspur</h1>
      <p style={{ color: '#888', fontSize: 13, marginBottom: 20 }}>
        Benachrichtigungen über E-Mail, Push, In-App und WhatsApp. Der Wiederholungslauf
        arbeitet alle fünf Minuten die offenen Fälle ab.
      </p>

      {fehler && <Banner tone="danger">{fehler}</Banner>}
      {daten?.hinweis && <Banner tone="warn">{daten.hinweis}</Banner>}

      <h2 style={{ fontSize: 16, fontWeight: 600, margin: '24px 0 8px' }}>
        Aufgegeben ({daten?.deadLetter.length ?? 0})
      </h2>
      <p style={{ color: '#888', fontSize: 12, marginBottom: 8 }}>
        Diese Nachrichten sind nicht angekommen und werden nicht mehr versendet.
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={kopf}>Kanal</th>
            <th style={kopf}>Empfänger</th>
            <th style={kopf}>Vorgang</th>
            <th style={kopf}>Versuche</th>
            <th style={kopf}>Grund</th>
            <th style={kopf}>Wann</th>
          </tr>
        </thead>
        <tbody>
          {(daten?.deadLetter ?? []).length === 0 ? (
            <EmptyRow colSpan={6}>Keine aufgegebenen Zustellungen.</EmptyRow>
          ) : (
            daten!.deadLetter.map(z => (
              <tr key={z.id}>
                <td style={zelle}>{KANAL_TEXT[z.channel] ?? z.channel}</td>
                <td style={zelle}>{z.recipient}</td>
                <td style={zelle}>{z.vorgang_art ?? '—'}</td>
                <td style={zelle}>{z.attempt_count}</td>
                <td style={zelle}>
                  <StatusBadge label={GRUND_TEXT[z.grund] ?? z.grund} color="#C0392B" />
                  {z.sanitized_error && (
                    <div style={{ color: '#888', fontSize: 11, marginTop: 4 }}>{z.sanitized_error}</div>
                  )}
                </td>
                <td style={zelle}>{timeAgo(z.created_at)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <h2 style={{ fontSize: 16, fontWeight: 600, margin: '28px 0 8px' }}>
        In Wiederholung ({daten?.offen.length ?? 0})
      </h2>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={kopf}>Kanal</th>
            <th style={kopf}>Empfänger</th>
            <th style={kopf}>Vorgang</th>
            <th style={kopf}>Versuche</th>
            <th style={kopf}>Nächster Versuch</th>
          </tr>
        </thead>
        <tbody>
          {(daten?.offen ?? []).length === 0 ? (
            <EmptyRow colSpan={5}>Keine offenen Zustellungen.</EmptyRow>
          ) : (
            daten!.offen.map(z => (
              <tr key={z.id}>
                <td style={zelle}>{KANAL_TEXT[z.channel] ?? z.channel}</td>
                <td style={zelle}>{z.recipient}</td>
                <td style={zelle}>{z.vorgangArt ?? <span style={{ color: '#C0392B' }}>ohne Vorgangsbezug</span>}</td>
                <td style={zelle}>{z.attemptCount}</td>
                <td style={zelle}>{z.wiederholbarAb ? timeAgo(z.wiederholbarAb) : '—'}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <h2 style={{ fontSize: 16, fontWeight: 600, margin: '28px 0 8px' }}>Letzte Läufe</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={kopf}>Start</th>
            <th style={kopf}>Status</th>
            <th style={kopf}>Dauer</th>
            <th style={kopf}>Erfolgreich</th>
            <th style={kopf}>Fehlgeschlagen</th>
            <th style={kopf}>Aufgegeben</th>
          </tr>
        </thead>
        <tbody>
          {(daten?.laeufe ?? []).length === 0 ? (
            <EmptyRow colSpan={6}>Noch kein Lauf protokolliert.</EmptyRow>
          ) : (
            daten!.laeufe.map(l => (
              <tr key={l.id}>
                <td style={zelle}>{timeAgo(l.gestartet_am)}</td>
                <td style={zelle}>
                  <StatusBadge label={l.status} color={LAUF_FARBE[l.status] ?? '#999'} />
                  {l.abbruchgrund && (
                    <div style={{ color: '#888', fontSize: 11, marginTop: 4 }}>{l.abbruchgrund}</div>
                  )}
                </td>
                <td style={zelle}>{l.laufzeit_ms == null ? '—' : `${(l.laufzeit_ms / 1000).toFixed(1)} s`}</td>
                <td style={zelle}>{l.erfolgreich}</td>
                <td style={zelle}>{l.fehlgeschlagen}</td>
                <td style={zelle}>{l.dead_letter}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <p style={{ color: '#888', fontSize: 12, marginTop: 20 }}>
        Wiederherstellbare Vorgangsarten:{' '}
        {(daten?.vorgaenge ?? []).map(v => `${v.art} (${v.kanaele.join(', ')})`).join(' · ') || '—'}
      </p>
    </div>
  )
}
