'use client'
// ═══════════════════════════════════════════════════════════════
// Onboarding neuer Organisationen (Phase 3 — Multi-Mandant SaaS)
// Flow: 1 Konto → 2 Organisation & IK-Nummer → 3 ITSG-Zertifikat →
//       4 Erste Verordnung / fertig
// ═══════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { validateIkNummer } from '@/lib/organizations/ik'
import { BUNDESLAND_NAMEN } from '@/lib/expansion/types'
import { eindeutigesBundeslandFuerPlz } from '@/lib/expansion/plz-bundesland'
import BundeslandErkennung from '@/components/kunde/BundeslandErkennung'

type Step = 1 | 2 | 3 | 4

const STEPS: Array<{ nr: Step; label: string }> = [
  { nr: 1, label: 'Konto' },
  { nr: 2, label: 'Organisation' },
  { nr: 3, label: 'Zertifikat' },
  { nr: 4, label: 'Loslegen' },
]

const box: React.CSSProperties = {
  background: '#fff', borderRadius: 16, padding: '28px 24px',
  boxShadow: '0 2px 16px rgba(42,36,25,0.07)', border: '1px solid #EDE5D8',
}
const label: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: '#5A5142', marginBottom: 6 }
const input: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #DDD3C2',
  fontSize: 15, background: '#FCFAF6', color: '#2A2419', fontFamily: 'inherit', boxSizing: 'border-box',
}
const btnPrimary: React.CSSProperties = {
  padding: '12px 24px', borderRadius: 12, border: 'none', background: '#C9963C',
  color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
}
const btnGhost: React.CSSProperties = {
  padding: '12px 20px', borderRadius: 12, border: '1px solid #DDD3C2', background: 'transparent',
  color: '#5A5142', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
}

export default function OnboardingPage() {
  const [step, setStep] = useState<Step>(1)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loggedIn, setLoggedIn] = useState(false)

  // Schritt 2
  const [name, setName] = useState('')
  const [ik, setIk] = useState('')
  const [ikError, setIkError] = useState('')
  const [strasse, setStrasse] = useState('')
  const [plz, setPlz] = useState('')
  const [ort, setOrt] = useState('')
  // Katalog-Code, nicht Klartext — organizations.bundesland traegt einen
  // Fremdschluessel auf public.bundeslaender.
  const [bundesland, setBundesland] = useState('hessen')
  // Sobald eine vollstaendige PLZ steht, wird das Bundesland daraus
  // vorbelegt. Der Nutzer kann es weiterhin ueberschreiben.
  useEffect(() => {
    const ausPlz = eindeutigesBundeslandFuerPlz(plz)
    if (ausPlz) setBundesland(ausPlz)
  }, [plz])
  const [orgId, setOrgId] = useState<string | null>(null)
  const [orgName, setOrgName] = useState('')

  // Schritt 3
  const [zertDatei, setZertDatei] = useState<File | null>(null)
  const [zertPasswort, setZertPasswort] = useState('')
  const [zertInfo, setZertInfo] = useState<{ ik_nummer: string; gueltig_bis: string } | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setLoggedIn(Boolean(user))
      if (user) setStep(2)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  function handleIkChange(value: string) {
    setIk(value)
    const cleaned = value.replace(/\s/g, '')
    if (cleaned.length === 9) {
      const check = validateIkNummer(cleaned)
      setIkError(check.valid ? '' : check.error || '')
    } else {
      setIkError('')
    }
  }

  async function handleCreateOrg() {
    setError('')
    const check = validateIkNummer(ik)
    if (!check.valid) { setIkError(check.error || ''); return }
    if (name.trim().length < 3) { setError('Bitte einen Firmennamen angeben.'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          ik_nummer: ik.replace(/\s/g, ''),
          address: { strasse, plz, ort },
          bundesland,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data?.error || 'Anlegen fehlgeschlagen'); return }
      setOrgId(data.organization.id)
      setOrgName(data.organization.name)
      setStep(3)
    } catch (e: any) {
      setError(e?.message || 'Netzwerkfehler')
    } finally {
      setBusy(false)
    }
  }

  async function handleUploadZertifikat() {
    if (!orgId || !zertDatei) return
    setError('')
    setBusy(true)
    try {
      const form = new FormData()
      form.append('organization_id', orgId)
      form.append('datei', zertDatei)
      if (zertPasswort) form.append('passwort', zertPasswort)
      const res = await fetch('/api/organizations/zertifikat', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) { setError(data?.error || 'Upload fehlgeschlagen'); return }
      setZertInfo({ ik_nummer: data.ik_nummer, gueltig_bis: data.gueltig_bis })
      setStep(4)
    } catch (e: any) {
      setError(e?.message || 'Netzwerkfehler')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F7F2EA' }}>
        <div style={{ width: 40, height: 40, border: '3px solid #C9963C', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F7F2EA', padding: '40px 16px' }}>
      <div style={{ maxWidth: 620, margin: '0 auto' }}>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 34, color: '#2A2419', marginBottom: 4, textAlign: 'center' }}>
          Willkommen bei der Abrechnungsplattform
        </h1>
        <p style={{ textAlign: 'center', color: '#7A7060', fontSize: 15, marginBottom: 28 }}>
          In vier Schritten von der Registrierung zur ersten Kassenabrechnung.
        </p>

        {/* Fortschrittsleiste */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 28 }}>
          {STEPS.map(s => (
            <div key={s.nr} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{
                height: 5, borderRadius: 3, marginBottom: 6,
                background: step >= s.nr ? '#C9963C' : '#E5DCCB',
              }} />
              <span style={{ fontSize: 11, fontWeight: step === s.nr ? 700 : 500, color: step >= s.nr ? '#8A6A25' : '#A99F8D' }}>
                {s.nr}. {s.label}
              </span>
            </div>
          ))}
        </div>

        {error && (
          <div style={{ background: '#FBEAEA', border: '1px solid #E5B8B8', color: '#8A2A2A', borderRadius: 10, padding: '10px 14px', fontSize: 14, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {/* ═══ Schritt 1: Konto ═══ */}
        {step === 1 && (
          <div style={box}>
            <h2 style={{ fontSize: 20, color: '#2A2419', marginTop: 0 }}>Konto anlegen</h2>
            <p style={{ fontSize: 14, color: '#5A5142', lineHeight: 1.6 }}>
              Für die Abrechnungsplattform benötigen Sie ein Benutzerkonto.
              {loggedIn ? ' Sie sind bereits angemeldet.' : ' Bitte registrieren Sie sich oder melden Sie sich an — Sie kommen danach automatisch hierher zurück.'}
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              {loggedIn ? (
                <button style={btnPrimary} onClick={() => setStep(2)}>Weiter</button>
              ) : (
                <>
                  <Link href="/auth/register?redirectTo=/onboarding"><button style={btnPrimary}>Registrieren</button></Link>
                  <Link href="/auth/login?redirectTo=/onboarding"><button style={btnGhost}>Ich habe schon ein Konto</button></Link>
                </>
              )}
            </div>
          </div>
        )}

        {/* ═══ Schritt 2: Organisation & IK ═══ */}
        {step === 2 && (
          <div style={box}>
            <h2 style={{ fontSize: 20, color: '#2A2419', marginTop: 0 }}>Ihr Pflegedienst</h2>
            <div style={{ display: 'grid', gap: 14 }}>
              <div>
                <label style={label}>Firmenname *</label>
                <input style={input} value={name} onChange={e => setName(e.target.value)} placeholder="z. B. Pflegedienst Sonnenschein GmbH" />
              </div>
              <div>
                <label style={label}>IK-Nummer (Institutionskennzeichen) *</label>
                <input
                  style={{ ...input, ...(ikError ? { border: '1px solid #C96B3C' } : {}) }}
                  value={ik} onChange={e => handleIkChange(e.target.value)}
                  placeholder="9 Ziffern, z. B. 460629986" inputMode="numeric" maxLength={11}
                />
                {ikError
                  ? <p style={{ color: '#A8501F', fontSize: 12, margin: '4px 0 0' }}>{ikError}</p>
                  : ik.replace(/\s/g, '').length === 9 && <p style={{ color: '#4A7A3A', fontSize: 12, margin: '4px 0 0' }}>✓ Prüfziffer korrekt</p>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
                <div>
                  <label style={label}>Straße & Hausnummer</label>
                  <input style={input} value={strasse} onChange={e => setStrasse(e.target.value)} />
                </div>
                <div>
                  <label style={label}>PLZ</label>
                  <input
                    style={input}
                    value={plz}
                    onChange={e => setPlz(e.target.value.replace(/\D/g, '').slice(0, 5))}
                    maxLength={5}
                    inputMode="numeric"
                  />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={label}>Ort</label>
                  <input style={input} value={ort} onChange={e => setOrt(e.target.value)} />
                </div>
                <div>
                  <label style={label}>Bundesland *</label>
                  <select style={input} value={bundesland} onChange={e => setBundesland(e.target.value)}>
                    {Object.entries(BUNDESLAND_NAMEN).map(([code, name]) => (
                      <option key={code} value={code}>{name}</option>
                    ))}
                  </select>
                </div>
              </div>
              {/* Zeigt sofort, was im erkannten Bundesland moeglich ist —
                  Kassenabrechnung, nur Privatleistungen oder Vormerkung. */}
              <BundeslandErkennung plz={plz} ausfuehrlich />
              <p style={{ fontSize: 12, color: '#8A8070', margin: 0 }}>
                Das Bundesland bestimmt den Leistungskomplex-Katalog und die Tarifkennzeichen Ihrer Abrechnung.
              </p>
            </div>
            <div style={{ marginTop: 20 }}>
              <button style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={handleCreateOrg}>
                {busy ? 'Wird angelegt…' : 'Organisation anlegen'}
              </button>
            </div>
          </div>
        )}

        {/* ═══ Schritt 3: ITSG-Zertifikat ═══ */}
        {step === 3 && (
          <div style={box}>
            <h2 style={{ fontSize: 20, color: '#2A2419', marginTop: 0 }}>ITSG-Zertifikat</h2>
            <p style={{ fontSize: 14, color: '#5A5142', lineHeight: 1.6 }}>
              Für den verschlüsselten Datenaustausch mit den Kassen (SECON, Anlage 16) benötigt
              <strong> {orgName || 'Ihre Organisation'}</strong> ein X.509-Zertifikat des ITSG Trust Centers,
              ausgestellt auf Ihre IK-Nummer. Sie können es hier hochladen — oder diesen Schritt
              überspringen und das Zertifikat später unter „Abrechnung → Einstellungen" nachreichen.
            </p>
            <div style={{ display: 'grid', gap: 14, marginTop: 8 }}>
              <div>
                <label style={label}>Zertifikatsdatei (.p12 oder .pem)</label>
                <input type="file" accept=".p12,.pfx,.pem,.crt,.cer" style={{ fontSize: 14 }}
                  onChange={e => setZertDatei(e.target.files?.[0] || null)} />
              </div>
              <div>
                <label style={label}>Passwort (nur bei .p12-Dateien)</label>
                <input type="password" style={input} value={zertPasswort} onChange={e => setZertPasswort(e.target.value)} autoComplete="off" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button style={{ ...btnPrimary, opacity: busy || !zertDatei ? 0.6 : 1 }} disabled={busy || !zertDatei} onClick={handleUploadZertifikat}>
                {busy ? 'Wird geprüft…' : 'Zertifikat hochladen'}
              </button>
              <button style={btnGhost} disabled={busy} onClick={() => setStep(4)}>Später nachreichen</button>
            </div>
            <p style={{ fontSize: 12, color: '#8A8070', marginTop: 14 }}>
              Noch kein Zertifikat? Der Online-Antrag beim ITSG Trust Center dauert nur wenige Tage
              (~70–100 €, 3 Jahre gültig): itsg.de → Trust Center → Zertifikat beantragen.
            </p>
          </div>
        )}

        {/* ═══ Schritt 4: Fertig / Erste Verordnung ═══ */}
        {step === 4 && (
          <div style={box}>
            <h2 style={{ fontSize: 20, color: '#2A2419', marginTop: 0 }}>Geschafft — Sie können loslegen!</h2>
            <ul style={{ fontSize: 14, color: '#5A5142', lineHeight: 2, paddingLeft: 20, margin: '8px 0 16px' }}>
              <li>Organisation <strong>{orgName || '—'}</strong> ist angelegt.</li>
              <li>{zertInfo
                ? <>ITSG-Zertifikat hinterlegt (IK {zertInfo.ik_nummer}, gültig bis {zertInfo.gueltig_bis}).</>
                : <>ITSG-Zertifikat: noch offen — jederzeit unter „Abrechnung → Einstellungen" nachreichbar.</>}
              </li>
              <li>Nächster Schritt: Legen Sie Ihre <strong>erste Verordnung</strong> an. Daraus entstehen
                Leistungsnachweise, Rechnungen und schließlich Ihre erste Test-Kassenabrechnung (EDIFACT).</li>
            </ul>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link href="/admin/verordnungen"><button style={btnPrimary}>Erste Verordnung anlegen</button></Link>
              <Link href="/admin/home"><button style={btnGhost}>Zum Dashboard</button></Link>
            </div>
            <p style={{ fontSize: 12, color: '#8A8070', marginTop: 14 }}>
              Sobald Ihre ersten Leistungen erfasst sind, reicht die Plattform automatisch Testdateien
              bei den zuständigen Datenannahmestellen ein — den Status sehen Sie unter „Abrechnung".
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
