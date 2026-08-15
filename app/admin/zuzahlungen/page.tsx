'use client'
// ═══════════════════════════════════════════════════════════════
// Zuzahlungsverwaltung §61 SGB V — Eigenanteil bei häuslicher
// Krankenpflege (10%, max. 10€/Verordnung, max. 28 Tage/Jahr
// angerechnet) inkl. Befreiungsnachweis.
// ═══════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from 'react'
import { Banner, EmptyRow, StatusBadge } from '@/components/admin/OpsUI'
import { FeldRaster, Karte, SchalterFeld, TextBereich, TextFeld, pflegeInput, pflegeMiniBtn, pflegePrimaryBtn } from '@/components/admin/PflegeUI'

interface Zuzahlung {
  id: string
  client_id: string
  jahr: number
  betrag: number
  tage: number
  faellig_am: string | null
  bezahlt: boolean
  bezahlt_am: string | null
  befreit: boolean
  befreiung_gueltig_von: string | null
  befreiung_gueltig_bis: string | null
  bemerkung: string | null
  clients: { first_name: string; last_name: string } | null
}

type Kunde = { id: string; first_name: string; last_name: string }

const AKTUELLES_JAHR = new Date().getFullYear()

const LEER_FORM = {
  clientId: '',
  jahr: String(AKTUELLES_JAHR),
  betrag: '',
  tage: '1',
  faelligAm: '',
  befreit: false,
  befreiungVon: '',
  befreiungBis: '',
  bemerkung: '',
}

export default function ZuzahlungenPage() {
  const [zuzahlungen, setZuzahlungen] = useState<Zuzahlung[]>([])
  const [jahresstand, setJahresstand] = useState<Record<string, number>>({})
  const [jahresgrenze, setJahresgrenze] = useState(28)
  const [kunden, setKunden] = useState<Kunde[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [zeigeForm, setZeigeForm] = useState(false)
  const [form, setForm] = useState(LEER_FORM)

  async function loadKunden() {
    try {
      const res = await fetch('/api/pflege/uebersicht')
      const body = await res.json()
      const liste: Kunde[] = (body.uebersicht || []).map((z: { client_id: string; first_name: string; last_name: string }) => ({
        id: z.client_id, first_name: z.first_name, last_name: z.last_name,
      }))
      setKunden(liste)
    } catch { /* optional */ }
  }

  async function load() {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/admin/zuzahlungen')
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Fehler beim Laden'); return }
      setZuzahlungen(body.zuzahlungen || [])
      setJahresstand(body.jahresstand || {})
      setJahresgrenze(body.jahresgrenzeTage || 28)
    } catch {
      setError('Zuzahlungen konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(); loadKunden() }, [])

  async function speichern() {
    if (!form.clientId || !form.betrag) { setError('Klient und Betrag sind Pflichtfelder.'); return }
    if (form.befreit && (!form.befreiungVon || !form.befreiungBis)) {
      setError('Bei Befreiung bitte Gültigkeitszeitraum angeben.')
      return
    }
    setBusy(true); setError(''); setSuccess('')
    try {
      const res = await fetch('/api/admin/zuzahlungen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: form.clientId,
          jahr: Number(form.jahr),
          betrag: Number(form.betrag),
          tage: Number(form.tage) || 0,
          faellig_am: form.faelligAm || null,
          befreit: form.befreit,
          befreiung_gueltig_von: form.befreiungVon || null,
          befreiung_gueltig_bis: form.befreiungBis || null,
          bemerkung: form.bemerkung || null,
        }),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Anlegen fehlgeschlagen.'); return }
      setSuccess('Zuzahlung erfasst.')
      setForm(LEER_FORM)
      setZeigeForm(false)
      await load()
    } finally { setBusy(false) }
  }

  async function alsBezahltMarkieren(id: string) {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/zuzahlungen/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bezahlt: true }),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Fehlgeschlagen.'); return }
      await load()
    } finally { setBusy(false) }
  }

  const offeneSumme = useMemo(
    () => zuzahlungen.filter(z => !z.bezahlt && !z.befreit).reduce((sum, z) => sum + Number(z.betrag), 0),
    [zuzahlungen],
  )

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Zuzahlungsverwaltung</h1>
          <p className="admin-subtitle">§61 SGB V — Eigenanteil häusliche Krankenpflege, max. {jahresgrenze} Tage/Jahr angerechnet</p>
        </div>
        {!zeigeForm && <button onClick={() => setZeigeForm(true)} style={pflegePrimaryBtn}>+ Neue Zuzahlung</button>}
      </div>

      {error && <Banner tone="danger">{error}</Banner>}
      {success && <Banner tone="success">{success}</Banner>}

      <div className="admin-stats-grid">
        <div className="admin-stat-card">
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--gold)' }}>{offeneSumme.toFixed(2)} €</div>
          <div style={{ fontSize: 12, color: 'var(--ink4)' }}>Offene Zuzahlungen (nicht befreit)</div>
        </div>
      </div>

      {zeigeForm && (
        <Karte titel="Neue Zuzahlung erfassen">
          <FeldRaster>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink4)' }}>Klient *</span>
              <select value={form.clientId} onChange={e => setForm(f => ({ ...f, clientId: e.target.value }))} style={pflegeInput}>
                <option value="">-- Klient wählen --</option>
                {kunden.map(k => <option key={k.id} value={k.id}>{k.first_name} {k.last_name}</option>)}
              </select>
            </label>
            <TextFeld label="Jahr" type="number" value={form.jahr} onChange={v => setForm(f => ({ ...f, jahr: v }))} />
            <TextFeld label="Betrag (€) *" type="number" value={form.betrag} onChange={v => setForm(f => ({ ...f, betrag: v }))} placeholder="max. 10,00" />
            <TextFeld label="Angerechnete Tage" type="number" value={form.tage} onChange={v => setForm(f => ({ ...f, tage: v }))} />
            <TextFeld label="Fällig am" type="date" value={form.faelligAm} onChange={v => setForm(f => ({ ...f, faelligAm: v }))} />
          </FeldRaster>
          <div style={{ marginTop: 8 }}>
            <SchalterFeld label="Klient ist von der Zuzahlung befreit (Befreiungsausweis liegt vor)" value={form.befreit}
              onChange={v => setForm(f => ({ ...f, befreit: v }))} />
          </div>
          {form.befreit && (
            <FeldRaster>
              <TextFeld label="Befreiung gültig von" type="date" value={form.befreiungVon} onChange={v => setForm(f => ({ ...f, befreiungVon: v }))} />
              <TextFeld label="Befreiung gültig bis" type="date" value={form.befreiungBis} onChange={v => setForm(f => ({ ...f, befreiungBis: v }))} />
            </FeldRaster>
          )}
          <div style={{ marginTop: 8 }}>
            <TextBereich label="Bemerkung" value={form.bemerkung} onChange={v => setForm(f => ({ ...f, bemerkung: v }))} rows={2} />
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button onClick={speichern} disabled={busy} style={pflegePrimaryBtn}>{busy ? 'Speichern...' : 'Erfassen'}</button>
            <button onClick={() => setZeigeForm(false)} style={{ ...pflegeMiniBtn, padding: '8px 16px' }}>Abbrechen</button>
          </div>
        </Karte>
      )}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr><th>Klient</th><th>Jahr</th><th>Betrag</th><th>Tage (Jahresstand)</th><th>Fällig</th><th>Status</th><th>Aktionen</th></tr>
          </thead>
          <tbody>
            {loading
              ? <EmptyRow colSpan={7}>Laden...</EmptyRow>
              : zuzahlungen.length === 0
                ? <EmptyRow colSpan={7}>Noch keine Zuzahlungen erfasst</EmptyRow>
                : zuzahlungen.map(z => {
                  const stand = jahresstand[`${z.client_id}:${z.jahr}`] ?? 0
                  return (
                    <tr key={z.id}>
                      <td style={{ fontWeight: 600 }}>{z.clients?.first_name} {z.clients?.last_name}</td>
                      <td>{z.jahr}</td>
                      <td>{Number(z.betrag).toFixed(2)} €</td>
                      <td style={{ fontSize: 13, color: stand > jahresgrenze ? '#D04B3B' : 'var(--ink3)' }}>
                        {stand} / {jahresgrenze}
                      </td>
                      <td style={{ fontSize: 13 }}>{z.faellig_am || '—'}</td>
                      <td>
                        {z.befreit
                          ? <StatusBadge label="Befreit" color="blue" />
                          : <StatusBadge label={z.bezahlt ? 'Bezahlt' : 'Offen'} color={z.bezahlt ? 'green' : 'orange'} />}
                      </td>
                      <td>
                        {!z.befreit && !z.bezahlt && (
                          <button onClick={() => alsBezahltMarkieren(z.id)} disabled={busy} style={pflegeMiniBtn}>Als bezahlt markieren</button>
                        )}
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
