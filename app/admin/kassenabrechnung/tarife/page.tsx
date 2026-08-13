'use client'
import { useEffect, useState, useCallback } from 'react'
import { Banner, StatusBadge } from '@/components/admin/OpsUI'
import Link from 'next/link'

interface Tarif {
  id: string
  leistungsart: string
  rechtsgrundlage: string
  bundesland: string | null
  preis_cent: number
  einheit: string | null
  verguetungsart: string
  ist_aktiv: boolean
  tarif_status: 'verified' | 'unverified' | 'blocked'
  verifiziert_am: string | null
  verifiziert_von: string | null
  verifizierungs_quelle: string | null
}

const STATUS_META: Record<Tarif['tarif_status'], { label: string; color: string }> = {
  verified: { label: 'VERIFIED', color: '#22c55e' },
  unverified: { label: 'UNVERIFIED', color: '#f59e0b' },
  blocked: { label: 'BLOCKED', color: '#ef4444' },
}

function euro(cent: number) {
  return (cent / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}

export default function TarifePage() {
  const [tarife, setTarife] = useState<Tarif[]>([])
  const [laden, setLaden] = useState(true)
  const [fehler, setFehler] = useState<string | null>(null)
  const [meldung, setMeldung] = useState<string | null>(null)
  const [dialogFuer, setDialogFuer] = useState<Tarif | null>(null)

  const laden_ = useCallback(async () => {
    setLaden(true)
    try {
      const res = await fetch('/api/billing/tariffs')
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`)
      setTarife(j.tariffs ?? [])
      setFehler(null)
    } catch (e) {
      setFehler((e as Error).message)
    } finally {
      setLaden(false)
    }
  }, [])

  useEffect(() => { laden_() }, [laden_])

  if (laden) return <div className="admin-page"><p>Lade Tarife…</p></div>

  return (
    <div className="admin-page">
      <h1>Kassenabrechnung — Tarife</h1>
      <p style={{ color: 'var(--muted)', marginBottom: 8 }}>
        Jeder Kassentarif muss verifiziert sein (tarif_status = verified), bevor er in einer
        Rechnung verwendet werden kann — sonst blockiert die Rechnungserstellung fail-closed.
        Der Status wird ausschließlich hier geändert, nie über das Anlage-Formular.
      </p>
      <p style={{ marginBottom: 24 }}>
        <Link href="/admin/kassenabrechnung/stammdaten">→ Kostenträger &amp; Datenannahmestellen</Link>
      </p>

      {fehler && <Banner tone="danger">{fehler}</Banner>}
      {meldung && <Banner tone="success">{meldung}</Banner>}

      <div className="admin-card">
        <h3>Tarife ({tarife.length})</h3>
        {tarife.length === 0
          ? <p style={{ color: 'var(--muted)' }}>Keine Tarife hinterlegt.</p>
          : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 13 }}>
                  <th style={{ padding: 6 }}>Leistungsart</th>
                  <th>Rechtsgrundlage</th>
                  <th>Bundesland</th>
                  <th>Preis</th>
                  <th>Status</th>
                  <th>Verifiziert</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tarife.map(t => {
                  const meta = STATUS_META[t.tarif_status] ?? STATUS_META.unverified
                  return (
                    <tr key={t.id} style={{ borderTop: '1px solid var(--border, #e5e7eb)' }}>
                      <td style={{ padding: 6 }}>{t.leistungsart}</td>
                      <td>{t.rechtsgrundlage}</td>
                      <td>{t.bundesland ?? '—'}</td>
                      <td>{euro(t.preis_cent)} / {t.einheit ?? t.verguetungsart}</td>
                      <td><StatusBadge label={meta.label} color={meta.color} /></td>
                      <td style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {t.verifiziert_am
                          ? <>{new Date(t.verifiziert_am).toLocaleDateString('de-DE')}<br />{t.verifiziert_von}</>
                          : '—'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="admin-btn-ghost" onClick={() => setDialogFuer(t)}>
                          Status ändern
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
      </div>

      {dialogFuer && (
        <VerifizierungsDialog
          tarif={dialogFuer}
          onAbbrechen={() => setDialogFuer(null)}
          onGespeichert={async (text) => {
            setDialogFuer(null)
            setMeldung(text)
            await laden_()
          }}
        />
      )}
    </div>
  )
}

function VerifizierungsDialog({
  tarif,
  onAbbrechen,
  onGespeichert,
}: {
  tarif: Tarif
  onAbbrechen: () => void
  onGespeichert: (meldung: string) => void
}) {
  const [status, setStatus] = useState<Tarif['tarif_status']>(tarif.tarif_status)
  const [quelle, setQuelle] = useState(tarif.verifizierungs_quelle ?? '')
  const [bestaetigt, setBestaetigt] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [speichert, setSpeichert] = useState(false)

  const quellePflicht = status === 'verified' || status === 'blocked'

  async function speichern() {
    setFehler(null)
    if (quellePflicht && quelle.trim().length < 5) {
      setFehler('Rechtsquelle ist bei "verified" und "blocked" verpflichtend (min. 5 Zeichen).')
      return
    }
    if (!bestaetigt) {
      setFehler('Bitte die Statusänderung bestätigen.')
      return
    }
    setSpeichert(true)
    try {
      const res = await fetch(`/api/billing/tariffs/${tarif.id}/verifizierung`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, quelle: quelle.trim() }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`)
      onGespeichert(`Status von "${tarif.leistungsart}" auf ${status.toUpperCase()} gesetzt.`)
    } catch (e) {
      setFehler((e as Error).message)
    } finally {
      setSpeichert(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
    >
      <div className="admin-card" style={{ maxWidth: 480, width: '90%' }}>
        <h3>Tarifstatus ändern</h3>
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>
          {tarif.leistungsart} · {tarif.rechtsgrundlage} · aktuell{' '}
          <strong>{STATUS_META[tarif.tarif_status]?.label ?? tarif.tarif_status}</strong>
        </p>

        {fehler && <Banner tone="danger">{fehler}</Banner>}

        <label style={{ display: 'block', margin: '12px 0 4px', fontSize: 13 }}>Neuer Status</label>
        <select value={status} onChange={e => setStatus(e.target.value as Tarif['tarif_status'])} style={{ width: '100%' }}>
          <option value="verified">verified — freigegeben für Kassenabrechnung</option>
          <option value="unverified">unverified — noch nicht geprüft</option>
          <option value="blocked">blocked — gesperrt</option>
        </select>

        <label style={{ display: 'block', margin: '12px 0 4px', fontSize: 13 }}>
          Rechtsquelle {quellePflicht ? '(Pflicht)' : '(optional)'}
        </label>
        <textarea
          value={quelle}
          onChange={e => setQuelle(e.target.value)}
          placeholder='z.B. "PfluV Hessen §1 Abs. 1 Nr. 12" oder Begründung der Sperrung'
          style={{ width: '100%', minHeight: 60 }}
        />

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0', fontSize: 13 }}>
          <input type="checkbox" checked={bestaetigt} onChange={e => setBestaetigt(e.target.checked)} />
          Ich bestätige diese Statusänderung. Sie wird im Audit-Trail protokolliert.
        </label>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="admin-btn-ghost" onClick={onAbbrechen} disabled={speichert}>Abbrechen</button>
          <button className="admin-btn" onClick={speichern} disabled={speichert}>
            {speichert ? 'Speichert…' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  )
}
