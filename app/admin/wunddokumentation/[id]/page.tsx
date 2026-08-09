'use client'
// ═══════════════════════════════════════════════════════════════
// Wunddetail — Assessment, Verlauf, Versorgung, Fotodokumentation
// ═══════════════════════════════════════════════════════════════
import Link from 'next/link'
import { use, useCallback, useEffect, useState } from 'react'
import { Banner } from '@/components/admin/OpsUI'
import {
  AuswahlFeld, FeldRaster, Karte, SchalterFeld, Tabs, TextBereich, TextFeld,
  pflegeMiniBtn, pflegePrimaryBtn,
} from '@/components/admin/PflegeUI'
import WundVerlaufChart from '@/components/admin/WundVerlaufChart'
import { verlaufAusAssessments } from '@/lib/wunden/assessments'
import {
  EXSUDAT_ART_LABELS, EXSUDAT_MENGE_LABELS, WUND_STATUS_LABELS, WUND_TYP_LABELS,
  type WoundAssessment, type WoundMitKunde, type WoundPhotoMitUrl, type WoundTreatment, type WundStatus,
} from '@/lib/wunden/types'

type Tab = 'assessment' | 'versorgung' | 'fotos'

const DEKUBITUS_GRAD_ROEMISCH = ['I', 'II', 'III', 'IV']

function formatDatum(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE')
}

function formatZeitpunkt(iso: string): string {
  return new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function WundDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [wunde, setWunde] = useState<WoundMitKunde | null>(null)
  const [assessments, setAssessments] = useState<WoundAssessment[]>([])
  const [behandlungen, setBehandlungen] = useState<WoundTreatment[]>([])
  const [naechsterVw, setNaechsterVw] = useState<string | null>(null)
  const [fotos, setFotos] = useState<WoundPhotoMitUrl[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [meldung, setMeldung] = useState('')
  const [tab, setTab] = useState<Tab>('assessment')

  const lade = useCallback(() => {
    fetch(`/api/wounds/${id}`)
      .then(r => r.json())
      .then(body => {
        if (body.error) { setError(body.error); return }
        setWunde(body.wunde)
        setAssessments(body.assessments || [])
        setBehandlungen(body.behandlungen || [])
        setNaechsterVw(body.naechsterVw ?? null)
      })
      .catch(() => setError('Laden fehlgeschlagen.'))
      .finally(() => setLoading(false))
    fetch(`/api/wounds/${id}/photos`)
      .then(r => r.json())
      .then(body => { if (!body.error) setFotos(body.fotos || []) })
      .catch(() => undefined)
  }, [id])

  useEffect(() => { lade() }, [lade])

  async function setzeStatus(status: WundStatus) {
    setError(''); setMeldung('')
    const res = await fetch(`/api/wounds/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    const body = await res.json()
    if (body.error) { setError(body.error); return }
    setMeldung(`Status auf „${WUND_STATUS_LABELS[status]}" gesetzt.`)
    lade()
  }

  const kundenName = [wunde?.clients?.first_name, wunde?.clients?.last_name].filter(Boolean).join(' ') || '—'
  const verlauf = verlaufAusAssessments(assessments)

  if (loading) return <div className="admin-page"><p>Lädt…</p></div>
  if (!wunde) {
    return (
      <div className="admin-page">
        {error && <Banner tone="danger">{error}</Banner>}
        <p>Wunde nicht gefunden. <Link href="/admin/wunddokumentation">Zur Übersicht</Link></p>
      </div>
    )
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <p style={{ marginBottom: 4 }}>
            <Link href="/admin/wunddokumentation" style={{ fontSize: 13 }}>← Wunddokumentation</Link>
          </p>
          <h1>
            {WUND_TYP_LABELS[wunde.wund_typ]}
            {wunde.wund_typ === 'dekubitus' && wunde.dekubitus_grad ? ` Grad ${DEKUBITUS_GRAD_ROEMISCH[wunde.dekubitus_grad - 1]}` : ''}
            {' — '}{kundenName}
          </h1>
          <p className="admin-subtitle">
            {wunde.lokalisation}{wunde.koerperseite ? ` · ${wunde.koerperseite}` : ''}
            {' · Erstdokumentation '}{formatDatum(wunde.erstdokumentation_am)}
            {naechsterVw ? ` · Nächster Verbandwechsel: ${formatDatum(naechsterVw)}` : ' · Kein Verbandwechsel geplant'}
          </p>
        </div>
        <AuswahlFeld
          label="Wundstatus"
          value={wunde.status}
          onChange={v => setzeStatus(v as WundStatus)}
          optionen={Object.entries(WUND_STATUS_LABELS)}
        />
      </div>

      {error && <Banner tone="danger">{error}</Banner>}
      {meldung && <Banner tone="success">{meldung}</Banner>}

      <div style={{ marginBottom: 20 }}>
        <Karte titel={`Verlauf (${assessments.length} Assessments)`}>
          <WundVerlaufChart verlauf={verlauf} />
        </Karte>
      </div>

      <Tabs<Tab>
        tabs={[
          { key: 'assessment', label: `Assessment (${assessments.length})` },
          { key: 'versorgung', label: `Versorgung (${behandlungen.length})` },
          { key: 'fotos', label: `Fotos (${fotos.length})` },
        ]}
        aktiv={tab}
        onChange={setTab}
      />

      {tab === 'assessment' && (
        <AssessmentTab woundId={id} assessments={assessments} onChanged={lade} onError={setError} />
      )}
      {tab === 'versorgung' && (
        <VersorgungTab woundId={id} behandlungen={behandlungen} onChanged={lade} onError={setError} />
      )}
      {tab === 'fotos' && (
        <FotosTab woundId={id} fotos={fotos} assessments={assessments} onChanged={lade} onError={setError} />
      )}
    </div>
  )
}

// ───────────────────────────────────────────────────────────────
// Tab 1: Wundassessment
// ───────────────────────────────────────────────────────────────
function AssessmentTab({ woundId, assessments, onChanged, onError }: {
  woundId: string
  assessments: WoundAssessment[]
  onChanged: () => void
  onError: (e: string) => void
}) {
  const [speichert, setSpeichert] = useState(false)
  const [laenge, setLaenge] = useState('')
  const [breite, setBreite] = useState('')
  const [tiefe, setTiefe] = useState('')
  const [granulation, setGranulation] = useState('')
  const [fibrin, setFibrin] = useState('')
  const [nekrose, setNekrose] = useState('')
  const [epithel, setEpithel] = useState('')
  const [wundrand, setWundrand] = useState('')
  const [umgebungshaut, setUmgebungshaut] = useState('')
  const [exsudatMenge, setExsudatMenge] = useState('')
  const [exsudatArt, setExsudatArt] = useState('')
  const [geruch, setGeruch] = useState('')
  const [schmerz, setSchmerz] = useState('')
  const [infektion, setInfektion] = useState(false)
  const [bemerkung, setBemerkung] = useState('')

  const zahl = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')))
  const ganzzahl = (v: string) => (v.trim() === '' ? null : Number(v))

  async function speichere() {
    setSpeichert(true)
    onError('')
    try {
      const res = await fetch(`/api/wounds/${woundId}/assessments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          laengeCm: zahl(laenge), breiteCm: zahl(breite), tiefeCm: zahl(tiefe),
          granulationPct: ganzzahl(granulation), fibrinPct: ganzzahl(fibrin),
          nekrosePct: ganzzahl(nekrose), epithelPct: ganzzahl(epithel),
          wundrand: wundrand || null, umgebungshaut: umgebungshaut || null,
          exsudatMenge: exsudatMenge || null, exsudatArt: exsudatArt || null,
          geruch: geruch || null, schmerzNrs: ganzzahl(schmerz),
          infektionszeichen: infektion, bemerkung: bemerkung || null,
        }),
      })
      const body = await res.json()
      if (body.error) { onError(body.error); return }
      setLaenge(''); setBreite(''); setTiefe(''); setGranulation(''); setFibrin('')
      setNekrose(''); setEpithel(''); setWundrand(''); setUmgebungshaut('')
      setExsudatMenge(''); setExsudatArt(''); setGeruch(''); setSchmerz('')
      setInfektion(false); setBemerkung('')
      onChanged()
    } catch {
      onError('Speichern fehlgeschlagen.')
    } finally {
      setSpeichert(false)
    }
  }

  const mitLeer = (labels: Record<string, string>): Array<[string, string]> =>
    [['', '— keine Angabe —'] as [string, string]].concat(Object.entries(labels))

  return (
    <>
      <div style={{ margin: '16px 0' }}>
        <Karte titel="Neues Assessment erheben">
          <FeldRaster>
            <TextFeld label="Länge (cm)" type="number" value={laenge} onChange={setLaenge} placeholder="z. B. 3,5" />
            <TextFeld label="Breite (cm)" type="number" value={breite} onChange={setBreite} />
            <TextFeld label="Tiefe (cm)" type="number" value={tiefe} onChange={setTiefe} />
            <TextFeld label="Granulation (%)" type="number" value={granulation} onChange={setGranulation} />
            <TextFeld label="Fibrin (%)" type="number" value={fibrin} onChange={setFibrin} />
            <TextFeld label="Nekrose (%)" type="number" value={nekrose} onChange={setNekrose} />
            <TextFeld label="Epithel (%)" type="number" value={epithel} onChange={setEpithel} />
            <AuswahlFeld label="Exsudat: Menge" value={exsudatMenge} onChange={setExsudatMenge} optionen={mitLeer(EXSUDAT_MENGE_LABELS)} />
            <AuswahlFeld label="Exsudat: Art" value={exsudatArt} onChange={setExsudatArt} optionen={mitLeer(EXSUDAT_ART_LABELS)} />
            <AuswahlFeld label="Geruch" value={geruch} onChange={setGeruch} optionen={[['', '— keine Angabe —'], ['kein', 'Kein'], ['leicht', 'Leicht'], ['stark', 'Stark']]} />
            <TextFeld label="Schmerz (NRS 0–10)" type="number" value={schmerz} onChange={setSchmerz} />
            <TextFeld label="Wundrand" value={wundrand} onChange={setWundrand} placeholder="z. B. mazeriert, gerötet" />
            <TextFeld label="Umgebungshaut" value={umgebungshaut} onChange={setUmgebungshaut} placeholder="z. B. intakt, trocken, ödematös" />
          </FeldRaster>
          <div style={{ margin: '8px 0' }}>
            <SchalterFeld label="Infektionszeichen vorhanden" value={infektion} onChange={setInfektion} />
          </div>
          <TextBereich label="Bemerkung" value={bemerkung} onChange={setBemerkung} rows={2} />
          <p style={{ fontSize: 12, color: 'var(--ink4, #6b7280)', margin: '8px 0' }}>
            Der PUSH-Score (0–17) wird automatisch aus Fläche, Exsudatmenge und Wundgrund berechnet.
          </p>
          <button style={pflegePrimaryBtn} disabled={speichert} onClick={speichere}>
            {speichert ? 'Speichert…' : 'Assessment speichern'}
          </button>
        </Karte>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Erhoben</th><th>L×B×T (cm)</th><th>Wundgrund G/F/N (%)</th><th>Exsudat</th>
              <th>Schmerz</th><th>PUSH</th><th>Infektion</th>
            </tr>
          </thead>
          <tbody>
            {assessments.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--ink4, #6b7280)' }}>Noch keine Assessments.</td></tr>
            )}
            {assessments.map(a => (
              <tr key={a.id}>
                <td>{formatZeitpunkt(a.erhoben_am)}</td>
                <td>{[a.laenge_cm, a.breite_cm, a.tiefe_cm].map(v => v ?? '–').join(' × ')}</td>
                <td>{[a.wundgrund_granulation_pct, a.wundgrund_fibrin_pct, a.wundgrund_nekrose_pct].map(v => v ?? '–').join(' / ')}</td>
                <td>
                  {a.exsudat_menge ? EXSUDAT_MENGE_LABELS[a.exsudat_menge] : '–'}
                  {a.exsudat_art ? ` (${EXSUDAT_ART_LABELS[a.exsudat_art]})` : ''}
                </td>
                <td>{a.schmerz_nrs ?? '–'}</td>
                <td>{a.push_gesamt ?? '–'}</td>
                <td>{a.infektionszeichen ? '⚠ ja' : 'nein'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ───────────────────────────────────────────────────────────────
// Tab 2: Wundversorgung / Verbandwechsel
// ───────────────────────────────────────────────────────────────
function VersorgungTab({ woundId, behandlungen, onChanged, onError }: {
  woundId: string
  behandlungen: WoundTreatment[]
  onChanged: () => void
  onError: (e: string) => void
}) {
  const [speichert, setSpeichert] = useState(false)
  const [massnahme, setMassnahme] = useState('')
  const [wundreinigung, setWundreinigung] = useState('')
  const [materialText, setMaterialText] = useState('')
  const [schmerzmittel, setSchmerzmittel] = useState(false)
  const [besonderheiten, setBesonderheiten] = useState('')
  const [naechsterVw, setNaechsterVw] = useState('')

  async function speichere() {
    if (!massnahme.trim()) { onError('Maßnahme ist ein Pflichtfeld.'); return }
    setSpeichert(true)
    onError('')
    try {
      // "Schaumverband 10x10 (1), NaCl 0,9% (10ml)" → [{name, menge}]
      const materialien = materialText
        .split(',')
        .map(t => t.trim())
        .filter(Boolean)
        .map(t => {
          const m = t.match(/^(.+?)\s*\(([^)]+)\)$/)
          return m ? { name: m[1].trim(), menge: m[2].trim() } : { name: t }
        })
      const res = await fetch(`/api/wounds/${woundId}/treatments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          massnahme,
          wundreinigung: wundreinigung || null,
          materialien,
          schmerzmittelGegeben: schmerzmittel,
          besonderheiten: besonderheiten || null,
          naechsterVwAm: naechsterVw || null,
        }),
      })
      const body = await res.json()
      if (body.error) { onError(body.error); return }
      setMassnahme(''); setWundreinigung(''); setMaterialText('')
      setSchmerzmittel(false); setBesonderheiten(''); setNaechsterVw('')
      onChanged()
    } catch {
      onError('Speichern fehlgeschlagen.')
    } finally {
      setSpeichert(false)
    }
  }

  return (
    <>
      <div style={{ margin: '16px 0' }}>
        <Karte titel="Verbandwechsel protokollieren">
          <FeldRaster>
            <TextFeld label="Maßnahme *" value={massnahme} onChange={setMassnahme} placeholder="z. B. Verbandwechsel nach Standard" breit />
            <TextFeld label="Wundreinigung" value={wundreinigung} onChange={setWundreinigung} placeholder="z. B. NaCl 0,9 %, Wischtechnik" />
            <TextFeld label="Nächster Verbandwechsel" type="date" value={naechsterVw} onChange={setNaechsterVw} />
            <TextFeld
              label="Materialien"
              value={materialText}
              onChange={setMaterialText}
              placeholder="Komma-getrennt, Menge in Klammern: Schaumverband 10×10 (1), NaCl (10 ml)"
              breit
            />
          </FeldRaster>
          <div style={{ margin: '8px 0' }}>
            <SchalterFeld label="Schmerzmittel vor dem Verbandwechsel gegeben" value={schmerzmittel} onChange={setSchmerzmittel} />
          </div>
          <TextBereich label="Besonderheiten" value={besonderheiten} onChange={setBesonderheiten} rows={2} />
          <button style={pflegePrimaryBtn} disabled={speichert} onClick={speichere}>
            {speichert ? 'Speichert…' : 'Verbandwechsel speichern'}
          </button>
        </Karte>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr><th>Durchgeführt</th><th>Maßnahme</th><th>Materialien</th><th>Schmerzmittel</th><th>Nächster VW</th></tr>
          </thead>
          <tbody>
            {behandlungen.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--ink4, #6b7280)' }}>Noch keine Verbandwechsel protokolliert.</td></tr>
            )}
            {behandlungen.map(b => (
              <tr key={b.id}>
                <td>{formatZeitpunkt(b.durchgefuehrt_am)}</td>
                <td>
                  {b.massnahme}
                  {b.besonderheiten ? <div style={{ fontSize: 12, color: 'var(--ink4, #6b7280)' }}>{b.besonderheiten}</div> : null}
                </td>
                <td>{b.materialien.length ? b.materialien.map(m => m.menge ? `${m.name} (${m.menge})` : m.name).join(', ') : '–'}</td>
                <td>{b.schmerzmittel_gegeben ? 'ja' : 'nein'}</td>
                <td>{formatDatum(b.naechster_vw_am)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ───────────────────────────────────────────────────────────────
// Tab 3: Fotodokumentation
// ───────────────────────────────────────────────────────────────
function FotosTab({ woundId, fotos, assessments, onChanged, onError }: {
  woundId: string
  fotos: WoundPhotoMitUrl[]
  assessments: WoundAssessment[]
  onChanged: () => void
  onError: (e: string) => void
}) {
  const [laedt, setLaedt] = useState(false)
  const [datei, setDatei] = useState<File | null>(null)
  const [assessmentId, setAssessmentId] = useState('')
  const [bemerkung, setBemerkung] = useState('')

  async function ladeHoch() {
    if (!datei) { onError('Bitte ein Foto auswählen.'); return }
    setLaedt(true)
    onError('')
    try {
      const fd = new FormData()
      fd.set('file', datei)
      if (assessmentId) fd.set('assessmentId', assessmentId)
      if (bemerkung) fd.set('bemerkung', bemerkung)
      const res = await fetch(`/api/wounds/${woundId}/photos`, { method: 'POST', body: fd })
      const body = await res.json()
      if (body.error) { onError(body.error); return }
      setDatei(null); setAssessmentId(''); setBemerkung('')
      onChanged()
    } catch {
      onError('Upload fehlgeschlagen.')
    } finally {
      setLaedt(false)
    }
  }

  return (
    <>
      <div style={{ margin: '16px 0' }}>
        <Karte titel="Foto hochladen (JPEG/PNG/WebP/HEIC, max. 10 MB)">
          <FeldRaster>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
              <span>Foto *</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic"
                onChange={e => setDatei(e.target.files?.[0] ?? null)}
              />
            </label>
            <AuswahlFeld
              label="Zugehöriges Assessment"
              value={assessmentId}
              onChange={setAssessmentId}
              optionen={[['', '— ohne Zuordnung —'] as [string, string]].concat(
                assessments.map(a => [a.id, formatZeitpunkt(a.erhoben_am)] as [string, string])
              )}
            />
            <TextFeld label="Bemerkung" value={bemerkung} onChange={setBemerkung} breit />
          </FeldRaster>
          <button style={pflegePrimaryBtn} disabled={laedt || !datei} onClick={ladeHoch}>
            {laedt ? 'Lädt hoch…' : 'Foto hochladen'}
          </button>
        </Karte>
      </div>

      {fotos.length === 0 && <p style={{ color: 'var(--ink4, #6b7280)' }}>Noch keine Fotos dokumentiert.</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
        {fotos.map(f => (
          <figure key={f.id} style={{ margin: 0, border: '1px solid var(--line, #e5e7eb)', borderRadius: 10, overflow: 'hidden' }}>
            {/* Signed URLs sind kurzlebig — next/image-Optimierung würde sie cachen/brechen. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={f.signed_url} alt={`Wundfoto vom ${formatZeitpunkt(f.aufgenommen_am)}`} style={{ width: '100%', height: 160, objectFit: 'cover', display: 'block' }} />
            <figcaption style={{ padding: '8px 10px', fontSize: 12 }}>
              <strong>{formatZeitpunkt(f.aufgenommen_am)}</strong>
              {f.bemerkung && <div style={{ color: 'var(--ink4, #6b7280)' }}>{f.bemerkung}</div>}
              <a href={f.signed_url} target="_blank" rel="noreferrer" style={pflegeMiniBtn as React.CSSProperties}>Original öffnen</a>
            </figcaption>
          </figure>
        ))}
      </div>
    </>
  )
}
