'use client'
// ═══════════════════════════════════════════════════════════════
// Diagnosen & Risiken eines Kunden — pflege_diagnosen / pflege_risiken
// ═══════════════════════════════════════════════════════════════
import Link from 'next/link'
import { use, useEffect, useState } from 'react'
import {
  PFLEGE_DIAGNOSE_TYP, PFLEGE_RISIKO_TYP, PFLEGE_SCHWEREGRAD, formatDate, statusMeta,
} from '@/lib/admin/ops'
import { Banner, EmptyRow, StatusBadge } from '@/components/admin/OpsUI'
import {
  AuswahlFeld, FeldRaster, Karte, SchalterFeld, TextBereich, TextFeld,
  pflegeMiniBtn, pflegePrimaryBtn, pflegeSecondaryBtn,
} from '@/components/admin/PflegeUI'
import {
  DIAGNOSE_SCHWEREGRAD_WERTE, RISIKO_SCHWEREGRAD_WERTE,
  type PflegeDiagnose, type PflegeRisiko, type PflegeUebersichtZeile,
} from '@/lib/pflege/types'

const DIAGNOSE_LEER = {
  diagnoseTyp: 'diagnose', bezeichnung: '', icdCode: '', beschreibung: '',
  diagnostiziertAm: '', diagnostiziertVon: '', schweregrad: '',
  betreuungsrelevant: true, hinweisFuerEngel: '',
}

const RISIKO_LEER = {
  risikoTyp: 'allergie', bezeichnung: '', beschreibung: '', schweregrad: 'mittel',
  massnahmen: '', erkanntAm: '', naechstePruefung: '',
}

export default function AdminDiagnosenPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = use(params)
  const [diagnosen, setDiagnosen] = useState<PflegeDiagnose[]>([])
  const [risiken, setRisiken] = useState<PflegeRisiko[]>([])
  const [kunde, setKunde] = useState<PflegeUebersichtZeile | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [zeigeInaktive, setZeigeInaktive] = useState(false)
  const [diagnoseForm, setDiagnoseForm] = useState(DIAGNOSE_LEER)
  const [risikoForm, setRisikoForm] = useState(RISIKO_LEER)
  const [zeigeDiagnoseForm, setZeigeDiagnoseForm] = useState(false)
  const [zeigeRisikoForm, setZeigeRisikoForm] = useState(false)

  useEffect(() => { load() }, [clientId])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [dRes, rRes, kRes] = await Promise.all([
        fetch(`/api/pflege/diagnosen?clientId=${clientId}`).then(r => r.json()),
        fetch(`/api/pflege/risiken?clientId=${clientId}`).then(r => r.json()),
        fetch(`/api/pflege/uebersicht?clientId=${clientId}`).then(r => r.json()),
      ])
      if (dRes.error || rRes.error) { setError(dRes.error || rRes.error); return }
      setDiagnosen(dRes.diagnosen || [])
      setRisiken(rRes.risiken || [])
      setKunde((kRes.uebersicht || [])[0] ?? null)
    } catch {
      setError('Laden fehlgeschlagen.')
    } finally {
      setLoading(false)
    }
  }

  async function diagnoseAnlegen() {
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/pflege/diagnosen', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId, ...diagnoseForm,
          schweregrad: diagnoseForm.schweregrad || null,
          diagnostiziertAm: diagnoseForm.diagnostiziertAm || null,
        }),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Anlegen fehlgeschlagen.'); return }
      setDiagnoseForm(DIAGNOSE_LEER)
      setZeigeDiagnoseForm(false)
      await load()
    } finally { setBusy(false) }
  }

  async function risikoAnlegen() {
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/pflege/risiken', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId, ...risikoForm,
          erkanntAm: risikoForm.erkanntAm || null,
          naechstePruefung: risikoForm.naechstePruefung || null,
        }),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Anlegen fehlgeschlagen.'); return }
      setRisikoForm(RISIKO_LEER)
      setZeigeRisikoForm(false)
      await load()
    } finally { setBusy(false) }
  }

  async function deaktivieren(art: 'diagnosen' | 'risiken', id: string) {
    if (!window.confirm('Eintrag wirklich auf inaktiv setzen?')) return
    setBusy(true); setError('')
    try {
      const res = await fetch(`/api/pflege/${art}/${id}`, { method: 'DELETE' })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Aktion fehlgeschlagen.'); return }
      await load()
    } finally { setBusy(false) }
  }

  async function reaktivieren(art: 'diagnosen' | 'risiken', id: string) {
    setBusy(true); setError('')
    try {
      const res = await fetch(`/api/pflege/${art}/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aktiv: true }),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Aktion fehlgeschlagen.'); return }
      await load()
    } finally { setBusy(false) }
  }

  const sichtbareDiagnosen = zeigeInaktive ? diagnosen : diagnosen.filter(d => d.aktiv)
  const sichtbareRisiken = zeigeInaktive ? risiken : risiken.filter(r => r.aktiv)

  if (loading) return <div className="admin-page"><p style={{ color: 'var(--muted)' }}>Laden…</p></div>

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Diagnosen & Risiken</h1>
          <p className="admin-subtitle">
            {kunde ? `${kunde.first_name} ${kunde.last_name}` : 'Kunde'} ·
            {' '}{diagnosen.filter(d => d.aktiv).length} aktive Diagnosen ·
            {' '}{risiken.filter(r => r.aktiv).length} aktive Risiken
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <SchalterFeld label="Inaktive anzeigen" value={zeigeInaktive} onChange={setZeigeInaktive} />
          <Link href="/admin/pflegedoku" style={pflegeSecondaryBtn}>← Übersicht</Link>
        </div>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      <Karte
        titel="Diagnosen und Einschränkungen"
        aktion={<button onClick={() => setZeigeDiagnoseForm(v => !v)} style={pflegePrimaryBtn}>+ Diagnose</button>}
      >
        {zeigeDiagnoseForm && (
          <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
            <FeldRaster>
              <AuswahlFeld label="Typ" value={diagnoseForm.diagnoseTyp} onChange={v => setDiagnoseForm(f => ({ ...f, diagnoseTyp: v }))} optionen={PFLEGE_DIAGNOSE_TYP} />
              <TextFeld label="Bezeichnung *" value={diagnoseForm.bezeichnung} onChange={v => setDiagnoseForm(f => ({ ...f, bezeichnung: v }))} />
              <TextFeld label="ICD-Code" value={diagnoseForm.icdCode} onChange={v => setDiagnoseForm(f => ({ ...f, icdCode: v }))} />
              <AuswahlFeld
                label="Schweregrad"
                value={diagnoseForm.schweregrad}
                onChange={v => setDiagnoseForm(f => ({ ...f, schweregrad: v }))}
                optionen={[['', '— keine Angabe —'], ...DIAGNOSE_SCHWEREGRAD_WERTE.map(s => [s, statusMeta(PFLEGE_SCHWEREGRAD, s).label] as [string, string])]}
              />
              <TextFeld label="Diagnostiziert am" type="date" value={diagnoseForm.diagnostiziertAm} onChange={v => setDiagnoseForm(f => ({ ...f, diagnostiziertAm: v }))} />
              <TextFeld label="Diagnostiziert von" value={diagnoseForm.diagnostiziertVon} onChange={v => setDiagnoseForm(f => ({ ...f, diagnostiziertVon: v }))} placeholder="Praxis / Klinik" />
            </FeldRaster>
            <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
              <TextBereich label="Beschreibung" value={diagnoseForm.beschreibung} onChange={v => setDiagnoseForm(f => ({ ...f, beschreibung: v }))} rows={2} />
              <TextBereich label="Hinweis für den Engel" value={diagnoseForm.hinweisFuerEngel} onChange={v => setDiagnoseForm(f => ({ ...f, hinweisFuerEngel: v }))} rows={2} />
              <SchalterFeld label="Betreuungsrelevant (für Engel sichtbar)" value={diagnoseForm.betreuungsrelevant} onChange={v => setDiagnoseForm(f => ({ ...f, betreuungsrelevant: v }))} />
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button onClick={diagnoseAnlegen} disabled={busy || !diagnoseForm.bezeichnung} style={pflegePrimaryBtn}>Speichern</button>
              <button onClick={() => setZeigeDiagnoseForm(false)} style={pflegeSecondaryBtn}>Abbrechen</button>
            </div>
          </div>
        )}

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Bezeichnung</th><th>Typ</th><th>ICD</th><th>Schweregrad</th><th>Seit</th><th>Engel-Hinweis</th><th>Aktionen</th></tr>
            </thead>
            <tbody>
              {sichtbareDiagnosen.length === 0
                ? <EmptyRow colSpan={7}>Keine Diagnosen erfasst</EmptyRow>
                : sichtbareDiagnosen.map(d => (
                  <tr key={d.id} style={{ opacity: d.aktiv ? 1 : 0.5 }}>
                    <td style={{ fontWeight: 600 }}>{d.bezeichnung}</td>
                    <td><StatusBadge label={statusMeta(PFLEGE_DIAGNOSE_TYP, d.diagnose_typ).label} color={statusMeta(PFLEGE_DIAGNOSE_TYP, d.diagnose_typ).color} /></td>
                    <td style={{ fontSize: 13 }}>{d.icd_code || '—'}</td>
                    <td>{d.schweregrad ? <StatusBadge label={statusMeta(PFLEGE_SCHWEREGRAD, d.schweregrad).label} color={statusMeta(PFLEGE_SCHWEREGRAD, d.schweregrad).color} /> : '—'}</td>
                    <td style={{ fontSize: 13 }}>{formatDate(d.diagnostiziert_am)}</td>
                    <td style={{ fontSize: 13, maxWidth: 220 }}>{d.betreuungsrelevant ? (d.hinweis_fuer_engel || '—') : 'nicht freigegeben'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {d.aktiv
                        ? <button onClick={() => deaktivieren('diagnosen', d.id)} disabled={busy} style={{ ...pflegeMiniBtn, color: '#D04B3B' }}>Deaktivieren</button>
                        : <button onClick={() => reaktivieren('diagnosen', d.id)} disabled={busy} style={pflegeMiniBtn}>Reaktivieren</button>}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Karte>

      <Karte
        titel="Risiken, Allergien und Notfallhinweise"
        aktion={<button onClick={() => setZeigeRisikoForm(v => !v)} style={pflegePrimaryBtn}>+ Risiko</button>}
      >
        {zeigeRisikoForm && (
          <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
            <FeldRaster>
              <AuswahlFeld label="Risikotyp" value={risikoForm.risikoTyp} onChange={v => setRisikoForm(f => ({ ...f, risikoTyp: v }))} optionen={PFLEGE_RISIKO_TYP} />
              <TextFeld label="Bezeichnung *" value={risikoForm.bezeichnung} onChange={v => setRisikoForm(f => ({ ...f, bezeichnung: v }))} />
              <AuswahlFeld
                label="Schweregrad"
                value={risikoForm.schweregrad}
                onChange={v => setRisikoForm(f => ({ ...f, schweregrad: v }))}
                optionen={RISIKO_SCHWEREGRAD_WERTE.map(s => [s, statusMeta(PFLEGE_SCHWEREGRAD, s).label] as [string, string])}
              />
              <TextFeld label="Erkannt am" type="date" value={risikoForm.erkanntAm} onChange={v => setRisikoForm(f => ({ ...f, erkanntAm: v }))} />
              <TextFeld label="Nächste Prüfung" type="date" value={risikoForm.naechstePruefung} onChange={v => setRisikoForm(f => ({ ...f, naechstePruefung: v }))} />
            </FeldRaster>
            <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
              <TextBereich label="Beschreibung" value={risikoForm.beschreibung} onChange={v => setRisikoForm(f => ({ ...f, beschreibung: v }))} rows={2} />
              <TextBereich label="Schutzmaßnahmen" value={risikoForm.massnahmen} onChange={v => setRisikoForm(f => ({ ...f, massnahmen: v }))} rows={2} />
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button onClick={risikoAnlegen} disabled={busy || !risikoForm.bezeichnung} style={pflegePrimaryBtn}>Speichern</button>
              <button onClick={() => setZeigeRisikoForm(false)} style={pflegeSecondaryBtn}>Abbrechen</button>
            </div>
          </div>
        )}

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Bezeichnung</th><th>Typ</th><th>Schweregrad</th><th>Maßnahmen</th><th>Nächste Prüfung</th><th>Aktionen</th></tr>
            </thead>
            <tbody>
              {sichtbareRisiken.length === 0
                ? <EmptyRow colSpan={6}>Keine Risiken erfasst</EmptyRow>
                : sichtbareRisiken.map(r => (
                  <tr key={r.id} style={{ opacity: r.aktiv ? 1 : 0.5 }}>
                    <td style={{ fontWeight: 600 }}>{r.bezeichnung}</td>
                    <td><StatusBadge label={statusMeta(PFLEGE_RISIKO_TYP, r.risiko_typ).label} color={statusMeta(PFLEGE_RISIKO_TYP, r.risiko_typ).color} /></td>
                    <td><StatusBadge label={statusMeta(PFLEGE_SCHWEREGRAD, r.schweregrad).label} color={statusMeta(PFLEGE_SCHWEREGRAD, r.schweregrad).color} /></td>
                    <td style={{ fontSize: 13, maxWidth: 240 }}>{r.massnahmen || '—'}</td>
                    <td style={{ fontSize: 13 }}>{formatDate(r.naechste_pruefung)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {r.aktiv
                        ? <button onClick={() => deaktivieren('risiken', r.id)} disabled={busy} style={{ ...pflegeMiniBtn, color: '#D04B3B' }}>Deaktivieren</button>
                        : <button onClick={() => reaktivieren('risiken', r.id)} disabled={busy} style={pflegeMiniBtn}>Reaktivieren</button>}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Karte>

      <div style={{ display: 'flex', gap: 8 }}>
        <Link href={`/admin/pflegedoku/verlauf/${clientId}`} style={pflegeSecondaryBtn}>Verlaufsdokumentation →</Link>
        <Link href="/admin/pflegedoku/risiko-dashboard" style={pflegeSecondaryBtn}>Risiko-Dashboard</Link>
      </div>
    </div>
  )
}
