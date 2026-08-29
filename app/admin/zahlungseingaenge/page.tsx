'use client'

import { heuteBerlin } from '@/lib/utils/timezone';
import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { IconMoney, IconDocument, IconChart, IconTarget } from '@/components/Icons'
import { klickbar } from '@/lib/a11y'
import { DIFFERENCE_STATUS } from '@/lib/admin/ops'
import { WIDERSPRUCH_STATUS, istMahnbremse } from '@/lib/billing/core/differenzen'

// ═══════════════════════════════════════════════════════════════
// Zahlungseingänge — CAMT Import, OPOS, Klärfälle
// ═══════════════════════════════════════════════════════════════

type Tab = 'import' | 'opos' | 'klaerfaelle' | 'kuerzungen'

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

// Nur die Felder, die diese Ansicht liest — die Route liefert mehr.
interface CamtPreflight {
  modus: string
  buchend: boolean
  modusGrund: string
  dateiname: string
  format: string
  kontoIbanKurz: string | null
  auszugsDatum: string | null
  dateiBereitsImportiert: boolean
  parseFehler: string[]
  gesamt: number
  nachEinordnung: Record<string, number>
  summeEingangCent: number
  summeAusgangCent: number
  summeBuchbarCent: number
  freigabefaehig: boolean
  blocker: string[]
  warnungen: string[]
}

const EINORDNUNG_LABEL: Record<string, { label: string; color: string }> = {
  MATCHED: { label: 'Zugeordnet', color: '#22c55e' },
  AMBIGUOUS: { label: 'Mehrdeutig', color: '#f59e0b' },
  UNMATCHED: { label: 'Nicht zuordenbar', color: '#ef4444' },
  DUPLICATE: { label: 'Dublette', color: '#8b5cf6' },
  INVALID: { label: 'Ungültig', color: '#b91c1c' },
  CROSS_TENANT_BLOCKED: { label: 'Fremder Mandant', color: '#b91c1c' },
}

interface Kuerzung {
  id: string
  invoice_id: string
  soll_cents: number
  ist_cents: number
  differenz_cents: number
  kuerzung_grund: string | null
  kuerzung_kategorie: string | null
  widerspruch_status: string
  widerspruch_frist: string | null
  widerspruch_at: string | null
  widerspruch_notes: string | null
  nachforderung_cents: number | null
  gutschrift_cents: number | null
  abschreibung_cents: number | null
  resolved_at: string | null
  created_at: string
  invoice: {
    id: string
    invoice_number: string | null
    invoice_number_formatted: string | null
    total_amount: number | null
    client: { first_name: string | null; last_name: string | null } | null
  } | null
}

// ═══════════════════════════════════════════════════════════════
// Hilfsfunktionen
// ═══════════════════════════════════════════════════════════════
const formatCurrency = (cents: number) =>
  `${(cents / 100).toFixed(2).replace('.', ',')} €`
const formatDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }) : '—'

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
  const [preflight, setPreflight] = useState<CamtPreflight | null>(null)
  const [preflightDatei, setPreflightDatei] = useState<File | null>(null)
  const [oposFilter, setOposFilter] = useState<string>('alle')
  // null heisst „noch nicht geladen" und NICHT „keine Kuerzungen" —
  // „keine Kuerzungen" ist eine Aussage, die man nur machen darf, wenn
  // wirklich nachgesehen wurde.
  const [kuerzungen, setKuerzungen] = useState<Kuerzung[] | null>(null)
  const [kuerzungFehler, setKuerzungFehler] = useState<string | null>(null)
  const [kuerzungLaeuft, setKuerzungLaeuft] = useState(false)
  const [nurOffeneKuerzungen, setNurOffeneKuerzungen] = useState(true)
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

  const loadKuerzungen = useCallback(async () => {
    setKuerzungFehler(null)
    try {
      const res = await fetch('/api/billing/differences')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Kürzungen konnten nicht geladen werden.')
      setKuerzungen(data.differences || [])
    } catch (e) {
      // Eigener Fehlerpfad: ein Fehlschlag darf nicht als leere Liste
      // durchgehen. „Keine Kürzungen offen" ist die beruhigendste aller
      // falschen Antworten — hier haengt eine Widerspruchsfrist daran.
      setKuerzungFehler(e instanceof Error ? e.message : 'Unbekannter Fehler.')
    }
  }, [])

  const patchKuerzung = useCallback(async (id: string, felder: Record<string, unknown>) => {
    setKuerzungLaeuft(true)
    setKuerzungFehler(null)
    try {
      const res = await fetch('/api/billing/differences', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...felder }),
      })
      const data = await res.json()
      if (!res.ok) { setKuerzungFehler(data.error || 'Änderung fehlgeschlagen.'); return }
      await loadKuerzungen()
    } finally {
      setKuerzungLaeuft(false)
    }
  }, [loadKuerzungen])

  const loadKlaerfaelle = useCallback(async () => {
    try {
      const res = await fetch('/api/billing/klaerfaelle')
      if (res.ok) setKlaerfaelle(await res.json())
    } catch { /* */ }
  }, [])

  useEffect(() => {
    setLoading(true)
    Promise.all([loadImports(), loadOpos(), loadKlaerfaelle(), loadKuerzungen()]).finally(() => setLoading(false))
  }, [loadImports, loadOpos, loadKlaerfaelle, loadKuerzungen])

  useEffect(() => { loadOpos() }, [loadOpos])

  // ─── CAMT Upload ───
  // ═══════════════════════════════════════════════════════════
  // ERST ANSEHEN, DANN BUCHEN
  // ═══════════════════════════════════════════════════════════
  //
  // /api/billing/camt/preflight ist ein vollstaendiger Trockenlauf ueber
  // eine echte Bankdatei — er BUCHT NIE, auch nicht wenn CAMT_IMPORT_MODE
  // auf LIVE steht, und liefert je Buchung eine Einordnung (zugeordnet,
  // mehrdeutig, unzuordenbar, Dublette, ungueltig, mandantenfremd), die
  // Blocker und ein fail-closed `freigabefaehig`. Die Route wurde von
  // KEINER Stelle der Oberflaeche aufgerufen.
  //
  // Bis hierhin ging eine abgelegte Datei unmittelbar an
  // /api/billing/camt/import, und das BUCHT je nach Betriebsart. Die
  // einzige Art zu sehen, was in einer Bankdatei steht, war also, sie zu
  // verbuchen — bei einer Dublette oder einer Datei des falschen Kontos
  // merkt man das erst danach.
  //
  // Deshalb liegt der Trockenlauf jetzt VOR dem Buchen und das Buchen
  // hinter einem zweiten, ausdruecklichen Klick. Das ist eine bewusste
  // Verhaltensaenderung: aus einem Klick werden zwei. Weggenommen wird
  // nichts — nur die Reihenfolge ist jetzt die, in der man eine Geldbuchung
  // ansieht, bevor sie passiert.
  async function handlePreflight(file: File) {
    setUploading(true)
    setUploadResult(null)
    setPreflight(null)
    setPreflightDatei(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/billing/camt/preflight', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) { setUploadResult(`Fehler: ${data.error}`); return }
      setPreflight(data.preflight)
      setPreflightDatei(file)
    } catch {
      setUploadResult('Prüfung fehlgeschlagen')
    } finally {
      setUploading(false)
    }
  }

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
        // Das Prüfergebnis gehört zu einer Datei, die es jetzt nicht mehr
        // nur als Vorschau gibt. Bliebe es stehen, stünde neben dem
        // Buchungsergebnis weiter ein „würde gebucht"-Bericht.
        setPreflight(null)
        setPreflightDatei(null)
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
  const todayStr = heuteBerlin()
  const eingaengeHeute = imports
    .filter(i => i.import_datum?.startsWith(todayStr))
    .reduce((s, i) => s + i.buchungen_anzahl, 0)
  const zugeordnetHeute = imports
    .filter(i => i.import_datum?.startsWith(todayStr))
    .reduce((s, i) => s + i.zugeordnet_anzahl, 0)
  const klaerfaelleOffen = klaerfaelle.filter(k => k.status === 'offen').length
  const oposGesamt = oposData?.gesamtOffen ?? 0
  // Nur was noch nicht ueber das Geld entschieden ist zaehlt als offen;
  // erledigte Kuerzungen sonst haetten die Zahl fuer immer wachsen lassen.
  const kuerzungenOffen = (kuerzungen ?? []).filter(
    k => !['gutschrift', 'abschreibung', 'erledigt'].includes(k.widerspruch_status),
  ).length

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
          { key: 'kuerzungen' as Tab, label: `Kürzungen${kuerzungenOffen > 0 ? ` (${kuerzungenOffen})` : ''}` },
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
                  if (f) handlePreflight(f)
                }}
                {...klickbar(() => fileRef.current?.click())}
                aria-label="camt.053-Datei auswählen oder hierher ziehen — wird zuerst geprüft, nicht gebucht"
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
                    if (f) handlePreflight(f)
                  }}
                />
                <IconDocument size={32} color="#c8a84e" />
                <p style={{ margin: '8px 0 4px', fontWeight: 600, color: '#92400e' }}>
                  {uploading ? 'Wird geprüft…' : 'CAMT-Datei prüfen'}
                </p>
                <p style={{ margin: 0, fontSize: 13, color: '#78716c' }}>
                  Klicken oder Datei hierher ziehen (CAMT.053 / CAMT.054 XML) —
                  die Datei wird zuerst im Trockenlauf geprüft und <strong>nicht</strong> gebucht.
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

              {/* ─── Trockenlauf-Ergebnis ─── */}
              {preflight && (
                <div style={{
                  border: `1px solid ${preflight.freigabefaehig ? '#22c55e' : '#ef4444'}`,
                  borderRadius: 12, padding: 16, marginBottom: 20,
                  background: preflight.freigabefaehig ? '#f0fdf4' : '#fef2f2',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                    <strong style={{ fontSize: 15 }}>Trockenlauf: {preflight.dateiname}</strong>
                    <span style={{
                      padding: '2px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                      background: preflight.freigabefaehig ? '#dcfce7' : '#fee2e2',
                      color: preflight.freigabefaehig ? '#166534' : '#991b1b',
                    }}>
                      {preflight.freigabefaehig ? 'Kann gebucht werden' : 'Nicht buchbar'}
                    </span>
                    <span style={{ fontSize: 12, color: '#666' }}>
                      {preflight.format}
                      {preflight.kontoIbanKurz ? ` · Konto ${preflight.kontoIbanKurz}` : ''}
                      {preflight.auszugsDatum ? ` · Auszug ${formatDate(preflight.auszugsDatum)}` : ''}
                    </span>
                  </div>

                  <div style={{ fontSize: 13, color: '#555', marginBottom: 8 }}>
                    {preflight.gesamt} {preflight.gesamt === 1 ? 'Buchung' : 'Buchungen'} ·
                    Eingang {formatCurrency(preflight.summeEingangCent)} ·
                    Ausgang {formatCurrency(preflight.summeAusgangCent)} ·
                    davon automatisch zuordenbar {formatCurrency(preflight.summeBuchbarCent)}
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                    {Object.entries(preflight.nachEinordnung)
                      .filter(([, n]) => n > 0)
                      .map(([schluessel, n]) => {
                        const m = EINORDNUNG_LABEL[schluessel] ?? { label: schluessel, color: '#666' }
                        return (
                          <span key={schluessel} style={{
                            padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                            color: m.color, background: `${m.color}1a`, border: `1px solid ${m.color}55`,
                          }}>{m.label}: {n}</span>
                        )
                      })}
                  </div>

                  {/* Die Betriebsart steht dabei, weil sie entscheidet, ob der
                      scharfe Lauf ueberhaupt schreibt — ohne diese Angabe
                      koennte ein Lauf „erfolgreich" melden und nichts gebucht
                      haben. */}
                  <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
                    Betriebsart <strong>{preflight.modus}</strong> — {preflight.modusGrund}
                    {!preflight.buchend && ' (ein scharfer Lauf würde in dieser Betriebsart nichts buchen)'}
                  </div>

                  {preflight.dateiBereitsImportiert && (
                    <div style={{ fontSize: 13, color: '#991b1b', fontWeight: 600, marginBottom: 6 }}>
                      Diese Datei wurde bereits einmal importiert.
                    </div>
                  )}

                  {preflight.parseFehler.length > 0 && (
                    <div style={{ fontSize: 13, color: '#991b1b', marginBottom: 6 }}>
                      <strong>Nicht lesbare Zeilen:</strong>
                      <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                        {preflight.parseFehler.map((f, i) => <li key={i}>{f}</li>)}
                      </ul>
                    </div>
                  )}

                  {preflight.blocker.length > 0 && (
                    <div style={{ fontSize: 13, color: '#991b1b', marginBottom: 6 }}>
                      <strong>Blocker:</strong>
                      <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                        {preflight.blocker.map((b, i) => <li key={i}>{b}</li>)}
                      </ul>
                    </div>
                  )}

                  {preflight.warnungen.length > 0 && (
                    <div style={{ fontSize: 13, color: '#92400e', marginBottom: 6 }}>
                      <strong>Hinweise:</strong>
                      <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                        {preflight.warnungen.map((w, i) => <li key={i}>{w}</li>)}
                      </ul>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                    {/* Fail-closed: der Knopf ist gesperrt, solange `freigabefaehig`
                        false ist. Die Entscheidung faellt im Preflight selbst, der
                        bei Zweifeln nein sagt — die Oberflaeche legt sie nicht neu
                        aus und bietet auch kein „trotzdem buchen" an. */}
                    <button
                      disabled={!preflight.freigabefaehig || uploading || !preflightDatei}
                      onClick={() => preflightDatei && handleUpload(preflightDatei)}
                      style={{
                        padding: '8px 18px', borderRadius: 6, border: 'none', fontSize: 14, fontWeight: 600,
                        cursor: preflight.freigabefaehig && !uploading ? 'pointer' : 'not-allowed',
                        background: preflight.freigabefaehig ? '#166534' : '#cbd5e1',
                        color: preflight.freigabefaehig ? '#fff' : '#64748b',
                      }}
                    >
                      {uploading ? 'Läuft…' : 'Jetzt buchen'}
                    </button>
                    <button
                      onClick={() => { setPreflight(null); setPreflightDatei(null) }}
                      style={{
                        padding: '8px 18px', borderRadius: 6, border: '1px solid #cbd5e1',
                        background: '#fff', cursor: 'pointer', fontSize: 14,
                      }}
                    >Verwerfen</button>
                  </div>
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

          {/* ─── Tab: Kürzungen ─── */}
          {/*
            payment_differences war bis heute nur beschreibbar: POST erfasst
            eine Kürzung, GET listet sie — und KEINE Stelle der Oberfläche rief
            beides je auf. Der Zustand blieb damit für immer 'offen', und die
            beiden Mahnbremsen, die auf 'widerspruch_eingereicht' und
            'nachforderung' warten, konnten nie greifen: eine bestrittene
            Forderung wurde weitergemahnt.
          */}
          {tab === 'kuerzungen' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Kürzungen der Kostenträger</h3>
                <span style={{ flex: 1 }} />
                <label style={{ fontSize: 13, color: '#555', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={nurOffeneKuerzungen}
                    onChange={e => setNurOffeneKuerzungen(e.target.checked)} />
                  Nur unerledigte
                </label>
              </div>
              <p style={{ fontSize: 13, color: '#666', marginTop: 0, marginBottom: 16 }}>
                Solange eine Kürzung als <strong>Widerspruch eingereicht</strong> oder{' '}
                <strong>Nachforderung</strong> geführt wird, mahnt der Mahnlauf die
                zugehörige Rechnung nicht — eine bestrittene Forderung wird nicht gemahnt.
              </p>

              {kuerzungFehler && (
                <div style={{ padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontSize: 14, background: '#fee2e2', color: '#991b1b' }}>
                  {kuerzungFehler}
                </div>
              )}

              {kuerzungen === null && !kuerzungFehler && <p style={{ color: '#888', fontSize: 14 }}>Laden…</p>}
              {kuerzungen !== null && kuerzungen.length === 0 && (
                <p style={{ color: '#888', fontSize: 14 }}>Keine Kürzung erfasst.</p>
              )}

              {(kuerzungen ?? [])
                .filter(k => !nurOffeneKuerzungen || !['gutschrift', 'abschreibung', 'erledigt'].includes(k.widerspruch_status))
                .map(k => (
                  <KuerzungCard
                    key={k.id}
                    kuerzung={k}
                    laeuft={kuerzungLaeuft}
                    onPatch={patchKuerzung}
                  />
                ))}
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

// ═══════════════════════════════════════════════════════════════
// Eine Kürzung mit ihrem Lebenszyklus
// ═══════════════════════════════════════════════════════════════
function KuerzungCard({ kuerzung: k, laeuft, onPatch }: {
  kuerzung: Kuerzung
  laeuft: boolean
  onPatch: (id: string, felder: Record<string, unknown>) => Promise<void>
}) {
  const [offen, setOffen] = useState(false)
  const [status, setStatus] = useState(k.widerspruch_status)
  const [frist, setFrist] = useState(k.widerspruch_frist ?? '')
  const [notizen, setNotizen] = useState(k.widerspruch_notes ?? '')
  const [nachforderung, setNachforderung] = useState(String(((k.nachforderung_cents ?? 0) / 100).toFixed(2)))
  const [gutschrift, setGutschrift] = useState(String(((k.gutschrift_cents ?? 0) / 100).toFixed(2)))
  const [abschreibung, setAbschreibung] = useState(String(((k.abschreibung_cents ?? 0) / 100).toFixed(2)))

  const anzeige = DIFFERENCE_STATUS[k.widerspruch_status] ?? { label: k.widerspruch_status, color: '#666' }
  const klient = k.invoice?.client
    ? [k.invoice.client.first_name, k.invoice.client.last_name].filter(Boolean).join(' ')
    : '—'
  const rechnung = k.invoice?.invoice_number_formatted || k.invoice?.invoice_number || '—'
  const bremst = istMahnbremse(k.widerspruch_status)

  // Fristampel: die Widerspruchsfrist ist der Punkt, ab dem das Geld ohne
  // weiteres Zutun verloren ist. Sie wird nur gezeigt, solange der Widerspruch
  // noch möglich ist — nach dem Einreichen läuft sie nicht weiter.
  const fristTage = k.widerspruch_frist && k.widerspruch_status === 'offen'
    ? Math.ceil((new Date(`${k.widerspruch_frist}T00:00:00`).getTime() - new Date(`${heuteBerlin()}T00:00:00`).getTime()) / 86400000)
    : null

  // Euro-Eingabe zu Cent: über Math.round auf dem Euro-Wert *100, damit
  // 12,35 € nicht als 1234 Cent ankommt (0.1+0.2-Problem in Binärgleitkomma).
  const zuCent = (wert: string): number | null => {
    const zahl = Number(wert.replace(',', '.'))
    if (!Number.isFinite(zahl) || zahl < 0) return null
    return Math.round(zahl * 100)
  }

  const speichern = async () => {
    const felder: Record<string, unknown> = {}
    if (status !== k.widerspruch_status) felder.status = status
    if ((frist || null) !== (k.widerspruch_frist || null)) felder.frist = frist || null
    if ((notizen.trim() || '') !== (k.widerspruch_notes || '')) felder.notizen = notizen
    for (const [wert, alt, name] of [
      [nachforderung, k.nachforderung_cents ?? 0, 'nachforderungCents'],
      [gutschrift, k.gutschrift_cents ?? 0, 'gutschriftCents'],
      [abschreibung, k.abschreibung_cents ?? 0, 'abschreibungCents'],
    ] as const) {
      const cents = zuCent(wert)
      if (cents === null) return
      if (cents !== alt) felder[name] = cents
    }
    if (Object.keys(felder).length === 0) { setOffen(false); return }
    await onPatch(k.id, felder)
    setOffen(false)
  }

  return (
    <div style={{
      border: '1px solid #e5e7eb', borderLeft: `4px solid ${anzeige.color}`,
      borderRadius: 10, padding: 14, marginBottom: 10, background: '#fff',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600, fontSize: 15 }}>{klient}</span>
        <span style={{ fontSize: 13, color: '#666' }}>Rechnung {rechnung}</span>
        <span style={{
          padding: '2px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600,
          color: anzeige.color, background: `${anzeige.color}22`, border: `1px solid ${anzeige.color}55`,
        }}>{anzeige.label}</span>
        {bremst && (
          <span style={{ fontSize: 12, color: '#166534', background: '#dcfce7', padding: '2px 10px', borderRadius: 999 }}>
            Mahnlauf gestoppt
          </span>
        )}
        <span style={{ flex: 1 }} />
        <button onClick={() => setOffen(o => !o)} style={{
          padding: '6px 14px', borderRadius: 6, border: '1px solid #cbd5e1',
          background: '#f8fafc', cursor: 'pointer', fontSize: 13,
        }}>{offen ? 'Schließen' : 'Bearbeiten'}</button>
      </div>

      <div style={{ fontSize: 13, color: '#555', marginTop: 6 }}>
        Soll {formatCurrency(k.soll_cents)} · Ist {formatCurrency(k.ist_cents)} ·{' '}
        <strong style={{ color: '#b91c1c' }}>gekürzt um {formatCurrency(k.differenz_cents)}</strong>
        {k.kuerzung_kategorie && ` · ${k.kuerzung_kategorie.replace(/_/g, ' ')}`}
      </div>
      {k.kuerzung_grund && (
        <div style={{ fontSize: 13, color: '#555', marginTop: 2 }}>Grund: {k.kuerzung_grund}</div>
      )}
      {fristTage !== null && (
        <div style={{
          fontSize: 13, marginTop: 6, fontWeight: 600,
          color: fristTage < 0 ? '#991b1b' : fristTage <= 14 ? '#b45309' : '#166534',
        }}>
          {fristTage < 0
            ? `Widerspruchsfrist am ${formatDate(k.widerspruch_frist)} abgelaufen`
            : `Widerspruch noch ${fristTage} Tage möglich (bis ${formatDate(k.widerspruch_frist)})`}
        </div>
      )}
      {k.widerspruch_at && (
        <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
          Widerspruch eingelegt am {formatDate(k.widerspruch_at)}
        </div>
      )}
      {k.widerspruch_notes && !offen && (
        <div style={{ fontSize: 13, color: '#555', marginTop: 4 }}>{k.widerspruch_notes}</div>
      )}

      {offen && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <label style={{ fontSize: 13, color: '#555' }}>
              Stand<br />
              <select value={status} onChange={e => setStatus(e.target.value)} style={feldStyle}>
                {WIDERSPRUCH_STATUS.map(w => (
                  <option key={w} value={w}>{DIFFERENCE_STATUS[w]?.label ?? w}</option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 13, color: '#555' }}>
              Widerspruchsfrist<br />
              <input type="date" value={frist} onChange={e => setFrist(e.target.value)} style={feldStyle} />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            {([
              ['Nachforderung €', nachforderung, setNachforderung],
              ['Gutschrift €', gutschrift, setGutschrift],
              ['Abschreibung €', abschreibung, setAbschreibung],
            ] as const).map(([label, wert, setter]) => (
              <label key={label} style={{ fontSize: 13, color: '#555' }}>
                {label}<br />
                <input type="number" min={0} step="0.01" value={wert}
                  onChange={e => setter(e.target.value)} style={{ ...feldStyle, width: 130 }} />
              </label>
            ))}
          </div>
          {/* Die Summe der drei kann die Kürzung nicht übersteigen — sie teilen
              denselben einbehaltenen Betrag auf. Die Route weist das ab; hier
              steht der Rahmen, damit man es vor dem Absenden sieht. */}
          <div style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>
            Zusammen höchstens {formatCurrency(k.differenz_cents)} — Nachforderung, Gutschrift
            und Abschreibung teilen den einbehaltenen Betrag auf.
          </div>
          <label style={{ fontSize: 13, color: '#555', display: 'block', marginBottom: 10 }}>
            Notiz<br />
            <textarea value={notizen} onChange={e => setNotizen(e.target.value)} rows={2}
              style={{ ...feldStyle, width: '100%', maxWidth: 620 }} />
          </label>
          <button onClick={speichern} disabled={laeuft} style={{
            padding: '8px 18px', borderRadius: 6, border: 'none', cursor: 'pointer',
            background: '#1a365d', color: '#fff', fontWeight: 600, fontSize: 14,
          }}>{laeuft ? 'Speichere…' : 'Speichern'}</button>
        </div>
      )}
    </div>
  )
}

const feldStyle: React.CSSProperties = {
  padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13,
}
