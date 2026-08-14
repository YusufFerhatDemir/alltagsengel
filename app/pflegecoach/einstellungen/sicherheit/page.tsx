'use client'

// ═══════════════════════════════════════════════════════════════
// PflegeCoach — Anmeldesicherheit (zweiter Faktor)
//
// Deckt DiPA-Matrix SEC-03 ab. Die Begründungen für TOTP statt SMS und
// für „freiwillig, aber durchgesetzt" stehen in lib/coach/mfa.ts.
//
// WARUM DIREKT GEGEN DIE AUTH-SCHICHT und nicht über /api/coach/*:
// Die Faktor-Verwaltung ist reine Kontosache und läuft ausschließlich auf
// der Sitzung des Nutzers — es gibt nichts zu autorisieren, was eine
// eigene Route besser könnte. Vor allem: Das TOTP-Geheimnis darf unsere
// Anwendung nie zu Gesicht bekommen; es geht direkt zwischen Auth-Schicht
// und Gerät des Nutzers hin und her.
//
// ZIELGRUPPE: Die Seite erklärt jeden Schritt in ganzen Sätzen und nennt
// den Verlustfall („Handy weg") ausdrücklich, bevor eingerichtet wird —
// hochaltrige Nutzer sperren sich sonst selbst aus.
// ═══════════════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { faktorName, verifizierteFaktoren, type MfaFaktor } from '@/lib/coach/mfa'
import { COACH_SUPPORT_EMAIL } from '@/lib/coach/version'
import { useCoachProfil } from '../../_lib/client'
import { CoachLaden, CoachLadefehler } from '../../_lib/Zustand'

interface Einrichtung {
  faktorId: string
  qrCode: string
  geheimnis: string
}

const FEHLER_TEXT =
  'Die Anmeldesicherheit konnte nicht geladen werden. Bitte laden Sie die Seite neu.'

export default function SicherheitSeite() {
  const { profil, laden, fehler, neuLaden } = useCoachProfil()
  const [faktoren, setFaktoren] = useState<MfaFaktor[]>([])
  const [geladen, setGeladen] = useState(false)
  const [einrichtung, setEinrichtung] = useState<Einrichtung | null>(null)
  const [code, setCode] = useState('')
  const [arbeitet, setArbeitet] = useState(false)
  const [meldung, setMeldung] = useState<{ art: 'ok' | 'error'; text: string } | null>(null)

  const ladeFaktoren = useCallback(async () => {
    const supabase = createClient()
    const { data, error } = await supabase.auth.mfa.listFactors()
    if (error) {
      setMeldung({ art: 'error', text: FEHLER_TEXT })
      setGeladen(true)
      return
    }
    setFaktoren((data?.all ?? []) as MfaFaktor[])
    setGeladen(true)
  }, [])

  useEffect(() => { if (profil) void ladeFaktoren() }, [profil, ladeFaktoren])

  if (laden) return <CoachLaden />
  if (fehler) return <CoachLadefehler fehler={fehler} neuLaden={neuLaden} />
  if (!profil) return null

  const aktiv = verifizierteFaktoren(faktoren)

  const starteEinrichtung = async () => {
    setMeldung(null)
    setArbeitet(true)
    try {
      const supabase = createClient()
      // Angefangene, nie bestätigte Versuche zuerst aufräumen: Die
      // Auth-Schicht lehnt eine zweite Einrichtung mit gleichem Namen sonst ab,
      // und der Nutzer stünde vor einer unerklärlichen Fehlermeldung.
      for (const alt of faktoren.filter(f => f.status === 'unverified')) {
        await supabase.auth.mfa.unenroll({ factorId: alt.id })
      }
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `PflegeCoach ${new Date().toLocaleDateString('de-DE')}`,
      })
      if (error || !data) {
        setMeldung({ art: 'error', text: 'Die Einrichtung konnte nicht gestartet werden. Bitte später erneut versuchen.' })
        return
      }
      setEinrichtung({ faktorId: data.id, qrCode: data.totp.qr_code, geheimnis: data.totp.secret })
      setCode('')
    } finally {
      setArbeitet(false)
    }
  }

  const bestaetige = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!einrichtung) return
    setMeldung(null)
    setArbeitet(true)
    try {
      const supabase = createClient()
      const { data: challenge, error: challengeFehler } = await supabase.auth.mfa.challenge({
        factorId: einrichtung.faktorId,
      })
      if (challengeFehler || !challenge) {
        setMeldung({ art: 'error', text: 'Die Prüfung konnte nicht gestartet werden. Bitte später erneut versuchen.' })
        return
      }
      const { error } = await supabase.auth.mfa.verify({
        factorId: einrichtung.faktorId,
        challengeId: challenge.id,
        code: code.replace(/\s/g, ''),
      })
      if (error) {
        setMeldung({
          art: 'error',
          text: 'Der Code stimmt nicht. Bitte geben Sie den aktuell angezeigten sechsstelligen Code ein — er wechselt alle 30 Sekunden.',
        })
        return
      }
      setEinrichtung(null)
      setCode('')
      setMeldung({ art: 'ok', text: 'Der zweite Faktor ist eingerichtet. Ab der nächsten Anmeldung fragen wir zusätzlich nach dem Code.' })
      await ladeFaktoren()
    } finally {
      setArbeitet(false)
    }
  }

  const entferne = async (faktor: MfaFaktor) => {
    const ok = window.confirm(
      'Nach dem Entfernen genügt für die Anmeldung wieder das Passwort allein. ' +
      'Sie können den zweiten Faktor jederzeit neu einrichten. Wirklich entfernen?'
    )
    if (!ok) return
    setMeldung(null)
    setArbeitet(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.mfa.unenroll({ factorId: faktor.id })
      if (error) {
        setMeldung({ art: 'error', text: 'Der zweite Faktor konnte nicht entfernt werden. Bitte später erneut versuchen.' })
        return
      }
      setMeldung({ art: 'ok', text: 'Der zweite Faktor wurde entfernt.' })
      await ladeFaktoren()
    } finally {
      setArbeitet(false)
    }
  }

  return (
    <>
      <h1 className="pc-h1">Anmeldesicherheit</h1>

      {meldung && (
        <p className={`pc-feedback pc-feedback--${meldung.art}`} role={meldung.art === 'error' ? 'alert' : 'status'}>
          {meldung.text}
        </p>
      )}

      <section className="pc-card" aria-labelledby="erklaerung-titel">
        <h2 id="erklaerung-titel">Was ist der zweite Faktor?</h2>
        <p>
          Beim Anmelden geben Sie normalerweise nur Ihr Passwort ein. Mit einem zweiten Faktor
          kommt ein sechsstelliger Code dazu, den eine App auf Ihrem Handy oder Tablet erzeugt.
          Wer Ihr Passwort kennt, kommt dann trotzdem nicht an Ihre Pflegedaten.
        </p>
        <p className="pc-lead">
          Der zweite Faktor ist <strong>freiwillig</strong>. Ohne ihn können Sie den PflegeCoach
          unverändert nutzen. Wenn Sie ihn einrichten, gilt er ab der nächsten Anmeldung.
        </p>
        <p className="pc-lead">
          <strong>Bitte vorher bedenken:</strong> Wenn Sie das Gerät mit der App verlieren, können
          Sie sich nicht mehr allein anmelden. Wir helfen Ihnen dann weiter — schreiben Sie an{' '}
          <a href={`mailto:${COACH_SUPPORT_EMAIL}`}>{COACH_SUPPORT_EMAIL}</a>. Bewahren Sie den
          unten angezeigten Schlüssel deshalb an einem sicheren Ort auf.
        </p>
      </section>

      <section className="pc-card" aria-labelledby="stand-titel">
        <h2 id="stand-titel">Ihr aktueller Stand</h2>
        {!geladen && <p className="pc-lead">Wird geladen …</p>}
        {geladen && aktiv.length === 0 && (
          <p>
            Für Ihr Konto ist <strong>kein zweiter Faktor</strong> eingerichtet. Die Anmeldung
            erfolgt allein mit Passwort.
          </p>
        )}
        {geladen && aktiv.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {aktiv.map(f => (
              <li
                key={f.id}
                style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--pc-border)' }}
              >
                <span style={{ flex: 1 }}>
                  <strong>{faktorName(f)}</strong>
                  <br />
                  <span className="pc-lead">Aktiv — wird bei jeder Anmeldung abgefragt</span>
                </span>
                <button
                  type="button"
                  className="pc-btn pc-btn--secondary pc-btn--small"
                  onClick={() => entferne(f)}
                  disabled={arbeitet}
                >
                  Entfernen
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!einrichtung && geladen && (
        <section className="pc-card" aria-labelledby="einrichten-titel">
          <h2 id="einrichten-titel">Zweiten Faktor einrichten</h2>
          <p>
            Sie brauchen eine Authenticator-App auf Ihrem Handy oder Tablet. Diese Apps sind
            kostenlos und in den App-Stores erhältlich; gängige Namen sind „Google Authenticator",
            „Microsoft Authenticator" oder „FreeOTP".
          </p>
          <button type="button" className="pc-btn" onClick={starteEinrichtung} disabled={arbeitet}>
            {aktiv.length > 0 ? 'Weiteres Gerät hinzufügen' : 'Jetzt einrichten'}
          </button>
        </section>
      )}

      {einrichtung && (
        <section className="pc-card" aria-labelledby="qr-titel">
          <h2 id="qr-titel">Schritt für Schritt</h2>
          <ol style={{ paddingLeft: '1.4em', lineHeight: 1.7 }}>
            <li>Öffnen Sie die Authenticator-App auf Ihrem Handy.</li>
            <li>Wählen Sie dort „Konto hinzufügen" oder das Plus-Zeichen.</li>
            <li>Scannen Sie mit der App dieses Bild:</li>
          </ol>
          {/* Das Bild kommt als fertige Grafik von der Auth-Schicht (Daten-URL);
              next/image bringt hier nichts und würde nur eine Optimierungs-Route
              vor ein bereits eingebettetes Bild schalten. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={einrichtung.qrCode}
            alt="QR-Code zum Einrichten des zweiten Faktors. Falls Sie ihn nicht scannen können, verwenden Sie den darunter angezeigten Schlüssel."
            style={{ width: 220, height: 220, background: '#fff', padding: 12, borderRadius: 8 }}
          />
          <p className="pc-lead">
            Können Sie nicht scannen? Geben Sie in der App stattdessen diesen Schlüssel ein:
          </p>
          <p style={{ fontFamily: 'monospace', fontSize: '1.1rem', wordBreak: 'break-all' }}>
            {einrichtung.geheimnis}
          </p>

          <form onSubmit={bestaetige} style={{ marginTop: 16 }}>
            <label htmlFor="mfa-code" style={{ display: 'block', marginBottom: 8 }}>
              <strong>Sechsstelliger Code aus der App</strong>
            </label>
            <input
              id="mfa-code"
              name="mfa-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]*"
              maxLength={7}
              required
              value={code}
              onChange={e => setCode(e.target.value)}
              style={{ maxWidth: 200, fontSize: '1.3rem', letterSpacing: '0.2em' }}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
              <button type="submit" className="pc-btn" disabled={arbeitet || code.trim().length < 6}>
                Code prüfen und aktivieren
              </button>
              <button
                type="button"
                className="pc-btn pc-btn--secondary"
                onClick={() => { setEinrichtung(null); setCode('') }}
                disabled={arbeitet}
              >
                Abbrechen
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="pc-card" aria-labelledby="zurueck-titel">
        <h2 id="zurueck-titel">Weitere Einstellungen</h2>
        <p>
          <Link href="/pflegecoach/einstellungen">Zurück zu den Einstellungen</Link>
        </p>
      </section>
    </>
  )
}
