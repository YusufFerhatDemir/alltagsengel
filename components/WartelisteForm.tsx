'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  WARTELISTE_LEISTUNGEN, WARTELISTE_REGIONEN, WARTELISTE_PFLEGEGRADE, WARTELISTE_MAX,
} from '@/lib/warteliste/katalog'
import { trackContactRequest } from '@/lib/tracking'
import { logger } from '@/lib/logger'

const log = logger.child('warteliste-form')

/**
 * Wartelistenformular.
 *
 * Pflicht sind Name und EIN Rückweg (E-Mail oder Telefon) — dieselbe Regel
 * wie im CHECK der Tabelle und in der Route. Alles andere ist freiwillig:
 * Wer sich vormerken lässt, hat oft noch keinen Pflegegrad und weiß noch
 * nicht, welche Leistung er braucht. Ein Pflichtfeld mehr kostet hier
 * Eintragungen, keine Datenqualität.
 */
export default function WartelisteForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [plz, setPlz] = useState('')
  const [region, setRegion] = useState('')
  const [pflegegrad, setPflegegrad] = useState('')
  const [leistungen, setLeistungen] = useState<string[]>([])
  const [nachricht, setNachricht] = useState('')
  const [datenschutz, setDatenschutz] = useState(false)
  const [honeypot, setHoneypot] = useState('')
  const [utm, setUtm] = useState<{ source?: string; medium?: string; campaign?: string }>({})
  const [status, setStatus] = useState<'idle' | 'sending'>('idle')
  const [fehler, setFehler] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const p = new URLSearchParams(window.location.search)
    setUtm({
      source: p.get('utm_source') || p.get('source') || undefined,
      medium: p.get('utm_medium') || undefined,
      campaign: p.get('utm_campaign') || undefined,
    })
  }, [])

  function toggleLeistung(key: string) {
    setLeistungen(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }

  async function absenden(e: React.FormEvent) {
    e.preventDefault()
    setFehler(null)

    if (!name.trim()) { setFehler('Bitte geben Sie Ihren Namen an.'); return }
    // E-Mail ist Pflicht: darüber geht die Bestätigung raus, und die
    // Zieltabelle verlangt sie ohnehin (NOT NULL).
    if (!email.trim()) {
      setFehler('Bitte geben Sie eine E-Mail-Adresse an — wir bestätigen Ihre Vormerkung darüber.')
      return
    }
    if (!datenschutz) { setFehler('Bitte bestätigen Sie die Datenschutzhinweise.'); return }

    setStatus('sending')
    try {
      const antwort = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, email, phone, plz, region, pflegegrad,
          gewuenschte_leistungen: leistungen,
          nachricht,
          datenschutz,
          website: honeypot,
          utm_source: utm.source, utm_medium: utm.medium, utm_campaign: utm.campaign,
        }),
      })

      const daten = await antwort.json().catch(() => null)

      if (!antwort.ok) {
        // Die Route sagt, was los ist. Diese Meldung wird angezeigt statt
        // eines allgemeinen „hat nicht geklappt" — insbesondere der Fall
        // „Warteliste noch nicht freigeschaltet" (503) muss beim Menschen
        // ankommen, sonst hält er sich für vorgemerkt.
        setFehler(daten?.error || 'Die Vormerkung konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.')
        setStatus('idle')
        return
      }

      trackContactRequest('warteliste')
      router.push(daten?.bereits_vorgemerkt ? '/warteliste/bestaetigung?bereits=1' : '/warteliste/bestaetigung')
    } catch (err) {
      log.errorWithException('Vormerkung fehlgeschlagen', err)
      setFehler('Die Verbindung ist fehlgeschlagen. Bitte versuchen Sie es erneut.')
      setStatus('idle')
    }
  }

  return (
    <form onSubmit={absenden} style={karte} noValidate>
      <h3 style={{ color: '#F5F0E8', fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>
        Jetzt unverbindlich vormerken
      </h3>
      <p style={{ color: '#8A8279', fontSize: 13, margin: '0 0 20px' }}>
        Kostenlos und jederzeit widerrufbar. Wir melden uns, sobald wir in Ihrer Region starten.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Honeypot — für Menschen unsichtbar, für Bots verlockend */}
        <input
          type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true"
          value={honeypot} onChange={e => setHoneypot(e.target.value)}
          style={{ position: 'absolute', left: '-9999px', height: 0, width: 0, opacity: 0 }}
        />

        <label style={feld}>
          <span style={beschriftung}>Name *</span>
          <input
            type="text" value={name} onChange={e => setName(e.target.value)}
            maxLength={WARTELISTE_MAX.name} required autoComplete="name"
            placeholder="Vor- und Nachname" style={eingabe}
          />
        </label>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ ...feld, flex: '1 1 200px' }}>
            <span style={beschriftung}>E-Mail *</span>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              maxLength={WARTELISTE_MAX.email} required autoComplete="email"
              placeholder="name@beispiel.de" style={eingabe}
            />
          </label>
          <label style={{ ...feld, flex: '1 1 200px' }}>
            <span style={beschriftung}>Telefon</span>
            <input
              type="tel" value={phone} onChange={e => setPhone(e.target.value)}
              maxLength={WARTELISTE_MAX.phone} autoComplete="tel"
              placeholder="0170 1234567" style={eingabe}
            />
          </label>
        </div>
        <p style={{ color: '#6A6259', fontSize: 12, margin: '-4px 0 0' }}>
          Die E-Mail brauchen wir für die Bestätigung. Eine Telefonnummer ist freiwillig —
          damit rufen wir zurück, wenn Sie das möchten.
        </p>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ ...feld, flex: '0 1 130px' }}>
            <span style={beschriftung}>PLZ</span>
            <input
              type="text" inputMode="numeric" value={plz}
              onChange={e => setPlz(e.target.value.replace(/\D/g, '').slice(0, 5))}
              maxLength={5} autoComplete="postal-code"
              placeholder="60311" style={eingabe}
            />
          </label>
          <label style={{ ...feld, flex: '1 1 200px' }}>
            <span style={beschriftung}>Region</span>
            <select value={region} onChange={e => setRegion(e.target.value)}
              style={{ ...eingabe, appearance: 'auto', color: region ? '#F5F0E8' : '#8A8279' }}>
              <option value="">Bitte wählen</option>
              {WARTELISTE_REGIONEN.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </label>
          <label style={{ ...feld, flex: '1 1 200px' }}>
            <span style={beschriftung}>Pflegegrad (optional)</span>
            <select value={pflegegrad} onChange={e => setPflegegrad(e.target.value)}
              style={{ ...eingabe, appearance: 'auto', color: pflegegrad ? '#F5F0E8' : '#8A8279' }}>
              <option value="">Keine Angabe</option>
              {WARTELISTE_PFLEGEGRADE.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </label>
        </div>

        <fieldset style={{ border: 'none', padding: 0, margin: '4px 0 0' }}>
          <legend style={{ ...beschriftung, padding: 0, marginBottom: 8 }}>
            Woran haben Sie Interesse? (Mehrfachauswahl möglich)
          </legend>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {WARTELISTE_LEISTUNGEN.map(l => {
              const aktiv = leistungen.includes(l.key)
              return (
                <label key={l.key} style={{
                  ...chip,
                  borderColor: aktiv ? '#C9963C' : 'rgba(255,255,255,0.12)',
                  background: aktiv ? 'rgba(201,150,60,0.14)' : 'rgba(255,255,255,0.03)',
                  color: aktiv ? '#E8C88A' : '#B8B0A4',
                }}>
                  <input
                    type="checkbox" checked={aktiv} onChange={() => toggleLeistung(l.key)}
                    style={{ marginRight: 8, accentColor: '#C9963C' }}
                  />
                  {l.label}
                </label>
              )
            })}
          </div>
        </fieldset>

        <label style={feld}>
          <span style={beschriftung}>Ihre Nachricht (optional)</span>
          <textarea
            value={nachricht} onChange={e => setNachricht(e.target.value)}
            maxLength={WARTELISTE_MAX.nachricht} rows={3}
            placeholder="Worum geht es? Was ist Ihnen wichtig?"
            style={{ ...eingabe, resize: 'vertical', minHeight: 80 }}
          />
        </label>

        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 4 }}>
          <input
            type="checkbox" checked={datenschutz} onChange={e => setDatenschutz(e.target.checked)}
            style={{ marginTop: 3, accentColor: '#C9963C', flexShrink: 0 }}
          />
          <span style={{ color: '#B8B0A4', fontSize: 13, lineHeight: 1.5 }}>
            Ich habe die{' '}
            <Link href="/datenschutz" style={{ color: '#C9963C' }}>Datenschutzhinweise</Link>{' '}
            gelesen und bin damit einverstanden, dass Alltagsengel meine Angaben zur
            Bearbeitung meiner Vormerkung speichert und mich dazu kontaktiert. *
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
        {status === 'sending' ? 'Wird gesendet…' : 'JETZT UNVERBINDLICH VORMERKEN'}
      </button>

      <p style={{ color: '#6A6259', fontSize: 11, textAlign: 'center', marginTop: 12, lineHeight: 1.6 }}>
        Kostenlos und unverbindlich. Es entsteht kein Vertrag und keine Zahlungspflicht.
      </p>
    </form>
  )
}

// ── Stile ──────────────────────────────────────────────────────────────
const karte: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 18, padding: '26px 24px',
}
const feld: React.CSSProperties = { display: 'block', width: '100%', minWidth: 0 }
const beschriftung: React.CSSProperties = {
  display: 'block', color: '#B8B0A4', fontSize: 13, fontWeight: 600, marginBottom: 6,
}
const eingabe: React.CSSProperties = {
  width: '100%', padding: '14px 16px', borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)',
  color: '#F5F0E8', fontSize: 15, outline: 'none', boxSizing: 'border-box',
  fontFamily: 'inherit', transition: 'border-color 0.2s',
}
const chip: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', padding: '9px 14px', borderRadius: 999,
  border: '1px solid', fontSize: 13, cursor: 'pointer', transition: 'all .15s',
}
