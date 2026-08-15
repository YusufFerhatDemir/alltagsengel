'use client'
// ═══════════════════════════════════════════════════════════════
// Biografiebogen — Lebensgeschichte/Gewohnheiten für
// biografieorientierte Pflege (1 Bogen pro Klient).
// ═══════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react'
import { Banner } from '@/components/admin/OpsUI'
import { FeldRaster, Karte, TextBereich, pflegeInput, pflegePrimaryBtn } from '@/components/admin/PflegeUI'

type Kunde = { id: string; first_name: string; last_name: string }

const LEER_FORM = {
  beruflicher_werdegang: '',
  familienstand: '',
  wichtige_bezugspersonen: '',
  lebensereignisse: '',
  gewohnheiten_tagesablauf: '',
  vorlieben: '',
  abneigungen: '',
  glaubensrichtung_werte: '',
  hobbies_interessen: '',
  haustiere: '',
  biografische_besonderheiten: '',
}
type FormState = typeof LEER_FORM

export default function BiografiebogenPage() {
  const [kunden, setKunden] = useState<Kunde[]>([])
  const [selectedClient, setSelectedClient] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [form, setForm] = useState<FormState>(LEER_FORM)
  const [zuletztAktualisiert, setZuletztAktualisiert] = useState<string | null>(null)

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
    }
  }

  async function loadBogen() {
    setLoading(true); setError(''); setSuccess('')
    try {
      const res = await fetch(`/api/admin/biografiebogen/${selectedClient}`)
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Fehler beim Laden'); return }
      if (body.bogen) {
        setForm({
          beruflicher_werdegang: body.bogen.beruflicher_werdegang || '',
          familienstand: body.bogen.familienstand || '',
          wichtige_bezugspersonen: body.bogen.wichtige_bezugspersonen || '',
          lebensereignisse: body.bogen.lebensereignisse || '',
          gewohnheiten_tagesablauf: body.bogen.gewohnheiten_tagesablauf || '',
          vorlieben: body.bogen.vorlieben || '',
          abneigungen: body.bogen.abneigungen || '',
          glaubensrichtung_werte: body.bogen.glaubensrichtung_werte || '',
          hobbies_interessen: body.bogen.hobbies_interessen || '',
          haustiere: body.bogen.haustiere || '',
          biografische_besonderheiten: body.bogen.biografische_besonderheiten || '',
        })
        setZuletztAktualisiert(body.bogen.updated_at)
      } else {
        setForm(LEER_FORM)
        setZuletztAktualisiert(null)
      }
    } catch {
      setError('Biografiebogen konnte nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadKunden() }, [])
  useEffect(() => { if (selectedClient) loadBogen() }, [selectedClient])

  async function speichern() {
    setBusy(true); setError(''); setSuccess('')
    try {
      const res = await fetch(`/api/admin/biografiebogen/${selectedClient}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Speichern fehlgeschlagen.'); return }
      setSuccess('Biografiebogen gespeichert.')
      await loadBogen()
    } finally { setBusy(false) }
  }

  function set<K extends keyof FormState>(key: K, value: string) {
    setForm(f => ({ ...f, [key]: value }))
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Biografiebogen</h1>
          <p className="admin-subtitle">Lebensgeschichte und Gewohnheiten für biografieorientierte Pflege</p>
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

      {selectedClient && !loading && (
        <Karte titel="Biografiebogen" aktion={
          zuletztAktualisiert ? <span style={{ fontSize: 12, color: 'var(--ink4)' }}>Zuletzt aktualisiert: {new Date(zuletztAktualisiert).toLocaleString('de-DE')}</span> : undefined
        }>
          <FeldRaster>
            <TextBereich label="Beruflicher Werdegang" value={form.beruflicher_werdegang} onChange={v => set('beruflicher_werdegang', v)} rows={2} />
            <TextBereich label="Familienstand / Kinder" value={form.familienstand} onChange={v => set('familienstand', v)} rows={2} />
            <TextBereich label="Wichtige Bezugspersonen" value={form.wichtige_bezugspersonen} onChange={v => set('wichtige_bezugspersonen', v)} rows={2} />
            <TextBereich label="Wichtige Lebensereignisse" value={form.lebensereignisse} onChange={v => set('lebensereignisse', v)} rows={3} />
            <TextBereich label="Gewohnheiten / Tagesablauf" value={form.gewohnheiten_tagesablauf} onChange={v => set('gewohnheiten_tagesablauf', v)} rows={3} />
            <TextBereich label="Vorlieben" value={form.vorlieben} onChange={v => set('vorlieben', v)} rows={2} />
            <TextBereich label="Abneigungen" value={form.abneigungen} onChange={v => set('abneigungen', v)} rows={2} />
            <TextBereich label="Glaubensrichtung / Werte" value={form.glaubensrichtung_werte} onChange={v => set('glaubensrichtung_werte', v)} rows={2} />
            <TextBereich label="Hobbies / Interessen" value={form.hobbies_interessen} onChange={v => set('hobbies_interessen', v)} rows={2} />
            <TextBereich label="Haustiere" value={form.haustiere} onChange={v => set('haustiere', v)} rows={1} />
            <TextBereich label="Biografische Besonderheiten" value={form.biografische_besonderheiten} onChange={v => set('biografische_besonderheiten', v)} rows={3} />
          </FeldRaster>
          <button onClick={speichern} disabled={busy} style={{ ...pflegePrimaryBtn, marginTop: 14 }}>
            {busy ? 'Speichern...' : 'Speichern'}
          </button>
        </Karte>
      )}
    </div>
  )
}
