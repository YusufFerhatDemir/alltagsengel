'use client'
import { useEffect, useState, useCallback } from 'react'
import { Banner } from '@/components/admin/OpsUI'
import Link from 'next/link'

interface Kostentraeger {
  id: string
  ik_nummer: string
  name: string
  kassenart: string
  bundesland: string | null
  abrechnungsweg: string | null
  datenannahmestelle_id: string | null
  ist_aktiv: boolean
}

interface Datenannahmestelle {
  id: string
  name: string
  ik_nummer: string
  kassenart: string | null
  sftp_host: string | null
  sftp_user: string | null
  kim_adresse: string | null
  ssh_key_hinterlegt: boolean
  aktiv: boolean
  global: boolean
  editierbar: boolean
}

interface Validierungsfehler { feld: string; meldung: string }

const KASSENARTEN = [
  { code: 'AO', label: 'AOK' },
  { code: 'BK', label: 'Betriebskrankenkassen' },
  { code: 'BN', label: 'Knappschaft' },
  { code: 'EK', label: 'Ersatzkassen' },
  { code: 'IK', label: 'Innungskrankenkassen' },
  { code: 'LK', label: 'Landwirtschaftliche KK' },
  { code: 'SE', label: 'Seekasse' },
]

export default function StammdatenPage() {
  const [kostentraeger, setKostentraeger] = useState<Kostentraeger[]>([])
  const [stellen, setStellen] = useState<Datenannahmestelle[]>([])
  const [laden, setLaden] = useState(true)
  const [fehler, setFehler] = useState<string | null>(null)
  const [meldung, setMeldung] = useState<string | null>(null)
  const [feldFehler, setFeldFehler] = useState<Validierungsfehler[]>([])

  const [ktForm, setKtForm] = useState({ ik_nummer: '', name: '', kassenart: 'AO', bundesland: '', datenannahmestelle_id: '' })
  const [dasForm, setDasForm] = useState({ ik_nummer: '', name: '', kassenart: 'AO', sftp_host: '', sftp_user: '', sftp_verzeichnis: '', kim_adresse: '' })

  const laden_ = useCallback(async () => {
    setLaden(true)
    try {
      const [ktRes, dasRes] = await Promise.all([
        fetch('/api/billing/stammdaten/kostentraeger').then(r => r.json()),
        fetch('/api/billing/stammdaten/datenannahmestellen').then(r => r.json()),
      ])
      if (ktRes.error) throw new Error(ktRes.error)
      if (dasRes.error) throw new Error(dasRes.error)
      setKostentraeger(ktRes.kostentraeger ?? [])
      setStellen(dasRes.datenannahmestellen ?? [])
      setFehler(null)
    } catch (e) {
      setFehler((e as Error).message)
    } finally {
      setLaden(false)
    }
  }, [])

  useEffect(() => { laden_() }, [laden_])

  async function speichern(pfad: string, koerper: Record<string, unknown>, erfolgsText: string) {
    setFeldFehler([])
    setMeldung(null)
    const res = await fetch(pfad, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(koerper),
    })
    const j = await res.json()
    if (!res.ok) {
      setFeldFehler(j.fehler ?? [{ feld: '_', meldung: j.error ?? `HTTP ${res.status}` }])
      return
    }
    setMeldung(
      erfolgsText + (j.warnungen?.length ? ` — Hinweis: ${j.warnungen.map((w: Validierungsfehler) => w.meldung).join(' · ')}` : ''),
    )
    await laden_()
  }

  async function loeschen(pfad: string, id: string) {
    const res = await fetch(`${pfad}?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setFehler(j.error ?? `Löschen fehlgeschlagen (HTTP ${res.status})`)
      return
    }
    await laden_()
  }

  if (laden) return <div className="admin-page"><p>Lade Stammdaten…</p></div>

  return (
    <div className="admin-page">
      <h1>Kassenabrechnung — Stammdaten</h1>
      <p style={{ color: 'var(--muted)', marginBottom: 8 }}>
        Kostenträger, Datenannahmestellen und deren Zuordnung. Jede IK-Nummer wird
        gegen die Prüfziffer nach § 293 SGB V validiert.
      </p>
      <p style={{ marginBottom: 24, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Link href="/admin/kassenabrechnung/readiness">→ Bereitschaft prüfen</Link>
        <Link href="/admin/kassenabrechnung/tarife">→ Tarife &amp; Verifizierungsstatus</Link>
      </p>

      {fehler && <Banner tone="danger">{fehler}</Banner>}
      {meldung && <Banner tone="success">{meldung}</Banner>}
      {feldFehler.length > 0 && (
        <Banner tone="danger">
          {feldFehler.map((f, i) => <div key={i}>{f.feld !== '_' ? `${f.feld}: ` : ''}{f.meldung}</div>)}
        </Banner>
      )}

      {/* ── Datenannahmestellen ────────────────────────────────── */}
      <div className="admin-card" style={{ marginBottom: 24 }}>
        <h3>Datenannahmestellen ({stellen.length})</h3>
        {stellen.length === 0
          ? <p style={{ color: 'var(--muted)' }}>Keine Datenannahmestelle gepflegt — ohne sie ist kein DTA-Versand möglich.</p>
          : (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 13 }}>
                  <th style={{ padding: 6 }}>Name</th><th>IK</th><th>Art</th><th>Transport</th><th>SSH-Key</th><th></th>
                </tr>
              </thead>
              <tbody>
                {stellen.map(s => (
                  <tr key={s.id} style={{ borderTop: '1px solid var(--border, #e5e7eb)' }}>
                    <td style={{ padding: 6 }}>{s.name}{s.global && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--muted)' }}>(global)</span>}</td>
                    <td>{s.ik_nummer}</td>
                    <td>{s.kassenart ?? '—'}</td>
                    <td>{s.sftp_host ? `SFTP ${s.sftp_host}` : s.kim_adresse ? 'KIM' : <span style={{ color: '#ef4444' }}>fehlt</span>}</td>
                    <td>{s.ssh_key_hinterlegt ? 'ja' : <span style={{ color: '#f59e0b' }}>nein</span>}</td>
                    <td style={{ textAlign: 'right' }}>
                      {s.editierbar && (
                        <button onClick={() => loeschen('/api/billing/stammdaten/datenannahmestellen', s.id)} className="admin-btn-ghost">
                          Entfernen
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

        <h4>Neue Datenannahmestelle</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          <input placeholder="IK-Nummer (9 Ziffern)" value={dasForm.ik_nummer} onChange={e => setDasForm({ ...dasForm, ik_nummer: e.target.value })} />
          <input placeholder="Name" value={dasForm.name} onChange={e => setDasForm({ ...dasForm, name: e.target.value })} />
          <select value={dasForm.kassenart} onChange={e => setDasForm({ ...dasForm, kassenart: e.target.value })}>
            {KASSENARTEN.map(k => <option key={k.code} value={k.code}>{k.code} — {k.label}</option>)}
          </select>
          <input placeholder="SFTP-Host" value={dasForm.sftp_host} onChange={e => setDasForm({ ...dasForm, sftp_host: e.target.value })} />
          <input placeholder="SFTP-Benutzer" value={dasForm.sftp_user} onChange={e => setDasForm({ ...dasForm, sftp_user: e.target.value })} />
          <input placeholder="SFTP-Verzeichnis" value={dasForm.sftp_verzeichnis} onChange={e => setDasForm({ ...dasForm, sftp_verzeichnis: e.target.value })} />
          <input placeholder="KIM-Adresse (optional)" value={dasForm.kim_adresse} onChange={e => setDasForm({ ...dasForm, kim_adresse: e.target.value })} />
        </div>
        <p style={{ color: 'var(--muted)', fontSize: 13, margin: '8px 0' }}>
          Der SSH-Key wird separat unter Abrechnung → Einstellungen hochgeladen, nicht hier.
        </p>
        <button
          className="admin-btn"
          onClick={() => speichern('/api/billing/stammdaten/datenannahmestellen', dasForm, 'Datenannahmestelle gespeichert')}
        >
          Speichern
        </button>
      </div>

      {/* ── Kostenträger ───────────────────────────────────────── */}
      <div className="admin-card">
        <h3>Kostenträger ({kostentraeger.length})</h3>
        {kostentraeger.length === 0
          ? <p style={{ color: 'var(--muted)' }}>Keine Kassen gepflegt — der Pre-Flight blockiert jeden Lauf.</p>
          : (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 13 }}>
                  <th style={{ padding: 6 }}>Name</th><th>IK</th><th>Art</th><th>Annahmestelle</th><th>Aktiv</th><th></th>
                </tr>
              </thead>
              <tbody>
                {kostentraeger.map(k => {
                  const ziel = stellen.find(s => s.id === k.datenannahmestelle_id)
                  return (
                    <tr key={k.id} style={{ borderTop: '1px solid var(--border, #e5e7eb)' }}>
                      <td style={{ padding: 6 }}>{k.name}</td>
                      <td>{k.ik_nummer}</td>
                      <td>{k.kassenart}</td>
                      <td>{ziel ? ziel.name : <span style={{ color: '#f59e0b' }}>nicht zugeordnet</span>}</td>
                      <td>{k.ist_aktiv ? 'ja' : 'nein'}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button onClick={() => loeschen('/api/billing/stammdaten/kostentraeger', k.id)} className="admin-btn-ghost">
                          Entfernen
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}

        <h4>Neuer Kostenträger</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          <input placeholder="IK-Nummer (9 Ziffern)" value={ktForm.ik_nummer} onChange={e => setKtForm({ ...ktForm, ik_nummer: e.target.value })} />
          <input placeholder="Name der Kasse" value={ktForm.name} onChange={e => setKtForm({ ...ktForm, name: e.target.value })} />
          <select value={ktForm.kassenart} onChange={e => setKtForm({ ...ktForm, kassenart: e.target.value })}>
            {KASSENARTEN.map(k => <option key={k.code} value={k.code}>{k.code} — {k.label}</option>)}
          </select>
          <input placeholder="Bundesland" value={ktForm.bundesland} onChange={e => setKtForm({ ...ktForm, bundesland: e.target.value })} />
          <select value={ktForm.datenannahmestelle_id} onChange={e => setKtForm({ ...ktForm, datenannahmestelle_id: e.target.value })}>
            <option value="">— Datenannahmestelle wählen —</option>
            {stellen.map(s => <option key={s.id} value={s.id}>{s.name} ({s.ik_nummer})</option>)}
          </select>
        </div>
        <button
          className="admin-btn"
          style={{ marginTop: 10 }}
          onClick={() => speichern('/api/billing/stammdaten/kostentraeger', ktForm, 'Kostenträger gespeichert')}
        >
          Speichern
        </button>
      </div>
    </div>
  )
}
