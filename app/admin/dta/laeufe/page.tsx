'use client'
import { datumBerlin } from '@/lib/utils/timezone';
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { StatusBadge, SearchInput, EmptyRow, Banner } from '@/components/admin/OpsUI'
import { useBundeslandFilter } from '@/components/admin/BundeslandContext'
import Link from 'next/link'

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  erstellt: { label: 'Erstellt', color: '#94a3b8' },
  validierung_laeuft: { label: 'Validierung…', color: '#f59e0b' },
  validierung_fehlgeschlagen: { label: 'Validierung fehlg.', color: '#ef4444' },
  geprueft: { label: 'Geprüft', color: '#3b82f6' },
  freigegeben: { label: 'Freigegeben', color: '#8b5cf6' },
  export_laeuft: { label: 'Export…', color: '#f59e0b' },
  bereit_zum_export: { label: 'Bereit z. Export', color: '#06b6d4' },
  exportiert: { label: 'Exportiert', color: '#0ea5e9' },
  bereit_zur_uebermittlung: { label: 'Bereit z. Überm.', color: '#6366f1' },
  uebermittelt: { label: 'Übermittelt', color: '#8b5cf6' },
  quittiert: { label: 'Quittiert', color: '#a855f7' },
  angenommen: { label: 'Angenommen', color: '#22c55e' },
  teilweise_abgelehnt: { label: 'Teilw. abgelehnt', color: '#f97316' },
  abgelehnt: { label: 'Abgelehnt', color: '#ef4444' },
  korrektur_erforderlich: { label: 'Korrektur erf.', color: '#f97316' },
  korrigiert: { label: 'Korrigiert', color: '#06b6d4' },
  abgeschlossen: { label: 'Abgeschlossen', color: '#6b7280' },
  storniert: { label: 'Storniert', color: '#9ca3af' },
}

const TYP_LABELS: Record<string, string> = {
  erstabrechnung: 'Erstabrechnung',
  korrekturabrechnung: 'Korrektur',
  nachberechnung: 'Nachberechnung',
  storno: 'Storno',
  wiederholungslauf: 'Wiederholung',
  sammelabrechnung: 'Sammel',
}

function euro(cents: number) {
  return (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}

interface Lauf {
  id: string
  abrechnungsmonat: string
  kostentraeger_ik: string
  kostentraeger_name: string | null
  bundesland: string | null
  lauf_typ: string
  status: string
  anzahl_faelle: number | null
  gesamtbetrag_cent: number | null
  erstellt_am: string
}

export default function DtaLaeufePage() {
  const [laeufe, setLaeufe] = useState<Lauf[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const bundesland = useBundeslandFilter()

  async function load() {
    setLoading(true)
    try {
      const supabase = createClient()
      let query = supabase
        .from('abrechnungslaeufe')
        .select('id, abrechnungsmonat, kostentraeger_ik, kostentraeger_name, bundesland, lauf_typ, status, anzahl_faelle, gesamtbetrag_cent, erstellt_am')
        .is('deleted_at', null)
        .order('erstellt_am', { ascending: false })
        .limit(200)

      if (!bundesland.alle) query = query.eq('bundesland', bundesland.aktiv)

      const { data, error: fetchErr } = await query
      if (fetchErr) { setError(fetchErr.message); return }
      setLaeufe(data ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [bundesland.aktiv])

  const filtered = laeufe.filter(l => {
    if (statusFilter !== 'all' && l.status !== statusFilter) return false
    if (search) {
      const s = search.toLowerCase()
      return (l.kostentraeger_name?.toLowerCase().includes(s) ||
        l.kostentraeger_ik.includes(s) ||
        l.abrechnungsmonat.includes(s))
    }
    return true
  })

  return (
    <div className="admin-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1>DTA-Abrechnungsläufe</h1>
        <button className="admin-btn primary" onClick={() => setShowCreate(true)}>
          + Neuer Lauf
        </button>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      {showCreate && <CreateLaufForm onClose={() => { setShowCreate(false); load() }} bundesland={bundesland.alle ? null : bundesland.aktiv} />}

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Suche nach Kostenträger, IK, Monat…" />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="admin-select">
          <option value="all">Alle Status</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Monat</th>
              <th>Kostenträger</th>
              <th>Bundesland</th>
              <th>Typ</th>
              <th>Status</th>
              <th>Fälle</th>
              <th style={{ textAlign: 'right' }}>Betrag</th>
              <th>Erstellt</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9}>Lade…</td></tr>
            ) : filtered.length === 0 ? (
              <EmptyRow colSpan={9}>Keine Abrechnungsläufe gefunden.</EmptyRow>
            ) : filtered.map(l => {
              const st = STATUS_LABELS[l.status] || { label: l.status, color: '#94a3b8' }
              return (
                <tr key={l.id}>
                  <td>{l.abrechnungsmonat}</td>
                  <td>{l.kostentraeger_name || l.kostentraeger_ik}</td>
                  <td>{l.bundesland || '—'}</td>
                  <td>{TYP_LABELS[l.lauf_typ] || l.lauf_typ}</td>
                  <td><StatusBadge label={st.label} color={st.color} /></td>
                  <td>{l.anzahl_faelle ?? 0}</td>
                  <td style={{ textAlign: 'right' }}>{euro(l.gesamtbetrag_cent ?? 0)}</td>
                  <td>{new Date(l.erstellt_am).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })}</td>
                  <td>
                    <Link href={`/admin/dta/laeufe/${l.id}`} className="admin-btn small">
                      Details
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CreateLaufForm({ onClose, bundesland }: { onClose: () => void; bundesland: string | null }) {
  const [monat, setMonat] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 1)
    return datumBerlin(d).slice(0, 7)
  })
  const [bl, setBl] = useState(bundesland || 'hessen')
  const [kt, setKt] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [err, setErr] = useState<string | null>(null)

  async function submit() {
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch('/api/billing/dta/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          abrechnungsmonat: monat,
          bundesland: bl,
          kostentraegerIk: kt || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setErr(data.error || 'Unbekannter Fehler')
      } else {
        setResult(data)
      }
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-card" style={{ marginBottom: 24, padding: 20 }}>
      <h3>Neuen Abrechnungslauf erstellen</h3>

      {result ? (
        <div>
          {result.laufId ? (
            <Banner tone="success">
              Lauf erstellt: {result.rechnungenAnzahl} Rechnungen,{' '}
              {(result.gesamtbetragCent / 100).toFixed(2)} €
            </Banner>
          ) : (
            <Banner tone="danger">
              Validierung fehlgeschlagen:
              <ul style={{ margin: '8px 0 0 16px' }}>
                {result.validierung?.fehler?.map((f: any, i: number) => (
                  <li key={i}>{f.label}: {f.details}</li>
                ))}
              </ul>
            </Banner>
          )}
          <button className="admin-btn" onClick={onClose} style={{ marginTop: 12 }}>Schließen</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label>
            <span style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>Abrechnungsmonat</span>
            <input type="month" value={monat} onChange={e => setMonat(e.target.value)} className="admin-input" />
          </label>
          <label>
            <span style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>Bundesland</span>
            <select value={bl} onChange={e => setBl(e.target.value)} className="admin-select">
              {['hessen','bayern','baden_wuerttemberg','berlin','brandenburg','bremen','hamburg',
                'mecklenburg_vorpommern','niedersachsen','nordrhein_westfalen','rheinland_pfalz',
                'saarland','sachsen','sachsen_anhalt','schleswig_holstein','thueringen'
              ].map(b => <option key={b} value={b}>{b.replace(/_/g,' ')}</option>)}
            </select>
          </label>
          <label>
            <span style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>Kostenträger-IK (optional)</span>
            <input type="text" value={kt} onChange={e => setKt(e.target.value)} placeholder="z.B. 109519005" className="admin-input" />
          </label>
          <button className="admin-btn primary" onClick={submit} disabled={busy}>
            {busy ? 'Erstelle…' : 'Lauf erstellen'}
          </button>
          <button className="admin-btn" onClick={onClose}>Abbrechen</button>
        </div>
      )}
      {err && <Banner tone="danger">{err}</Banner>}
    </div>
  )
}
