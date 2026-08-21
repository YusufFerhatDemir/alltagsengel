'use client'

// ═══════════════════════════════════════════════════════════════
// Admin — Zweiten Faktor einrichten (TOTP)
//
// Diese Seite ist eine Ausnahme vom MFA-Gate: Sie wird angezeigt,
// auch wenn der Admin noch keinen Faktor hat (sonst könnte er ihn
// nie einrichten).
// ═══════════════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { faktorName, verifizierteFaktoren, type MfaFaktor } from '@/lib/coach/mfa'

interface Einrichtung {
  faktorId: string
  qrCode: string
  geheimnis: string
}

const cardStyle: React.CSSProperties = {
  background: 'var(--card-bg, rgba(28,24,20,0.6))',
  border: '1px solid var(--border, rgba(201,150,60,0.15))',
  borderRadius: 16,
  padding: 24,
  marginBottom: 24,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 220,
  padding: '10px 14px',
  borderRadius: 10,
  border: '1px solid var(--border, rgba(201,150,60,0.2))',
  background: 'rgba(13,10,8,0.5)',
  color: 'var(--ink, #e8e0d4)',
  fontSize: 20,
  fontFamily: 'monospace',
  letterSpacing: '0.2em',
  textAlign: 'center' as const,
}

const btnStyle: React.CSSProperties = {
  padding: '10px 20px',
  borderRadius: 10,
  border: 'none',
  background: 'linear-gradient(135deg, #C9963C, #DBA84A)',
  color: '#0D0A08',
  fontWeight: 700,
  fontSize: 14,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const btnSecondaryStyle: React.CSSProperties = {
  ...btnStyle,
  background: 'rgba(100,100,100,0.25)',
  color: 'var(--ink, #e8e0d4)',
}

const btnDangerStyle: React.CSSProperties = {
  ...btnStyle,
  background: 'rgba(180,50,50,0.8)',
  color: '#fff',
  padding: '6px 14px',
  fontSize: 12,
}

export default function AdminMfaEinrichtung() {
  const router = useRouter()
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
      setMeldung({ art: 'error', text: 'MFA-Status konnte nicht geladen werden. Bitte laden Sie die Seite neu.' })
      setGeladen(true)
      return
    }
    setFaktoren((data?.all ?? []) as MfaFaktor[])
    setGeladen(true)
  }, [])

  useEffect(() => { void ladeFaktoren() }, [ladeFaktoren])

  const aktiv = verifizierteFaktoren(faktoren)

  const starteEinrichtung = async () => {
    setMeldung(null)
    setArbeitet(true)
    try {
      const supabase = createClient()
      // Angefangene, nie bestätigte Versuche aufräumen
      for (const alt of faktoren.filter(f => f.status === 'unverified')) {
        await supabase.auth.mfa.unenroll({ factorId: alt.id })
      }
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `Admin ${new Date().toLocaleDateString('de-DE')}`,
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
      // Nach kurzer Pause zum Dashboard weiterleiten
      setTimeout(() => router.push('/admin/dashboard'), 2000)
    } finally {
      setArbeitet(false)
    }
  }

  const entferne = async (faktor: MfaFaktor) => {
    const ok = window.confirm(
      'Nach dem Entfernen genügt für die Anmeldung wieder das Passwort allein. ' +
      'Sie können den zweiten Faktor jederzeit neu einrichten. Wirklich entfernen?',
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

  const msgStyle = (msg: { art: string }): React.CSSProperties => ({
    padding: '10px 14px',
    borderRadius: 10,
    marginBottom: 16,
    fontSize: 13,
    background: msg.art === 'ok' ? 'rgba(50,180,80,0.15)' : 'rgba(180,50,50,0.15)',
    color: msg.art === 'ok' ? '#6ddf80' : '#ff8080',
  })

  return (
    <div style={{ maxWidth: 700 }}>
      <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>
        Anmeldesicherheit (MFA)
      </h1>
      <p style={{ color: 'var(--dim)', fontSize: 14, marginBottom: 24 }}>
        Schützen Sie Ihr Admin-Konto mit einem zweiten Faktor (Authenticator-App).
      </p>

      {meldung && <div style={msgStyle(meldung)}>{meldung.text}</div>}

      {/* ═══ Hinweis für Admins ohne Faktor ═══ */}
      {geladen && aktiv.length === 0 && !einrichtung && (
        <div style={{
          ...cardStyle,
          border: '1px solid rgba(201,150,60,0.4)',
          background: 'rgba(201,150,60,0.08)',
        }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--gold2, #DBA84A)', marginBottom: 12, fontFamily: "'Cormorant Garamond', serif" }}>
            Zweiter Faktor erforderlich
          </h2>
          <p style={{ color: 'var(--ink)', fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>
            Für Admin-Konten ist ein zweiter Faktor (TOTP) Pflicht. Er schützt das Konto auch dann,
            wenn das Passwort in fremde Hände gerät. Sie brauchen eine Authenticator-App auf Ihrem
            Handy — z.&nbsp;B. „Google Authenticator", „Microsoft Authenticator" oder „FreeOTP"
            (kostenlos in den App-Stores).
          </p>
          <p style={{ color: 'var(--dim)', fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>
            <strong>Wichtig:</strong> Wenn Sie das Gerät mit der App verlieren, können
            Sie sich nicht mehr allein anmelden. Notieren Sie den angezeigten Schlüssel
            an einem sicheren Ort.
          </p>
          <button type="button" onClick={starteEinrichtung} disabled={arbeitet} style={btnStyle}>
            {arbeitet ? 'Wird vorbereitet...' : 'Jetzt einrichten'}
          </button>
        </div>
      )}

      {/* ═══ QR-Code-Einrichtung ═══ */}
      {einrichtung && (
        <div style={cardStyle}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 16, fontFamily: "'Cormorant Garamond', serif" }}>
            Schritt für Schritt
          </h2>
          <ol style={{ color: 'var(--ink)', fontSize: 14, lineHeight: 1.8, paddingLeft: '1.4em', marginBottom: 16 }}>
            <li>Öffnen Sie die Authenticator-App auf Ihrem Handy.</li>
            <li>Wählen Sie dort „Konto hinzufügen" oder das Plus-Zeichen.</li>
            <li>Scannen Sie mit der App dieses Bild:</li>
          </ol>

          <div style={{ marginBottom: 16 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={einrichtung.qrCode}
              alt="QR-Code zum Einrichten des zweiten Faktors"
              style={{ width: 220, height: 220, background: '#fff', padding: 12, borderRadius: 8 }}
            />
          </div>

          <p style={{ color: 'var(--dim)', fontSize: 13, marginBottom: 8 }}>
            Können Sie nicht scannen? Geben Sie in der App stattdessen diesen Schlüssel ein:
          </p>
          <p style={{ fontFamily: 'monospace', fontSize: 14, color: 'var(--ink)', wordBreak: 'break-all', marginBottom: 20, background: 'rgba(13,10,8,0.4)', padding: '8px 12px', borderRadius: 8 }}>
            {einrichtung.geheimnis}
          </p>

          <form onSubmit={bestaetige}>
            <label style={{ display: 'block', color: 'var(--ink)', fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
              Sechsstelliger Code aus der App
            </label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]*"
              maxLength={7}
              required
              autoFocus
              value={code}
              onChange={e => setCode(e.target.value)}
              style={inputStyle}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
              <button type="submit" disabled={arbeitet || code.replace(/\s/g, '').length < 6} style={btnStyle}>
                {arbeitet ? 'Wird geprüft...' : 'Code prüfen und aktivieren'}
              </button>
              <button
                type="button"
                onClick={() => { setEinrichtung(null); setCode('') }}
                disabled={arbeitet}
                style={btnSecondaryStyle}
              >
                Abbrechen
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ═══ Bestehende Faktoren ═══ */}
      {geladen && aktiv.length > 0 && (
        <div style={cardStyle}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 16, fontFamily: "'Cormorant Garamond', serif" }}>
            Aktive Faktoren
          </h2>
          {aktiv.map(f => (
            <div
              key={f.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 14px',
                borderRadius: 10,
                background: 'rgba(13,10,8,0.4)',
                marginBottom: 8,
              }}
            >
              <div>
                <span style={{ color: 'var(--ink)', fontSize: 14, fontWeight: 600 }}>
                  {faktorName(f)}
                </span>
                <span style={{ color: 'var(--dim)', fontSize: 12, marginLeft: 8 }}>
                  Aktiv — wird bei jeder Anmeldung abgefragt
                </span>
              </div>
              <button
                type="button"
                onClick={() => entferne(f)}
                disabled={arbeitet}
                style={btnDangerStyle}
              >
                Entfernen
              </button>
            </div>
          ))}
          {!einrichtung && (
            <button
              type="button"
              onClick={starteEinrichtung}
              disabled={arbeitet}
              style={{ ...btnSecondaryStyle, marginTop: 12 }}
            >
              Weiteres Gerät hinzufügen
            </button>
          )}
        </div>
      )}

      {/* ═══ Zurück-Link ═══ */}
      {geladen && aktiv.length > 0 && !einrichtung && (
        <div style={{ marginTop: 16 }}>
          <button
            type="button"
            onClick={() => router.push('/admin/settings')}
            style={{ background: 'none', border: 'none', color: 'var(--gold2, #DBA84A)', cursor: 'pointer', fontSize: 14, textDecoration: 'underline', padding: 0, fontFamily: 'inherit' }}
          >
            Zurück zu den Einstellungen
          </button>
        </div>
      )}
    </div>
  )
}
