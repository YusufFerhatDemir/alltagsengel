'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { StatusBadge, SearchInput, EmptyRow, Banner } from '@/components/admin/OpsUI'
import Link from 'next/link'

function euro(cents: number) {
  return (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}

// ── Status-Metadaten ────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; color: string }> = {
  eingegangen: { label: 'Eingegangen', color: '#3b82f6' },
  in_verarbeitung: { label: 'In Verarbeitung', color: '#f59e0b' },
  zugeordnet: { label: 'Zugeordnet', color: '#06b6d4' },
  angenommen: { label: 'Angenommen', color: '#22c55e' },
  angenommen_mit_hinweis: { label: 'Angenom. (Hinweis)', color: '#84cc16' },
  teilweise_abgelehnt: { label: 'Teilw. abgelehnt', color: '#f97316' },
  abgelehnt: { label: 'Abgelehnt', color: '#ef4444' },
  technischer_fehler: { label: 'Techn. Fehler', color: '#ef4444' },
  fachlicher_fehler: { label: 'Fachl. Fehler', color: '#e11d48' },
  duplikat: { label: 'Duplikat', color: '#9ca3af' },
  korrektur_erforderlich: { label: 'Korrektur erf.', color: '#f97316' },
  korrektur_erstellt: { label: 'Korrektur erstellt', color: '#06b6d4' },
  erledigt: { label: 'Erledigt', color: '#6b7280' },
}

const TYP_LABELS: Record<string, string> = {
  quittung: 'Quittung',
  annahmebestaetigung: 'Annahmebestätigung',
  fehlermeldung: 'Fehlermeldung',
  abrechnungsergebnis: 'Abrechnungsergebnis',
  zahlungsavis: 'Zahlungsavis',
  sonstige: 'Sonstige',
}

// ── Types ───────────────────────────────────────────────────────

interface Ruecklaeufer {
  id: string
  lauf_id: string | null
  ruecklaeufer_typ: string
  status: string
  kostentraeger_ik: string | null
  positionen_gesamt: number
  positionen_angenommen: number
  positionen_abgelehnt: number
  betrag_angefordert_cent: number | null
  betrag_anerkannt_cent: number | null
  betrag_differenz_cent: number | null
  quelldatei_name: string | null
  created_at: string
  lauf: { id: string; abrechnungsmonat: string; kostentraeger_name: string } | null
}

interface FristEintrag {
  id: string
  aufgabeId: string | null
  ruecklaeuferId: string | null
  fristTyp: string
  faelligAm: string
  eskalationsstufe: number
  status: string
  notiz: string | null
}

interface PipelineLauf {
  id: string
  abrechnungsmonat: string
  kostentraegerName: string
  status: string
  aktuellerSchritt: string
  naechsterSchritt: string | null
  ruecklaeuferAnzahl: number
}

// ── Pipeline-Stufen ─────────────────────────────────────────────

const PIPELINE_STUFEN = [
  { key: 'erstellt', label: 'Erstellt', icon: '📝' },
  { key: 'geprueft', label: 'Geprüft', icon: '✓' },
  { key: 'freigegeben', label: 'Freigegeben', icon: '✅' },
  { key: 'exportiert', label: 'Exportiert', icon: '📤' },
  { key: 'uebermittelt', label: 'Übermittelt', icon: '📨' },
  { key: 'quittiert', label: 'Quittiert', icon: '📋' },
  { key: 'antwort_eingegangen', label: 'Antwort', icon: '📩' },
  { key: 'abgeschlossen', label: 'Abgeschlossen', icon: '🏁' },
]

// ── Statistik-Karten ────────────────────────────────────────────

function StatKarte({ label, wert, farbe }: { label: string; wert: number; farbe: string }) {
  return (
    <div style={{
      background: 'var(--card-bg, #fff)',
      border: '1px solid var(--border, #e5e7eb)',
      borderRadius: 8,
      padding: '16px 20px',
      minWidth: 140,
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: farbe }}>{wert}</div>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{label}</div>
    </div>
  )
}

// ── Pipeline-Visualisierung ─────────────────────────────────────

function PipelineVis({ schritt }: { schritt: string }) {
  const idx = PIPELINE_STUFEN.findIndex(s => s.key === schritt)
  return (
    <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
      {PIPELINE_STUFEN.map((stufe, i) => {
        const aktiv = i <= idx
        const istAktuell = i === idx
        return (
          <div
            key={stufe.key}
            title={stufe.label}
            style={{
              width: istAktuell ? 24 : 16,
              height: 6,
              borderRadius: 3,
              background: aktiv
                ? (istAktuell ? '#3b82f6' : '#22c55e')
                : 'var(--border, #e5e7eb)',
              transition: 'all 0.2s',
            }}
          />
        )
      })}
    </div>
  )
}

// ── Upload-Bereich ──────────────────────────────────────────────

function UploadBereich({ onUploadErfolg }: { onUploadErfolg: () => void }) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [ergebnis, setErgebnis] = useState<{ ok: boolean; text: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const uploadDatei = useCallback(async (file: File) => {
    setUploading(true)
    setErgebnis(null)
    try {
      const fd = new FormData()
      fd.append('datei', file)
      const res = await fetch('/api/billing/dta/ruecklaeufer/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) {
        setErgebnis({ ok: false, text: data.error || 'Upload fehlgeschlagen' })
      } else {
        const text = [
          `${data.nachrichtenGefunden} Nachricht(en) gefunden`,
          `${data.importeVerarbeitet} importiert`,
          data.duplikate > 0 ? `${data.duplikate} Duplikat(e)` : null,
          data.positionenAbgelehnt > 0 ? `${data.positionenAbgelehnt} Pos. abgelehnt` : null,
        ].filter(Boolean).join(', ')
        setErgebnis({ ok: true, text })
        onUploadErfolg()
      }
    } catch (err) {
      setErgebnis({ ok: false, text: (err as Error).message })
    } finally {
      setUploading(false)
    }
  }, [onUploadErfolg])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) uploadDatei(file)
  }, [uploadDatei])

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      style={{
        border: `2px dashed ${dragging ? '#3b82f6' : 'var(--border, #d1d5db)'}`,
        borderRadius: 8,
        padding: '24px 16px',
        textAlign: 'center',
        cursor: 'pointer',
        background: dragging ? 'rgba(59,130,246,0.05)' : 'transparent',
        marginBottom: 20,
        transition: 'all 0.2s',
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".txt,.dat,.edi,.edifact,.slga,.slaa"
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) uploadDatei(file)
          e.target.value = ''
        }}
      />
      {uploading ? (
        <div style={{ color: 'var(--muted)' }}>Datei wird verarbeitet…</div>
      ) : (
        <>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
            SLGA/SLAA-Datei hochladen
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            Datei hierher ziehen oder klicken zum Auswählen
          </div>
        </>
      )}
      {ergebnis && (
        <div style={{
          marginTop: 12,
          padding: '8px 12px',
          borderRadius: 6,
          fontSize: 13,
          background: ergebnis.ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
          color: ergebnis.ok ? '#16a34a' : '#dc2626',
        }}>
          {ergebnis.text}
        </div>
      )}
    </div>
  )
}

// ── Fristen-Mini-Liste ──────────────────────────────────────────

function FristenPanel({ fristen }: { fristen: FristEintrag[] }) {
  const heute = new Date().toISOString().slice(0, 10)
  const ueberfaellige = fristen.filter(f => f.faelligAm < heute)
  const anstehende = fristen.filter(f => f.faelligAm >= heute).slice(0, 5)

  if (fristen.length === 0) return null

  return (
    <div style={{
      background: 'var(--card-bg, #fff)',
      border: '1px solid var(--border, #e5e7eb)',
      borderRadius: 8,
      padding: 16,
      marginBottom: 20,
    }}>
      <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>
        Fristen {ueberfaellige.length > 0 && (
          <span style={{ color: '#ef4444', fontWeight: 400, fontSize: 13 }}>
            ({ueberfaellige.length} überfällig)
          </span>
        )}
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {ueberfaellige.map(f => (
          <div key={f.id} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '6px 8px', borderRadius: 4, background: 'rgba(239,68,68,0.08)',
          }}>
            <span style={{ fontSize: 13, color: '#dc2626' }}>
              {STATUS_META[f.fristTyp]?.label || f.fristTyp}
              {f.eskalationsstufe > 0 && ` (Eskalation ${f.eskalationsstufe})`}
            </span>
            <span style={{ fontSize: 12, color: '#dc2626' }}>
              fällig {new Date(f.faelligAm).toLocaleDateString('de-DE')}
            </span>
          </div>
        ))}
        {anstehende.map(f => (
          <div key={f.id} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '6px 8px', borderRadius: 4,
          }}>
            <span style={{ fontSize: 13 }}>
              {STATUS_META[f.fristTyp]?.label || f.fristTyp}
            </span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              fällig {new Date(f.faelligAm).toLocaleDateString('de-DE')}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Haupt-Komponente ────────────────────────────────────────────

export default function RuecklaeuferPage() {
  const [items, setItems] = useState<Ruecklaeufer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [fristen, setFristen] = useState<FristEintrag[]>([])
  const [pipeline, setPipeline] = useState<PipelineLauf[]>([])
  const [pipelineLoading, setPipelineLoading] = useState(false)
  const [tab, setTab] = useState<'liste' | 'pipeline'>('liste')

  const ladeDaten = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/billing/dta/ruecklaeufer').then(r => r.json()),
      fetch('/api/billing/dta/fristen').then(r => r.json()).catch(() => ({ fristen: [] })),
      fetch('/api/billing/dta/pipeline').then(r => r.json()).catch(() => ({ laeufe: [] })),
    ]).then(([rl, fr, pl]) => {
      setItems(Array.isArray(rl) ? rl : [])
      setFristen(Array.isArray(fr.fristen) ? fr.fristen : [])
      setPipeline(Array.isArray(pl.laeufe) ? pl.laeufe : [])
      setLoading(false)
    }).catch(e => {
      setError(e.message)
      setLoading(false)
    })
  }, [])

  useEffect(() => { ladeDaten() }, [ladeDaten])

  const pipelineVerarbeiten = async () => {
    setPipelineLoading(true)
    try {
      const res = await fetch('/api/billing/dta/pipeline', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      await res.json()
      ladeDaten()
    } catch {
      // Fehler ignorieren, Daten werden neu geladen
    } finally {
      setPipelineLoading(false)
    }
  }

  const fristenPruefen = async () => {
    try {
      await fetch('/api/billing/dta/fristen', { method: 'POST' })
      ladeDaten()
    } catch {
      // ignore
    }
  }

  const filtered = items.filter(r => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false
    if (search) {
      const s = search.toLowerCase()
      return (r.kostentraeger_ik?.includes(s) || r.quelldatei_name?.toLowerCase().includes(s) ||
        r.lauf?.kostentraeger_name?.toLowerCase().includes(s))
    }
    return true
  })

  // Statistik
  const eingegangen = items.filter(r => r.status === 'eingegangen').length
  const angenommen = items.filter(r => ['angenommen', 'angenommen_mit_hinweis'].includes(r.status)).length
  const abgelehnt = items.filter(r => ['abgelehnt', 'teilweise_abgelehnt'].includes(r.status)).length
  const offen = items.filter(r => ['eingegangen', 'in_verarbeitung', 'korrektur_erforderlich', 'technischer_fehler', 'fachlicher_fehler'].includes(r.status)).length

  return (
    <div className="admin-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <h1>Rückläufer</h1>
          <p style={{ color: 'var(--muted)', marginBottom: 0 }}>
            Rückmeldungen von Datenannahmestellen und Kostenträgern.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="admin-btn" onClick={pipelineVerarbeiten} disabled={pipelineLoading}>
            {pipelineLoading ? 'Verarbeite…' : 'Pipeline prüfen'}
          </button>
          <button className="admin-btn" onClick={fristenPruefen}>
            Fristen prüfen
          </button>
        </div>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      {/* Statistik-Karten */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <StatKarte label="Eingegangen" wert={eingegangen} farbe="#3b82f6" />
        <StatKarte label="Angenommen" wert={angenommen} farbe="#22c55e" />
        <StatKarte label="Abgelehnt" wert={abgelehnt} farbe="#ef4444" />
        <StatKarte label="Offen" wert={offen} farbe="#f59e0b" />
      </div>

      {/* Fristen-Panel */}
      <FristenPanel fristen={fristen} />

      {/* Upload-Bereich */}
      <UploadBereich onUploadErfolg={ladeDaten} />

      {/* Tab-Umschalter */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1px solid var(--border, #e5e7eb)' }}>
        <button
          onClick={() => setTab('liste')}
          style={{
            padding: '8px 16px', fontSize: 14, fontWeight: tab === 'liste' ? 600 : 400,
            border: 'none', background: 'none', cursor: 'pointer',
            borderBottom: tab === 'liste' ? '2px solid #3b82f6' : '2px solid transparent',
            color: tab === 'liste' ? '#3b82f6' : 'var(--muted)',
          }}
        >
          Rückläufer-Liste
        </button>
        <button
          onClick={() => setTab('pipeline')}
          style={{
            padding: '8px 16px', fontSize: 14, fontWeight: tab === 'pipeline' ? 600 : 400,
            border: 'none', background: 'none', cursor: 'pointer',
            borderBottom: tab === 'pipeline' ? '2px solid #3b82f6' : '2px solid transparent',
            color: tab === 'pipeline' ? '#3b82f6' : 'var(--muted)',
          }}
        >
          Pipeline-Übersicht ({pipeline.length})
        </button>
      </div>

      {tab === 'liste' && (
        <>
          {/* Filter */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <SearchInput value={search} onChange={setSearch} placeholder="Suche nach Kostenträger, Datei…" />
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="admin-select">
              <option value="all">Alle Status</option>
              {Object.entries(STATUS_META).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>

          {/* Tabelle */}
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Typ</th>
                  <th>Kostenträger</th>
                  <th>Lauf</th>
                  <th>Status</th>
                  <th>Pos.</th>
                  <th style={{ textAlign: 'right' }}>Angefordert</th>
                  <th style={{ textAlign: 'right' }}>Anerkannt</th>
                  <th style={{ textAlign: 'right' }}>Differenz</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={10}>Lade…</td></tr>
                ) : filtered.length === 0 ? (
                  <EmptyRow colSpan={10}>Keine Rückläufer vorhanden.</EmptyRow>
                ) : filtered.map(r => {
                  const sm = STATUS_META[r.status] || { label: r.status, color: '#94a3b8' }
                  return (
                    <tr key={r.id}>
                      <td>{new Date(r.created_at).toLocaleDateString('de-DE')}</td>
                      <td>{TYP_LABELS[r.ruecklaeufer_typ] || r.ruecklaeufer_typ}</td>
                      <td>{r.lauf?.kostentraeger_name || r.kostentraeger_ik || '—'}</td>
                      <td>
                        {r.lauf_id ? (
                          <Link href={`/admin/dta/laeufe/${r.lauf_id}`}>{r.lauf?.abrechnungsmonat || '→'}</Link>
                        ) : '—'}
                      </td>
                      <td><StatusBadge label={sm.label} color={sm.color} /></td>
                      <td>{r.positionen_gesamt}</td>
                      <td style={{ textAlign: 'right' }}>{r.betrag_angefordert_cent != null ? euro(r.betrag_angefordert_cent) : '—'}</td>
                      <td style={{ textAlign: 'right' }}>{r.betrag_anerkannt_cent != null ? euro(r.betrag_anerkannt_cent) : '—'}</td>
                      <td style={{ textAlign: 'right', color: (r.betrag_differenz_cent ?? 0) > 0 ? '#ef4444' : undefined }}>
                        {r.betrag_differenz_cent != null ? euro(r.betrag_differenz_cent) : '—'}
                      </td>
                      <td>
                        {r.lauf_id && (
                          <Link href={`/admin/dta/laeufe/${r.lauf_id}`} className="admin-btn small">
                            Details
                          </Link>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'pipeline' && (
        <div style={{ overflowX: 'auto' }}>
          {pipeline.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
              Keine aktiven Abrechnungsläufe.
            </div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Monat</th>
                  <th>Kostenträger</th>
                  <th>Status</th>
                  <th>Pipeline</th>
                  <th>Rückläufer</th>
                  <th>Nächster Schritt</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pipeline.map(l => {
                  const sm = STATUS_META[l.status] || { label: l.status, color: '#94a3b8' }
                  return (
                    <tr key={l.id}>
                      <td>{l.abrechnungsmonat}</td>
                      <td>{l.kostentraegerName}</td>
                      <td><StatusBadge label={sm.label || l.status} color={sm.color || '#94a3b8'} /></td>
                      <td><PipelineVis schritt={l.aktuellerSchritt} /></td>
                      <td>{l.ruecklaeuferAnzahl || '—'}</td>
                      <td style={{ fontSize: 13, color: 'var(--muted)' }}>{l.naechsterSchritt || '—'}</td>
                      <td>
                        <Link href={`/admin/dta/laeufe/${l.id}`} className="admin-btn small">
                          Öffnen
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
