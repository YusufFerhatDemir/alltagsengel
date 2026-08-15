'use client'
// ═══════════════════════════════════════════════════════════════
// Pflegeüberleitungsbogen — strukturierte Übergabe an Klinik/
// Kurzzeitpflege/Nachversorger.
// ═══════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from 'react'
import { Banner, EmptyRow, SearchInput, StatusBadge } from '@/components/admin/OpsUI'
import {
  AuswahlFeld, FeldRaster, Karte, SchalterFeld, TextBereich, TextFeld,
  pflegeInput, pflegePrimaryBtn, pflegeSecondaryBtn,
} from '@/components/admin/PflegeUI'

interface Ueberleitung {
  id: string
  client_id: string
  anlass: string
  ziel_einrichtung: string | null
  uebergabe_am: string
  status: 'entwurf' | 'abgeschlossen' | 'archiviert'
  ansprechpartner_uebernehmend: string | null
  clients: { first_name: string; last_name: string } | null
}

type Kunde = { id: string; first_name: string; last_name: string }

const ANLAESSE: Record<string, string> = {
  krankenhauseinweisung: 'Krankenhauseinweisung',
  kurzzeitpflege: 'Kurzzeitpflege',
  verlegung_pflegeheim: 'Verlegung Pflegeheim',
  arztbesuch: 'Arztbesuch',
  reha: 'Reha',
  sonstige: 'Sonstige',
}

const LEER_FORM = {
  clientId: '',
  anlass: 'krankenhauseinweisung',
  zielEinrichtung: '',
  diagnosen: '',
  medikamentenplanBeigefuegt: false,
  hilfsmittel: '',
  mobilitaet: '',
  kommunikation: '',
  ernaehrung: '',
  besonderheitenPflege: '',
  risiken: '',
  ansprechpartnerAbgebend: '',
  ansprechpartnerUebernehmend: '',
}

export default function UeberleitungPage() {
  const [ueberleitungen, setUeberleitungen] = useState<Ueberleitung[]>([])
  const [kunden, setKunden] = useState<Kunde[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
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

  async function load(archived?: boolean) {
    const archiv = archived ?? showArchived
    setLoading(true); setError('')
    try {
      const url = archiv ? '/api/admin/ueberleitung?showArchived=true' : '/api/admin/ueberleitung'
      const res = await fetch(url)
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Fehler beim Laden'); return }
      setUeberleitungen(body.ueberleitungen || [])
    } catch {
      setError('Überleitungsbögen konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(); loadKunden() }, [])

  async function archivieren(id: string) {
    setBusy(true); setError(''); setSuccess('')
    try {
      const res = await fetch(`/api/admin/ueberleitung/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'archiviert' }),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Archivieren fehlgeschlagen.'); return }
      setSuccess('Überleitungsbogen archiviert.')
      await load()
    } finally { setBusy(false) }
  }

  function toggleArchived() {
    const next = !showArchived
    setShowArchived(next)
    load(next)
  }

  async function speichern(alsAbgeschlossen: boolean) {
    if (!form.clientId) { setError('Bitte Klient wählen.'); return }
    setBusy(true); setError(''); setSuccess('')
    try {
      const res = await fetch('/api/admin/ueberleitung', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: form.clientId,
          anlass: form.anlass,
          ziel_einrichtung: form.zielEinrichtung || null,
          diagnosen: form.diagnosen || null,
          medikamentenplan_beigefuegt: form.medikamentenplanBeigefuegt,
          hilfsmittel: form.hilfsmittel || null,
          mobilitaet: form.mobilitaet || null,
          kommunikation: form.kommunikation || null,
          ernaehrung: form.ernaehrung || null,
          besonderheiten_pflege: form.besonderheitenPflege || null,
          risiken: form.risiken || null,
          ansprechpartner_abgebend: form.ansprechpartnerAbgebend || null,
          ansprechpartner_uebernehmend: form.ansprechpartnerUebernehmend || null,
        }),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Anlegen fehlgeschlagen.'); return }

      if (alsAbgeschlossen) {
        await fetch(`/api/admin/ueberleitung/${body.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'abgeschlossen' }),
        })
      }

      setSuccess('Überleitungsbogen gespeichert.')
      setForm(LEER_FORM)
      setZeigeForm(false)
      await load()
    } finally { setBusy(false) }
  }

  const gefiltert = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return ueberleitungen
    return ueberleitungen.filter(u => {
      const name = `${u.clients?.first_name || ''} ${u.clients?.last_name || ''}`.toLowerCase()
      return name.includes(q) || (u.ziel_einrichtung || '').toLowerCase().includes(q)
    })
  }, [ueberleitungen, search])

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Pflegeüberleitung</h1>
          <p className="admin-subtitle">Strukturierte Übergabe an Klinik, Kurzzeitpflege oder Nachversorger</p>
        </div>
        {!zeigeForm && <button onClick={() => setZeigeForm(true)} style={pflegePrimaryBtn}>+ Neuer Überleitungsbogen</button>}
      </div>

      {error && <Banner tone="danger">{error}</Banner>}
      {success && <Banner tone="success">{success}</Banner>}

      {zeigeForm && (
        <Karte titel="Neuer Überleitungsbogen" aktion={<button onClick={() => setZeigeForm(false)} style={pflegeSecondaryBtn}>Abbrechen</button>}>
          <FeldRaster>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink4)' }}>Klient *</span>
              <select value={form.clientId} onChange={e => setForm(f => ({ ...f, clientId: e.target.value }))} style={pflegeInput}>
                <option value="">-- Klient wählen --</option>
                {kunden.map(k => <option key={k.id} value={k.id}>{k.first_name} {k.last_name}</option>)}
              </select>
            </label>
            <AuswahlFeld label="Anlass" value={form.anlass} onChange={v => setForm(f => ({ ...f, anlass: v }))} optionen={Object.entries(ANLAESSE)} />
            <TextFeld label="Zieleinrichtung" value={form.zielEinrichtung} onChange={v => setForm(f => ({ ...f, zielEinrichtung: v }))} />
            <TextFeld label="Ansprechpartner (abgebend)" value={form.ansprechpartnerAbgebend} onChange={v => setForm(f => ({ ...f, ansprechpartnerAbgebend: v }))} />
            <TextFeld label="Ansprechpartner (übernehmend)" value={form.ansprechpartnerUebernehmend} onChange={v => setForm(f => ({ ...f, ansprechpartnerUebernehmend: v }))} />
          </FeldRaster>
          <div style={{ marginTop: 12 }}>
            <TextBereich label="Diagnosen" value={form.diagnosen} onChange={v => setForm(f => ({ ...f, diagnosen: v }))} rows={2} />
          </div>
          <div style={{ marginTop: 8 }}>
            <SchalterFeld label="Medikamentenplan beigefügt" value={form.medikamentenplanBeigefuegt} onChange={v => setForm(f => ({ ...f, medikamentenplanBeigefuegt: v }))} />
          </div>
          <FeldRaster>
            <TextBereich label="Hilfsmittel" value={form.hilfsmittel} onChange={v => setForm(f => ({ ...f, hilfsmittel: v }))} rows={2} />
            <TextBereich label="Mobilität" value={form.mobilitaet} onChange={v => setForm(f => ({ ...f, mobilitaet: v }))} rows={2} />
            <TextBereich label="Kommunikation" value={form.kommunikation} onChange={v => setForm(f => ({ ...f, kommunikation: v }))} rows={2} />
            <TextBereich label="Ernährung" value={form.ernaehrung} onChange={v => setForm(f => ({ ...f, ernaehrung: v }))} rows={2} />
          </FeldRaster>
          <div style={{ marginTop: 8 }}>
            <TextBereich label="Besonderheiten Pflege" value={form.besonderheitenPflege} onChange={v => setForm(f => ({ ...f, besonderheitenPflege: v }))} rows={2} />
          </div>
          <div style={{ marginTop: 8 }}>
            <TextBereich label="Risiken" value={form.risiken} onChange={v => setForm(f => ({ ...f, risiken: v }))} rows={2} />
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button onClick={() => speichern(false)} disabled={busy} style={pflegeSecondaryBtn}>Als Entwurf speichern</button>
            <button onClick={() => speichern(true)} disabled={busy} style={pflegePrimaryBtn}>Speichern &amp; abschließen</button>
          </div>
        </Karte>
      )}

      {!zeigeForm && (
        <>
          <div style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <SearchInput value={search} onChange={setSearch} placeholder="Klient, Zieleinrichtung..." />
            <button
              onClick={toggleArchived}
              style={{
                ...pflegeSecondaryBtn,
                fontSize: 13,
                padding: '6px 14px',
                opacity: showArchived ? 1 : 0.7,
              }}
            >
              {showArchived ? 'Archivierte ausblenden' : 'Archivierte anzeigen'}
            </button>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>Klient</th><th>Anlass</th><th>Ziel</th><th>Übergabe am</th><th>Status</th><th>Aktionen</th></tr>
              </thead>
              <tbody>
                {loading
                  ? <EmptyRow colSpan={6}>Laden...</EmptyRow>
                  : gefiltert.length === 0
                    ? <EmptyRow colSpan={6}>Noch keine Überleitungsbögen</EmptyRow>
                    : gefiltert.map(u => (
                      <tr key={u.id}>
                        <td style={{ fontWeight: 600 }}>{u.clients?.first_name} {u.clients?.last_name}</td>
                        <td>{ANLAESSE[u.anlass] || u.anlass}</td>
                        <td style={{ fontSize: 13 }}>{u.ziel_einrichtung || '—'}</td>
                        <td style={{ fontSize: 13 }}>{new Date(u.uebergabe_am).toLocaleString('de-DE')}</td>
                        <td>
                          <StatusBadge
                            label={u.status === 'abgeschlossen' ? 'Abgeschlossen' : u.status === 'archiviert' ? 'Archiviert' : 'Entwurf'}
                            color={u.status === 'abgeschlossen' ? 'green' : u.status === 'archiviert' ? 'gray' : 'yellow'}
                          />
                        </td>
                        <td>
                          {u.status !== 'archiviert' && (
                            <button
                              onClick={() => archivieren(u.id)}
                              disabled={busy}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--ink3, #888)',
                                cursor: 'pointer',
                                fontSize: 13,
                                padding: '2px 6px',
                                textDecoration: 'underline',
                              }}
                            >
                              Archivieren
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
