'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Banner, StatusBadge } from '@/components/admin/OpsUI'
import { KATEGORIEN } from '@/lib/medikamente/types'
import type { MedikamentKategorie } from '@/lib/medikamente/types'

interface MedDetail {
  id: string
  client_id: string
  medikament_name: string
  wirkstoff: string | null
  pzn: string | null
  kategorie: MedikamentKategorie
  darreichungsform: string | null
  dosierung: string
  einheit: string
  einnahme_morgens: boolean
  einnahme_mittags: boolean
  einnahme_abends: boolean
  einnahme_nachts: boolean
  einnahme_hinweis: string | null
  verordnet_von: string | null
  beginn_datum: string | null
  end_datum: string | null
  dauermedikation: boolean
  status: string
  abgesetzt_am: string | null
  abgesetzt_grund: string | null
  notizen: string | null
  created_at: string
  updated_at: string
}

interface Eingabe {
  id: string
  einnahme_zeit: string
  geplant_um: string
  gegeben_um: string | null
  status: string
  verweigert_grund: string | null
  notizen: string | null
}

const STATUS_FARBE: Record<string, string> = {
  aktiv: '#38A169', pausiert: '#D69E2E', abgesetzt: '#A0AEC0',
}

const EINGABE_FARBE: Record<string, string> = {
  geplant: '#3182CE', gegeben: '#38A169', verweigert: '#E53E3E', ausgelassen: '#A0AEC0',
}

export default function MedikamentDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [med, setMed] = useState<MedDetail | null>(null)
  const [eingaben, setEingaben] = useState<Eingabe[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState<Partial<MedDetail>>({})
  const [saving, setSaving] = useState(false)

  function loadData() {
    setLoading(true)
    fetch(`/api/medikamente/${id}`)
      .then(r => r.json())
      .then(body => {
        if (body.error) { setError(body.error); return }
        setMed(body)
        setEditForm(body)
        return fetch(`/api/medikamente/eingaben?client_id=${body.client_id}&medikament_id=${id}`)
      })
      .then(r => r?.json())
      .then(body => { if (body && !body.error) setEingaben(body) })
      .catch(() => setError('Laden fehlgeschlagen.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadData() }, [id])  

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/medikamente/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.error); return }
      setMed(body)
      setEditing(false)
    } catch { setError('Speichern fehlgeschlagen.') }
    finally { setSaving(false) }
  }

  async function erfasseEingabe(status: 'gegeben' | 'verweigert' | 'ausgelassen', zeit: string) {
    const grund = status === 'verweigert' ? prompt('Grund der Verweigerung:') : undefined
    try {
      const res = await fetch('/api/medikamente/eingaben', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          medikament_id: id,
          client_id: med!.client_id,
          einnahme_zeit: zeit,
          geplant_um: new Date().toISOString(),
          status,
          verweigert_grund: grund,
        }),
      })
      if (!res.ok) { const b = await res.json(); setError(b.error); return }
      loadData()
    } catch { setError('Eingabe fehlgeschlagen.') }
  }

  if (loading) return <div className="p-8 text-gray-500">Lade Medikament…</div>
  if (!med) return <div className="p-8 text-red-500">{error || 'Nicht gefunden.'}</div>

  const zeiten: string[] = []
  if (med.einnahme_morgens) zeiten.push('morgens')
  if (med.einnahme_mittags) zeiten.push('mittags')
  if (med.einnahme_abends) zeiten.push('abends')
  if (med.einnahme_nachts) zeiten.push('nachts')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <button onClick={() => router.push('/admin/medikamente')} className="text-sm text-blue-600 hover:underline mb-1">
            ← Zurück zur Übersicht
          </button>
          <h1 className="text-2xl font-bold">{med.medikament_name}</h1>
          {med.wirkstoff && <p className="text-gray-500">{med.wirkstoff}</p>}
        </div>
        <StatusBadge label={med.status} color={STATUS_FARBE[med.status] || '#A0AEC0'} />
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      {/* Stammdaten */}
      <div className="rounded-lg border bg-white p-6 shadow-sm dark:bg-gray-900 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-lg">Stammdaten</h2>
          {!editing ? (
            <button onClick={() => setEditing(true)} className="text-sm text-blue-600 hover:underline">Bearbeiten</button>
          ) : (
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={saving} className="rounded bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700 disabled:opacity-50">
                {saving ? 'Speichere…' : 'Speichern'}
              </button>
              <button onClick={() => { setEditing(false); setEditForm(med) }} className="text-sm text-gray-500 hover:underline">Abbrechen</button>
            </div>
          )}
        </div>

        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
          <div>
            <dt className="font-medium text-gray-500">Dosierung</dt>
            <dd>{editing
              ? <input value={editForm.dosierung as string || ''} onChange={e => setEditForm(p => ({ ...p, dosierung: e.target.value }))}
                  className="rounded border px-2 py-1 w-full dark:bg-gray-800 dark:border-gray-600" />
              : `${med.dosierung} ${med.einheit}`}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-500">Kategorie</dt>
            <dd>{editing
              ? <select value={editForm.kategorie as string || ''} onChange={e => setEditForm(p => ({ ...p, kategorie: e.target.value as MedikamentKategorie }))}
                  className="rounded border px-2 py-1 w-full dark:bg-gray-800 dark:border-gray-600">
                  {Object.entries(KATEGORIEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              : KATEGORIEN[med.kategorie] || med.kategorie}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-500">PZN</dt>
            <dd>{med.pzn || '—'}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-500">Darreichungsform</dt>
            <dd>{med.darreichungsform || '—'}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-500">Verordnet von</dt>
            <dd>{editing
              ? <input value={editForm.verordnet_von as string || ''} onChange={e => setEditForm(p => ({ ...p, verordnet_von: e.target.value }))}
                  className="rounded border px-2 py-1 w-full dark:bg-gray-800 dark:border-gray-600" />
              : med.verordnet_von || '—'}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-500">Einnahmezeiten</dt>
            <dd>{zeiten.map(z => z.charAt(0).toUpperCase() + z.slice(1)).join(', ')}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-500">Beginn</dt>
            <dd>{med.beginn_datum || '—'}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-500">Ende</dt>
            <dd>{med.end_datum || (med.dauermedikation ? 'Dauermedikation' : '—')}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-500">Hinweis</dt>
            <dd>{med.einnahme_hinweis || '—'}</dd>
          </div>
          {med.abgesetzt_am && (
            <>
              <div>
                <dt className="font-medium text-gray-500">Abgesetzt am</dt>
                <dd>{new Date(med.abgesetzt_am).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })}</dd>
              </div>
              <div>
                <dt className="font-medium text-gray-500">Absetzgrund</dt>
                <dd>{med.abgesetzt_grund || '—'}</dd>
              </div>
            </>
          )}
        </dl>

        {med.notizen && (
          <div className="mt-4 p-3 rounded bg-yellow-50 text-sm dark:bg-yellow-900/20">
            <span className="font-medium">Notizen:</span> {med.notizen}
          </div>
        )}
      </div>

      {/* Eingabe-Buttons */}
      {med.status === 'aktiv' && (
        <div className="rounded-lg border bg-white p-6 shadow-sm dark:bg-gray-900 dark:border-gray-700">
          <h2 className="font-semibold text-lg mb-4">Verabreichung erfassen</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {zeiten.map(z => (
              <div key={z} className="rounded border p-3 dark:border-gray-700">
                <div className="font-medium mb-2">{z.charAt(0).toUpperCase() + z.slice(1)}</div>
                <div className="flex gap-2">
                  <button onClick={() => erfasseEingabe('gegeben', z)}
                    className="flex-1 rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700">Gegeben</button>
                  <button onClick={() => erfasseEingabe('verweigert', z)}
                    className="flex-1 rounded bg-red-500 px-2 py-1 text-xs text-white hover:bg-red-600">Verweigert</button>
                  <button onClick={() => erfasseEingabe('ausgelassen', z)}
                    className="flex-1 rounded bg-gray-400 px-2 py-1 text-xs text-white hover:bg-gray-500">Ausgelassen</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Eingabe-Verlauf */}
      <div className="rounded-lg border bg-white p-6 shadow-sm dark:bg-gray-900 dark:border-gray-700">
        <h2 className="font-semibold text-lg mb-4">Verabreichungs-Verlauf</h2>
        {eingaben.length === 0 ? (
          <p className="text-gray-500 text-sm">Noch keine Eingaben erfasst.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Datum/Zeit</th>
                  <th className="px-3 py-2 text-left font-medium">Tageszeit</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-left font-medium">Bemerkung</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-gray-700">
                {eingaben.map(e => (
                  <tr key={e.id}>
                    <td className="px-3 py-2">{new Date(e.geplant_um).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td className="px-3 py-2">{e.einnahme_zeit}</td>
                    <td className="px-3 py-2">
                      <StatusBadge label={e.status} color={EINGABE_FARBE[e.status] || '#A0AEC0'} />
                    </td>
                    <td className="px-3 py-2 text-gray-500">{e.verweigert_grund || e.notizen || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
