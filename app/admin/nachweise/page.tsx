'use client'
// ═══════════════════════════════════════════════════════════════
// Nachweise — Qualifikationen/Zertifikate aller Mitarbeiter mit Ablauf-Ampel
// ═══════════════════════════════════════════════════════════════
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { daysUntil, formatDate } from '@/lib/admin/ops'
import { EmptyRow, Banner, SearchInput } from '@/components/admin/OpsUI'

interface NachweisRow {
  id: string
  caregiver_id: string
  caregiver_name: string
  titel: string
  typ: string
  ausgestellt: string | null
  gueltig_bis: string | null
  pflicht: boolean
  einsatzrelevant: boolean
}

function ampelFor(gueltigBis: string | null): { farbe: string; label: string } {
  const tage = daysUntil(gueltigBis)
  if (tage === null) return { farbe: '#999', label: 'Kein Datum' }
  if (tage < 0) return { farbe: '#D04B3B', label: 'Abgelaufen' }
  if (tage <= 30) return { farbe: '#D04B3B', label: `${tage} Tage` }
  if (tage <= 60) return { farbe: '#E8A000', label: `${tage} Tage` }
  return { farbe: '#5CB882', label: `${tage} Tage` }
}

export default function AdminNachweisePage() {
  const [rows, setRows] = useState<NachweisRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [nurAblaufend, setNurAblaufend] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError('')
      try {
        // ── WARUM UEBER DIE ROUTEN UND NICHT UEBER DEN BROWSER-CLIENT ──
        //
        // BEFUND 29.08.2026: hier stand `createClient()` aus
        // `@/lib/supabase/client`, die Seite las also unter RLS. Auf
        // `caregiver_qualifications` steht live genau eine verwaltende
        // Policy: `is_admin()` — beschraenkt auf admin/superadmin. Fuer
        // die Pflegedienstleitung, fuer die diese Seite gebaut ist, kam
        // damit eine LEERE Liste zurueck. Kein Fehler, keine Meldung:
        // „Keine Nachweise vorhanden." Eine Seite, die Ablaufwarnungen zu
        // Fuehrungszeugnissen zeigen soll, sagte der Rolle, die sie
        // braucht, dass alles in Ordnung sei.
        //
        // Beide Routen fahren hinter `requirePersonalAdmin('personal.lesen')`
        // mit dem Dienstschluessel und dem Mandanten aus dem Kontext — der
        // Riegel ist die Route, nicht RLS.
        //
        // `npm run lint:rls-sicht` findet Seiten dieser Art.
        const [qRes, cRes] = await Promise.all([
          fetch('/api/personal/qualifikationen'),
          fetch('/api/personal/stammdaten'),
        ])
        // AUSDRUECKLICH GEPRUEFT statt verschluckt: ein fehlgeschlagener
        // Ladevorgang darf nicht als leere Liste erscheinen — das ist
        // genau der Fehler, den diese Seite hatte.
        if (!qRes.ok || !cRes.ok) {
          const body = await (qRes.ok ? cRes : qRes).json().catch(() => null)
          setError(body?.error || 'Nachweise konnten nicht geladen werden.')
          return
        }
        const qualifikationen = await qRes.json()
        const kraefte = await cRes.json()

        const nameVon = new Map<string, string>()
        for (const cg of (Array.isArray(kraefte) ? kraefte : [])) {
          nameVon.set(cg.id, `${cg.first_name ?? ''} ${cg.last_name ?? ''}`.trim() || cg.id)
        }

        const acc: NachweisRow[] = []
        for (const q of (Array.isArray(qualifikationen) ? qualifikationen : [])) {
          acc.push({
            id: q.id, caregiver_id: q.caregiver_id,
            caregiver_name: nameVon.get(q.caregiver_id) ?? '—',
            titel: q.title, typ: q.qualification_type,
            ausgestellt: q.issued_date, gueltig_bis: q.valid_until,
            pflicht: q.pflicht ?? false, einsatzrelevant: q.einsatzrelevant ?? false,
          })
        }
        // Fuehrungszeugnis und Erste-Hilfe-Nachweis stehen NICHT in
        // `caregiver_qualifications`, sondern als eigene Spalten an
        // `caregivers` — deshalb der zweite Aufruf.
        for (const cg of (Array.isArray(kraefte) ? kraefte : [])) {
          const name = nameVon.get(cg.id) ?? '—'
          if (cg.fuehrungszeugnis_gueltig_bis || cg.fuehrungszeugnis_datum) {
            acc.push({ id: `fz-${cg.id}`, caregiver_id: cg.id, caregiver_name: name, titel: 'Führungszeugnis', typ: 'fuehrungszeugnis', ausgestellt: cg.fuehrungszeugnis_datum, gueltig_bis: cg.fuehrungszeugnis_gueltig_bis, pflicht: true, einsatzrelevant: true })
          }
          if (cg.erste_hilfe_gueltig_bis || cg.erste_hilfe_datum) {
            acc.push({ id: `eh-${cg.id}`, caregiver_id: cg.id, caregiver_name: name, titel: 'Erste-Hilfe-Nachweis', typ: 'erste_hilfe', ausgestellt: cg.erste_hilfe_datum, gueltig_bis: cg.erste_hilfe_gueltig_bis, pflicht: true, einsatzrelevant: false })
          }
        }
        acc.sort((a, b) => (a.gueltig_bis || '9999').localeCompare(b.gueltig_bis || '9999'))
        setRows(acc)
      } catch {
        setError('Unerwarteter Fehler beim Laden.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (nurAblaufend && (daysUntil(r.gueltig_bis) ?? 999) > 60) return false
      if (!q) return true
      return r.caregiver_name.toLowerCase().includes(q) || r.titel.toLowerCase().includes(q)
    })
  }, [rows, search, nurAblaufend])

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Nachweise</h1>
          <p className="admin-subtitle">{rows.length} Qualifikationen/Zertifikate/Nachweise aller Mitarbeiter</p>
        </div>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Mitarbeiter, Nachweis…" />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--ink3)' }}>
          <input type="checkbox" checked={nurAblaufend} onChange={e => setNurAblaufend(e.target.checked)} />
          Nur bald ablaufend (≤ 60 Tage)
        </label>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th>Mitarbeiter</th><th>Nachweis</th><th>Flags</th><th>Ausgestellt</th><th>Gültig bis</th><th>Status</th></tr></thead>
          <tbody>
            {loading
              ? <EmptyRow colSpan={6}>Laden…</EmptyRow>
              : filtered.length === 0
                ? <EmptyRow colSpan={6}>Keine Nachweise gefunden</EmptyRow>
                : filtered.map(r => {
                  const ampel = ampelFor(r.gueltig_bis)
                  return (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600 }}><Link href={`/admin/mitarbeiterakte/${r.caregiver_id}`} style={{ color: 'inherit' }}>{r.caregiver_name}</Link></td>
                      <td style={{ fontSize: 13 }}>{r.titel}</td>
                      <td style={{ fontSize: 13 }}>
                        <span style={{ display: 'inline-flex', gap: 4 }}>
                          {r.pflicht && <span className="admin-status" style={{ background: '#D04B3B', fontSize: 11, padding: '1px 6px' }}>Pflicht</span>}
                          {r.einsatzrelevant && <span className="admin-status" style={{ background: '#E8A000', fontSize: 11, padding: '1px 6px' }}>Einsatz</span>}
                        </span>
                      </td>
                      <td style={{ fontSize: 13 }}>{formatDate(r.ausgestellt)}</td>
                      <td style={{ fontSize: 13 }}>{formatDate(r.gueltig_bis)}</td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: ampel.farbe }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: ampel.farbe }} />
                          {ampel.label}
                        </span>
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
