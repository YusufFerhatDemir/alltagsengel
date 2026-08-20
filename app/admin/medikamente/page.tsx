'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Banner, SearchInput, StatusBadge } from '@/components/admin/OpsUI'
import { KATEGORIEN, type MedikamentKategorie } from '@/lib/medikamente/types'

interface MedRow {
  id: string
  client_id: string
  medikament_name: string
  wirkstoff: string | null
  dosierung: string
  einheit: string
  kategorie: MedikamentKategorie
  einnahme_morgens: boolean
  einnahme_mittags: boolean
  einnahme_abends: boolean
  einnahme_nachts: boolean
  status: string
  dauermedikation: boolean
  verordnet_von: string | null
  beginn_datum: string | null
  end_datum: string | null
}

interface KlientInfo {
  id: string
  first_name: string
  last_name: string
}

const STATUS_FARBE: Record<string, string> = {
  aktiv: '#38A169',
  pausiert: '#D69E2E',
  abgesetzt: '#A0AEC0',
}

function zeitenLabel(m: MedRow): string {
  const z: string[] = []
  if (m.einnahme_morgens) z.push('Mo')
  if (m.einnahme_mittags) z.push('Mi')
  if (m.einnahme_abends) z.push('Ab')
  if (m.einnahme_nachts) z.push('Na')
  return z.join(' · ')
}

export default function AdminMedikamentePage() {
  const [medikamente, setMedikamente] = useState<MedRow[]>([])
  const [klienten, setKlienten] = useState<KlientInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('aktiv')
  const [filterKategorie, setFilterKategorie] = useState<string>('')
  const [filterClient, setFilterClient] = useState<string>('')

  // Neu-Anlage
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    client_id: '', medikament_name: '', wirkstoff: '', pzn: '',
    kategorie: 'sonstige', darreichungsform: '', dosierung: '', einheit: 'mg',
    einnahme_morgens: true, einnahme_mittags: false, einnahme_abends: false, einnahme_nachts: false,
    einnahme_hinweis: '', verordnet_von: '', beginn_datum: '', end_datum: '',
    dauermedikation: true, notizen: '',
  })
  const [saving, setSaving] = useState(false)

  function loadData() {
    setLoading(true)
    const params = new URLSearchParams()
    if (filterStatus) params.set('status', filterStatus)
    if (filterKategorie) params.set('kategorie', filterKategorie)
    if (filterClient) params.set('client_id', filterClient)

    Promise.all([
      fetch(`/api/medikamente?${params}`).then(r => r.json()),
      fetch('/api/pflege/uebersicht').then(r => r.json()),
    ])
      .then(([mBody, kBody]) => {
        if (mBody.error) { setError(mBody.error); return }
        setMedikamente(Array.isArray(mBody) ? mBody : [])
        const klist = (kBody.uebersicht || []).map((k: Record<string, string>) => ({
          id: k.client_id, first_name: k.first_name, last_name: k.last_name,
        }))
        setKlienten(klist)
      })
      .catch(() => setError('Laden fehlgeschlagen.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadData() }, [filterStatus, filterKategorie, filterClient])  

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/medikamente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Fehler'); return }
      setShowForm(false)
      setFormData(prev => ({ ...prev, medikament_name: '', wirkstoff: '', pzn: '', dosierung: '', notizen: '' }))
      loadData()
    } catch { setError('Speichern fehlgeschlagen.') }
    finally { setSaving(false) }
  }

  async function handleArchive(id: string) {
    if (!confirm('Medikament wirklich archivieren?')) return
    try {
      const res = await fetch(`/api/medikamente/${id}`, { method: 'DELETE' })
      if (!res.ok) { const b = await res.json(); setError(b.error); return }
      loadData()
    } catch { setError('Archivierung fehlgeschlagen.') }
  }

  async function handleStatusChange(id: string, status: string) {
    const grund = status === 'abgesetzt' ? prompt('Grund für das Absetzen:') : undefined
    try {
      const res = await fetch(`/api/medikamente/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, abgesetzt_grund: grund }),
      })
      if (!res.ok) { const b = await res.json(); setError(b.error); return }
      loadData()
    } catch { setError('Statusänderung fehlgeschlagen.') }
  }

  const klientName = (cId: string) => {
    const k = klienten.find(x => x.id === cId)
    return k ? `${k.last_name}, ${k.first_name}` : cId.slice(0, 8)
  }

  const filtered = medikamente.filter(m => {
    if (!search) return true
    const s = search.toLowerCase()
    return m.medikament_name.toLowerCase().includes(s) ||
           (m.wirkstoff?.toLowerCase().includes(s)) ||
           klientName(m.client_id).toLowerCase().includes(s)
  })

  if (loading) return <div className="p-8 text-gray-500">Lade Medikamente…</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Medikamentenmanagement</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
        >
          {showForm ? 'Abbrechen' : '+ Medikament anlegen'}
        </button>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      {/* Neu-Anlage-Formular */}
      {showForm && (
        <form onSubmit={handleCreate} className="rounded-lg border bg-white p-6 shadow-sm space-y-4 dark:bg-gray-900 dark:border-gray-700">
          <h2 className="font-semibold text-lg">Neues Medikament</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block">
              <span className="text-sm font-medium">Klient *</span>
              <select required value={formData.client_id} onChange={e => setFormData(p => ({ ...p, client_id: e.target.value }))}
                className="mt-1 block w-full rounded border px-3 py-2 dark:bg-gray-800 dark:border-gray-600">
                <option value="">Bitte wählen</option>
                {klienten.map(k => <option key={k.id} value={k.id}>{k.last_name}, {k.first_name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium">Medikamentenname *</span>
              <input required value={formData.medikament_name} onChange={e => setFormData(p => ({ ...p, medikament_name: e.target.value }))}
                className="mt-1 block w-full rounded border px-3 py-2 dark:bg-gray-800 dark:border-gray-600" />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Wirkstoff</span>
              <input value={formData.wirkstoff} onChange={e => setFormData(p => ({ ...p, wirkstoff: e.target.value }))}
                className="mt-1 block w-full rounded border px-3 py-2 dark:bg-gray-800 dark:border-gray-600" />
            </label>
            <label className="block">
              <span className="text-sm font-medium">PZN</span>
              <input value={formData.pzn} placeholder="7-8 Ziffern" onChange={e => setFormData(p => ({ ...p, pzn: e.target.value }))}
                className="mt-1 block w-full rounded border px-3 py-2 dark:bg-gray-800 dark:border-gray-600" />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Kategorie</span>
              <select value={formData.kategorie} onChange={e => setFormData(p => ({ ...p, kategorie: e.target.value }))}
                className="mt-1 block w-full rounded border px-3 py-2 dark:bg-gray-800 dark:border-gray-600">
                {Object.entries(KATEGORIEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium">Dosierung *</span>
              <div className="flex gap-2 mt-1">
                <input required value={formData.dosierung} onChange={e => setFormData(p => ({ ...p, dosierung: e.target.value }))}
                  className="block w-full rounded border px-3 py-2 dark:bg-gray-800 dark:border-gray-600" placeholder="z.B. 100" />
                <select value={formData.einheit} onChange={e => setFormData(p => ({ ...p, einheit: e.target.value }))}
                  className="block w-24 rounded border px-2 py-2 dark:bg-gray-800 dark:border-gray-600">
                  {['mg', 'g', 'ml', 'IE', 'µg', 'Tropfen', 'Hub', 'Stück'].map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
            </label>
            <label className="block">
              <span className="text-sm font-medium">Verordnet von</span>
              <input value={formData.verordnet_von} onChange={e => setFormData(p => ({ ...p, verordnet_von: e.target.value }))}
                className="mt-1 block w-full rounded border px-3 py-2 dark:bg-gray-800 dark:border-gray-600" placeholder="Dr. …" />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Beginn</span>
              <input type="date" value={formData.beginn_datum} onChange={e => setFormData(p => ({ ...p, beginn_datum: e.target.value }))}
                className="mt-1 block w-full rounded border px-3 py-2 dark:bg-gray-800 dark:border-gray-600" />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Ende</span>
              <input type="date" value={formData.end_datum} onChange={e => setFormData(p => ({ ...p, end_datum: e.target.value }))}
                className="mt-1 block w-full rounded border px-3 py-2 dark:bg-gray-800 dark:border-gray-600" />
            </label>
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium">Einnahmezeiten *</span>
            <div className="flex flex-wrap gap-4">
              {(['morgens', 'mittags', 'abends', 'nachts'] as const).map(z => (
                <label key={z} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={formData[`einnahme_${z}`]}
                    onChange={e => setFormData(p => ({ ...p, [`einnahme_${z}`]: e.target.checked }))} />
                  {z.charAt(0).toUpperCase() + z.slice(1)}
                </label>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={formData.dauermedikation}
              onChange={e => setFormData(p => ({ ...p, dauermedikation: e.target.checked }))} />
            Dauermedikation
          </label>

          <label className="block">
            <span className="text-sm font-medium">Notizen</span>
            <textarea value={formData.notizen} onChange={e => setFormData(p => ({ ...p, notizen: e.target.value }))}
              rows={2} className="mt-1 block w-full rounded border px-3 py-2 dark:bg-gray-800 dark:border-gray-600" />
          </label>

          <button type="submit" disabled={saving}
            className="rounded bg-green-600 px-6 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50">
            {saving ? 'Speichere…' : 'Medikament speichern'}
          </button>
        </form>
      )}

      {/* Filter */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Name, Wirkstoff oder Klient…" />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="rounded border px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600">
          <option value="">Alle Status</option>
          <option value="aktiv">Aktiv</option>
          <option value="pausiert">Pausiert</option>
          <option value="abgesetzt">Abgesetzt</option>
        </select>
        <select value={filterKategorie} onChange={e => setFilterKategorie(e.target.value)}
          className="rounded border px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600">
          <option value="">Alle Kategorien</option>
          {Object.entries(KATEGORIEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filterClient} onChange={e => setFilterClient(e.target.value)}
          className="rounded border px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600">
          <option value="">Alle Klienten</option>
          {klienten.map(k => <option key={k.id} value={k.id}>{k.last_name}, {k.first_name}</option>)}
        </select>
      </div>

      {/* Tabelle */}
      <div className="overflow-x-auto rounded-lg border dark:border-gray-700">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Medikament</th>
              <th className="px-4 py-3 text-left font-medium">Klient</th>
              <th className="px-4 py-3 text-left font-medium">Dosierung</th>
              <th className="px-4 py-3 text-left font-medium">Kategorie</th>
              <th className="px-4 py-3 text-left font-medium">Zeiten</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Aktionen</th>
            </tr>
          </thead>
          <tbody className="divide-y dark:divide-gray-700">
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">Keine Medikamente gefunden.</td></tr>
            ) : filtered.map(m => (
              <tr key={m.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td className="px-4 py-3">
                  <Link href={`/admin/medikamente/${m.id}`} className="font-medium text-blue-600 hover:underline">
                    {m.medikament_name}
                  </Link>
                  {m.wirkstoff && <div className="text-xs text-gray-500">{m.wirkstoff}</div>}
                </td>
                <td className="px-4 py-3">{klientName(m.client_id)}</td>
                <td className="px-4 py-3">{m.dosierung} {m.einheit}</td>
                <td className="px-4 py-3">{KATEGORIEN[m.kategorie] || m.kategorie}</td>
                <td className="px-4 py-3">{zeitenLabel(m)}</td>
                <td className="px-4 py-3">
                  <StatusBadge label={m.status} color={STATUS_FARBE[m.status] || '#A0AEC0'} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    {m.status === 'aktiv' && (
                      <>
                        <button onClick={() => handleStatusChange(m.id, 'pausiert')}
                          className="text-xs text-yellow-600 hover:underline">Pausieren</button>
                        <button onClick={() => handleStatusChange(m.id, 'abgesetzt')}
                          className="text-xs text-red-600 hover:underline">Absetzen</button>
                      </>
                    )}
                    {m.status === 'pausiert' && (
                      <button onClick={() => handleStatusChange(m.id, 'aktiv')}
                        className="text-xs text-green-600 hover:underline">Reaktivieren</button>
                    )}
                    {m.status !== 'abgesetzt' && (
                      <button onClick={() => handleArchive(m.id)}
                        className="text-xs text-gray-500 hover:underline">Archivieren</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-sm text-gray-500">{filtered.length} Medikament{filtered.length !== 1 ? 'e' : ''}</p>
    </div>
  )
}
