'use client'

import { useState, useEffect, useCallback } from 'react'
import { IconMoney, IconDocument, IconTarget } from '@/components/Icons'
import { logger } from '@/lib/logger'
const log = logger.child('admin:datev')

// ═══════════════════════════════════════════════════════════════
// DATEV-Export — Export, Konfiguration, Kontenzuordnung
// ═══════════════════════════════════════════════════════════════

type Tab = 'export' | 'config' | 'konten'

interface DatevExport {
  id: string
  zeitraumVon: string
  zeitraumBis: string
  buchungenAnzahl: number
  exportDatum: string
  status: string
  beraternummer: string
  mandantennummer: string
  kontenrahmen: string
  fehlerDetails: string | null
}

interface DatevConfig {
  beraternummer: string
  mandantennummer: string
  kontenrahmen: 'SKR03' | 'SKR04'
  wjBeginn: string
  sachkontenlaenge: number
  naechsteDebitorennummer: number
  erzeugerKuerzel: string
}

interface Kontenzuordnung {
  clientId: string
  clientName: string
  debitorennummer: string
}

// ═══ Hilfs-Styles ═══
const card: React.CSSProperties = {
  background: 'white', borderRadius: 12, padding: 24,
  boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid var(--border, #e5e7eb)',
}
const btn: React.CSSProperties = {
  padding: '10px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
  fontWeight: 600, fontSize: 14, fontFamily: 'inherit', transition: 'all 0.15s',
}
const btnPrimary: React.CSSProperties = {
  ...btn, background: 'var(--gold2, #C9963C)', color: 'white',
}
const btnSecondary: React.CSSProperties = {
  ...btn, background: 'var(--bg, #F7F2EA)', color: 'var(--ink, #333)',
}
const inputStyle: React.CSSProperties = {
  padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border, #e5e7eb)',
  fontSize: 14, fontFamily: 'inherit', width: '100%',
}
const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: 'var(--ink5, #888)', marginBottom: 4,
  display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em',
}
const badge = (color: string): React.CSSProperties => ({
  display: 'inline-block', padding: '2px 8px', borderRadius: 6,
  fontSize: 11, fontWeight: 600, background: color, color: 'white',
})

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    erstellt: '#3b82f6',
    heruntergeladen: '#22c55e',
    importiert: '#8b5cf6',
    fehler: '#ef4444',
  }
  return <span style={badge(colors[status] || '#6b7280')}>{status}</span>
}

function formatDate(d: string) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatDateTime(d: string) {
  if (!d) return '—'
  return new Date(d).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ═══ Monatszeitraum-Helper ═══
function getMonatsZeitraum(monatOffset = 0): { von: string; bis: string; label: string } {
  const d = new Date()
  d.setMonth(d.getMonth() + monatOffset)
  const year = d.getFullYear()
  const month = d.getMonth()
  const von = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const letzterTag = new Date(year, month + 1, 0).getDate()
  const bis = `${year}-${String(month + 1).padStart(2, '0')}-${String(letzterTag).padStart(2, '0')}`
  const label = d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', month: 'long', year: 'numeric' })
  return { von, bis, label }
}

export default function DatevExportPage() {
  const [tab, setTab] = useState<Tab>('export')
  const [exporte, setExporte] = useState<DatevExport[]>([])
  const [config, setConfig] = useState<DatevConfig | null>(null)
  const [konten, setKonten] = useState<Kontenzuordnung[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Export-Formular
  const [exportVon, setExportVon] = useState('')
  const [exportBis, setExportBis] = useState('')
  const [exporting, setExporting] = useState(false)

  // Konfig-Formular
  const [configForm, setConfigForm] = useState<DatevConfig | null>(null)

  // ═══ Daten laden ═══
  const ladeExporte = useCallback(async () => {
    try {
      const res = await fetch('/api/billing/datev/export')
      if (!res.ok) throw new Error('Fehler beim Laden')
      const data = await res.json()
      setExporte(data)
    } catch (err) {
      log.errorWithException('Fehler in ladeExporte', err)
      setError('DATEV-Exporte konnten nicht geladen werden.')
    }
  }, [])

  const ladeConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/billing/datev/config')
      if (!res.ok) throw new Error('Fehler beim Laden')
      const data = await res.json()
      setConfig(data)
      setConfigForm(data)
    } catch (err) {
      log.errorWithException('Fehler in ladeConfig', err)
      setError('DATEV-Konfiguration konnte nicht geladen werden.')
    }
  }, [])

  const ladeKonten = useCallback(async () => {
    try {
      const res = await fetch('/api/billing/datev/kontenzuordnung')
      if (!res.ok) throw new Error('Fehler beim Laden')
      const data = await res.json()
      setKonten(data)
    } catch (err) {
      log.errorWithException('Fehler in ladeKonten', err)
      setError('Kontenzuordnung konnte nicht geladen werden.')
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    Promise.all([ladeExporte(), ladeConfig(), ladeKonten()]).finally(() => setLoading(false))
  }, [ladeExporte, ladeConfig, ladeKonten])

  // ═══ Vormonat als Default ═══
  useEffect(() => {
    const { von, bis } = getMonatsZeitraum(-1)
    setExportVon(von)
    setExportBis(bis)
  }, [])

  // ═══ Export starten ═══
  async function starteExport() {
    setExporting(true)
    setError('')
    setSuccess('')
    try {
      const res = await fetch('/api/billing/datev/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zeitraumVon: exportVon, zeitraumBis: exportBis }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Export fehlgeschlagen')
      setSuccess(`Export erstellt: ${data.buchungenAnzahl} Buchungssaetze`)
      await ladeExporte()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setExporting(false)
    }
  }

  // ═══ Download ═══
  async function downloadExport(id: string) {
    try {
      const res = await fetch(`/api/billing/datev/export/${id}/download`)
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Download fehlgeschlagen')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `DATEV_Export.csv`
      a.click()
      URL.revokeObjectURL(url)
      await ladeExporte()
    } catch (e: any) {
      setError(e.message)
    }
  }

  // ═══ Config speichern ═══
  async function speichereConfig() {
    if (!configForm) return
    setError('')
    setSuccess('')
    try {
      const res = await fetch('/api/billing/datev/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configForm),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Speichern fehlgeschlagen')
      setConfig(data)
      setConfigForm(data)
      setSuccess('Konfiguration gespeichert')
    } catch (e: any) {
      setError(e.message)
    }
  }

  // ═══ Schnellwahl-Buttons ═══
  function setzeZeitraum(offset: number) {
    const { von, bis } = getMonatsZeitraum(offset)
    setExportVon(von)
    setExportBis(bis)
  }

  // ═══ Tabs ═══
  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'export', label: 'Export', icon: <IconDocument size={16} /> },
    { key: 'config', label: 'Konfiguration', icon: <IconTarget size={16} /> },
    { key: 'konten', label: 'Kontenzuordnung', icon: <IconMoney size={16} /> },
  ]

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <IconMoney size={28} />
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, fontFamily: "'Cormorant Garamond', serif" }}>
            DATEV-Export
          </h1>
          <p style={{ fontSize: 13, color: 'var(--ink5, #888)', margin: 0 }}>
            Buchungsstapel fuer den Steuerberater exportieren
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border, #e5e7eb)', paddingBottom: 0 }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              ...btn,
              background: tab === t.key ? 'white' : 'transparent',
              color: tab === t.key ? 'var(--gold2, #C9963C)' : 'var(--ink5, #888)',
              borderBottom: tab === t.key ? '2px solid var(--gold2, #C9963C)' : '2px solid transparent',
              borderRadius: '8px 8px 0 0',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Feedback */}
      {error && (
        <div style={{ background: '#fef2f2', color: '#dc2626', padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ background: '#f0fdf4', color: '#16a34a', padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          {success}
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink5, #888)' }}>
          Daten werden geladen...
        </div>
      )}

      {/* ═══ Tab: Export ═══ */}
      {!loading && tab === 'export' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Export-Formular */}
          <div style={card}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px' }}>Neuen Export erstellen</h2>

            {/* Schnellwahl */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              {[-3, -2, -1, 0].map(offset => {
                const { label } = getMonatsZeitraum(offset)
                return (
                  <button key={offset} style={btnSecondary} onClick={() => setzeZeitraum(offset)}>
                    {label}
                  </button>
                )
              })}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, alignItems: 'end' }}>
              <div>
                <label style={labelStyle}>Von</label>
                <input type="date" value={exportVon} onChange={e => setExportVon(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Bis</label>
                <input type="date" value={exportBis} onChange={e => setExportBis(e.target.value)} style={inputStyle} />
              </div>
              <button
                style={{ ...btnPrimary, opacity: exporting ? 0.6 : 1 }}
                disabled={exporting || !exportVon || !exportBis}
                onClick={starteExport}
              >
                {exporting ? 'Exportiert...' : 'Export starten'}
              </button>
            </div>

            {config && !config.beraternummer && (
              <p style={{ fontSize: 12, color: '#f59e0b', marginTop: 12 }}>
                Hinweis: Beraternummer und Mandantennummer sind noch nicht konfiguriert.
              </p>
            )}
          </div>

          {/* Statistik */}
          {exporte.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
              {[
                { label: 'Exporte gesamt', value: exporte.length },
                { label: 'Letzter Export', value: exporte[0] ? formatDate(exporte[0].exportDatum) : '—' },
                { label: 'Buchungen (letzter)', value: exporte[0]?.buchungenAnzahl ?? 0 },
              ].map((s, i) => (
                <div key={i} style={{ ...card, padding: 16, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--ink5)', textTransform: 'uppercase', fontWeight: 600 }}>{s.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginTop: 4 }}>{s.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Export-Liste */}
          <div style={card}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px' }}>Bisherige Exporte</h2>
            {exporte.length === 0 ? (
              <p style={{ color: 'var(--ink5)', fontSize: 13 }}>Noch keine Exporte vorhanden.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)' }}>
                      {['Zeitraum', 'Buchungen', 'Exportdatum', 'Status', 'Kontenrahmen', 'Aktion'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, fontWeight: 700, color: 'var(--ink5)', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {exporte.map(exp => (
                      <tr key={exp.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 12px' }}>
                          {formatDate(exp.zeitraumVon)} – {formatDate(exp.zeitraumBis)}
                        </td>
                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>{exp.buchungenAnzahl}</td>
                        <td style={{ padding: '10px 12px' }}>{formatDateTime(exp.exportDatum)}</td>
                        <td style={{ padding: '10px 12px' }}>
                          {statusBadge(exp.status)}
                          {exp.fehlerDetails && (
                            <span style={{ fontSize: 11, color: '#ef4444', marginLeft: 8 }} title={exp.fehlerDetails}>
                              (Details)
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '10px 12px' }}>{exp.kontenrahmen}</td>
                        <td style={{ padding: '10px 12px' }}>
                          {exp.status !== 'fehler' && (
                            <button style={{ ...btnSecondary, padding: '4px 12px', fontSize: 12 }} onClick={() => downloadExport(exp.id)}>
                              Herunterladen
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ Tab: Konfiguration ═══ */}
      {!loading && tab === 'config' && configForm && (
        <div style={card}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 20px' }}>DATEV-Einstellungen</h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 600 }}>
            <div>
              <label style={labelStyle}>Beraternummer</label>
              <input
                style={inputStyle}
                value={configForm.beraternummer}
                onChange={e => setConfigForm({ ...configForm, beraternummer: e.target.value })}
                placeholder="z.B. 1234567"
              />
            </div>
            <div>
              <label style={labelStyle}>Mandantennummer</label>
              <input
                style={inputStyle}
                value={configForm.mandantennummer}
                onChange={e => setConfigForm({ ...configForm, mandantennummer: e.target.value })}
                placeholder="z.B. 12345"
              />
            </div>
            <div>
              <label style={labelStyle}>Kontenrahmen</label>
              <select
                style={inputStyle}
                value={configForm.kontenrahmen}
                onChange={e => setConfigForm({ ...configForm, kontenrahmen: e.target.value as 'SKR03' | 'SKR04' })}
              >
                <option value="SKR03">SKR03 (Standard Pflege)</option>
                <option value="SKR04">SKR04</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Sachkontenlänge</label>
              <select
                style={inputStyle}
                value={configForm.sachkontenlaenge}
                onChange={e => setConfigForm({ ...configForm, sachkontenlaenge: Number(e.target.value) })}
              >
                <option value={4}>4 Stellen</option>
                <option value={5}>5 Stellen</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>WJ-Beginn (MM-TT)</label>
              <input
                style={inputStyle}
                value={configForm.wjBeginn}
                onChange={e => setConfigForm({ ...configForm, wjBeginn: e.target.value })}
                placeholder="01-01"
              />
            </div>
            <div>
              <label style={labelStyle}>Erzeuger-Kürzel</label>
              <input
                style={inputStyle}
                value={configForm.erzeugerKuerzel}
                onChange={e => setConfigForm({ ...configForm, erzeugerKuerzel: e.target.value })}
                placeholder="AE"
              />
            </div>
          </div>

          <div style={{ marginTop: 20 }}>
            <button style={btnPrimary} onClick={speichereConfig}>
              Konfiguration speichern
            </button>
          </div>
        </div>
      )}

      {/* ═══ Tab: Kontenzuordnung ═══ */}
      {!loading && tab === 'konten' && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Klienten-Debitorennummern</h2>
            <span style={{ fontSize: 12, color: 'var(--ink5)' }}>
              {konten.length} Zuordnungen | Bereich: 10000–69999
            </span>
          </div>

          <p style={{ fontSize: 13, color: 'var(--ink5)', marginBottom: 16 }}>
            Debitorennummern werden beim Export automatisch vergeben. Hier koennen Sie bestehende Zuordnungen einsehen und manuell aendern.
          </p>

          {konten.length === 0 ? (
            <p style={{ color: 'var(--ink5)', fontSize: 13 }}>
              Noch keine Zuordnungen vorhanden. Diese werden beim ersten Export automatisch erstellt.
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)' }}>
                    {['Debitorennr.', 'Klient', 'Klient-ID'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, fontWeight: 700, color: 'var(--ink5)', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {konten.map(k => (
                    <tr key={k.clientId} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 600, fontFamily: 'monospace' }}>{k.debitorennummer}</td>
                      <td style={{ padding: '10px 12px' }}>{k.clientName}</td>
                      <td style={{ padding: '10px 12px', fontSize: 11, color: 'var(--ink5)', fontFamily: 'monospace' }}>{k.clientId.slice(0, 8)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
