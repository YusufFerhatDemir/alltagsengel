'use client'
// ═══════════════════════════════════════════════════════════════
// SIS — Strukturierte Informationssammlung: Übersicht + Neuanlage
// ═══════════════════════════════════════════════════════════════
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { formatDate, statusMeta } from '@/lib/admin/ops'
import { Banner, EmptyRow, SearchInput, StatusBadge } from '@/components/admin/OpsUI'
import { AuswahlFeld, Karte, FeldRaster, pflegePrimaryBtn } from '@/components/admin/PflegeUI'
import type { PflegeUebersichtZeile } from '@/lib/pflege/types'
import type { SisAssessment } from '@/lib/sis/types'
import {
  SIS_ASSESSMENT_TYP_WERTE, SIS_STATUS_META, SIS_TYP_LABELS,
  SIS_VERSORGUNGSFORM_LABELS, SIS_VERSORGUNGSFORM_WERTE,
} from '@/lib/sis/types'

export default function AdminSisPage() {
  const router = useRouter()
  const [assessments, setAssessments] = useState<SisAssessment[]>([])
  const [kunden, setKunden] = useState<PflegeUebersichtZeile[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  const [neuClientId, setNeuClientId] = useState('')
  const [neuTyp, setNeuTyp] = useState('erstgespraech')
  const [neuVersorgung, setNeuVersorgung] = useState('ambulant')

  useEffect(() => {
    Promise.all([
      fetch('/api/sis/assessments').then(r => r.json()),
      fetch('/api/pflege/uebersicht').then(r => r.json()),
    ])
      .then(([sisRes, kundenRes]) => {
        if (sisRes.error) { setError(sisRes.error); return }
        setAssessments(sisRes.assessments || [])
        setKunden(kundenRes.uebersicht || [])
      })
      .catch(() => setError('Laden fehlgeschlagen.'))
      .finally(() => setLoading(false))
  }, [])

  const kundenName = useMemo(() => {
    const map = new Map<string, string>()
    for (const k of kunden) map.set(k.client_id, `${k.first_name ?? ''} ${k.last_name ?? ''}`.trim() || '—')
    return map
  }, [kunden])

  const gefiltert = useMemo(() => {
    const suche = search.trim().toLowerCase()
    if (!suche) return assessments
    return assessments.filter(a => (kundenName.get(a.client_id) ?? '').toLowerCase().includes(suche))
  }, [assessments, search, kundenName])

  async function neuAnlegen() {
    if (!neuClientId) { setError('Bitte zuerst einen Kunden auswählen.'); return }
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/sis/assessments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: neuClientId, assessmentTyp: neuTyp, versorgungsform: neuVersorgung }),
      })
      const body = await res.json()
      if (body.error) { setError(body.error); return }
      router.push(`/admin/sis/${body.assessment.id}`)
    } catch {
      setError('Anlegen fehlgeschlagen.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Strukturierte Informationssammlung (SIS)</h1>
          <p className="admin-subtitle">{assessments.length} Assessments · 6 Themenfelder + Risikomatrix</p>
        </div>
        <Link href="/admin/pflegedoku" style={{ textDecoration: 'none' }}>Zur Pflegedokumentation →</Link>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      <Karte titel="Neue Informationssammlung">
        <FeldRaster>
          <AuswahlFeld
            label="Kunde"
            value={neuClientId}
            onChange={setNeuClientId}
            optionen={[
              ['', '— Kunde wählen —'] as [string, string],
              ...kunden.map(k => [k.client_id, `${k.first_name ?? ''} ${k.last_name ?? ''}`.trim() || k.client_id] as [string, string]),
            ]}
          />
          <AuswahlFeld
            label="Anlass"
            value={neuTyp}
            onChange={setNeuTyp}
            optionen={SIS_ASSESSMENT_TYP_WERTE.map(t => [t, SIS_TYP_LABELS[t] ?? t] as [string, string])}
          />
          <AuswahlFeld
            label="Versorgungsform"
            value={neuVersorgung}
            onChange={setNeuVersorgung}
            optionen={SIS_VERSORGUNGSFORM_WERTE.map(v => [v, SIS_VERSORGUNGSFORM_LABELS[v] ?? v] as [string, string])}
          />
        </FeldRaster>
        <button style={pflegePrimaryBtn} onClick={neuAnlegen} disabled={busy || !neuClientId}>
          {busy ? 'Wird angelegt…' : 'SIS anlegen'}
        </button>
      </Karte>

      <div style={{ margin: '16px 0' }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Nach Kundenname suchen…" />
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th>Kunde</th>
            <th>Datum</th>
            <th>Anlass</th>
            <th>Versorgungsform</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {loading && <EmptyRow colSpan={6}>Lade…</EmptyRow>}
          {!loading && gefiltert.length === 0 && (
            <EmptyRow colSpan={6}>Noch keine Informationssammlung erfasst.</EmptyRow>
          )}
          {gefiltert.map(a => {
            const meta = statusMeta(SIS_STATUS_META, a.status)
            return (
              <tr key={a.id}>
                <td>{kundenName.get(a.client_id) ?? a.client_id}</td>
                <td>{formatDate(a.assessment_datum)}</td>
                <td>{SIS_TYP_LABELS[a.assessment_typ] ?? a.assessment_typ}</td>
                <td>{SIS_VERSORGUNGSFORM_LABELS[a.versorgungsform] ?? a.versorgungsform}</td>
                <td><StatusBadge label={meta.label} color={meta.color} /></td>
                <td><Link href={`/admin/sis/${a.id}`}>Öffnen</Link></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
