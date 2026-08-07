'use client'
// ═══════════════════════════════════════════════════════════════
// Monatsabschlüsse der Pflegedoku — pflege_doku_perioden
// Abschließen sperrt alle Verlaufseinträge des Monats.
// ═══════════════════════════════════════════════════════════════
import Link from 'next/link'
import { use, useEffect, useState } from 'react'
import { MONATSNAMEN, PFLEGE_PERIODEN_STATUS, formatDate, statusMeta } from '@/lib/admin/ops'
import { Banner, EmptyRow, StatusBadge } from '@/components/admin/OpsUI'
import {
  AuswahlFeld, FeldRaster, Karte, TextFeld,
  pflegeMiniBtn, pflegePrimaryBtn, pflegeSecondaryBtn,
} from '@/components/admin/PflegeUI'
import type { PflegeDokuPeriode, PflegeUebersichtZeile } from '@/lib/pflege/types'

export default function AdminPeriodenPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = use(params)
  const [perioden, setPerioden] = useState<PflegeDokuPeriode[]>([])
  const [kunde, setKunde] = useState<PflegeUebersichtZeile | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [hinweis, setHinweis] = useState('')
  const [jahr, setJahr] = useState('')
  const [monat, setMonat] = useState('1')

  useEffect(() => { load() }, [clientId])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [pRes, kRes] = await Promise.all([
        fetch(`/api/pflege/doku-perioden?clientId=${clientId}`).then(r => r.json()),
        fetch(`/api/pflege/uebersicht?clientId=${clientId}`).then(r => r.json()),
      ])
      if (pRes.error) { setError(pRes.error); return }
      setPerioden(pRes.perioden || [])
      setKunde((kRes.uebersicht || [])[0] ?? null)
    } catch {
      setError('Laden fehlgeschlagen.')
    } finally {
      setLoading(false)
    }
  }

  async function anlegen() {
    if (!jahr) { setError('Bitte ein Jahr angeben.'); return }
    setBusy(true); setError(''); setHinweis('')
    try {
      const res = await fetch('/api/pflege/doku-perioden', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, jahr: Number(jahr), monat: Number(monat) }),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Anlegen fehlgeschlagen.'); return }
      setHinweis('Periode angelegt.')
      await load()
    } finally { setBusy(false) }
  }

  async function abschliessen(periode: PflegeDokuPeriode) {
    const bemerkung = window.prompt('Freigabebemerkung (optional):') ?? ''
    if (!window.confirm(`${MONATSNAMEN[periode.monat - 1]} ${periode.jahr} abschließen? Alle Verlaufseinträge des Monats werden gesperrt.`)) return
    setBusy(true); setError(''); setHinweis('')
    try {
      const res = await fetch(`/api/pflege/doku-perioden/${periode.id}/abschliessen`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ freigabeBemerkung: bemerkung || null }),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Abschluss fehlgeschlagen.'); return }
      setHinweis(`Abgeschlossen — ${body.gesperrteEintraege} Verlaufseinträge gesperrt.`)
      await load()
    } finally { setBusy(false) }
  }

  async function wiedereroeffnen(periode: PflegeDokuPeriode) {
    const grund = window.prompt('Grund für die Wiedereröffnung:')
    if (!grund) return
    setBusy(true); setError(''); setHinweis('')
    try {
      const res = await fetch(`/api/pflege/doku-perioden/${periode.id}/wiedereroeffnen`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grund }),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Wiedereröffnung fehlgeschlagen.'); return }
      setHinweis(`Wiedereröffnet — ${body.entsperrteEintraege} Verlaufseinträge entsperrt.`)
      await load()
    } finally { setBusy(false) }
  }

  if (loading) return <div className="admin-page"><p style={{ color: 'var(--muted)' }}>Laden…</p></div>

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Monatsabschlüsse</h1>
          <p className="admin-subtitle">
            {kunde ? `${kunde.first_name} ${kunde.last_name}` : 'Kunde'} · {perioden.length} Perioden
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href={`/admin/pflegedoku/verlauf/${clientId}`} style={pflegeSecondaryBtn}>Verlauf</Link>
          <Link href="/admin/pflegedoku" style={pflegeSecondaryBtn}>← Übersicht</Link>
        </div>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}
      {hinweis && <Banner tone="success">{hinweis}</Banner>}

      <Karte titel="Neue Periode anlegen">
        <FeldRaster>
          <TextFeld label="Jahr" type="number" value={jahr} onChange={setJahr} placeholder="2026" />
          <AuswahlFeld
            label="Monat"
            value={monat}
            onChange={setMonat}
            optionen={MONATSNAMEN.map((m, i) => [String(i + 1), m] as [string, string])}
          />
        </FeldRaster>
        <div style={{ marginTop: 12 }}>
          <button onClick={anlegen} disabled={busy} style={pflegePrimaryBtn}>Periode anlegen</button>
        </div>
      </Karte>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr><th>Monat</th><th>Status</th><th>Abgeschlossen am</th><th>Bemerkung</th><th>Wiedereröffnung</th><th>Aktionen</th></tr>
          </thead>
          <tbody>
            {perioden.length === 0
              ? <EmptyRow colSpan={6}>Noch keine Perioden angelegt</EmptyRow>
              : perioden.map(p => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 600 }}>{MONATSNAMEN[p.monat - 1]} {p.jahr}</td>
                  <td><StatusBadge label={statusMeta(PFLEGE_PERIODEN_STATUS, p.status).label} color={statusMeta(PFLEGE_PERIODEN_STATUS, p.status).color} /></td>
                  <td style={{ fontSize: 13 }}>{formatDate(p.abgeschlossen_am)}</td>
                  <td style={{ fontSize: 13, maxWidth: 220 }}>{p.freigabe_bemerkung || '—'}</td>
                  <td style={{ fontSize: 13, maxWidth: 220 }}>
                    {p.wiedereroeffnung_grund
                      ? `${formatDate(p.wiedereroeffnet_am)}: ${p.wiedereroeffnung_grund}`
                      : '—'}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {p.status === 'abgeschlossen'
                      ? <button onClick={() => wiedereroeffnen(p)} disabled={busy} style={pflegeMiniBtn}>Wiedereröffnen</button>
                      : <button onClick={() => abschliessen(p)} disabled={busy} style={pflegeMiniBtn}>Abschließen</button>}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
