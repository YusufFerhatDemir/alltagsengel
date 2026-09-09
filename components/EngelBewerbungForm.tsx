'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { trackContactRequest } from '@/lib/tracking'
import { logger } from '@/lib/logger'
import { WARTELISTE_REGIONEN } from '@/lib/warteliste/katalog'
import {
  QUALIFIKATIONEN, FUEHRERSCHEIN, SPRACHEN, VERFUEGBARKEIT,
  STUNDEN, BESCHAEFTIGUNGSART, BEWERBUNG_MAX,
} from '@/lib/bewerbung/katalog'

const log = logger.child('engel-bewerbung')

/**
 * Bewerbungsformular „Engel werden".
 *
 * Pflicht sind nur Name und Telefon — alles darunter ist freiwillig. Das
 * ist Absicht: Die Zielgruppe bewirbt sich oft vom Handy und ohne
 * Lebenslauf. Zwölf Pflichtfelder kosten hier Bewerbungen, keine
 * Datenqualität; wer mag, füllt mehr aus, und die Verwaltung sieht es.
 *
 * Neu gegenüber der Kurzfassung: E-Mail wird abgefragt. Bisher trug KEINE
 * der 34 eingegangenen Bewerbungen eine Adresse, und die Freigabe-Mail in
 * /admin/applications konnte deshalb nie ausgelöst werden.
 *
 * Zielroute ist /api/apply (setzt `art='bewerbung'`), nicht mehr
 * /api/lead-inquiry (kennt die Spalte nicht).
 */
export default function EngelBewerbungForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [plz, setPlz] = useState('')
  const [region, setRegion] = useState('')
  const [qualifikation, setQualifikation] = useState('')
  const [fuehrerschein, setFuehrerschein] = useState('')
  const [sprachen, setSprachen] = useState<string[]>(['deutsch'])
  const [verfuegbarkeit, setVerfuegbarkeit] = useState<string[]>([])
  const [stunden, setStunden] = useState('')
  const [beschaeftigungsart, setBeschaeftigungsart] = useState('')
  const [motivation, setMotivation] = useState('')
  const [datenschutz, setDatenschutz] = useState(false)
  const [honeypot, setHoneypot] = useState('')
  const [utmSource, setUtmSource] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [fehler, setFehler] = useState('')

  useEffect(() => {
    if (typeof window === 'undefined') return
    const p = new URLSearchParams(window.location.search)
    setUtmSource(p.get('utm_source') || p.get('source') || '')
  }, [])

  function toggle(liste: string[], setzen: (w: string[]) => void, key: string) {
    setzen(liste.includes(key) ? liste.filter(k => k !== key) : [...liste, key])
  }

  async function absenden(e: React.FormEvent) {
    e.preventDefault()
    setFehler('')

    if (!name.trim()) { setFehler('Bitte gib deinen Namen an.'); return }
    if (!phone.trim()) { setFehler('Bitte gib deine Telefonnummer an.'); return }
    if (!datenschutz) { setFehler('Bitte bestätige die Datenschutzhinweise.'); return }

    setStatus('sending')
    try {
      const antwort = await fetch('/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, email, phone, plz, region, qualifikation, fuehrerschein,
          sprachen, verfuegbarkeit, stunden, beschaeftigungsart, motivation,
          datenschutz, website: honeypot, utm_source: utmSource,
        }),
      })

      if (antwort.ok) {
        setStatus('sent')
        trackContactRequest('engel-bewerbung')
        return
      }

      const daten = await antwort.json().catch(() => null)
      setFehler(daten?.error || 'Die Bewerbung konnte nicht gesendet werden. Bitte versuche es erneut.')
      setStatus('idle')
    } catch (err) {
      log.errorWithException('Bewerbung fehlgeschlagen', err)
      setFehler('Die Verbindung ist fehlgeschlagen. Bitte versuche es erneut.')
      setStatus('idle')
    }
  }

  if (status === 'sent') {
    return (
      <div style={{ ...karte, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>&#10003;</div>
        <h3 style={{ color: '#F5F0E8', fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
          Danke für deine Bewerbung!
        </h3>
        <p style={{ color: '#B8B0A4', fontSize: 14, lineHeight: 1.6 }}>
          Wir melden uns telefonisch bei dir — in der Regel innerhalb von zwei Werktagen.
          Du musst nichts weiter tun.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={absenden} style={karte} noValidate>
      <h3 style={{ color: '#F5F0E8', fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>
        Jetzt als Engel bewerben
      </h3>
      <p style={{ color: '#8A8279', fontSize: 13, margin: '0 0 20px' }}>
        Nur Name und Telefonnummer sind Pflicht. Alles andere hilft uns, passende Einsätze
        zu finden — du kannst es auch später im Gespräch klären.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input
          type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true"
          value={honeypot} onChange={e => setHoneypot(e.target.value)}
          style={{ position: 'absolute', left: '-9999px', height: 0, width: 0, opacity: 0 }}
        />

        {/* ── Pflicht ────────────────────────────────────────────── */}
        <label style={feld}>
          <span style={beschriftung}>Dein Name *</span>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            maxLength={BEWERBUNG_MAX.name} required autoComplete="name"
            placeholder="Vor- und Nachname" style={eingabe} />
        </label>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ ...feld, flex: '1 1 190px' }}>
            <span style={beschriftung}>Telefon *</span>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
              maxLength={BEWERBUNG_MAX.phone} required autoComplete="tel"
              placeholder="0170 1234567" style={eingabe} />
          </label>
          <label style={{ ...feld, flex: '1 1 190px' }}>
            <span style={beschriftung}>E-Mail</span>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              maxLength={BEWERBUNG_MAX.email} autoComplete="email"
              placeholder="name@beispiel.de" style={eingabe} />
          </label>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ ...feld, flex: '0 1 130px' }}>
            <span style={beschriftung}>PLZ</span>
            <input type="text" inputMode="numeric" value={plz}
              onChange={e => setPlz(e.target.value.replace(/\D/g, '').slice(0, 5))}
              maxLength={BEWERBUNG_MAX.plz} autoComplete="postal-code"
              placeholder="60311" style={eingabe} />
          </label>
          <label style={{ ...feld, flex: '1 1 220px' }}>
            <span style={beschriftung}>Region</span>
            <select value={region} onChange={e => setRegion(e.target.value)}
              style={{ ...eingabe, appearance: 'auto', color: region ? '#F5F0E8' : '#8A8279' }}>
              <option value="">Bitte wählen</option>
              {WARTELISTE_REGIONEN.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </label>
        </div>

        {/* ── Qualifikation ──────────────────────────────────────── */}
        <label style={feld}>
          <span style={beschriftung}>Erfahrung / Qualifikation</span>
          <select value={qualifikation} onChange={e => setQualifikation(e.target.value)}
            style={{ ...eingabe, appearance: 'auto', color: qualifikation ? '#F5F0E8' : '#8A8279' }}>
            <option value="">Bitte wählen</option>
            {QUALIFIKATIONEN.map(q => <option key={q.key} value={q.key}>{q.label}</option>)}
          </select>
        </label>
        <p style={{ color: '#6A6259', fontSize: 12, margin: '-4px 0 0' }}>
          Eine pflegerische Ausbildung ist nicht nötig — Zuverlässigkeit und Geduld zählen mehr.
        </p>

        <label style={feld}>
          <span style={beschriftung}>Führerschein</span>
          <select value={fuehrerschein} onChange={e => setFuehrerschein(e.target.value)}
            style={{ ...eingabe, appearance: 'auto', color: fuehrerschein ? '#F5F0E8' : '#8A8279' }}>
            <option value="">Keine Angabe</option>
            {FUEHRERSCHEIN.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
        </label>

        {/* ── Sprachen ───────────────────────────────────────────── */}
        <fieldset style={feldgruppe}>
          <legend style={{ ...beschriftung, padding: 0, marginBottom: 8 }}>Sprachen</legend>
          <div style={chipReihe}>
            {SPRACHEN.map(s => (
              <Chip key={s.key} label={s.label} aktiv={sprachen.includes(s.key)}
                onChange={() => toggle(sprachen, setSprachen, s.key)} />
            ))}
          </div>
        </fieldset>

        {/* ── Verfügbarkeit ──────────────────────────────────────── */}
        <fieldset style={feldgruppe}>
          <legend style={{ ...beschriftung, padding: 0, marginBottom: 8 }}>Wann kannst du?</legend>
          <div style={chipReihe}>
            {VERFUEGBARKEIT.map(v => (
              <Chip key={v.key} label={v.label} aktiv={verfuegbarkeit.includes(v.key)}
                onChange={() => toggle(verfuegbarkeit, setVerfuegbarkeit, v.key)} />
            ))}
          </div>
        </fieldset>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ ...feld, flex: '1 1 190px' }}>
            <span style={beschriftung}>Stunden pro Woche</span>
            <select value={stunden} onChange={e => setStunden(e.target.value)}
              style={{ ...eingabe, appearance: 'auto', color: stunden ? '#F5F0E8' : '#8A8279' }}>
              <option value="">Keine Angabe</option>
              {STUNDEN.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </label>
          <label style={{ ...feld, flex: '1 1 190px' }}>
            <span style={beschriftung}>Beschäftigungsart</span>
            <select value={beschaeftigungsart} onChange={e => setBeschaeftigungsart(e.target.value)}
              style={{ ...eingabe, appearance: 'auto', color: beschaeftigungsart ? '#F5F0E8' : '#8A8279' }}>
              <option value="">Keine Angabe</option>
              {BESCHAEFTIGUNGSART.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
            </select>
          </label>
        </div>

        <label style={feld}>
          <span style={beschriftung}>Warum möchtest du Engel werden? (optional)</span>
          <textarea value={motivation} onChange={e => setMotivation(e.target.value)}
            maxLength={BEWERBUNG_MAX.motivation} rows={3}
            placeholder="Erzähl uns kurz von dir."
            style={{ ...eingabe, resize: 'vertical', minHeight: 80 }} />
        </label>

        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 4 }}>
          <input type="checkbox" checked={datenschutz} onChange={e => setDatenschutz(e.target.checked)}
            style={{ marginTop: 3, accentColor: '#C9963C', flexShrink: 0 }} />
          <span style={{ color: '#B8B0A4', fontSize: 13, lineHeight: 1.5 }}>
            Ich habe die{' '}
            <Link href="/datenschutz" style={{ color: '#C9963C' }}>Datenschutzhinweise</Link>{' '}
            gelesen und bin damit einverstanden, dass Alltagsengel meine Angaben zur
            Bearbeitung meiner Bewerbung speichert und mich dazu kontaktiert. *
          </span>
        </label>

        {fehler && (
          <p role="alert" style={{ color: '#E74C3C', fontSize: 13, margin: '4px 0 0', lineHeight: 1.5 }}>
            {fehler}
          </p>
        )}
      </div>

      <button type="submit" disabled={status === 'sending'} style={{
        width: '100%', marginTop: 18, padding: '15px 24px', borderRadius: 12, border: 'none',
        background: status === 'sending' ? 'rgba(201,150,60,0.4)' : 'linear-gradient(135deg,#E8C88A,#C9963C)',
        color: '#1A1612', fontWeight: 700, fontSize: 15, fontFamily: 'inherit',
        cursor: status === 'sending' ? 'wait' : 'pointer',
      }}>
        {status === 'sending' ? 'Wird gesendet…' : 'BEWERBUNG ABSENDEN'}
      </button>

      <p style={{ color: '#6A6259', fontSize: 11, textAlign: 'center', marginTop: 12, lineHeight: 1.6 }}>
        Kostenlos und unverbindlich. Wir melden uns telefonisch bei dir.
      </p>
    </form>
  )
}

function Chip({ label, aktiv, onChange }: { label: string; aktiv: boolean; onChange: () => void }) {
  return (
    <label style={{
      display: 'inline-flex', alignItems: 'center', padding: '9px 14px', borderRadius: 999,
      border: '1px solid', fontSize: 13, cursor: 'pointer', transition: 'all .15s',
      borderColor: aktiv ? '#C9963C' : 'rgba(255,255,255,0.12)',
      background: aktiv ? 'rgba(201,150,60,0.14)' : 'rgba(255,255,255,0.03)',
      color: aktiv ? '#E8C88A' : '#B8B0A4',
    }}>
      <input type="checkbox" checked={aktiv} onChange={onChange}
        style={{ marginRight: 8, accentColor: '#C9963C' }} />
      {label}
    </label>
  )
}

// ── Stile ──────────────────────────────────────────────────────────────
const karte: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 18, padding: '26px 24px',
}
const feld: React.CSSProperties = { display: 'block', width: '100%', minWidth: 0 }
const feldgruppe: React.CSSProperties = { border: 'none', padding: 0, margin: '4px 0 0' }
const chipReihe: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8 }
const beschriftung: React.CSSProperties = {
  display: 'block', color: '#B8B0A4', fontSize: 13, fontWeight: 600, marginBottom: 6,
}
const eingabe: React.CSSProperties = {
  width: '100%', padding: '14px 16px', borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)',
  color: '#F5F0E8', fontSize: 15, outline: 'none', boxSizing: 'border-box',
  fontFamily: 'inherit', transition: 'border-color 0.2s',
}
