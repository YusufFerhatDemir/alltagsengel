'use client'
import { useEffect, useMemo, useState } from 'react'
import { statusMeta, formatDate, ABSENCE_STATUS, ABSENCE_TYPE, MONATSNAMEN } from '@/lib/admin/ops'
import { StatusBadge, SearchInput, EmptyRow, Banner } from '@/components/admin/OpsUI'
import { logger } from '@/lib/logger'
const log = logger.child('admin:urlaub')

interface Antrag {
  id: string
  mitarbeiter: string
  caregiver_id: string
  typ: string
  von: string
  bis: string
  tage: number
  status: string
  bemerkung: string | null
}

interface Konto {
  caregiver_id: string
  mitarbeiter: string
  anspruch: number
  genommen: number
  geplant: number
  resturlaub: number
}

const primaryBtn: React.CSSProperties = {
  fontSize: 14, color: 'var(--coal)', fontWeight: 600,
  background: 'linear-gradient(135deg,var(--gold2),var(--gold))', border: 'none',
  borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit',
}

const dangerBtn: React.CSSProperties = {
  fontSize: 13, color: '#fff', fontWeight: 600,
  background: '#D04B3B', border: 'none',
  borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontFamily: 'inherit',
}

const successBtn: React.CSSProperties = {
  fontSize: 13, color: '#fff', fontWeight: 600,
  background: '#5CB882', border: 'none',
  borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontFamily: 'inherit',
}

export default function UrlaubPage() {
  const [antraege, setAntraege] = useState<Antrag[]>([])
  const [konten, setKonten] = useState<Konto[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [acting, setActing] = useState<string | null>(null)
  const currentYear = new Date().getFullYear()

  async function load() {
    try {
      const [resA, resK] = await Promise.all([
        fetch('/api/personal/abwesenheiten?status=beantragt'),
        fetch(`/api/personal/urlaubskonto/uebersicht?jahr=${currentYear}`),
      ])
      if (resA.ok) {
        const dataA = await resA.json()
        setAntraege((dataA.abwesenheiten || dataA || []).map((r: any) => ({
          id: r.id,
          mitarbeiter: r.mitarbeiter || r.name || '—',
          caregiver_id: r.caregiver_id,
          typ: r.typ || r.type || 'vacation',
          von: r.von || r.start_date || r.datum_von,
          bis: r.bis || r.end_date || r.datum_bis,
          tage: r.tage ?? r.days ?? 0,
          status: r.status || 'beantragt',
          bemerkung: r.bemerkung || r.notes || null,
        })))
      }
      if (resK.ok) {
        const dataK = await resK.json()
        setKonten((dataK.konten || dataK || []).map((r: any) => ({
          caregiver_id: r.caregiver_id,
          mitarbeiter: r.mitarbeiter || r.name || '—',
          anspruch: r.anspruch ?? r.entitlement ?? 0,
          genommen: r.genommen ?? r.taken ?? 0,
          geplant: r.geplant ?? r.planned ?? 0,
          resturlaub: r.resturlaub ?? r.remaining ?? 0,
        })))
      }
    } catch (err) {
      log.errorWithException('Urlaub laden fehlgeschlagen', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function genehmigen(id: string) {
    setActing(id)
    try {
      const res = await fetch(`/api/personal/abwesenheiten/${id}/genehmigen`, { method: 'POST' })
      if (res.ok) {
        setAntraege(prev => prev.filter(a => a.id !== id))
      }
    } catch (err) {
      log.errorWithException('Genehmigung fehlgeschlagen', err)
    } finally {
      setActing(null)
    }
  }

  async function ablehnen(id: string) {
    const grund = prompt('Ablehnungsgrund eingeben:')
    if (!grund) return
    setActing(id)
    try {
      const res = await fetch(`/api/personal/abwesenheiten/${id}/ablehnen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ablehnungsgrund: grund }),
      })
      if (res.ok) {
        setAntraege(prev => prev.filter(a => a.id !== id))
      }
    } catch (err) {
      log.errorWithException('Ablehnung fehlgeschlagen', err)
    } finally {
      setActing(null)
    }
  }

  const filteredKonten = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return konten
    return konten.filter(k => k.mitarbeiter.toLowerCase().includes(q))
  }, [konten, search])

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Urlaubsverwaltung</h1>
          <p className="admin-subtitle">{currentYear} — {antraege.length} offene Antr&auml;ge</p>
        </div>
      </div>

      {/* ── Offene Anträge ─────────────────────────────────────── */}
      <h2 style={{ fontSize: 18, fontWeight: 600, margin: '24px 0 12px' }}>Offene Antr&auml;ge</h2>

      {loading ? <p>Laden...</p> : antraege.length === 0 ? (
        <Banner tone="success">Keine offenen Urlaubsantr&auml;ge vorhanden.</Banner>
      ) : (
        <div className="admin-table-wrap" style={{ marginBottom: 32 }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Mitarbeiter</th>
                <th>Typ</th>
                <th>Von</th>
                <th>Bis</th>
                <th style={{ textAlign: 'right' }}>Tage</th>
                <th>Bemerkung</th>
                <th>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {antraege.map(a => {
                const tm = statusMeta(ABSENCE_TYPE, a.typ)
                return (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 600 }}>{a.mitarbeiter}</td>
                    <td><StatusBadge label={tm.label} color={tm.color} /></td>
                    <td>{formatDate(a.von)}</td>
                    <td>{formatDate(a.bis)}</td>
                    <td style={{ textAlign: 'right' }}>{a.tage}</td>
                    <td style={{ fontSize: 13, color: 'var(--ink4)' }}>{a.bemerkung || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          style={successBtn}
                          disabled={acting === a.id}
                          onClick={() => genehmigen(a.id)}
                        >
                          Genehmigen
                        </button>
                        <button
                          style={dangerBtn}
                          disabled={acting === a.id}
                          onClick={() => ablehnen(a.id)}
                        >
                          Ablehnen
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Urlaubsübersicht ───────────────────────────────────── */}
      <h2 style={{ fontSize: 18, fontWeight: 600, margin: '24px 0 12px' }}>Urlaubs&uuml;bersicht {currentYear}</h2>

      <div style={{ marginBottom: 16 }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Mitarbeiter suchen..." />
      </div>

      {loading ? <p>Laden...</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Mitarbeiter</th>
                <th style={{ textAlign: 'right' }}>Anspruch</th>
                <th style={{ textAlign: 'right' }}>Genommen</th>
                <th style={{ textAlign: 'right' }}>Geplant</th>
                <th style={{ textAlign: 'right' }}>Resturlaub</th>
              </tr>
            </thead>
            <tbody>
              {filteredKonten.length === 0 ? (
                <EmptyRow colSpan={5}>
                  {search ? 'Keine Treffer' : 'Keine Urlaubsdaten vorhanden'}
                </EmptyRow>
              ) : filteredKonten.map(k => (
                <tr key={k.caregiver_id}>
                  <td style={{ fontWeight: 600 }}>{k.mitarbeiter}</td>
                  <td style={{ textAlign: 'right' }}>{k.anspruch} Tage</td>
                  <td style={{ textAlign: 'right' }}>{k.genommen} Tage</td>
                  <td style={{ textAlign: 'right' }}>{k.geplant} Tage</td>
                  <td style={{
                    textAlign: 'right', fontWeight: 600,
                    color: k.resturlaub <= 0 ? '#D04B3B' : k.resturlaub <= 5 ? '#E8A000' : '#5CB882',
                  }}>
                    {k.resturlaub} Tage
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
