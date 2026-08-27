'use client'
// ═══════════════════════════════════════════════════════════════
// Anamnese — pflege_anamnesen (Tabs: Körper, Kognition, Sozial,
// Selbstversorgung, Zusammenfassung)
// Der Route-Parameter [id] ist die client_id: die Seite lädt die
// jüngste Anamnese des Kunden oder legt eine neue an.
// ═══════════════════════════════════════════════════════════════
import Link from 'next/link'
import { use, useEffect, useState } from 'react'
import {
  PFLEGE_ANAMNESE_STATUS, PFLEGE_ANAMNESE_TYP, PFLEGE_STURZRISIKO, formatDate, statusMeta,
} from '@/lib/admin/ops'
import { Banner, StatusBadge } from '@/components/admin/OpsUI'
import {
  AuswahlFeld, FeldRaster, Karte, SchalterFeld, Tabs, TextBereich, TextFeld,
  pflegePrimaryBtn, pflegeSecondaryBtn,
} from '@/components/admin/PflegeUI'
import type { PflegeAnamnese, PflegeUebersichtZeile } from '@/lib/pflege/types'

type Tab = 'koerper' | 'kognition' | 'sozial' | 'selbstversorgung' | 'zusammenfassung'

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'koerper', label: 'Körper' },
  { key: 'kognition', label: 'Kognition & Psyche' },
  { key: 'sozial', label: 'Soziale Situation' },
  { key: 'selbstversorgung', label: 'Selbstversorgung' },
  { key: 'zusammenfassung', label: 'Zusammenfassung' },
]

const LEER = {
  anamneseDatum: '', anamneseTyp: 'erstanamnese',
  koerperlicherZustand: '', mobilitaet: '', sturzrisiko: 'unbekannt', schmerzen: '',
  ernaehrungszustand: '', schluckbeschwerden: false, inkontinenz: '', hautbild: '',
  orientierung: '', kommunikationsfaehigkeit: '', stimmungslage: '',
  verhaltensauffaelligkeiten: '', nachtruhe: '',
  sozialeKontakte: '', tagesstruktur: '', hobbysInteressen: '', religioesKulturell: '',
  koerperpflege: '', anAuskleiden: '', essenTrinken: '', hauswirtschaft: '',
  zusammenfassung: '', besonderheiten: '', empfehlungen: '',
}

export default function AdminAnamnesePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = use(params)
  const [anamnese, setAnamnese] = useState<PflegeAnamnese | null>(null)
  const [alle, setAlle] = useState<PflegeAnamnese[]>([])
  const [kunde, setKunde] = useState<PflegeUebersichtZeile | null>(null)
  const [form, setForm] = useState(LEER)
  const [tab, setTab] = useState<Tab>('koerper')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [hinweis, setHinweis] = useState('')

  const gesperrt = anamnese?.gesperrt === true
  const editierbar = !!anamnese && !gesperrt && anamnese.status === 'entwurf'

  useEffect(() => { load() }, [clientId])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [anRes, kundeRes] = await Promise.all([
        fetch(`/api/pflege/anamnesen?clientId=${clientId}`).then(r => r.json()),
        fetch(`/api/pflege/uebersicht?clientId=${clientId}`).then(r => r.json()),
      ])
      if (anRes.error) { setError(anRes.error); return }
      setKunde((kundeRes.uebersicht || [])[0] ?? null)
      const liste: PflegeAnamnese[] = anRes.anamnesen || []
      setAlle(liste)
      setAnamnese(liste[0] ?? null)
      if (liste[0]) uebernehme(liste[0])
    } catch {
      setError('Laden fehlgeschlagen.')
    } finally {
      setLoading(false)
    }
  }

  function uebernehme(a: PflegeAnamnese) {
    setForm({
      anamneseDatum: a.anamnese_datum ?? '',
      anamneseTyp: a.anamnese_typ,
      koerperlicherZustand: a.koerperlicher_zustand ?? '',
      mobilitaet: a.mobilitaet ?? '',
      sturzrisiko: a.sturzrisiko ?? 'unbekannt',
      schmerzen: a.schmerzen ?? '',
      ernaehrungszustand: a.ernaehrungszustand ?? '',
      schluckbeschwerden: a.schluckbeschwerden ?? false,
      inkontinenz: a.inkontinenz ?? '',
      hautbild: a.hautbild ?? '',
      orientierung: a.orientierung ?? '',
      kommunikationsfaehigkeit: a.kommunikationsfaehigkeit ?? '',
      stimmungslage: a.stimmungslage ?? '',
      verhaltensauffaelligkeiten: a.verhaltensauffaelligkeiten ?? '',
      nachtruhe: a.nachtruhe ?? '',
      sozialeKontakte: a.soziale_kontakte ?? '',
      tagesstruktur: a.tagesstruktur ?? '',
      hobbysInteressen: a.hobbys_interessen ?? '',
      religioesKulturell: a.religioes_kulturell ?? '',
      koerperpflege: a.koerperpflege ?? '',
      anAuskleiden: a.an_auskleiden ?? '',
      essenTrinken: a.essen_trinken ?? '',
      hauswirtschaft: a.hauswirtschaft ?? '',
      zusammenfassung: a.zusammenfassung ?? '',
      besonderheiten: a.besonderheiten ?? '',
      empfehlungen: a.empfehlungen ?? '',
    })
  }

  function feld<K extends keyof typeof LEER>(key: K, wert: (typeof LEER)[K]) {
    setForm(f => ({ ...f, [key]: wert }))
  }

  async function anlegen() {
    setBusy(true); setError(''); setHinweis('')
    try {
      const res = await fetch('/api/pflege/anamnesen', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, ...form, anamneseDatum: form.anamneseDatum || undefined }),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Anlegen fehlgeschlagen.'); return }
      setAnamnese(body.anamnese)
      setAlle(a => [body.anamnese, ...a])
      uebernehme(body.anamnese)
      setHinweis('Anamnese angelegt.')
    } finally { setBusy(false) }
  }

  async function speichern(status?: string) {
    if (!anamnese) return anlegen()
    setBusy(true); setError(''); setHinweis('')
    try {
      const res = await fetch(`/api/pflege/anamnesen/${anamnese.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, anamneseDatum: form.anamneseDatum || undefined, status }),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Speichern fehlgeschlagen.'); return }
      setAnamnese(body.anamnese)
      uebernehme(body.anamnese)
      setHinweis('Gespeichert.')
    } finally { setBusy(false) }
  }

  async function sperreUmschalten() {
    if (!anamnese) return
    setBusy(true); setError(''); setHinweis('')
    try {
      const res = await fetch(`/api/pflege/anamnesen/${anamnese.id}/sperren`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gesperrt: !anamnese.gesperrt }),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Aktion fehlgeschlagen.'); return }
      setAnamnese(body.anamnese)
      setHinweis(body.anamnese.gesperrt ? 'Anamnese gesperrt.' : 'Sperre aufgehoben.')
    } finally { setBusy(false) }
  }

  if (loading) return <div className="admin-page"><p style={{ color: 'var(--muted)' }}>Laden…</p></div>

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Anamnese</h1>
          <p className="admin-subtitle">
            {kunde ? `${kunde.first_name} ${kunde.last_name}` : 'Kunde'}
            {anamnese && ` · erhoben am ${formatDate(anamnese.anamnese_datum)}`}
            {alle.length > 1 && ` · ${alle.length} Anamnesen insgesamt`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {anamnese && (
            <StatusBadge
              label={statusMeta(PFLEGE_ANAMNESE_STATUS, anamnese.status).label}
              color={statusMeta(PFLEGE_ANAMNESE_STATUS, anamnese.status).color}
            />
          )}
          <Link href="/admin/pflegedoku" style={pflegeSecondaryBtn}>← Übersicht</Link>
        </div>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}
      {hinweis && <Banner tone="success">{hinweis}</Banner>}
      {gesperrt && <Banner tone="info">Diese Anamnese ist gesperrt und damit unveränderlich.</Banner>}
      {!gesperrt && anamnese?.status === 'abgeschlossen' && (
        <Banner tone="info">Diese Anamnese ist abgeschlossen und kann nicht mehr bearbeitet werden.</Banner>
      )}

      <Karte titel="Erhebung">
        <FeldRaster>
          <TextFeld label="Datum der Erhebung" type="date" value={form.anamneseDatum} onChange={v => feld('anamneseDatum', v)} disabled={!editierbar} />
          <AuswahlFeld label="Art der Anamnese" value={form.anamneseTyp} onChange={v => feld('anamneseTyp', v)} optionen={PFLEGE_ANAMNESE_TYP} disabled={!editierbar} />
        </FeldRaster>
      </Karte>

      <Tabs tabs={TABS} aktiv={tab} onChange={setTab} />

      {tab === 'koerper' && (
        <Karte titel="Körperlicher Zustand">
          <FeldRaster>
            <AuswahlFeld label="Sturzrisiko" value={form.sturzrisiko} onChange={v => feld('sturzrisiko', v)} optionen={PFLEGE_STURZRISIKO} disabled={!editierbar} />
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <SchalterFeld label="Schluckbeschwerden" value={form.schluckbeschwerden} onChange={v => feld('schluckbeschwerden', v)} disabled={!editierbar} />
            </div>
          </FeldRaster>
          <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
            <TextBereich label="Allgemeiner körperlicher Zustand" value={form.koerperlicherZustand} onChange={v => feld('koerperlicherZustand', v)} disabled={!editierbar} />
            <TextBereich label="Mobilität" value={form.mobilitaet} onChange={v => feld('mobilitaet', v)} disabled={!editierbar} rows={2} />
            <TextBereich label="Schmerzen" value={form.schmerzen} onChange={v => feld('schmerzen', v)} disabled={!editierbar} rows={2} />
            <TextBereich label="Ernährungszustand" value={form.ernaehrungszustand} onChange={v => feld('ernaehrungszustand', v)} disabled={!editierbar} rows={2} />
            <TextBereich label="Kontinenz" value={form.inkontinenz} onChange={v => feld('inkontinenz', v)} disabled={!editierbar} rows={2} />
            <TextBereich label="Hautbild" value={form.hautbild} onChange={v => feld('hautbild', v)} disabled={!editierbar} rows={2} />
          </div>
        </Karte>
      )}

      {tab === 'kognition' && (
        <Karte titel="Kognition & Psyche">
          <div style={{ display: 'grid', gap: 12 }}>
            <TextBereich label="Orientierung" value={form.orientierung} onChange={v => feld('orientierung', v)} disabled={!editierbar} rows={2} />
            <TextBereich label="Kommunikationsfähigkeit" value={form.kommunikationsfaehigkeit} onChange={v => feld('kommunikationsfaehigkeit', v)} disabled={!editierbar} rows={2} />
            <TextBereich label="Stimmungslage" value={form.stimmungslage} onChange={v => feld('stimmungslage', v)} disabled={!editierbar} rows={2} />
            <TextBereich label="Verhaltensauffälligkeiten" value={form.verhaltensauffaelligkeiten} onChange={v => feld('verhaltensauffaelligkeiten', v)} disabled={!editierbar} rows={2} />
            <TextBereich label="Nachtruhe" value={form.nachtruhe} onChange={v => feld('nachtruhe', v)} disabled={!editierbar} rows={2} />
          </div>
        </Karte>
      )}

      {tab === 'sozial' && (
        <Karte titel="Soziale Situation">
          <div style={{ display: 'grid', gap: 12 }}>
            <TextBereich label="Soziale Kontakte" value={form.sozialeKontakte} onChange={v => feld('sozialeKontakte', v)} disabled={!editierbar} rows={2} />
            <TextBereich label="Tagesstruktur" value={form.tagesstruktur} onChange={v => feld('tagesstruktur', v)} disabled={!editierbar} rows={2} />
            <TextBereich label="Hobbys und Interessen" value={form.hobbysInteressen} onChange={v => feld('hobbysInteressen', v)} disabled={!editierbar} rows={2} />
            <TextBereich label="Religiöse und kulturelle Bedürfnisse" value={form.religioesKulturell} onChange={v => feld('religioesKulturell', v)} disabled={!editierbar} rows={2} />
          </div>
        </Karte>
      )}

      {tab === 'selbstversorgung' && (
        <Karte titel="Selbstversorgung">
          <div style={{ display: 'grid', gap: 12 }}>
            <TextBereich label="Körperpflege" value={form.koerperpflege} onChange={v => feld('koerperpflege', v)} disabled={!editierbar} rows={2} />
            <TextBereich label="An- und Auskleiden" value={form.anAuskleiden} onChange={v => feld('anAuskleiden', v)} disabled={!editierbar} rows={2} />
            <TextBereich label="Essen und Trinken" value={form.essenTrinken} onChange={v => feld('essenTrinken', v)} disabled={!editierbar} rows={2} />
            <TextBereich label="Hauswirtschaft" value={form.hauswirtschaft} onChange={v => feld('hauswirtschaft', v)} disabled={!editierbar} rows={2} />
          </div>
        </Karte>
      )}

      {tab === 'zusammenfassung' && (
        <Karte titel="Zusammenfassung">
          <div style={{ display: 'grid', gap: 12 }}>
            <TextBereich label="Zusammenfassung" value={form.zusammenfassung} onChange={v => feld('zusammenfassung', v)} disabled={!editierbar} rows={4} />
            <TextBereich label="Besonderheiten" value={form.besonderheiten} onChange={v => feld('besonderheiten', v)} disabled={!editierbar} />
            <TextBereich label="Empfehlungen" value={form.empfehlungen} onChange={v => feld('empfehlungen', v)} disabled={!editierbar} />
          </div>
        </Karte>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {!anamnese && <button onClick={anlegen} disabled={busy} style={pflegePrimaryBtn}>Anamnese anlegen</button>}
        {anamnese && editierbar && (
          <>
            <button onClick={() => speichern()} disabled={busy} style={pflegePrimaryBtn}>Speichern</button>
            <button onClick={() => speichern('abgeschlossen')} disabled={busy} style={pflegeSecondaryBtn}>Abschließen</button>
          </>
        )}
        {anamnese && (
          <button onClick={sperreUmschalten} disabled={busy} style={pflegeSecondaryBtn}>
            {anamnese.gesperrt ? 'Sperre aufheben' : 'Sperren'}
          </button>
        )}
        <button onClick={() => { setAnamnese(null); setForm(LEER); setHinweis('') }} disabled={busy} style={pflegeSecondaryBtn}>
          Neue Anamnese
        </button>
        <Link href={`/admin/pflegedoku/diagnosen/${clientId}`} style={pflegeSecondaryBtn}>Diagnosen & Risiken →</Link>
      </div>

      {alle.length > 1 && (
        <Karte titel="Frühere Anamnesen">
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Datum</th><th>Art</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {alle.map(a => (
                  <tr key={a.id}>
                    <td style={{ fontSize: 13 }}>{formatDate(a.anamnese_datum)}</td>
                    <td><StatusBadge label={statusMeta(PFLEGE_ANAMNESE_TYP, a.anamnese_typ).label} color={statusMeta(PFLEGE_ANAMNESE_TYP, a.anamnese_typ).color} /></td>
                    <td><StatusBadge label={statusMeta(PFLEGE_ANAMNESE_STATUS, a.status).label} color={statusMeta(PFLEGE_ANAMNESE_STATUS, a.status).color} /></td>
                    <td>
                      <button onClick={() => { setAnamnese(a); uebernehme(a) }} style={pflegeSecondaryBtn}>Öffnen</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Karte>
      )}
    </div>
  )
}
