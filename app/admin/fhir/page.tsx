'use client'
// ═══════════════════════════════════════════════════════════════
// Admin-UI: FHIR / ISiP Interoperabilität (Block 21)
//
// Drei Bereiche:
//   1) Endpunkt-Übersicht (statisch, dokumentiert was implementiert ist)
//   2) Export — Klient auswählen → Bundle-Download
//   3) Import — FHIR-Bundle hochladen → Vorschau (neu/bestehend) → Bestätigen
//   4) Audit-Log (fhir_audit_log)
// ═══════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Banner, EmptyRow, SearchInput, StatusBadge } from '@/components/admin/OpsUI'
import { formatDate } from '@/lib/admin/ops'
import type { PflegeUebersichtZeile } from '@/lib/pflege/types'
import type { ImportPreviewItem } from '@/lib/fhir/import'

interface AuditEntry {
  id: string
  actor_name: string
  action: 'export' | 'import_preview' | 'import_commit'
  resource_types: string[]
  client_id: string | null
  resource_count: number
  created_at: string
}

const ENDPUNKTE = [
  { method: 'GET', path: '/api/fhir/Patient', beschreibung: 'Suche/Liste (Bundle searchset)' },
  { method: 'GET', path: '/api/fhir/Patient/[id]', beschreibung: 'Einzelner Klient' },
  { method: 'GET', path: '/api/fhir/Encounter?patient=', beschreibung: 'Einsätze eines Klienten (aus Leistungsnachweisen)' },
  { method: 'GET', path: '/api/fhir/Encounter/[id]', beschreibung: 'Einzelner Einsatz' },
  { method: 'GET', path: '/api/fhir/Observation?patient=&category=vital-signs', beschreibung: 'Vitalwerte eines Klienten' },
  { method: 'GET', path: '/api/fhir/CarePlan?patient=', beschreibung: 'Maßnahmenpläne eines Klienten' },
  { method: 'GET', path: '/api/fhir/CarePlan/[id]', beschreibung: 'Einzelner Maßnahmenplan inkl. Aktivitäten' },
  { method: 'GET', path: '/api/fhir/export?patient=', beschreibung: 'Voll-Export als Bundle (Download)' },
  { method: 'POST', path: '/api/fhir/import', beschreibung: 'Patient-Bundle-Import (Vorschau/Bestätigung)' },
]

const ACTION_LABEL: Record<AuditEntry['action'], string> = {
  export: 'Export', import_preview: 'Import-Vorschau', import_commit: 'Import bestätigt',
}

type Decision = 'create' | 'update' | 'skip'

export default function FhirAdminPage() {
  const [tab, setTab] = useState<'uebersicht' | 'export' | 'import' | 'audit'>('uebersicht')

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>FHIR / ISiP Interoperabilität</h1>
          <p className="admin-subtitle">
            FHIR-R4-Schnittstelle (Basis-Profil, kein länderspezifisches Constraint) für Systemintegration
            und Datenportabilität — siehe docs/fhir-isip.md.
          </p>
        </div>
      </div>

      <Banner tone="info">
        <strong>ISiP-Interpretation:</strong> Hier keine Zertifizierungsbehauptung — &bdquo;ISiP-konform&ldquo;
        bedeutet in diesem Modul: Audit-Trail für jeden Export/Import (unten einsehbar), Zugriffskontrolle
        nur für Administratoren, TLS-Verschlüsselung und Datensparsamkeit (nur vorhandene Felder, org-gefenced).
      </Banner>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {([
          ['uebersicht', 'Endpunkte'],
          ['export', 'Export'],
          ['import', 'Import'],
          ['audit', 'Audit-Log'],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={tab === key ? tabBtnActive : tabBtn}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'uebersicht' && <UebersichtTab />}
      {tab === 'export' && <ExportTab />}
      {tab === 'import' && <ImportTab />}
      {tab === 'audit' && <AuditTab />}
    </div>
  )
}

function UebersichtTab() {
  return (
    <>
      <h2 style={cardTitle}>Implementierte Endpunkte</h2>
      <p style={{ fontSize: 13, color: 'var(--ink4)', marginBottom: 12 }}>
        Alle Endpunkte sind mit Admin-Session geschützt (requireOpsAdmin) und org-gefenced.
        Fehlerantworten sind FHIR-<code>OperationOutcome</code>-Ressourcen, keine generischen JSON-Fehler.
      </p>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr><th>Methode</th><th>Pfad</th><th>Beschreibung</th></tr>
          </thead>
          <tbody>
            {ENDPUNKTE.map(e => (
              <tr key={e.path}>
                <td><StatusBadge label={e.method} color={e.method === 'GET' ? '#5CB882' : '#C9963C'} /></td>
                <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{e.path}</td>
                <td style={{ fontSize: 13, color: 'var(--ink3)' }}>{e.beschreibung}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 12, color: 'var(--ink4)', marginTop: 16 }}>
        Nicht umgesetzt: Encounter/Observation/CarePlan-Import (nur Patient-Import), Practitioner-Ressource,
        AllergyIntolerance/MedicationStatement. Details siehe docs/fhir-isip.md.
      </p>
    </>
  )
}

function ExportTab() {
  const [klienten, setKlienten] = useState<PflegeUebersichtZeile[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/pflege/uebersicht')
      .then(r => r.json())
      .then(body => {
        if (body.error) { setError(body.error); return }
        setKlienten(body.uebersicht || [])
      })
      .catch(() => setError('Klientenliste konnte nicht geladen werden.'))
      .finally(() => setLoading(false))
  }, [])

  const gefiltert = useMemo(() => {
    const s = search.trim().toLowerCase()
    return klienten.filter(k => !s || `${k.first_name} ${k.last_name}`.toLowerCase().includes(s))
  }, [klienten, search])

  return (
    <>
      <h2 style={cardTitle}>Klient exportieren</h2>
      <p style={{ fontSize: 13, color: 'var(--ink4)', marginBottom: 12 }}>
        Erzeugt ein FHIR-Bundle (Patient + alle Encounter/Observation/CarePlan-Ressourcen dieses Klienten)
        als Download — für Anbieterwechsel/Portabilität. Jeder Export wird protokolliert.
      </p>
      {error && <Banner tone="danger">{error}</Banner>}
      <SearchInput value={search} onChange={setSearch} placeholder="Klient suchen…" />
      <div className="admin-table-wrap" style={{ marginTop: 12 }}>
        <table className="admin-table">
          <thead><tr><th>Klient</th><th>Pflegegrad</th><th></th></tr></thead>
          <tbody>
            {loading ? <EmptyRow colSpan={3}>Laden…</EmptyRow>
              : gefiltert.length === 0 ? <EmptyRow colSpan={3}>Keine Klienten gefunden</EmptyRow>
              : gefiltert.map(k => (
                <tr key={k.client_id}>
                  <td style={{ fontWeight: 600 }}>{k.first_name} {k.last_name}</td>
                  <td>{k.pflegegrad ?? '—'}</td>
                  <td>
                    <a
                      href={`/api/fhir/export?patient=${k.client_id}`}
                      style={actionBtn}
                    >
                      Bundle herunterladen
                    </a>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function ImportTab() {
  const [bundleText, setBundleText] = useState('')
  const [preview, setPreview] = useState<ImportPreviewItem[] | null>(null)
  const [bundleErrors, setBundleErrors] = useState<string[]>([])
  const [decisions, setDecisions] = useState<Record<number, Decision>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState<Array<{ index: number; status: string; error?: string }> | null>(null)

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setBundleText(String(reader.result ?? ''))
    reader.readAsText(file)
  }

  const ladeVorschau = useCallback(async () => {
    setLoading(true)
    setError('')
    setResults(null)
    try {
      const bundle = JSON.parse(bundleText)
      const res = await fetch('/api/fhir/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundle, mode: 'preview' }),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.issue?.[0]?.diagnostics || body.error || 'Vorschau fehlgeschlagen.'); return }
      setPreview(body.patients)
      setBundleErrors(body.bundleErrors || [])
      const initial: Record<number, Decision> = {}
      for (const p of body.patients as ImportPreviewItem[]) {
        initial[p.index] = p.errors.length > 0 ? 'skip' : (p.match === 'neu' ? 'create' : 'update')
      }
      setDecisions(initial)
    } catch {
      setError('Kein gültiges JSON.')
    } finally {
      setLoading(false)
    }
  }, [bundleText])

  const commit = useCallback(async () => {
    if (!preview) return
    setLoading(true)
    setError('')
    try {
      const bundle = JSON.parse(bundleText)
      const payload = {
        bundle,
        mode: 'commit',
        decisions: preview.map(p => ({ index: p.index, action: decisions[p.index] ?? 'skip', clientId: p.matchedClientId ?? undefined })),
      }
      const res = await fetch('/api/fhir/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.issue?.[0]?.diagnostics || body.error || 'Import fehlgeschlagen.'); return }
      setResults(body.results)
    } catch {
      setError('Unerwarteter Fehler beim Import.')
    } finally {
      setLoading(false)
    }
  }, [preview, bundleText, decisions])

  return (
    <>
      <h2 style={cardTitle}>FHIR-Bundle importieren</h2>
      <p style={{ fontSize: 13, color: 'var(--ink4)', marginBottom: 12 }}>
        Nur Patient-Ressourcen werden übernommen. Jede Zeile muss vor dem Schreiben bestätigt werden —
        &bdquo;bestehend&ldquo; überschreibt nur Felder, die im Bundle tatsächlich gesetzt sind.
      </p>
      {error && <Banner tone="danger">{error}</Banner>}
      {bundleErrors.length > 0 && <Banner tone="warn">{bundleErrors.join(' ')}</Banner>}

      <input type="file" accept="application/json" onChange={onFile} style={{ marginBottom: 12, fontSize: 13 }} />
      <textarea
        value={bundleText}
        onChange={e => setBundleText(e.target.value)}
        placeholder='{ "resourceType": "Bundle", "entry": [...] }'
        rows={6}
        style={{ width: '100%', fontFamily: 'monospace', fontSize: 12, padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--coal3)', color: 'var(--ink)', boxSizing: 'border-box', marginBottom: 12 }}
      />
      <button onClick={ladeVorschau} disabled={loading || !bundleText.trim()} style={actionBtnPrimary}>
        {loading ? 'Lädt…' : 'Vorschau laden'}
      </button>

      {preview && preview.length > 0 && (
        <>
          <h3 style={{ ...cardTitle, fontSize: 16 }}>Vorschau ({preview.length})</h3>
          <div className="admin-table-wrap" style={{ marginBottom: 16 }}>
            <table className="admin-table">
              <thead>
                <tr><th>Name</th><th>Match</th><th>Fehler</th><th>Aktion</th></tr>
              </thead>
              <tbody>
                {preview.map(p => (
                  <tr key={p.index}>
                    <td>{p.firstName} {p.lastName}</td>
                    <td>
                      <StatusBadge
                        label={p.match === 'neu' ? 'Neu' : `Bestehend (${p.matchReason})`}
                        color={p.match === 'neu' ? '#5CB882' : '#C9963C'}
                      />
                    </td>
                    <td style={{ fontSize: 12, color: '#D04B3B' }}>{p.errors.join(' ') || '—'}</td>
                    <td>
                      <select
                        value={decisions[p.index] ?? 'skip'}
                        disabled={p.errors.length > 0}
                        onChange={e => setDecisions(prev => ({ ...prev, [p.index]: e.target.value as Decision }))}
                        style={selectStyle}
                      >
                        <option value="skip">Überspringen</option>
                        <option value="create">Als neuen Klienten anlegen</option>
                        {p.match === 'bestehend' && <option value="update">Bestehenden Klienten aktualisieren</option>}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={commit} disabled={loading} style={actionBtnPrimary}>
            {loading ? 'Importiert…' : 'Import bestätigen'}
          </button>
        </>
      )}

      {results && (
        <>
          <h3 style={{ ...cardTitle, fontSize: 16 }}>Ergebnis</h3>
          <ul style={{ fontSize: 13, color: 'var(--ink3)' }}>
            {results.map(r => (
              <li key={r.index}>
                Zeile {r.index}: {r.status}{r.error ? ` — ${r.error}` : ''}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}

function AuditTab() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/fhir/audit-log')
      .then(r => r.json())
      .then(body => {
        if (body.error) { setError(body.error); return }
        setEntries(body.entries || [])
      })
      .catch(() => setError('Audit-Log konnte nicht geladen werden.'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <>
      <h2 style={cardTitle}>Audit-Log</h2>
      {error && <Banner tone="danger">{error}</Banner>}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr><th>Zeitpunkt</th><th>Wer</th><th>Aktion</th><th>Ressourcen</th><th>Anzahl</th></tr>
          </thead>
          <tbody>
            {loading ? <EmptyRow colSpan={5}>Laden…</EmptyRow>
              : entries.length === 0 ? <EmptyRow colSpan={5}>Noch keine Einträge</EmptyRow>
              : entries.map(e => (
                <tr key={e.id}>
                  <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{formatDate(e.created_at)}</td>
                  <td>{e.actor_name}</td>
                  <td><StatusBadge label={ACTION_LABEL[e.action]} color="#C9963C" /></td>
                  <td style={{ fontSize: 12 }}>{e.resource_types.join(', ')}</td>
                  <td>{e.resource_count}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

const cardTitle: CSSProperties = {
  fontFamily: "'Cormorant Garamond',serif", fontSize: 18, fontWeight: 700,
  color: 'var(--ink)', margin: '20px 0 12px',
}
const tabBtn: CSSProperties = {
  fontSize: 13, padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--coal3)', color: 'var(--ink3)', cursor: 'pointer', fontFamily: 'inherit',
}
const tabBtnActive: CSSProperties = {
  ...tabBtn, background: 'rgba(201,150,60,0.15)', borderColor: 'rgba(201,150,60,0.4)', color: 'var(--gold2)', fontWeight: 600,
}
const actionBtn: CSSProperties = {
  fontSize: 12, color: 'var(--gold2)', background: 'rgba(201,150,60,0.1)',
  border: '1px solid rgba(201,150,60,0.3)', borderRadius: 6, padding: '4px 10px',
  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', textDecoration: 'none',
}
const actionBtnPrimary: CSSProperties = {
  fontSize: 14, color: '#1a1a1a', background: 'var(--gold2)',
  border: 'none', borderRadius: 8, padding: '10px 18px',
  cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, marginBottom: 20,
}
const selectStyle: CSSProperties = {
  fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)',
  background: 'var(--coal3)', color: 'var(--ink)', fontFamily: 'inherit',
}
