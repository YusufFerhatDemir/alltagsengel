'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { IconMoney, IconDocument, IconChart, IconTarget } from '@/components/Icons'

// ═══════════════════════════════════════════════════════════════
// Zahlungseingänge — CAMT Import, OPOS, Klärfälle
// ═══════════════════════════════════════════════════════════════

type Tab = 'import' | 'opos' | 'klaerfaelle'

interface CamtImport {
  id: string
  dateiname: string
  import_datum: string
  buchungen_anzahl: number
  zugeordnet_anzahl: number
  klaerfaelle_anzahl: number
  status: string
}

interface OffenerPosten {
  invoiceId: string
  invoiceNumber: string
  clientName: string
  rechnungsdatum: string
  faelligkeitsdatum: string | null
  sollCent: number
  bezahltCent: number
  offenCent: number
  status: string
  dunningLevel: string
  alterTage: number
  altersKlasse: string
}

interface OposData {
  offenePosten: OffenerPosten[]
  altersstruktur: {
    klasse0_30: { anzahl: number; summe: number }
    klasse30_60: { anzahl: number; summe: number }
    klasse60_90: { anzahl: number; summe: number }
    klasse90plus: { anzahl: number; summe: number }
  }
  gesamtOffen: number
  gesamtAnzahl: number
}

interface Klaerfall {
  id: string
  grund: string
  vorschlaege: { invoiceId: string; invoiceNumber: string; clientName: string; confidence: number }[]
  status: string
  bearbeitet_am: string | null
  zahlungseingang: {
    id: string
    buchungsdatum: string
    betrag_cent: number
    debitor_name: string | null
    debitor_iban: string | null
    verwendungszweck: string | null
    ist_ruecklastschrift: boolean
  }
}

// ═══════════════════════════════════════════════════════════════
// Hilfsfunktionen
// ═══════════════════════════════════════════════════════════════
const formatCurrency = (cents: number) =>
  `${(cents / 100).toFixed(2).replace('.', ',')} €`
const formatDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('de-DE') : '—'

const STATUS_COLORS: Record<string, string> = {
  importiert: '#3b82f6',
  verarbeitet: '#22c55e',
  fehler: '#ef4444',
  offen: '#f59e0b',
  teilweise_bezahlt: '#3b82f6',
  zugeordnet: '#22c55e',
  abgeschrieben: '#9ca3af',
}

const DUNNING_LABELS: Record<string, string> = {
  offen: 'Offen',
  erinnerung: 'Erinnerung',
  mahnung_1: '1. Mahnung',
  mahnung_2: '2. Mahnung',
  letzte_mahnung: 'Letzte Mahnung',
  inkasso_vorbereitung: 'Inkasso',
  bezahlt: 'Bezahlt',
}

// ═══════════════════════════════════════════════════════════════
// Hauptkomponente
// ═══════════════════════════════════════════════════════════════
export default function ZahlungseingaengePage() {
  const [tab, setTab] = useState<Tab>('import')
  const [imports, setImports] = useState<CamtImport[]>([])
  const [oposData, setOposData] = useState<OposData | null>(null)
  const [klaerfaelle, setKlaerfaelle] = useState<Klaerfall[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<string | null>(null)
  const [oposFilter, setOposFilter] = useState<string>('alle')
  const fileRef = useRef<HTMLInputElement>(null)

  // ─── Daten laden ───
  const loadImports = useCallback(async () => {
    try {
      const res = await fetch('/api/billing/camt/imports')
      if (res.ok) {
        const data = await res.json()
        setImports(data.imports || [])
      }
    } catch { /* */ }
  }, [])

  const loadOpos = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (oposFilter !== 'alle') params.set('status', oposFilter)
      const res = await fetch(`/api/billing/opos?${params}`)
      if (res.ok) setOposData(await res.json())
    } catch { /* */ }
  }, [oposFilter])

  const loadKlaerfaelle = useCallback(async () => {
    try {
      const res = await fetch('/api/billing/klaerfaelle')
      if (res.ok) setKlaerfaelle(await res.json())
    } catch { /* */ }
  }, [])

  useEffect(() => {
    setLoading(true)
    Promise.all([loadImports(), loadOpos(), loadKlaerfaelle()]).finally(() => setLoading(false))
  }, [loadImports, loadOpos, loadKlaerfaelle])

  useEffect(() => { loadOpos() }, [loadOpos])

  // ─── CAMT Upload ───
  async function handleUpload(file: File) {
    setUploading(true)
    setUploadResult(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/billing/camt/import', { method: 'POST', body: formData })
      const data = await res.json()
      if (res.ok) {
        setUploadResult(
          `Importiert: ${data.buchungenGesamt} Buchungen, ${data.zugeordnet} zugeordnet, ${data.klaerfaelle} Klärfälle`
        )
        await Promise.all([loadImports(), loadOpos(), loadKlaerfaelle()])
      } else {
        setUploadResult(`Fehler: ${data.error}`)
      }
    } catch (e) {
      setUploadResult('Upload fehlgeschlagen')
    }
    setUploading(false)
  }

  // ─── Klärfall zuordnen ───
  async function handleZuordnen(klaerfallId: string, invoiceId: string) {
    try {
      const res = await fetch(`/api/billing/klaerfaelle/${klaerfallId}/zuordnen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId }),
      })
      if (res.ok) {
        await Promise.all([loadKlaerfaelle(), loadOpos()])
      }
    } catch { /* */ }
  }

  // ─── Statistik-Karten ───
  const todayStr = new Date().toISOString().slice(0, 10)
  const eingaengeHeute = imports
    .filter(i => i.import_datum?.startsWith(todayStr))
    .reduce((s, i) => s + i.buchungen_anzahl, 0)
  const zugeordnetHeute = imports
    .filter(i => i.import_datum?.startsWith(todayStr))
    .reduce((s, i) => s + i.zugeordnet_anzahl, 0)
  const klaerfaelleOffen = klaerfaelle.filter(k => k.status === 'offen').length
  const oposGesamt = oposData?.gesamtOffen ?? 0

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1300 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <IconMoney size={28} color="#c8a84e" />
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Zahlungseingänge</h1>
      </div>

      {/* Statistik-Karten */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <StatCard label="Eingänge heute" value={String(eingaengeHeute)} icon={<IconMoney size={20} />} color="#3b82f6" />
        <StatCard label="Zugeordnet heute" value={String(zugeordnetHeute)} icon={<IconTarget size={20} />} color="#22c55e" />
        <StatCard label="Klärfälle offen" value={String(klaerfaelleOffen)} icon={<IconDocument size={20} />} color={klaerfaelleOffen > 0 ? '#f59e0b' : '#22c55e'} />
        <StatCard label="OPOS gesamt" value={formatCurrency(oposGesamt)} icon={<IconChart size={20} />} color="#8b5cf6" />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {([
          { key: 'import' as Tab, label: 'Import' },
          { key: 'opos' as Tab, label: 'OPOS' },
          { key: 'klaerfaelle' as Tab, label: `Klärfälle${klaerfaelleOffen > 0 ? ` (${klaerfaelleOffen})` : ''}` },
        ]).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '8px 18px', borderRadius: 6, border: 'none', cursor: 'pointer',
            background: tab === t.key ? '#1a365d' : '#f1f5f9',
            color: tab === t.key ? '#fff' : '#333',
            fontWeight: tab === t.key ? 600 : 400, fontSize: 14,
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? <p>Laden…</p> : (
        <>
          {/* ─── Tab: Import ─── */}
          {tab === 'import' && (
            <div>
              {/* Upload-Bereich */}
              <div
                onDragOver={e => { e.preventDefault(); e.stopPropagation() }}
                onDrop={e => {
                  e.preventDefault()
                  e.stopPropagation()
                  const f = e.dataTransfer.files[0]
                  if (f) handleUpload(f)
                }}
                onClick={() => fileRef.current?.click()}
                style={{
                  border: '2px dashed #c8a84e', borderRadius: 12, padding: '32px 24px',
                  textAlign: 'center', cursor: 'pointer', marginBottom: 20,
                  background: uploading ? '#fef3c7' : '#fefce8',
                  transition: 'background 0.2s',
                }}
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xml"
                  style={{ display: 'none' }}
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (f) handleUpload(f)
                  }}
                />
                <IconDocument size={32} color="#c8a84e" />
                <p style={{ margin: '8px 0 4px', fontWeight: 600, color: '#92400e' }}>
                  {uploading ? 'Wird importiert…' : 'CAMT-Datei hochladen'}
                </p>
                <p style={{ margin: 0, fontSize: 13, color: '#78716c' }}>
                  Klicken oder Datei hierher ziehen (CAMT.053 / CAMT.054 XML)
                </p>
              </div>

              {uploadResult && (
                <div style={{
                  padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontSize: 14,
                  background: uploadResult.startsWith('Fehler') ? '#fee2e2' : '#dcfce7',
                  color: uploadResult.startsWith('Fehler') ? '#991b1b' : '#166534',
                }}>
                  {uploadResult}
                </div>
              )}

              {/* Import-Historie */}
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Import-Historie</h3>
              {imports.length === 0 ? (
                <p style={{ color: '#888', fontSize: 14 }}>Noch keine Imports vorhanden.</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                      <th style={thStyle}>Dateiname</th>
                      <th style={thStyle}>Datum</th>
                      <th style={thStyle}>Buchungen</th>
                      <th style={thStyle}>Zugeordnet</th>
                      <th style={thStyle}>Klärfälle</th>
                      <th style={thStyle}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {imports.map(imp => (
                      <tr key={imp.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={tdStyle}>{imp.dateiname}</td>
                        <td style={tdStyle}>{formatDate(imp.import_datum)}</td>
                        <td style={tdStyle}>{imp.buchungen_anzahl}</td>
                        <td style={tdStyle}>{imp.zugeordnet_anzahl}</td>
                        <td style={tdStyle}>{imp.klaerfaelle_anzahl}</td>
                        <td style={tdStyle}>
                          <StatusBadge status={imp.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ─── Tab: OPOS ─── */}
          {tab === 'opos' && oposData && (
            <div>
              {/* Altersstruktur */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
                <AltersKlasseCard label="0–30 Tage" data={oposData.altersstruktur.klasse0_30} color="#22c55e" />
                <AltersKlasseCard label="30–60 Tage" data={oposData.altersstruktur.klasse30_60} color="#f59e0b" />
                <AltersKlasseCard label="60–90 Tage" data={oposData.altersstruktur.klasse60_90} color="#f97316" />
                <AltersKlasseCard label="90+ Tage" data={oposData.altersstruktur.klasse90plus} color="#ef4444" />
              </div>

              {/* Filter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <span style={{ fontSize: 14, color: '#666' }}>Filter:</span>
                {['alle', 'offen', 'teilweise_bezahlt'].map(f => (
                  <button key={f} onClick={() => setOposFilter(f)} style={{
                    padding: '4px 12px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 13,
                    background: oposFilter === f ? '#1a365d' : '#f1f5f9',
                    color: oposFilter === f ? '#fff' : '#333',
                  }}>
                    {f === 'alle' ? 'Alle' : f === 'offen' ? 'Nur offen' : 'Teilweise bezahlt'}
                  </button>
                ))}
                <span style={{ marginLeft: 'auto', fontSize: 14, color: '#666' }}>
                  {oposData.gesamtAnzahl} Posten — {formatCurrency(oposData.gesamtOffen)} offen
                </span>
              </div>

              {/* Tabelle */}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                    <th style={thStyle}>Rechnung</th>
                    <th style={thStyle}>Klient</th>
                    <th style={thStyle}>Datum</th>
                    <th style={thStyle}>Fällig</th>
                    <th style={thStyle}>Soll</th>
                    <th style={thStyle}>Bezahlt</th>
                    <th style={thStyle}>Offen</th>
                    <th style={thStyle}>Alter</th>
                    <th style={thStyle}>Mahnstufe</th>
                  </tr>
                </thead>
                <tbody>
                  {oposData.offenePosten.map(op => (
                    <tr key={op.invoiceId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={tdStyle}><strong>{op.invoiceNumber}</strong></td>
                      <td style={tdStyle}>{op.clientName}</td>
                      <td style={tdStyle}>{formatDate(op.rechnungsdatum)}</td>
                      <td style={tdStyle}>{formatDate(op.faelligkeitsdatum)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(op.sollCent)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(op.bezahltCent)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: op.alterTage > 90 ? '#ef4444' : op.alterTage > 60 ? '#f97316' : '#333' }}>
                        {formatCurrency(op.offenCent)}
                      </td>
                      <td style={tdStyle}>{op.alterTage} T.</td>
                      <td style={tdStyle}>
                        <span style={{
                          fontSize: 12, padding: '2px 8px', borderRadius: 4,
                          background: op.dunningLevel.includes('mahnung') ? '#fee2e2' : '#f1f5f9',
                          color: op.dunningLevel.includes('mahnung') ? '#991b1b' : '#555',
                        }}>
                          {DUNNING_LABELS[op.dunningLevel] || op.dunningLevel}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {oposData.offenePosten.length === 0 && (
                <p style={{ textAlign: 'center', color: '#888', marginTop: 24 }}>Keine offenen Posten.</p>
              )}
            </div>
          )}

          {/* ─── Tab: Klärfälle ─── */}
          {tab === 'klaerfaelle' && (
            <div>
              {klaerfaelle.length === 0 ? (
                <p style={{ color: '#888', fontSize: 14, textAlign: 'center', marginTop: 32 }}>
                  Keine offenen Klärfälle vorhanden.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {klaerfaelle.map(kf => {
                    const ze = kf.zahlungseingang
                    return (
                      <div key={kf.id} style={{
                        border: `1px solid ${ze?.ist_ruecklastschrift ? '#fca5a5' : '#e5e7eb'}`,
                        borderRadius: 8, padding: 16,
                        background: ze?.ist_ruecklastschrift ? '#fff5f5' : '#fff',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                          <div>
                            <strong style={{ color: ze?.ist_ruecklastschrift ? '#dc2626' : '#333' }}>
                              {ze?.ist_ruecklastschrift ? '⚠ Rücklastschrift' : 'Klärfall'}
                            </strong>
                            <span style={{ fontSize: 13, color: '#888', marginLeft: 12 }}>
                              {formatDate(ze?.buchungsdatum ?? null)}
                            </span>
                          </div>
                          <StatusBadge status={kf.status} />
                        </div>
                        <div style={{ fontSize: 14, marginBottom: 8, color: '#555' }}>
                          <strong>{formatCurrency(ze?.betrag_cent ?? 0)}</strong>
                          {ze?.debitor_name && <> — {ze.debitor_name}</>}
                          {ze?.debitor_iban && <span style={{ fontSize: 12, color: '#999', marginLeft: 8 }}>{ze.debitor_iban}</span>}
                        </div>
                        {ze?.verwendungszweck && (
                          <div style={{ fontSize: 13, color: '#666', marginBottom: 8, fontStyle: 'italic' }}>
                            VWZ: {ze.verwendungszweck}
                          </div>
                        )}
                        <div style={{ fontSize: 13, color: '#888', marginBottom: 12 }}>
                          Grund: {kf.grund}
                        </div>
                        {/* Vorschläge */}
                        {kf.status === 'offen' && kf.vorschlaege && kf.vorschlaege.length > 0 && (
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6 }}>Vorschläge:</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                              {kf.vorschlaege.map((v: any, idx: number) => (
                                <button
                                  key={idx}
                                  onClick={() => handleZuordnen(kf.id, v.invoiceId)}
                                  style={{
                                    padding: '6px 12px', borderRadius: 6,
                                    border: '1px solid #d1d5db', background: '#f9fafb',
                                    cursor: 'pointer', fontSize: 13, display: 'flex', gap: 8, alignItems: 'center',
                                  }}
                                >
                                  <span style={{ fontWeight: 600 }}>{v.invoiceNumber}</span>
                                  {v.clientName && <span style={{ color: '#888' }}>{v.clientName}</span>}
                                  <span style={{
                                    background: v.confidence >= 50 ? '#dcfce7' : '#fef3c7',
                                    color: v.confidence >= 50 ? '#166534' : '#92400e',
                                    padding: '1px 6px', borderRadius: 4, fontSize: 11,
                                  }}>
                                    {v.confidence}%
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Subkomponenten
// ═══════════════════════════════════════════════════════════════

function StatCard({ label, value, icon, color }: {
  label: string; value: string; icon: React.ReactNode; color: string
}) {
  return (
    <div style={{
      background: '#fff', borderRadius: 10, padding: '16px 20px',
      border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 14,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 8, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: `${color}18`, color,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#1a1a1a' }}>{value}</div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] || '#9ca3af'
  return (
    <span style={{
      fontSize: 12, padding: '2px 10px', borderRadius: 4,
      background: `${color}20`, color, fontWeight: 500,
    }}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

function AltersKlasseCard({ label, data, color }: {
  label: string; data: { anzahl: number; summe: number }; color: string
}) {
  return (
    <div style={{
      background: '#fff', borderRadius: 8, padding: '12px 16px',
      border: `1px solid ${color}40`, borderLeft: `4px solid ${color}`,
    }}>
      <div style={{ fontSize: 12, color: '#888' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color }}>{data.anzahl}</div>
      <div style={{ fontSize: 13, color: '#555' }}>{formatCurrency(data.summe)}</div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════
const thStyle: React.CSSProperties = { padding: '8px 12px', fontWeight: 600, fontSize: 13, color: '#555' }
const tdStyle: React.CSSProperties = { padding: '8px 12px' }
