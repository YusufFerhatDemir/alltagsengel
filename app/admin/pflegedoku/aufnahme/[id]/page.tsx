'use client'
// ═══════════════════════════════════════════════════════════════
// Kundenaufnahme — pflege_aufnahmen (Wizard über 4 Schritte)
// Der Route-Parameter [id] ist die client_id: die Seite lädt die
// jüngste Aufnahme des Kunden oder legt eine neue an.
// ═══════════════════════════════════════════════════════════════
import Link from 'next/link'
import { use, useEffect, useState } from 'react'
import { PFLEGE_AUFNAHME_ORT, PFLEGE_AUFNAHME_STATUS, PFLEGE_DRINGLICHKEIT, formatDate, statusMeta } from '@/lib/admin/ops'
import { Banner, StatusBadge } from '@/components/admin/OpsUI'
import {
  AuswahlFeld, FeldRaster, Karte, SchalterFeld, Tabs, TextBereich, TextFeld,
  pflegePrimaryBtn, pflegeSecondaryBtn,
} from '@/components/admin/PflegeUI'
import type { PflegeAufnahme, PflegeUebersichtZeile } from '@/lib/pflege/types'

type Schritt = 'metadaten' | 'wohnen' | 'bedarf' | 'abschluss'

const SCHRITTE: Array<{ key: Schritt; label: string }> = [
  { key: 'metadaten', label: '1. Aufnahme' },
  { key: 'wohnen', label: '2. Wohnsituation' },
  { key: 'bedarf', label: '3. Versorgungsbedarf' },
  { key: 'abschluss', label: '4. Abschluss' },
]

const LEER = {
  aufnahmedatum: '', aufnahmeOrt: 'wohnung', dringlichkeit: 'normal',
  pflegegradBeiAufnahme: '', vorherigeVersorgung: '', grundDerAnfrage: '',
  wohnsituationDetails: '', stockwerk: '', aufzugVorhanden: false, barrierefrei: false,
  schluesselregelung: '', betreuungsbedarf: '', gewuenschteZeiten: '',
  gewuenschteHaeufigkeit: '', besondereAnforderungen: '', empfehlung: '', abschlussBemerkung: '',
}

export default function AdminAufnahmePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = use(params)
  const [aufnahme, setAufnahme] = useState<PflegeAufnahme | null>(null)
  const [kunde, setKunde] = useState<PflegeUebersichtZeile | null>(null)
  const [form, setForm] = useState(LEER)
  const [schritt, setSchritt] = useState<Schritt>('metadaten')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [hinweis, setHinweis] = useState('')

  const gesperrt = aufnahme?.status === 'abgeschlossen' || aufnahme?.status === 'storniert'

  useEffect(() => { load() }, [clientId])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [aufRes, kundeRes] = await Promise.all([
        fetch(`/api/pflege/aufnahmen?clientId=${clientId}`).then(r => r.json()),
        fetch(`/api/pflege/uebersicht?clientId=${clientId}`).then(r => r.json()),
      ])
      if (aufRes.error) { setError(aufRes.error); return }
      setKunde((kundeRes.uebersicht || [])[0] ?? null)

      const neueste: PflegeAufnahme | undefined = (aufRes.aufnahmen || [])[0]
      setAufnahme(neueste ?? null)
      if (neueste) uebernehme(neueste)
    } catch {
      setError('Laden fehlgeschlagen.')
    } finally {
      setLoading(false)
    }
  }

  function uebernehme(a: PflegeAufnahme) {
    setForm({
      aufnahmedatum: a.aufnahmedatum ?? '',
      aufnahmeOrt: a.aufnahme_ort ?? 'wohnung',
      dringlichkeit: a.dringlichkeit ?? 'normal',
      pflegegradBeiAufnahme: a.pflegegrad_bei_aufnahme != null ? String(a.pflegegrad_bei_aufnahme) : '',
      vorherigeVersorgung: a.vorherige_versorgung ?? '',
      grundDerAnfrage: a.grund_der_anfrage ?? '',
      wohnsituationDetails: a.wohnsituation_details ?? '',
      stockwerk: a.stockwerk ?? '',
      aufzugVorhanden: a.aufzug_vorhanden ?? false,
      barrierefrei: a.barrierefrei ?? false,
      schluesselregelung: a.schluesselregelung ?? '',
      betreuungsbedarf: a.betreuungsbedarf ?? '',
      gewuenschteZeiten: a.gewuenschte_zeiten ?? '',
      gewuenschteHaeufigkeit: a.gewuenschte_haeufigkeit ?? '',
      besondereAnforderungen: a.besondere_anforderungen ?? '',
      empfehlung: a.empfehlung ?? '',
      abschlussBemerkung: a.abschluss_bemerkung ?? '',
    })
  }

  function feld<K extends keyof typeof LEER>(key: K, wert: (typeof LEER)[K]) {
    setForm(f => ({ ...f, [key]: wert }))
  }

  function nutzlast() {
    return {
      ...form,
      pflegegradBeiAufnahme: form.pflegegradBeiAufnahme === '' ? null : Number(form.pflegegradBeiAufnahme),
      aufnahmedatum: form.aufnahmedatum || undefined,
    }
  }

  async function anlegen() {
    setBusy(true); setError(''); setHinweis('')
    try {
      const res = await fetch('/api/pflege/aufnahmen', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, ...nutzlast() }),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Anlegen fehlgeschlagen.'); return }
      setAufnahme(body.aufnahme)
      uebernehme(body.aufnahme)
      setHinweis('Aufnahme angelegt.')
    } finally { setBusy(false) }
  }

  async function speichern(status?: string) {
    if (!aufnahme) return anlegen()
    setBusy(true); setError(''); setHinweis('')
    try {
      const res = await fetch(`/api/pflege/aufnahmen/${aufnahme.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...nutzlast(), status }),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Speichern fehlgeschlagen.'); return }
      setAufnahme(body.aufnahme)
      uebernehme(body.aufnahme)
      setHinweis(status === 'abgeschlossen' ? 'Aufnahme abgeschlossen — Stammdaten wurden übernommen.' : 'Gespeichert.')
    } finally { setBusy(false) }
  }

  if (loading) return <div className="admin-page"><p style={{ color: 'var(--muted)' }}>Laden…</p></div>

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Kundenaufnahme</h1>
          <p className="admin-subtitle">
            {kunde ? `${kunde.first_name} ${kunde.last_name}` : 'Kunde'}
            {aufnahme && ` · angelegt am ${formatDate(aufnahme.created_at)}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {aufnahme && (
            <StatusBadge
              label={statusMeta(PFLEGE_AUFNAHME_STATUS, aufnahme.status).label}
              color={statusMeta(PFLEGE_AUFNAHME_STATUS, aufnahme.status).color}
            />
          )}
          <Link href="/admin/pflegedoku" style={pflegeSecondaryBtn}>← Übersicht</Link>
        </div>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}
      {hinweis && <Banner tone="success">{hinweis}</Banner>}
      {gesperrt && <Banner tone="info">Diese Aufnahme ist abgeschlossen und kann nicht mehr bearbeitet werden.</Banner>}

      <Tabs tabs={SCHRITTE} aktiv={schritt} onChange={setSchritt} />

      {schritt === 'metadaten' && (
        <Karte titel="Aufnahmedaten">
          <FeldRaster>
            <TextFeld label="Aufnahmedatum" type="date" value={form.aufnahmedatum} onChange={v => feld('aufnahmedatum', v)} disabled={gesperrt} />
            <AuswahlFeld label="Ort der Aufnahme" value={form.aufnahmeOrt} onChange={v => feld('aufnahmeOrt', v)} optionen={PFLEGE_AUFNAHME_ORT} disabled={gesperrt} />
            <AuswahlFeld label="Dringlichkeit" value={form.dringlichkeit} onChange={v => feld('dringlichkeit', v)} optionen={PFLEGE_DRINGLICHKEIT} disabled={gesperrt} />
            <TextFeld label="Pflegegrad bei Aufnahme" type="number" value={form.pflegegradBeiAufnahme} onChange={v => feld('pflegegradBeiAufnahme', v)} disabled={gesperrt} placeholder="0–5" />
          </FeldRaster>
          <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
            <TextBereich label="Grund der Anfrage" value={form.grundDerAnfrage} onChange={v => feld('grundDerAnfrage', v)} disabled={gesperrt} />
            <TextBereich label="Bisherige Versorgung" value={form.vorherigeVersorgung} onChange={v => feld('vorherigeVersorgung', v)} disabled={gesperrt} />
          </div>
        </Karte>
      )}

      {schritt === 'wohnen' && (
        <Karte titel="Wohnsituation">
          <FeldRaster>
            <TextFeld label="Stockwerk" value={form.stockwerk} onChange={v => feld('stockwerk', v)} disabled={gesperrt} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center' }}>
              <SchalterFeld label="Aufzug vorhanden" value={form.aufzugVorhanden} onChange={v => feld('aufzugVorhanden', v)} disabled={gesperrt} />
              <SchalterFeld label="Barrierefrei" value={form.barrierefrei} onChange={v => feld('barrierefrei', v)} disabled={gesperrt} />
            </div>
          </FeldRaster>
          <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
            <TextBereich label="Details zur Wohnsituation" value={form.wohnsituationDetails} onChange={v => feld('wohnsituationDetails', v)} disabled={gesperrt} />
            <TextBereich label="Schlüsselregelung" value={form.schluesselregelung} onChange={v => feld('schluesselregelung', v)} disabled={gesperrt} rows={2} />
          </div>
        </Karte>
      )}

      {schritt === 'bedarf' && (
        <Karte titel="Versorgungsbedarf">
          <div style={{ display: 'grid', gap: 12 }}>
            <TextBereich label="Betreuungsbedarf" value={form.betreuungsbedarf} onChange={v => feld('betreuungsbedarf', v)} disabled={gesperrt} />
            <TextBereich label="Gewünschte Zeiten" value={form.gewuenschteZeiten} onChange={v => feld('gewuenschteZeiten', v)} disabled={gesperrt} rows={2} />
            <TextBereich label="Gewünschte Häufigkeit" value={form.gewuenschteHaeufigkeit} onChange={v => feld('gewuenschteHaeufigkeit', v)} disabled={gesperrt} rows={2} />
            <TextBereich label="Besondere Anforderungen" value={form.besondereAnforderungen} onChange={v => feld('besondereAnforderungen', v)} disabled={gesperrt} />
          </div>
        </Karte>
      )}

      {schritt === 'abschluss' && (
        <Karte titel="Ergebnis und Abschluss">
          <div style={{ display: 'grid', gap: 12 }}>
            <TextBereich label="Empfehlung" value={form.empfehlung} onChange={v => feld('empfehlung', v)} disabled={gesperrt} />
            <TextBereich label="Abschlussbemerkung" value={form.abschlussBemerkung} onChange={v => feld('abschlussBemerkung', v)} disabled={gesperrt} rows={2} />
          </div>
          {aufnahme?.abgeschlossen_am && (
            <p style={{ fontSize: 13, color: 'var(--ink4)', marginTop: 12 }}>
              Abgeschlossen am {formatDate(aufnahme.abgeschlossen_am)}
            </p>
          )}
        </Karte>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {!aufnahme && (
          <button onClick={anlegen} disabled={busy} style={pflegePrimaryBtn}>Aufnahme anlegen</button>
        )}
        {aufnahme && !gesperrt && (
          <>
            <button onClick={() => speichern()} disabled={busy} style={pflegePrimaryBtn}>Speichern</button>
            <button onClick={() => speichern('in_bearbeitung')} disabled={busy} style={pflegeSecondaryBtn}>In Bearbeitung setzen</button>
            <button onClick={() => speichern('abgeschlossen')} disabled={busy} style={pflegeSecondaryBtn}>Aufnahme abschließen</button>
            <button onClick={() => speichern('storniert')} disabled={busy} style={{ ...pflegeSecondaryBtn, color: '#D04B3B' }}>Stornieren</button>
          </>
        )}
        {aufnahme && (
          <Link href={`/admin/pflegedoku/anamnese/${clientId}`} style={pflegeSecondaryBtn}>Weiter zur Anamnese →</Link>
        )}
      </div>
    </div>
  )
}
