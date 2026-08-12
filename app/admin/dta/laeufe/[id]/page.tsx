'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { StatusBadge, Banner } from '@/components/admin/OpsUI'
import Link from 'next/link'

function euro(cents: number) {
  return (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}

const STATUS_COLORS: Record<string, string> = {
  erstellt: '#94a3b8', geprueft: '#3b82f6', freigegeben: '#8b5cf6',
  exportiert: '#0ea5e9', bereit_zur_uebermittlung: '#6366f1',
  uebermittelt: '#8b5cf6', angenommen: '#22c55e',
  teilweise_abgelehnt: '#f97316', abgelehnt: '#ef4444',
  korrektur_erforderlich: '#f97316', storniert: '#9ca3af',
  abgeschlossen: '#6b7280', validierung_fehlgeschlagen: '#ef4444',
}

export default function LaufDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  async function load() {
    const res = await fetch(`/api/billing/dta/${id}`)
    const json = await res.json()
    if (!res.ok) { setError(json.error); setLoading(false); return }
    setData(json)
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  async function action(endpoint: string, body?: any) {
    setBusy(endpoint)
    setError(null)
    try {
      const res = await fetch(`/api/billing/dta/${id}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      })
      const json = await res.json()
      if (!res.ok) setError(json.error)
      else await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  if (loading) return <div className="admin-page"><p>Lade Lauf-Details…</p></div>
  if (!data?.lauf) return <div className="admin-page"><Banner tone="danger">{error || 'Nicht gefunden'}</Banner></div>

  const lauf = data.lauf
  const st = lauf.status

  return (
    <div className="admin-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <Link href="/admin/dta/laeufe" style={{ fontSize: 14 }}>← Zurück</Link>
        <h1 style={{ margin: 0 }}>Abrechnungslauf {lauf.abrechnungsmonat}</h1>
        <StatusBadge label={st} color={STATUS_COLORS[st] || '#94a3b8'} />
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div className="admin-card">
          <h3>Stammdaten</h3>
          <dl style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '4px 16px', fontSize: 14 }}>
            <dt>Kostenträger</dt><dd>{lauf.kostentraeger_name || lauf.kostentraeger_ik}</dd>
            <dt>IK</dt><dd>{lauf.kostentraeger_ik}</dd>
            <dt>Bundesland</dt><dd>{lauf.bundesland || '—'}</dd>
            <dt>Typ</dt><dd>{lauf.lauf_typ}</dd>
            <dt>Fälle</dt><dd>{lauf.anzahl_faelle}</dd>
            <dt>Positionen</dt><dd>{lauf.anzahl_positionen}</dd>
            <dt>Betrag</dt><dd>{euro(lauf.gesamtbetrag_cent ?? 0)}</dd>
            <dt>Erstellt</dt><dd>{new Date(lauf.erstellt_am).toLocaleString('de-DE')}</dd>
            {lauf.freigegeben_am && <><dt>Freigegeben</dt><dd>{new Date(lauf.freigegeben_am).toLocaleString('de-DE')}</dd></>}
            {lauf.uebermittelt_am && <><dt>Übermittelt</dt><dd>{new Date(lauf.uebermittelt_am).toLocaleString('de-DE')}</dd></>}
            {lauf.pruefsumme && <><dt>Prüfsumme</dt><dd style={{ fontFamily: 'monospace', fontSize: 11 }}>{lauf.pruefsumme.slice(0, 16)}…</dd></>}
          </dl>
        </div>

        <div className="admin-card">
          <h3>Aktionen</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {st === 'geprueft' && (
              <button className="admin-btn primary" onClick={() => action('freigabe')} disabled={!!busy}>
                {busy === 'freigabe' ? 'Freigabe…' : 'Freigeben'}
              </button>
            )}
            {st === 'freigegeben' && (
              <button className="admin-btn primary" onClick={() => action('export')} disabled={!!busy}>
                {busy === 'export' ? 'Exportiere…' : 'EDIFACT exportieren'}
              </button>
            )}
            {!['storniert', 'abgeschlossen', 'uebermittelt', 'angenommen'].includes(st) && (
              <button className="admin-btn danger" onClick={() => {
                const grund = prompt('Stornogrund:')
                if (grund) action('storno', { grund })
              }} disabled={!!busy}>
                Stornieren
              </button>
            )}
            <button className="admin-btn" onClick={() => action('validate')} disabled={!!busy}>
              Erneut validieren
            </button>
          </div>
        </div>
      </div>

      {data.validierung && (
        <div className="admin-card" style={{ marginBottom: 16 }}>
          <h3>Validierung</h3>
          <p>
            {data.validierung.bestanden
              ? <StatusBadge label="Bestanden" color="#22c55e" />
              : <StatusBadge label="Fehlgeschlagen" color="#ef4444" />}
            {' '}— {data.validierung.fehler_anzahl} Fehler, {data.validierung.warnungen_anzahl} Warnungen
            ({data.validierung.dauer_ms}ms)
          </p>
          {data.validierung.ergebnis?.filter((p: any) => !p.bestanden).map((p: any, i: number) => (
            <div key={i} style={{ padding: '4px 0', fontSize: 13, color: p.pflicht ? '#ef4444' : '#f59e0b' }}>
              {p.pflicht ? '✗' : '⚠'} {p.label}: {p.details}
            </div>
          ))}
        </div>
      )}

      <div className="admin-card" style={{ marginBottom: 16 }}>
        <h3>Rechnungen im Lauf ({data.rechnungen?.length || 0})</h3>
        <div style={{ overflowX: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr><th>Position</th><th>Rechnungsnr.</th><th>Betrag</th><th>Status</th></tr>
            </thead>
            <tbody>
              {data.rechnungen?.map((r: any) => (
                <tr key={r.id}>
                  <td>{r.position_im_lauf}</td>
                  <td>{r.invoice?.invoice_number_formatted || r.invoice_id?.slice(0, 8)}</td>
                  <td>{euro(r.betrag_cent)}</td>
                  <td><StatusBadge label={r.status} color={STATUS_COLORS[r.status] || '#94a3b8'} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {data.dakotaAuftraege?.length > 0 && (
        <div className="admin-card" style={{ marginBottom: 16 }}>
          <h3>DAKOTA-Aufträge ({data.dakotaAuftraege.length})</h3>
          <table className="admin-table">
            <thead>
              <tr><th>Empfänger</th><th>Dateiname</th><th>Status</th><th>Versuche</th></tr>
            </thead>
            <tbody>
              {data.dakotaAuftraege.map((a: any) => (
                <tr key={a.id}>
                  <td>{a.empfaenger_ik}</td>
                  <td style={{ fontFamily: 'monospace' }}>{a.logischer_dateiname}</td>
                  <td><StatusBadge label={a.status} color={STATUS_COLORS[a.status] || '#94a3b8'} /></td>
                  <td>{a.versand_versuche}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.fehler?.length > 0 && (
        <div className="admin-card" style={{ marginBottom: 16 }}>
          <h3>Fehler ({data.fehler.length})</h3>
          {data.fehler.map((f: any) => (
            <div key={f.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
              <StatusBadge label={f.schweregrad} color={f.schweregrad === 'kritisch' ? '#ef4444' : '#f59e0b'} />
              {' '}{f.fehler_meldung}
              <span style={{ color: 'var(--muted)', marginLeft: 8 }}>{f.fehler_quelle}/{f.fehler_kategorie}</span>
            </div>
          ))}
        </div>
      )}

      {data.ruecklaeufer?.length > 0 && (
        <div className="admin-card">
          <h3>Rückläufer ({data.ruecklaeufer.length})</h3>
          {data.ruecklaeufer.map((r: any) => (
            <div key={r.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
              <StatusBadge label={r.status} color={STATUS_COLORS[r.status] || '#94a3b8'} />
              {' '}{r.ruecklaeufer_typ} — {r.positionen_gesamt || 0} Positionen
              {r.betrag_differenz_cent ? ` (Differenz: ${euro(r.betrag_differenz_cent)})` : ''}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
