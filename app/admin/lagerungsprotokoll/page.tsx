'use client'
// ═══════════════════════════════════════════════════════════════
// Lagerungsprotokoll — Umlagerung/Positionswechsel zur
// Dekubitusprophylaxe (Expertenstandard "Dekubitusprophylaxe").
// ═══════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react'
import { Banner, EmptyRow } from '@/components/admin/OpsUI'
import {
  AuswahlFeld, FeldRaster, Karte, SchalterFeld, TextBereich, TextFeld,
  pflegeInput, pflegePrimaryBtn,
} from '@/components/admin/PflegeUI'

interface Protokoll {
  id: string
  position: string
  durchgefuehrt_am: string
  hautzustand: string | null
  dekubitusrisiko_auffaellig: boolean
  hilfsmittel: string | null
  naechste_lagerung_geplant_am: string | null
  bemerkung: string | null
}

type Kunde = { id: string; first_name: string; last_name: string }

const POSITIONEN: Record<string, string> = {
  rueckenlage: 'Rückenlage',
  seitenlage_links: 'Seitenlage links',
  seitenlage_rechts: 'Seitenlage rechts',
  bauchlage: 'Bauchlage',
  '30grad_schraeglage_links': '30°-Schräglage links',
  '30grad_schraeglage_rechts': '30°-Schräglage rechts',
  sitzend: 'Sitzend',
  mikrolagerung: 'Mikrolagerung',
}

const LEER_FORM = {
  position: 'rueckenlage',
  hautzustand: '',
  dekubitusrisikoAuffaellig: false,
  hilfsmittel: '',
  naechsteLagerungGeplantAm: '',
  bemerkung: '',
}

export default function LagerungsprotokollPage() {
  const [kunden, setKunden] = useState<Kunde[]>([])
  const [selectedClient, setSelectedClient] = useState('')
  const [protokolle, setProtokolle] = useState<Protokoll[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [form, setForm] = useState(LEER_FORM)

  async function loadKunden() {
    try {
      const res = await fetch('/api/pflege/uebersicht')
      const body = await res.json()
      const liste: Kunde[] = (body.uebersicht || []).map((z: { client_id: string; first_name: string; last_name: string }) => ({
        id: z.client_id, first_name: z.first_name, last_name: z.last_name,
      }))
      setKunden(liste)
      if (liste.length > 0) setSelectedClient(liste[0].id)
    } catch {
      setError('Kunden konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }

  async function loadProtokolle() {
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/admin/lagerungsprotokoll?clientId=${selectedClient}`)
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Fehler beim Laden'); return }
      setProtokolle(body.protokolle || [])
    } catch {
      setError('Protokolle konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadKunden() }, [])
  useEffect(() => { if (selectedClient) loadProtokolle() }, [selectedClient])

  async function archivieren(id: string) {
    if (!confirm('Eintrag wirklich archivieren?')) return
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/admin/lagerungsprotokoll', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Archivierung fehlgeschlagen.'); return }
      setSuccess('Eintrag wurde archiviert.')
      await loadProtokolle()
    } finally { setBusy(false) }
  }

  async function speichern() {
    if (!selectedClient) { setError('Bitte Klient wählen.'); return }
    setBusy(true); setError(''); setSuccess('')
    try {
      const res = await fetch('/api/admin/lagerungsprotokoll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: selectedClient,
          position: form.position,
          hautzustand: form.hautzustand || null,
          dekubitusrisiko_auffaellig: form.dekubitusrisikoAuffaellig,
          hilfsmittel: form.hilfsmittel || null,
          naechste_lagerung_geplant_am: form.naechsteLagerungGeplantAm || null,
          bemerkung: form.bemerkung || null,
        }),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Speichern fehlgeschlagen.'); return }
      setSuccess('Lagerung protokolliert.')
      setForm(LEER_FORM)
      await loadProtokolle()
    } finally { setBusy(false) }
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Lagerungsprotokoll</h1>
          <p className="admin-subtitle">Umlagerung/Positionswechsel zur Dekubitusprophylaxe</p>
        </div>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}
      {success && <Banner tone="success">{success}</Banner>}

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink4)' }}>Klient</span>
          <select value={selectedClient} onChange={e => setSelectedClient(e.target.value)} style={{ ...pflegeInput, maxWidth: 400 }}>
            <option value="">Klient wählen...</option>
            {kunden.map(k => <option key={k.id} value={k.id}>{k.first_name} {k.last_name}</option>)}
          </select>
        </label>
      </div>

      {selectedClient && (
        <Karte titel="Neue Umlagerung protokollieren">
          <FeldRaster>
            <AuswahlFeld label="Position" value={form.position}
              onChange={v => setForm(f => ({ ...f, position: v }))}
              optionen={Object.entries(POSITIONEN)} />
            <TextFeld label="Hautzustand" value={form.hautzustand}
              onChange={v => setForm(f => ({ ...f, hautzustand: v }))} placeholder="z. B. unauffällig, gerötet" />
            <TextFeld label="Hilfsmittel" value={form.hilfsmittel}
              onChange={v => setForm(f => ({ ...f, hilfsmittel: v }))} placeholder="z. B. Antidekubitusmatratze, Lagerungskissen" />
            <TextFeld label="Nächste Lagerung geplant" type="datetime-local" value={form.naechsteLagerungGeplantAm}
              onChange={v => setForm(f => ({ ...f, naechsteLagerungGeplantAm: v }))} />
          </FeldRaster>
          <div style={{ marginTop: 8 }}>
            <SchalterFeld label="Dekubitusrisiko auffällig (Rötung/Druckstelle)" value={form.dekubitusrisikoAuffaellig}
              onChange={v => setForm(f => ({ ...f, dekubitusrisikoAuffaellig: v }))} />
          </div>
          <div style={{ marginTop: 8 }}>
            <TextBereich label="Bemerkung" value={form.bemerkung} rows={2}
              onChange={v => setForm(f => ({ ...f, bemerkung: v }))} />
          </div>
          <button onClick={speichern} disabled={busy} style={{ ...pflegePrimaryBtn, marginTop: 12 }}>
            {busy ? 'Speichern...' : 'Protokollieren'}
          </button>
        </Karte>
      )}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr><th>Zeitpunkt</th><th>Position</th><th>Hautzustand</th><th>Risiko</th><th>Nächste geplant</th><th>Aktion</th></tr>
          </thead>
          <tbody>
            {loading
              ? <EmptyRow colSpan={6}>Laden...</EmptyRow>
              : protokolle.length === 0
                ? <EmptyRow colSpan={6}>Noch keine Einträge</EmptyRow>
                : protokolle.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontSize: 13 }}>{new Date(p.durchgefuehrt_am).toLocaleString('de-DE')}</td>
                    <td>{POSITIONEN[p.position] || p.position}</td>
                    <td style={{ fontSize: 13 }}>{p.hautzustand || '—'}</td>
                    <td>{p.dekubitusrisiko_auffaellig ? <span style={{ color: '#D04B3B' }}>Auffällig</span> : '—'}</td>
                    <td style={{ fontSize: 13 }}>{p.naechste_lagerung_geplant_am ? new Date(p.naechste_lagerung_geplant_am).toLocaleString('de-DE') : '—'}</td>
                    <td>
                      <button onClick={() => archivieren(p.id)} style={{ fontSize: 12, color: 'var(--ink4)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                        Archivieren
                      </button>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
