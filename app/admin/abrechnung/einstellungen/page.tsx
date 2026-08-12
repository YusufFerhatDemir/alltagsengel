'use client'
// ═══════════════════════════════════════════════════════════════
// Abrechnung · Einstellungen — SECON-Verschlüsselung + Transport
//
// - Eigenes ITSG-Zertifikat (PKCS#12) hochladen (IK 460629986)
// - Empfänger-Zertifikate aus dem ITSG-Verzeichnis laden
// - Datenannahmestellen (SFTP) konfigurieren + Verbindung testen
// - Zertifikat-Ablauf-Warnung
// ═══════════════════════════════════════════════════════════════
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getOrgIK } from '@/lib/config/org-config'
import { Banner, EmptyRow } from '@/components/admin/OpsUI'

interface ZertifikatRow {
  id: string
  ik_nummer: string
  typ: 'absender' | 'empfaenger'
  gueltig_ab: string | null
  gueltig_bis: string | null
  fingerprint: string | null
  zertifikat_url: string | null
}

interface Annahmestelle {
  id: string
  name: string
  ik_nummer: string | null
  sftp_host: string | null
  sftp_port: number | null
  sftp_user: string | null
  sftp_verzeichnis: string | null
  antwort_verzeichnis: string | null
  sftp_key_url: string | null
  kim_adresse: string | null
  zustaendig_fuer: string[] | null
  aktiv: boolean
}

const EMPTY_DAS = {
  name: '',
  ik_nummer: '',
  sftp_host: '',
  sftp_port: 22,
  sftp_user: '',
  sftp_verzeichnis: '/upload',
  antwort_verzeichnis: '/download',
  kim_adresse: '',
  zustaendig_fuer: '',
  aktiv: true,
}
type DasForm = typeof EMPTY_DAS

function tageBis(datum: string | null): number | null {
  if (!datum) return null
  return Math.floor((new Date(datum).getTime() - Date.now()) / 86_400_000)
}

export default function AbrechnungEinstellungenPage() {
  const [zertifikate, setZertifikate] = useState<ZertifikatRow[]>([])
  const [passwortEnvGesetzt, setPasswortEnvGesetzt] = useState<boolean | null>(null)
  const [annahmestellen, setAnnahmestellen] = useState<Annahmestelle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [eigeneIk, setEigeneIk] = useState('')

  // Upload eigenes Zertifikat
  const p12Ref = useRef<HTMLInputElement>(null)
  const [p12Passwort, setP12Passwort] = useState('')
  const [uploading, setUploading] = useState(false)

  // ITSG-Abruf
  const [itsgIk, setItsgIk] = useState('')
  const [itsgLoading, setItsgLoading] = useState(false)

  // DAS-Form
  const [showDasForm, setShowDasForm] = useState(false)
  const [dasEditId, setDasEditId] = useState<string | null>(null)
  const [dasForm, setDasForm] = useState<DasForm>(EMPTY_DAS)
  const [dasSaving, setDasSaving] = useState(false)
  const [testBusyId, setTestBusyId] = useState<string | null>(null)
  const [testProtokoll, setTestProtokoll] = useState<{ id: string; erfolg: boolean; text: string } | null>(null)
  const keyRefs = useRef<Record<string, HTMLInputElement | null>>({})

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [zertRes, dasRes] = await Promise.all([
        fetch('/api/admin/abrechnung/zertifikat').then(r => r.json()),
        (async () => {
          const supabase = createClient()
          return supabase.from('datenannahmestellen').select('*').order('name')
        })(),
      ])
      if (zertRes.error) setError(zertRes.error)
      setZertifikate(zertRes.zertifikate || [])
      setPasswortEnvGesetzt(Boolean(zertRes.passwort_env_gesetzt))
      if (dasRes.error) setError(dasRes.error.message)
      setAnnahmestellen((dasRes.data || []) as Annahmestelle[])
    } catch (e: any) {
      setError(e?.message || 'Unerwarteter Fehler beim Laden.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // Absender-IK (organizations-Tabelle bzw. ALLTAGSENGEL_IK-Env, s. P0-5)
  useEffect(() => {
    getOrgIK(createClient())
      .then(setEigeneIk)
      .catch(e => setError(`Absender-IK konnte nicht geladen werden: ${e instanceof Error ? e.message : String(e)}`))
  }, [])

  const absender = zertifikate.find(z => z.typ === 'absender')
  const empfaenger = zertifikate.filter(z => z.typ === 'empfaenger')
  const absenderAblauf = absender ? tageBis(absender.gueltig_bis) : null

  // ── Eigenes Zertifikat hochladen ──────────────────────────────
  async function uploadZertifikat() {
    const datei = p12Ref.current?.files?.[0]
    if (!datei) { setError('Bitte eine .p12-Datei auswählen.'); return }
    if (!p12Passwort) { setError('Bitte das PKCS#12-Passwort eingeben (wird nur zur Prüfung genutzt).'); return }
    setUploading(true)
    setError(null)
    setInfo(null)
    try {
      const form = new FormData()
      form.append('datei', datei)
      form.append('passwort', p12Passwort)
      const res = await fetch('/api/admin/abrechnung/zertifikat', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok || json.error) { setError(json.error || `Fehler ${res.status}`); return }
      setInfo(
        `Zertifikat für IK ${json.zertifikat.ik_nummer} gespeichert (gültig bis ${new Date(json.zertifikat.gueltig_bis).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })}).` +
        (json.hinweis ? ` ${json.hinweis}` : '')
      )
      setP12Passwort('')
      if (p12Ref.current) p12Ref.current.value = ''
      await load()
    } catch (e: any) {
      setError(e?.message || 'Upload fehlgeschlagen.')
    } finally {
      setUploading(false)
    }
  }

  // ── Empfänger-Zertifikat aus ITSG laden ───────────────────────
  async function ladeItsg(ik?: string, neuLaden = false) {
    const ziel = (ik || itsgIk).replace(/\D/g, '')
    if (!/^\d{9}$/.test(ziel)) { setError('IK-Nummer muss 9 Ziffern haben.'); return }
    setItsgLoading(true)
    setError(null)
    setInfo(null)
    try {
      const res = await fetch('/api/admin/abrechnung/itsg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ik: ziel, neu_laden: neuLaden }),
      })
      const json = await res.json()
      if (!res.ok || json.error) { setError(json.error || `Fehler ${res.status}`); return }
      setInfo(`Empfänger-Zertifikat für IK ${ziel} geladen (gültig bis ${new Date(json.zertifikat.gueltig_bis).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })}).`)
      setItsgIk('')
      await load()
    } catch (e: any) {
      setError(e?.message || 'ITSG-Abruf fehlgeschlagen.')
    } finally {
      setItsgLoading(false)
    }
  }

  // ── Datenannahmestellen ───────────────────────────────────────
  function openDasCreate() {
    setDasEditId(null)
    setDasForm(EMPTY_DAS)
    setShowDasForm(true)
  }
  function openDasEdit(d: Annahmestelle) {
    setDasEditId(d.id)
    setDasForm({
      name: d.name,
      ik_nummer: d.ik_nummer || '',
      sftp_host: d.sftp_host || '',
      sftp_port: d.sftp_port || 22,
      sftp_user: d.sftp_user || '',
      sftp_verzeichnis: d.sftp_verzeichnis || '/upload',
      antwort_verzeichnis: d.antwort_verzeichnis || '/download',
      kim_adresse: d.kim_adresse || '',
      zustaendig_fuer: (d.zustaendig_fuer || []).join(', '),
      aktiv: d.aktiv,
    })
    setShowDasForm(true)
  }

  async function saveDas() {
    if (!dasForm.name) { setError('Name der Datenannahmestelle ist Pflichtfeld.'); return }
    setDasSaving(true)
    setError(null)
    try {
      const supabase = createClient()
      const payload = {
        name: dasForm.name,
        ik_nummer: dasForm.ik_nummer.replace(/\D/g, '') || null,
        sftp_host: dasForm.sftp_host || null,
        sftp_port: Number(dasForm.sftp_port) || 22,
        sftp_user: dasForm.sftp_user || null,
        sftp_verzeichnis: dasForm.sftp_verzeichnis || null,
        antwort_verzeichnis: dasForm.antwort_verzeichnis || null,
        kim_adresse: dasForm.kim_adresse || null,
        zustaendig_fuer: dasForm.zustaendig_fuer
          ? dasForm.zustaendig_fuer.split(',').map(s => s.trim().replace(/\D/g, '')).filter(Boolean)
          : [],
        aktiv: dasForm.aktiv,
      }
      const { error: e } = dasEditId
        ? await supabase.from('datenannahmestellen').update(payload).eq('id', dasEditId)
        : await supabase.from('datenannahmestellen').insert(payload)
      if (e) { setError(`Speichern fehlgeschlagen: ${e.message}`); return }
      setShowDasForm(false)
      await load()
    } finally {
      setDasSaving(false)
    }
  }

  async function removeDas(id: string) {
    if (!confirm('Datenannahmestelle wirklich löschen?')) return
    const supabase = createClient()
    const { error: e } = await supabase.from('datenannahmestellen').delete().eq('id', id)
    if (e) { setError(`Löschen fehlgeschlagen: ${e.message}`); return }
    await load()
  }

  async function uploadSshKey(dasId: string) {
    const inputEl = keyRefs.current[dasId]
    const datei = inputEl?.files?.[0]
    if (!datei) { setError('Bitte zuerst eine Key-Datei auswählen.'); return }
    setError(null)
    try {
      const form = new FormData()
      form.append('das_id', dasId)
      form.append('datei', datei)
      const res = await fetch('/api/admin/abrechnung/sftp-key', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok || json.error) { setError(json.error || `Fehler ${res.status}`); return }
      setInfo('SSH-Key im privaten Bucket gespeichert.')
      if (inputEl) inputEl.value = ''
      await load()
    } catch (e: any) {
      setError(e?.message || 'Key-Upload fehlgeschlagen.')
    }
  }

  async function testeSftp(id: string) {
    setTestBusyId(id)
    setTestProtokoll(null)
    setError(null)
    try {
      const res = await fetch('/api/admin/abrechnung/sftp-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const json = await res.json()
      if (json.error) { setTestProtokoll({ id, erfolg: false, text: json.error }); return }
      setTestProtokoll({ id, erfolg: Boolean(json.erfolg), text: json.protokoll || '' })
    } catch (e: any) {
      setTestProtokoll({ id, erfolg: false, text: e?.message || 'Test fehlgeschlagen' })
    } finally {
      setTestBusyId(null)
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Abrechnung · Einstellungen</h1>
          <p className="admin-subtitle">SECON-Verschlüsselung (Anlage 16) · ITSG-Zertifikate · Datenannahmestellen</p>
        </div>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}
      {info && <Banner tone="info">{info}</Banner>}

      {/* Ablauf-Warnungen */}
      {absender && absenderAblauf !== null && absenderAblauf <= 60 && (
        <Banner tone={absenderAblauf <= 14 ? 'danger' : 'warn'}>
          Das eigene ITSG-Zertifikat läuft {absenderAblauf < 0 ? 'ist ABGELAUFEN' : `in ${absenderAblauf} Tagen ab`} — rechtzeitig beim ITSG Trust Center verlängern!
        </Banner>
      )}
      {passwortEnvGesetzt === false && absender && (
        <Banner tone="warn">
          Env-Variable SECON_ZERT_PASSWORT ist nicht gesetzt — ohne sie kann nicht ver-/entschlüsselt werden (Vercel → Settings → Environment Variables).
        </Banner>
      )}

      {/* ── Eigenes Zertifikat ─────────────────────────────── */}
      <div style={card}>
        <h3 style={cardTitle}>Eigenes ITSG-Zertifikat (Absender, IK {eigeneIk || "…"})</h3>
        {absender ? (
          <p style={{ fontSize: 13, color: 'var(--ink4)', margin: '0 0 12px' }}>
            Hinterlegt für IK <strong>{absender.ik_nummer}</strong> · gültig{' '}
            {absender.gueltig_ab ? new Date(absender.gueltig_ab).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }) : '—'} bis{' '}
            <strong>{absender.gueltig_bis ? new Date(absender.gueltig_bis).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }) : '—'}</strong>
            {absenderAblauf !== null && absenderAblauf > 60 && ` (noch ${absenderAblauf} Tage)`} · Fingerprint{' '}
            <code style={{ fontSize: 11 }}>{(absender.fingerprint || '').slice(0, 16)}…</code>
          </p>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--ink4)', margin: '0 0 12px' }}>
            Noch kein Zertifikat hinterlegt. Das Zertifikat wird beim ITSG Trust Center (itsg.de → Trust Center → Zertifikat beantragen) für die IK {eigeneIk || "…"} beantragt und kommt als PKCS#12-Datei (.p12).
          </p>
        )}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={fieldLabel}>
            PKCS#12-Datei (.p12)
            <input ref={p12Ref} type="file" accept=".p12,.pfx,.pem" style={input} />
          </label>
          <label style={fieldLabel}>
            Passwort (nur zur Prüfung, wird nicht gespeichert)
            <input type="password" value={p12Passwort} onChange={e => setP12Passwort(e.target.value)} style={input} autoComplete="off" />
          </label>
          <button onClick={uploadZertifikat} disabled={uploading} style={primaryBtn}>
            {uploading ? 'Prüfe & speichere…' : absender ? 'Zertifikat ersetzen' : 'Zertifikat hochladen'}
          </button>
        </div>
        <p style={{ fontSize: 11, color: 'var(--ink4)', margin: '10px 0 0' }}>
          Die Datei landet im privaten Storage-Bucket. Das Passwort wird ausschließlich als Env-Variable <code>SECON_ZERT_PASSWORT</code> hinterlegt — nie in Code oder Datenbank.
        </p>
      </div>

      {/* ── Empfänger-Zertifikate ──────────────────────────── */}
      <div style={card}>
        <h3 style={cardTitle}>Empfänger-Zertifikate (Datenannahmestellen / Kassen)</h3>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 14 }}>
          <label style={fieldLabel}>
            IK der Annahmestelle
            <input value={itsgIk} onChange={e => setItsgIk(e.target.value)} style={input} placeholder="9-stellige IK" />
          </label>
          <button onClick={() => ladeItsg()} disabled={itsgLoading} style={primaryBtn}>
            {itsgLoading ? 'Lade aus ITSG…' : 'Aus ITSG-Verzeichnis laden'}
          </button>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>IK</th><th>Gültig ab</th><th>Gültig bis</th><th>Fingerprint (SHA-256)</th><th>Aktionen</th></tr>
            </thead>
            <tbody>
              {loading
                ? <EmptyRow colSpan={5}>Laden…</EmptyRow>
                : empfaenger.length === 0
                  ? <EmptyRow colSpan={5}>Noch keine Empfänger-Zertifikate geladen</EmptyRow>
                  : empfaenger.map(z => {
                    const t = tageBis(z.gueltig_bis)
                    return (
                      <tr key={z.id}>
                        <td style={{ fontWeight: 600 }}>{z.ik_nummer}</td>
                        <td style={{ fontSize: 13 }}>{z.gueltig_ab ? new Date(z.gueltig_ab).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }) : '—'}</td>
                        <td style={{ fontSize: 13, color: t !== null && t < 30 ? '#D04B3B' : undefined }}>
                          {z.gueltig_bis ? new Date(z.gueltig_bis).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }) : '—'}
                          {t !== null && t < 30 && ` (${t < 0 ? 'abgelaufen' : `${t} Tage`})`}
                        </td>
                        <td><code style={{ fontSize: 11 }}>{(z.fingerprint || '').slice(0, 24)}…</code></td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button onClick={() => ladeItsg(z.ik_nummer, true)} style={miniBtn}>Neu laden</button>
                        </td>
                      </tr>
                    )
                  })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Datenannahmestellen ────────────────────────────── */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ ...cardTitle, margin: 0 }}>Datenannahmestellen (SFTP-Transport)</h3>
          <button onClick={openDasCreate} style={primaryBtn}>+ Neue Annahmestelle</button>
        </div>

        {showDasForm && (
          <div style={{ ...card, background: 'var(--coal)', marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 12px', fontSize: 14 }}>{dasEditId ? 'Annahmestelle bearbeiten' : 'Neue Annahmestelle'}</h4>
            <div style={formGrid}>
              <label style={fieldLabel}>
                Name *
                <input value={dasForm.name} onChange={e => setDasForm({ ...dasForm, name: e.target.value })} style={input} placeholder="z. B. DAVASO, BITMARCK, AOK-RZ" />
              </label>
              <label style={fieldLabel}>
                IK der Annahmestelle
                <input value={dasForm.ik_nummer} onChange={e => setDasForm({ ...dasForm, ik_nummer: e.target.value })} style={input} placeholder="für Empfänger-Zertifikat" />
              </label>
              <label style={fieldLabel}>
                SFTP-Host
                <input value={dasForm.sftp_host} onChange={e => setDasForm({ ...dasForm, sftp_host: e.target.value })} style={input} placeholder="sftp.annahmestelle.de" />
              </label>
              <label style={fieldLabel}>
                Port
                <input type="number" value={dasForm.sftp_port} onChange={e => setDasForm({ ...dasForm, sftp_port: Number(e.target.value) })} style={input} />
              </label>
              <label style={fieldLabel}>
                SFTP-User
                <input value={dasForm.sftp_user} onChange={e => setDasForm({ ...dasForm, sftp_user: e.target.value })} style={input} />
              </label>
              <label style={fieldLabel}>
                Upload-Verzeichnis
                <input value={dasForm.sftp_verzeichnis} onChange={e => setDasForm({ ...dasForm, sftp_verzeichnis: e.target.value })} style={input} />
              </label>
              <label style={fieldLabel}>
                Antwort-Verzeichnis
                <input value={dasForm.antwort_verzeichnis} onChange={e => setDasForm({ ...dasForm, antwort_verzeichnis: e.target.value })} style={input} />
              </label>
              <label style={fieldLabel}>
                KIM-Adresse (ab Dez 2026)
                <input value={dasForm.kim_adresse} onChange={e => setDasForm({ ...dasForm, kim_adresse: e.target.value })} style={input} placeholder="annahme@kasse.kim.telematik" />
              </label>
              <label style={{ ...fieldLabel, gridColumn: '1 / -1' }}>
                Zuständig für Kostenträger-IKs (Komma-getrennt)
                <input value={dasForm.zustaendig_fuer} onChange={e => setDasForm({ ...dasForm, zustaendig_fuer: e.target.value })} style={input} placeholder="105313145, 108310400, …" />
              </label>
              <label style={{ ...fieldLabel, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={dasForm.aktiv} onChange={e => setDasForm({ ...dasForm, aktiv: e.target.checked })} />
                Aktiv
              </label>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button onClick={saveDas} disabled={dasSaving} style={primaryBtn}>
                {dasSaving ? 'Speichern…' : 'Speichern'}
              </button>
              <button onClick={() => setShowDasForm(false)} style={secondaryBtn}>Abbrechen</button>
            </div>
            <p style={{ fontSize: 11, color: 'var(--ink4)', margin: '10px 0 0' }}>
              Zugangsdaten: SSH-Key nach dem Anlegen direkt in der Tabelle hochladen (privater Bucket) — oder Passwort als Env-Variable <code>SECON_SFTP_PASSWORT_&lt;NAME&gt;</code> hinterlegen.
            </p>
          </div>
        )}

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Name</th><th>IK</th><th>SFTP</th><th>Zugang</th><th>Status</th><th>Aktionen</th></tr>
            </thead>
            <tbody>
              {loading
                ? <EmptyRow colSpan={6}>Laden…</EmptyRow>
                : annahmestellen.length === 0
                  ? <EmptyRow colSpan={6}>Noch keine Datenannahmestellen konfiguriert</EmptyRow>
                  : annahmestellen.map(d => (
                    <tr key={d.id}>
                      <td style={{ fontWeight: 600 }}>{d.name}{!d.aktiv && <span style={{ color: 'var(--ink4)', fontWeight: 400 }}> (inaktiv)</span>}</td>
                      <td style={{ fontSize: 13 }}>{d.ik_nummer || '—'}</td>
                      <td style={{ fontSize: 13 }}>
                        {d.sftp_host ? `${d.sftp_user || '?'}@${d.sftp_host}:${d.sftp_port || 22}` : '—'}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {d.sftp_key_url ? 'SSH-Key hinterlegt' : 'Kein Key'}
                        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                          <input
                            type="file"
                            ref={el => { keyRefs.current[d.id] = el }}
                            style={{ fontSize: 11, maxWidth: 150 }}
                          />
                          <button onClick={() => uploadSshKey(d.id)} style={miniBtn}>Key hochladen</button>
                        </div>
                      </td>
                      <td>
                        {testProtokoll?.id === d.id && (
                          <span style={{ fontSize: 12, color: testProtokoll.erfolg ? '#3E9B4F' : '#D04B3B', fontWeight: 600 }}>
                            {testProtokoll.erfolg ? 'Verbindung OK' : 'Fehlgeschlagen'}
                          </span>
                        )}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button onClick={() => testeSftp(d.id)} disabled={testBusyId === d.id} style={miniBtn}>
                          {testBusyId === d.id ? 'Teste…' : 'Verbindung testen'}
                        </button>
                        <button onClick={() => openDasEdit(d)} style={miniBtn}>Bearbeiten</button>
                        <button onClick={() => removeDas(d.id)} style={{ ...miniBtn, color: '#D04B3B' }}>Löschen</button>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>

        {testProtokoll && (
          <pre style={{
            marginTop: 12, padding: 12, borderRadius: 8, fontSize: 11, whiteSpace: 'pre-wrap',
            background: 'var(--coal)', border: '1px solid var(--border)',
            color: testProtokoll.erfolg ? 'var(--ink)' : '#D04B3B',
          }}>
            {testProtokoll.text}
          </pre>
        )}
      </div>
    </div>
  )
}

// ── Styles (Muster: /admin/kostentraeger) ───────────────────────
const primaryBtn: React.CSSProperties = {
  fontSize: 14, color: 'var(--coal)', fontWeight: 600,
  background: 'linear-gradient(135deg,var(--gold2),var(--gold))', border: 'none',
  borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit',
}
const secondaryBtn: React.CSSProperties = {
  fontSize: 14, color: 'var(--ink)', fontWeight: 600,
  background: 'var(--coal2)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit',
}
const miniBtn: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: 'var(--ink)',
  background: 'transparent', border: '1px solid var(--border)',
  borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontFamily: 'inherit',
  marginRight: 6,
}
const card: React.CSSProperties = {
  background: 'var(--coal2)', border: '1px solid var(--border)', borderRadius: 12,
  padding: 18, marginBottom: 20,
}
const cardTitle: React.CSSProperties = { margin: '0 0 12px', fontSize: 16 }
const formGrid: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12,
}
const fieldLabel: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12,
  color: 'var(--ink4)', fontWeight: 600,
}
const input: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8,
  fontSize: 14, background: 'var(--coal)', color: 'var(--ink)',
  fontFamily: 'inherit', outline: 'none',
}
